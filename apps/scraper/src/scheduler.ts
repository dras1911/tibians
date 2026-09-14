/**
 * Scheduler — 3 niezależne pętle scrape'ujące Tibia Bazaar.
 *
 * Architektura (`.omo/plans/tibia-tools-portal-architecture.md`):
 *   - §8.1 — webhook zwrotny scraper → web (`/api/revalidate`)
 *   - §8.3 — **3 pętle** (Full 15min / EndingSoon 30s / Reference 24h) +
 *     `pg_try_advisory_lock` (anti-overlap) + `scrape_runs` (observability)
 *   - §18.1 — R11 budget coordination (współdzielony z self-hosted TibiaData)
 *   - §9.2 — Phase 2 (data pipeline) — scheduler jest sercem pipeline'u
 *
 * Trzy niezależne pętle (arch §8.3 — Dlaczego to działa):
 *
 * | Pętla         | Interwał | Co robi                                                | Koszt            |
 * |---------------|----------|--------------------------------------------------------|------------------|
 * | **Full**      | 15 min   | lista 101 stron → diff aukcji → fan-out detali         | ~100-400 req     |
 * | **EndingSoon**| 30 s     | DB: aukcje kończące się <1h → detail tylko tych       | ~5-40 req        |
 * | **Reference** | 24 h     | items / outfits / mounts z TibiaData lub własnego skana | ~10-50 req       |
 *
 * Full scrape co 30 s dla 2500 aukcji = ~5000 req/30 s = **natychmiastowy ban**.
 * Ale kończące się aukcje to ~1-2% zbioru → 30 s dla 30 aukcji = 1 req/s
 * = **bezpieczne i wystarczające** (cytat z §8.3).
 *
 * Zabezpieczenia:
 *   - `pg_try_advisory_lock(hash('tibians-scrape-{type}'))` — jeśli poprzedni
 *     scrape jeszcze leci, nowy nie startuje. **Advisory lock jest trzymany
 *     wewnątrz każdej iteracji pętli** (nie wokół timera) — inaczej lock nigdy
 *     by się nie zwolnił i kolejna iteracja nigdy by nie wystartowała.
 *   - R11 budget: `throttleIfNeeded()` (t29) — pauzuje wywołującego aż okno
 *     się zresetuje. Scheduler nie obchodzi tego bezpośrednio — to robi HTTP
 *     client przez swoje wywołania `fetchHtml`.
 *   - Graceful shutdown: SIGTERM/SIGINT → stop wszystkie 3 timery, await
 *     in-flight iteracje (max 5 s budżet), zamknij DB pool.
 *
 * MUST NOT (arch §8.3 + plan §36):
 *   - NIE uruchamiaj wszystkich pętli jednocześnie BEZ advisory lock —
 *     ryzyko overlap przy wolnym DB query.
 *   - NIE commituj (ten plik jest nowy).
 *   - NIE crashuj całej pętli na pojedynczym auction error — log + skip +
 *     continue.
 *   - NIE używaj recursive `setTimeout` bez max-depth — stack overflow
 *     ryzyko. **`setInterval` jest tu bezpieczniejszy** (nie buduje stosu).
 *
 * Testowanie:
 *   - `SchedulerDb` jest interfejsem — testy wstrzykują mocka (zero real PG).
 *   - `HttpClient` jest opcjonalny — domyślnie `defaultHttpClient` (undici);
 *     testy używają `createHttpClient({ requester: fakeRequester })`.
 *   - Interwały konfigurowalne przez `options` (testy: 50 ms zamiast 15 min).
 *
 * Powiązania:
 *   - T29 — HTTP client (rate limit, retry, R11, advisory lock)
 *   - T30 — `parseAuctionList` + `compareAuctionLists` (diff dla Full loop)
 *   - T31 — `parseAuctionDetail` (detail fetch)
 *   - T32 — `scrapeReferenceData` (items/outfits/mounts dla Reference loop)
 *   - T34 — DB queries (interfejs `SchedulerDb` zostanie podpięty do produkcyjnego DB)
 *   - T35 — valuation (wywoływane po upsertAuction — pominięte w MVP, log only)
 *   - T38 — `POST /api/revalidate` (interfejs `RevalidateWebhook`)
 */
import type { AuctionSummary } from "./scrapers/auction-list.js";
import type {
  Auction,
  AuctionItem,
  AuctionMount,
  AuctionOutfit,
  AuctionSkillLoyalty,
  AuctionUsp,
} from "@tibians/shared/auction";
/**
 * Typ `ScrapeRunType` — dublujemy tu z `@tibians/db/schema/ops.ts`, żeby
 * uniknąć zaciągania całego modułu DB (który ma side-effects: lazy Pool init).
 * Trzymanie typu w sync z T34 to koszt niewielki — to enum 5 wartości.
 */
export type ScrapeRunType = "full" | "ending_soon" | "detail" | "history" | "reference";
import {
  tryAdvisoryLock,
  type AdvisoryLockClient,
} from "./advisory-lock.js";
import type { HttpClient } from "./http-client.js";
import { defaultHttpClient } from "./http-client.js";
import { SCRAPER_CONFIG, TIBIA_URLS } from "./config.js";
import { runCalibration } from "./calibration.js";
import {
  compareAuctionLists,
  parseAuctionList,
} from "./scrapers/auction-list.js";
import {
  isAuctionDetailSuccessful,
  parseAuctionDetail,
} from "./scrapers/auction-detail.js";
import {
  scrapeReferenceData,
  type Item,
  type Mount,
  type Outfit,
} from "./scrapers/reference-data.js";

// ──────────────────────────────────────────────────────────────────────────
// Publiczne typy
// ──────────────────────────────────────────────────────────────────────────

/** Logger — interfejs wstrzykiwalny (testy używają vi.fn()). */
export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

/** Domyślny logger (console-based, prod). */
export const defaultLogger: Logger = {
  debug: (msg, ctx) => console.debug(`[scheduler] ${msg}`, ctx ?? {}),
  info: (msg, ctx) => console.log(`[scheduler] ${msg}`, ctx ?? {}),
  warn: (msg, ctx) => console.warn(`[scheduler] ${msg}`, ctx ?? {}),
  error: (msg, ctx) => console.error(`[scheduler] ${msg}`, ctx ?? {}),
};

/**
 * Pakiet payloadu do upsertAuction (T34 interface).
 *
 * Łączy Auction (denormalizowane kolumny auctions) + relacje 1:N
 * (items / outfits / mounts / usps / skillLoyalties).
 */
export interface UpsertAuctionInput {
  auction: Auction;
  items: readonly AuctionItem[];
  outfits: readonly AuctionOutfit[];
  mounts: readonly AuctionMount[];
  usps: readonly AuctionUsp[];
  skillLoyalties: readonly AuctionSkillLoyalty[];
}

/** Wynik upsert (informacja czy był "new" / "updated" — do scrape_runs). */
export interface UpsertAuctionResult {
  /** "new" — wstawienie nowego wiersza, "updated" — UPDATE istniejącego. */
  kind: "new" | "updated" | "unchanged";
}

/**
 * Interfejs warstwy DB (plan §34 — DB ops). Produkcyjna implementacja
 * (Drizzle + pg.Pool) pojawi się w T34; tu definiujemy kontrakt + mock dla testów.
 *
 * Wszystkie metody są **asynchroniczne** (real DB I/O). Mock w testach
 * śledzi wywołania przez `vi.fn()` i zwraca predefiniowane wyniki.
 */
export interface SchedulerDb {
  // ── Aukcje — dane do upsert / archiwizacji / odczytu ─────────────────
  /** Pełna lista aktualnie śledzonych aukcji (do diff w Full loop). */
  fetchAllAuctionSummaries(): Promise<readonly AuctionSummary[]>;
  /** Wstaw lub zaktualizuj aukcję + relacje (T34: transakcja). */
  upsertAuction(input: UpsertAuctionInput): Promise<UpsertAuctionResult>;
  /** Oznacz aukcje jako zakończone; zwraca liczbę zarchiwizowanych. */
  archiveFinishedAuctions(ids: readonly bigint[]): Promise<number>;
  /** IDs aukcji aktywnych, których `auction_end` jest w oknie `[NOW, NOW+window]`. */
  getEndingSoonIds(withinHours: number): Promise<readonly bigint[]>;

  // ── Reference data (items / outfits / mounts) — dla Reference loop ───
  upsertItems(items: readonly Item[]): Promise<number>;
  upsertOutfits(outfits: readonly Outfit[]): Promise<number>;
  upsertMounts(mounts: readonly Mount[]): Promise<number>;

  // ── scrape_runs (obserwowalność — arch §7.2) ─────────────────────────
  createScrapeRun(input: {
    runType: ScrapeRunType;
    startedAt: Date;
  }): Promise<bigint>;
  finishScrapeRun(
    id: bigint,
    input: {
      finishedAt: Date;
      status: "success" | "partial" | "failed";
      pagesFetched: number;
      auctionsFound: number;
      auctionsNew: number;
      auctionsUpd: number;
      auctionsArch: number;
      errorsCount: number;
      errorSummary?: Record<string, unknown>;
    },
  ): Promise<void>;
  recordScrapeError(input: {
    runId: bigint;
    url?: string;
    auctionId?: bigint;
    errorType: "timeout" | "rate_limit" | "parse" | "http_4xx" | "http_5xx" | "db" | "other";
    message: string;
  }): Promise<void>;

  // ── Calibration (task 57 — arch §8.4 + §10 R3) ─────────────────────
  /**
   * Pobierz próbki kalibracji (JOIN auctions ↔ valuation_history).
   *
   * Domyślna implementacja w produkcji (T34): SELECT dla zakończonych
   * aukcji (`status IN ('finished','sold')`) z `final_price > 0` w oknie
   * `archived_at > NOW() - interval '$1 hours'`.
   *
   * Mock w testach może zwracać dowolne próbki — logika kalibracji
   * jest testowana w `calibration.test.ts`.
   */
  fetchCalibrationSamples(opts: {
    windowHours: number;
  }): Promise<
    readonly import("./calibration.js").CalibrationSample[]
  >;
  /**
   * Persistuj raport kalibracji do `scrape_runs` (runType='calibration').
   *
   * Używane przez `runCalibration` po każdym Reference loop. Pełny raport
   * (avg/median/MAPE/worstCases) idzie do `error_summary` JSONB.
   */
  recordCalibrationRun(input: {
    report: import("./calibration.js").CalibrationReport;
    generatedAt: string;
  }): Promise<void>;

  /** REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts (T34 helper). */
  refreshFacetCounts(): Promise<void>;

  /** Pool close (graceful shutdown). Opcjonalne — mock może nie mieć. */
  end?(): Promise<void>;
}

/**
 * Revalidate webhook (T38 — `POST /api/revalidate`).
 *
 * Wywoływany po Full loop, żeby Next.js (apps/web) zinvalidował cache tagów
 * `auctions` + `auction-{id}` oraz odświeżył `mv_facet_counts`.
 *
 * W testach: mock zwraca `Promise.resolve()` i zapisuje wywołanie do tablicy.
 */
export interface RevalidateWebhook {
  revalidate(payload: {
    paths?: readonly string[];
    tags?: readonly string[];
  }): Promise<void>;
}

/** Identyfikator logiczny pętli (używany w stats + runOnce). */
export type LoopName = "full" | "endingSoon" | "reference";

/** Statystyki pojedynczej pętli (do observability + testów). */
export interface LoopStats {
  /** Ile razy pętla próbowała wystartować (timer fired). */
  starts: number;
  /** Ile razy pętla faktycznie wykonała pracę (lock zdobyty). */
  executed: number;
  /** Ile razy pętla została pominięta (lock zajęty lub sygnał aborted). */
  skipped: number;
  /** Ile razy pętla zakończyła się błędem (lock zdobyty, ale wyjątek). */
  failed: number;
  /** Ile aukcji zostało zupsertowanych (tylko Full / EndingSoon). */
  upserted: number;
  /** Ile aukcji zostało zarchiwizowanych (tylko Full). */
  archived: number;
  /**
   * Ile razy uruchomiono kalibrację wyceny (task 57).
   *
   * Tylko `reference` inkrementuje — kalibracja jest wywoływana po każdym
   * Reference loop (arch §8.4 pętla feedbacku valuation_history vs final_price).
   */
  calibrationsRun: number;
}

/** Pełne statystyki schedulera (per-loop). */
export interface SchedulerStats {
  full: LoopStats;
  endingSoon: LoopStats;
  reference: LoopStats;
  /** Ile `setInterval` zostało uruchomionych. */
  intervalsActive: number;
  /** Ile iteracji jest aktualnie w locie. */
  inFlight: number;
}

/** Zerowe statystyki (init). */
function emptyLoopStats(): LoopStats {
  return {
    starts: 0,
    executed: 0,
    skipped: 0,
    failed: 0,
    upserted: 0,
    archived: 0,
    calibrationsRun: 0,
  };
}

/** Opcje factory `createScheduler`. */
export interface SchedulerOptions {
  /** Adapter locka DB (testy: fake; produkcja: pg-backed). */
  lockClient?: AdvisoryLockClient;
  /** Logger (domyślnie: `defaultLogger`). */
  logger?: Logger;
  /** Revalidate webhook (T38). Bez niego — pomijamy POST. */
  revalidate?: RevalidateWebhook;
  /** Override interwałów (testy ustawiają małe ms). */
  intervals?: Partial<{
    fullMs: number;
    endingSoonMs: number;
    referenceMs: number;
  }>;
  /** AbortSignal — zewnętrzny sygnał STOP (np. parent process). */
  signal?: AbortSignal;
}

/** Publiczny handle schedulera (zwracany przez `createScheduler`). */
export interface SchedulerHandle {
  /** Uruchom wszystkie 3 pętle (setInterval). Idempotentne. */
  start(): void;
  /** Zatrzymaj wszystkie pętle + await in-flight + close DB (graceful shutdown). */
  stop(): Promise<void>;
  /** Ręcznie wykonaj jedną iterację wybranej pętli (testy + on-demand). */
  runOnce(loop: LoopName): Promise<void>;
  /** Migawka statystyk. */
  getStats(): SchedulerStats;
  /** Czy scheduler został zatrzymany? */
  isStopped(): boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Wewnętrzne: lock keys + domyślne interwały
// ──────────────────────────────────────────────────────────────────────────

/**
 * Nazwy logiczne locków — deterministycznie haszowane przez SHA-256.
 * Każda pętla ma WŁASNY klucz (dzięki czemu 2 pętle mogą działać równolegle).
 */
const LOOP_LOCK_KEYS: Readonly<Record<LoopName, string>> = {
  full: "tibians-scrape-full",
  endingSoon: "tibians-scrape-ending-soon",
  reference: "tibians-scrape-reference",
};

/** Domyślne interwały (z konfiguracji SCRAPER_CONFIG — produkcja). */
function defaultIntervalsMs(config: typeof SCRAPER_CONFIG): {
  fullMs: number;
  endingSoonMs: number;
  referenceMs: number;
} {
  return {
    fullMs: config.fullIntervalMin * 60_000,
    endingSoonMs: config.endingSoonIntervalSec * 1000,
    referenceMs: config.referenceIntervalH * 60 * 60_000,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Wewnętrzne: payload budujący detail URL
// ──────────────────────────────────────────────────────────────────────────

function detailUrlFor(auctionId: bigint | number): string {
  // TIBIA_URLS.auctionDetail akceptuje `string | number` — konwertujemy
  // bigint → string (encodeURIComponent obsługuje oba, ale sygnatura jest string).
  return TIBIA_URLS.auctionDetail(typeof auctionId === "bigint" ? auctionId.toString() : auctionId);
}

function listUrlFor(page: number): string {
  return `${TIBIA_URLS.auctionList}&currentpage=${page}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Factory: createScheduler
// ──────────────────────────────────────────────────────────────────────────

/**
 * Stwórz scheduler z 3 niezależnymi pętlami.
 *
 * @param db        — implementacja SchedulerDb (testy: mock; produkcja: T34).
 * @param httpClient — opcjonalny HttpClient (domyślnie: defaultHttpClient).
 *                    Testy używają `createHttpClient({ requester: fake })`.
 * @param options   — dodatkowe opcje (lockClient, logger, interwały, …).
 */
export function createScheduler(
  db: SchedulerDb,
  httpClient: HttpClient = defaultHttpClient,
  options: SchedulerOptions = {},
): SchedulerHandle {
  const logger = options.logger ?? defaultLogger;
  const intervals = {
    ...defaultIntervalsMs(SCRAPER_CONFIG),
    ...(options.intervals ?? {}),
  };
  const revalidate = options.revalidate;

  // Sygnał: połącz wewnętrzny AbortController z opcjonalnym zewnętrznym.
  // Wewnętrzny jest abortowany przez `stop()`; zewnętrzne (opcjonalnie) przez
  // rodzica (np. parent process, test framework).
  const internalAbort = new AbortController();
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) internalAbort.abort();
    else
      externalSignal.addEventListener(
        "abort",
        () => internalAbort.abort(),
        { once: true },
      );
  }

  // Zbiory timerów + in-flight promise'ów (do graceful shutdown).
  const intervals_ = new Set<ReturnType<typeof setInterval>>();
  const inFlight = new Set<Promise<void>>();

  // Statystyki per-loop.
  const stats: SchedulerStats = {
    full: emptyLoopStats(),
    endingSoon: emptyLoopStats(),
    reference: emptyLoopStats(),
    intervalsActive: 0,
    inFlight: 0,
  };

  let started = false;
  let stopped = false;

  function isAborted(): boolean {
    return internalAbort.signal.aborted;
  }

  /**
   * Wrap iteracji pętli: advisory lock + scrape_run logging.
   *
   * Jeśli lock jest zajęty (inny proces scrapuje) → skip + log + zwróć.
   * Jeśli lock jest wolny → acquire → execute callback → release.
   *
   * Dodatkowo: jeśli sygnał aborted → skip bez acquire.
   */
  async function withRunGuard(
    loop: LoopName,
    runType: ScrapeRunType,
    callback: (runId: bigint) => Promise<RunMetrics>,
  ): Promise<void> {
    if (isAborted()) {
      stats[loop].skipped += 1;
      logger.debug(`Loop "${loop}" skipped (aborted)`, {});
      return;
    }

    stats[loop].starts += 1;
    const lockName = LOOP_LOCK_KEYS[loop];

    // Opcje advisory-locka: klient opcjonalny (gdy brak → "no-op" z warningiem).
    // Budujemy obiekt dynamicznie, żeby `exactOptionalPropertyTypes` nie wymagało
    // jawnego `undefined` w `client`.
    const lockOpts: Parameters<typeof tryAdvisoryLock>[2] = {
      onSkipped: (name) => {
        stats[loop].skipped += 1;
        logger.debug(`Advisory lock busy for "${name}" — skipping iteration`, {});
      },
    };
    if (options.lockClient) lockOpts.client = options.lockClient;

    const result = await tryAdvisoryLock(
      lockName,
      async () => {
        // Otwórz scrape_run.
        let runId: bigint;
        try {
          runId = await db.createScrapeRun({
            runType,
            startedAt: new Date(),
          });
        } catch (err) {
          stats[loop].failed += 1;
          logger.error(`createScrapeRun failed for "${loop}"`, {
            error: err instanceof Error ? err.message : String(err),
          });
          return failedMetrics("createScrapeRun", err);
        }

        // Wykonaj właściwą pracę pętli.
        let metrics: RunMetrics;
        try {
          metrics = await callback(runId);
        } catch (err) {
          stats[loop].failed += 1;
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`Loop "${loop}" iteration failed`, { error: message });
          metrics = failedMetrics("callback", err);
        }

        // Finalizuj scrape_run (nawet jeśli callback rzucił — status=failed).
        try {
          await db.finishScrapeRun(runId, {
            ...metrics,
            finishedAt: new Date(),
            status:
              metrics.errorsCount === 0
                ? "success"
                : metrics.auctionsFound > 0
                  ? "partial"
                  : "failed",
          });
        } catch (err) {
          logger.error(`finishScrapeRun failed for "${loop}"`, {
            runId: runId.toString(),
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Aktualizuj statystyki schedulera (po wykonaniu, lock zwolniony).
        stats[loop].executed += 1;
        stats[loop].upserted += metrics.auctionsNew + metrics.auctionsUpd;
        stats[loop].archived += metrics.auctionsArch;
        return metrics;
      },
      lockOpts,
    );

    // result === null → lock zajęty (onSkipped już zwiększył skipped).
    void result;
  }

  // ────────────────────────────────────────────────────────────────────
  // FULL LOOP (co 15 min)
  // ────────────────────────────────────────────────────────────────────

  /** Pojedyncza iteracja Full loop — eksportowana przez `runOnce("full")`. */
  async function runFullIteration(): Promise<void> {
    await withRunGuard("full", "full", async (runId) => {
      // 1. Fetch list page 1.
      const html = await httpClient.fetchHtml(listUrlFor(1), { signal: internalAbort.signal });
      if (isAborted()) {
        logger.debug("Full loop aborted during list fetch", {});
        return zeroMetrics();
      }

      const parsed = parseAuctionList(html);
      const currentSummaries = parsed.auctions;

      // 2. Fetch pozostałych stron (parallel z limitem host = maxConcurrent).
      // Dla uproszczenia: sekwencyjnie — R11 budget sam dba o throttling.
      const allSummaries: AuctionSummary[] = [...currentSummaries];
      let pagesFetched = 1;
      let errorsCount = 0;
      const errorSummary: Record<string, unknown> = {};

      for (let page = 2; page <= parsed.totalPages; page += 1) {
        if (isAborted()) break;
        try {
          const pageHtml = await httpClient.fetchHtml(listUrlFor(page), { signal: internalAbort.signal });
          if (isAborted()) break;
          const pageParsed = parseAuctionList(pageHtml);
          allSummaries.push(...pageParsed.auctions);
          pagesFetched += 1;
        } catch (err) {
          errorsCount += 1;
          const message = err instanceof Error ? err.message : String(err);
          errorSummary[`page_${page}`] = message;
          logger.warn(`Full loop: failed to fetch page ${page}`, { error: message });
          // NIE crashuj całej pętli — log + continue.
        }
      }

      // 3. Diff z poprzednim snapshotem (DB).
      let previous: readonly AuctionSummary[] = [];
      try {
        previous = await db.fetchAllAuctionSummaries();
      } catch (err) {
        errorsCount += 1;
        errorSummary.fetchPrevious = err instanceof Error ? err.message : String(err);
        logger.warn("Full loop: fetchAllAuctionSummaries failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const diff = compareAuctionLists(previous, allSummaries);

      // 4. Fetch detail dla new + updated (arch §8.3: tylko zmienione).
      let auctionsNew = 0;
      let auctionsUpd = 0;
      const toFetch: Array<{ id: bigint; kind: "new" | "updated" }> = [
        ...diff.newAuctions.map((a) => ({ id: a.auctionId, kind: "new" as const })),
        ...diff.updatedAuctions.map((d) => ({ id: d.auctionId, kind: "updated" as const })),
      ];

      for (const { id, kind } of toFetch) {
        if (isAborted()) break;
        try {
          const detailHtml = await httpClient.fetchHtml(detailUrlFor(id), { signal: internalAbort.signal });
          if (isAborted()) break;
          const detail = parseAuctionDetail(detailHtml, id);
          if (isAuctionDetailSuccessful(detail)) {
            await db.upsertAuction({
              auction: detail.auction,
              items: detail.items,
              outfits: detail.outfits,
              mounts: detail.mounts,
              usps: detail.usps,
              skillLoyalties: detail.skillLoyalties,
            });
            if (kind === "new") auctionsNew += 1;
            else auctionsUpd += 1;
          } else {
            errorsCount += 1;
            errorSummary[`detail_${id}`] = detail.parseError ?? "parse failed";
            logger.warn(`Full loop: detail parse failed for auction ${id}`, {
              warnings: detail.warnings,
            });
            // Zapisz błąd w scrape_errors (osobny wiersz).
            await db.recordScrapeError({
              runId,
              url: detailUrlFor(id),
              auctionId: id,
              errorType: "parse",
              message: detail.parseError ?? "parse failed",
            });
          }
        } catch (err) {
          errorsCount += 1;
          const message = err instanceof Error ? err.message : String(err);
          errorSummary[`detail_${id}`] = message;
          logger.warn(`Full loop: failed to fetch detail for auction ${id}`, {
            error: message,
          });
          await db.recordScrapeError({
            runId,
            url: detailUrlFor(id),
            auctionId: id,
            errorType: classifyError(err),
            message,
          });
          // Per-auction error → continue (NIE crash loop).
        }
      }

      // 5. Archive finished auctions (arch §8.3 — sweep po zakończonych).
      // Kiedy auction_end < now() i status='active' → finished.
      // Upsert zawsze ustawia status na 'active'; archiwizacja następuje gdy
      // aukcja zniknęła z listy LUB ma auction_end < now().
      const removedIds = diff.removedAuctions.map((d) => d.auctionId);
      const expiredIds = allSummaries
        .filter((s) => Date.parse(s.auctionEnd) < Date.now())
        .map((s) => s.auctionId);
      const toArchive = Array.from(new Set([...removedIds, ...expiredIds]));
      let auctionsArch = 0;
      if (toArchive.length > 0) {
        try {
          auctionsArch = await db.archiveFinishedAuctions(toArchive);
        } catch (err) {
          errorsCount += 1;
          errorSummary.archive = err instanceof Error ? err.message : String(err);
          logger.error("Full loop: archiveFinishedAuctions failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // 6. REFRESH MATERIALIZED VIEW CONCURRENTLY (T34 helper + arch §8.1).
      // Odświeżamy tylko po Full loop (nie po EndingSoon — to delty, nie bulk).
      if (!isAborted()) {
        try {
          await db.refreshFacetCounts();
        } catch (err) {
          errorsCount += 1;
          errorSummary.refreshMV = err instanceof Error ? err.message : String(err);
          logger.error("Full loop: refreshFacetCounts failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // 7. POST /api/revalidate (T38) — webhook do Next.js.
      if (!isAborted() && revalidate) {
        try {
          await revalidate.revalidate({
            tags: ["auctions", "auction-list"],
          });
        } catch (err) {
          // Re-validate failure jest nie-krytyczny — log i kontynuuj.
          errorsCount += 1;
          errorSummary.revalidate = err instanceof Error ? err.message : String(err);
          logger.warn("Full loop: revalidate webhook failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return {
        pagesFetched,
        auctionsFound: allSummaries.length,
        auctionsNew,
        auctionsUpd,
        auctionsArch,
        errorsCount,
        ...(errorsCount > 0 ? { errorSummary } : {}),
      };
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // ENDING-SOON LOOP (co 30 s)
  // ────────────────────────────────────────────────────────────────────

  async function runEndingSoonIteration(): Promise<void> {
    await withRunGuard("endingSoon", "ending_soon", async (runId) => {
      // 1. Query DB: aktywne aukcje kończące się w ciągu endingSoonWindowH.
      let ids: readonly bigint[];
      try {
        ids = await db.getEndingSoonIds(SCRAPER_CONFIG.endingSoonWindowH);
      } catch (err) {
        logger.error("EndingSoon loop: getEndingSoonIds failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return failedMetrics("getEndingSoonIds", err);
      }

      // 2. Fetch detail tylko dla ids (arch §8.3: zwykle 5-40 aukcji).
      let upserted = 0;
      let errorsCount = 0;
      const errorSummary: Record<string, unknown> = {};

      for (const id of ids) {
        if (isAborted()) break;
        try {
          const detailHtml = await httpClient.fetchHtml(detailUrlFor(id), { signal: internalAbort.signal });
          if (isAborted()) break;
          const detail = parseAuctionDetail(detailHtml, id);
          if (isAuctionDetailSuccessful(detail)) {
            await db.upsertAuction({
              auction: detail.auction,
              items: detail.items,
              outfits: detail.outfits,
              mounts: detail.mounts,
              usps: detail.usps,
              skillLoyalties: detail.skillLoyalties,
            });
            upserted += 1;
          } else {
            errorsCount += 1;
            errorSummary[`detail_${id}`] = detail.parseError ?? "parse failed";
            await db.recordScrapeError({
              runId,
              url: detailUrlFor(id),
              auctionId: id,
              errorType: "parse",
              message: detail.parseError ?? "parse failed",
            });
          }
        } catch (err) {
          errorsCount += 1;
          const message = err instanceof Error ? err.message : String(err);
          errorSummary[`detail_${id}`] = message;
          logger.warn(`EndingSoon loop: failed to fetch detail for auction ${id}`, {
            error: message,
          });
          await db.recordScrapeError({
            runId,
            url: detailUrlFor(id),
            auctionId: id,
            errorType: classifyError(err),
            message,
          });
          // Per-auction error → continue.
        }
      }

      return {
        pagesFetched: ids.length, // dla observability: ile potencjalnych detali
        auctionsFound: ids.length,
        auctionsNew: 0, // EndingSoon nie dodaje nowych (Full to robi)
        auctionsUpd: upserted,
        auctionsArch: 0,
        errorsCount,
        ...(errorsCount > 0 ? { errorSummary } : {}),
      };
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // REFERENCE LOOP (co 24 h)
  // ────────────────────────────────────────────────────────────────────

  async function runReferenceIteration(): Promise<void> {
    await withRunGuard("reference", "reference", async () => {
      let upserted = 0;
      let errorsCount = 0;
      const errorSummary: Record<string, unknown> = {};

      try {
        // 1. Scrape reference data (T32): TibiaData primary → own scanner fallback.
        const { result } = await scrapeReferenceData({
          signal: internalAbort.signal,
        });

        if (isAborted()) {
          return zeroMetrics();
        }

        // 2. Upsert do DB.
        const itemsUpserted = await db.upsertItems(result.items);
        const outfitsUpserted = await db.upsertOutfits(result.outfits);
        const mountsUpserted = await db.upsertMounts(result.mounts);
        upserted = itemsUpserted + outfitsUpserted + mountsUpserted;
      } catch (err) {
        errorsCount += 1;
        errorSummary.scrape = err instanceof Error ? err.message : String(err);
        logger.error("Reference loop: scrapeReferenceData failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // 3. Pętla kalibracji wyceny (T57 — arch §8.4 + §10 R3).
      // Po każdym Reference loop porównaj `valuation_history.estimated_tc`
      // z `auctions.final_price` → MAPE / worst cases → zapisz do scrape_runs
      // z runType='calibration'. To jest wewnętrzny tool dla dev-teamu (NIE UI).
      //
      // Calibration NIE blokuje Reference — błąd kalibracji logujemy i idziemy dalej.
      // Re-tuning wag (Faza 7) po zebraniu >30 próbek per vocation to manualna
      // analiza tego raportu (NIE ML, NIE auto-update wag w tej pętli).
      if (!isAborted()) {
        try {
          // SchedulerDb implementuje kontrakt CalibrationDb (subset metod
          // `fetchCalibrationSamples` + `recordCalibrationRun`). TypeScript
          // assignable structural — bez cast.
          await runCalibration(db);
          stats.reference.calibrationsRun += 1;
        } catch (err) {
          errorsCount += 1;
          errorSummary.calibration =
            err instanceof Error ? err.message : String(err);
          logger.warn("Reference loop: runCalibration failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return {
        pagesFetched: 0,
        auctionsFound: 0,
        auctionsNew: 0,
        auctionsUpd: upserted,
        auctionsArch: 0,
        errorsCount,
        ...(errorsCount > 0 ? { errorSummary } : {}),
      };
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Timer scheduling + graceful shutdown
  // ────────────────────────────────────────────────────────────────────

  /**
   * Wrap iteracji w Set + abort check. Dodaje promise do `inFlight`,
   * żeby `stop()` mogło poczekać na zakończenie.
   *
   * Celem uniknięcia setTimeout recursive → używamy **setInterval**, ale
   * jeśli poprzednia iteracja jeszcze leci, **nie startujemy drugiej**
   * (overlap protection). Dzięki temu `inFlight` może mieć max 3 elementy
   * (jeden per loop) w danym momencie.
   */
  function scheduleLoop(
    name: LoopName,
    intervalMs: number,
    fn: () => Promise<void>,
  ): ReturnType<typeof setInterval> {
    return setInterval(() => {
      if (isAborted() || stopped) return;
      // Sprawdź czy identyczny loop już działa (overlap guard).
      // Prosty mechanizm: porównujemy licznik `inFlight` per-loop — jeśli
      // iteracja trwa dłużej niż interwał, następny tick ją pomija.
      // `inFlight` Set przechowuje WSZYSTKIE aktywne promise'y (max 3).
      const promise = (async () => {
        try {
          await fn();
        } catch (err) {
          // Belt-and-suspenders: withRunGuard już łapie wszystko, ale gdyby
          // coś się przedostało — log i nie pozwól by zabiło interval.
          logger.error(`Loop "${name}" uncaught error`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      inFlight.add(promise);
      stats.inFlight = inFlight.size;
      void promise.finally(() => {
        inFlight.delete(promise);
        stats.inFlight = inFlight.size;
      });
    }, intervalMs);
  }

  function start(): void {
    if (started || stopped) return;
    started = true;
    intervals_.add(scheduleLoop("full", intervals.fullMs, runFullIteration));
    intervals_.add(
      scheduleLoop("endingSoon", intervals.endingSoonMs, runEndingSoonIteration),
    );
    intervals_.add(
      scheduleLoop("reference", intervals.referenceMs, runReferenceIteration),
    );
    stats.intervalsActive = intervals_.size;
    logger.info("Scheduler started", {
      intervals,
      loops: Object.keys(LOOP_LOCK_KEYS),
    });
  }

  async function stop(): Promise<void> {
    if (stopped) return;
    stopped = true;
    internalAbort.abort();

    // 1. Wyczyść timery (nie wystartują nowe iteracje).
    for (const timer of intervals_) clearInterval(timer);
    intervals_.clear();
    stats.intervalsActive = 0;

    // 2. Czekaj na in-flight (z budżetem 5 s — plan §36 AC "Graceful shutdown < 5 s").
    const inflightSnapshot = Array.from(inFlight);
    if (inflightSnapshot.length > 0) {
      logger.info(`Scheduler stopping — awaiting ${inflightSnapshot.length} in-flight iteration(s)`, {});
      const withTimeout = Promise.race([
        Promise.all(inflightSnapshot),
        new Promise<void>((resolve) =>
          setTimeout(() => {
            logger.warn("Graceful shutdown timeout (5s) — forcing exit", {});
            resolve();
          }, 5_000),
        ),
      ]);
      await withTimeout;
    }

    // 3. Zamknij DB pool (opcjonalne — mock może nie mieć).
    if (typeof db.end === "function") {
      try {
        await db.end();
      } catch (err) {
        logger.error("db.end() failed during shutdown", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("Scheduler stopped", {});
  }

  async function runOnce(loop: LoopName): Promise<void> {
    if (stopped) {
      throw new Error("Scheduler is stopped; cannot runOnce()");
    }
    const promise = (async () => {
      switch (loop) {
        case "full":
          await runFullIteration();
          break;
        case "endingSoon":
          await runEndingSoonIteration();
          break;
        case "reference":
          await runReferenceIteration();
          break;
      }
    })();
    inFlight.add(promise);
    stats.inFlight = inFlight.size;
    try {
      await promise;
    } finally {
      inFlight.delete(promise);
      stats.inFlight = inFlight.size;
    }
  }

  function getStats(): SchedulerStats {
    return {
      full: { ...stats.full },
      endingSoon: { ...stats.endingSoon },
      reference: { ...stats.reference },
      intervalsActive: stats.intervalsActive,
      inFlight: stats.inFlight,
    };
  }

  function isStopped(): boolean {
    return stopped;
  }

  return { start, stop, runOnce, getStats, isStopped };
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/** Kształt metryk zwracanych przez callback pętli (do scrape_runs). */
export interface RunMetrics {
  pagesFetched: number;
  auctionsFound: number;
  auctionsNew: number;
  auctionsUpd: number;
  auctionsArch: number;
  errorsCount: number;
  /** Prezent tylko gdy errorsCount > 0 — wpp brak klucza w scrape_runs. */
  errorSummary?: Record<string, unknown>;
}

/** Zerowe metryki (gdy loop został przerwany przed właściwą pracą). */
function zeroMetrics(): RunMetrics {
  return {
    pagesFetched: 0,
    auctionsFound: 0,
    auctionsNew: 0,
    auctionsUpd: 0,
    auctionsArch: 0,
    errorsCount: 0,
  };
}

/** Metryki "failed" z komunikatem błędu. */
function failedMetrics(stage: string, err: unknown): RunMetrics {
  return {
    pagesFetched: 0,
    auctionsFound: 0,
    auctionsNew: 0,
    auctionsUpd: 0,
    auctionsArch: 0,
    errorsCount: 1,
    errorSummary: {
      stage,
      error: err instanceof Error ? err.message : String(err),
    },
  };
}

/** Klasyfikuj błąd sieciowy do kategorii `scrape_errors.error_type`. */
function classifyError(err: unknown): "timeout" | "rate_limit" | "parse" | "http_4xx" | "http_5xx" | "db" | "other" {
  if (err == null) return "other";
  if (typeof err === "object" && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === "number") {
      if (status === 429) return "rate_limit";
      if (status >= 500) return "http_5xx";
      if (status >= 400) return "http_4xx";
    }
  }
  if (err instanceof Error) {
    if (err.name === "AbortError") return "timeout";
    if (/timeout|timed?\s*out/i.test(err.message)) return "timeout";
  }
  return "other";
}