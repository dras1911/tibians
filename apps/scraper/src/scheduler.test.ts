/**
 * Testy schedulera (task 36 — 3 niezależne pętle).
 *
 * Filozofia:
 *   - mockujemy `SchedulerDb` (zero real PG) przez vi.fn() — kontrakt T34,
 *   - mockujemy `HttpClient` przez fakeRequester (zero real tibia.com),
 *   - **używamy inline minimalnych HTML** zamiast realnych 250 KB fixtures
 *     (szybkość + determinizm + zero zależności od tibii.com struktury),
 *   - interwały obniżamy do 30-60 ms (szybkie testy, zero flakiness).
 *
 * Pokrycie (16 testów):
 *   1. start() aktywuje 3 niezależne timery (intervalsActive=3)
 *   2. stop() jest idempotentny
 *   3. runOnce() wywołuje pojedynczą iterację bez start() (manual trigger)
 *   4. Full loop: scrape_runs + REFRESH MV + revalidate webhook
 *   5. Full loop: upsert detail dla 'new' aukcji z diff
 *   6. EndingSoon loop: fetch detail TYLKO dla IDs z getEndingSoonIds
 *   7. EndingSoon loop: NIE robi refresh/revalidate (live SSE flow)
 *   8. Reference loop: upsertItems + upsertOutfits + upsertMounts
 *   9. Per-auction HTTP 500 → loop KONTYNUUJE (NIE crashuje)
 *  10. getEndingSoonIds throws → loop raportuje error w scrape_runs (status=failed)
 *  11. R11 budget exceeded → throttling blokuje loop
 *  12. Advisory lock BUSY (inny proces) → iteracja skipped (stats.skipped++)
 *  13. Advisory lock ACQUIRED → iteracja executed, lock RELEASED
 *  14. stop() podczas iteracji → in-flight awaited + intervals cleared
 *  15. stop() force-exit po 5s jeśli in-flight nie kończy się
 *  16. start() z krótkimi interwałami → loop wykonuje się N razy
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createScheduler, type SchedulerDb } from "./scheduler.js";
import { createHttpClient, type Requester } from "./http-client.js";
import { resetBudget, resetBudgetConfig } from "./r11-budget.js";

// ──────────────────────────────────────────────────────────────────────────
// Inline minimal HTML fixtures (deterministic + fast)
// ──────────────────────────────────────────────────────────────────────────

/** Generuje minimalną stronę listy z `n` aukcjami + `totalPages=1`. */
function makeListPage(
  opts: {
    count: number;
    totalPages?: number;
    auctionIdPrefix?: bigint;
  } = { count: 0 },
): string {
  const { count, totalPages = 1, auctionIdPrefix = 100n } = opts;
  const tps = Math.max(totalPages, 1);
  const blocks: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = auctionIdPrefix + BigInt(i);
    const futureEnd = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    blocks.push(`<div class="Auction">
      <div class="AuctionCharacterName"><a href="?subtopic=currentcharactertrades&page=details&auctionid=${id}">TestChar${i}</a></div>
      <div class="AuctionHeader">Level: ${100 + i} | Vocation: Elite Knight | Male | World: Antica</div>
      <img class="AuctionOutfitImage" src="https://static.tibia.com/images/charactertrade/outfits/962_3.gif" />
      <div class="ShortAuctionDataBidRow">
        <div class="ShortAuctionDataLabel">Current Bid:</div>
        <div class="ShortAuctionDataValue"><b>1000</b></div>
      </div>
      <div class="AuctionTimer" data-timestamp="${Math.floor(new Date(futureEnd).getTime() / 1000)}"></div>
    </div>`);
  }
  const pageLinks = Array.from({ length: tps }, (_, i) =>
    i + 1 === 1
      ? `<div class="PageLink"><span class="CurrentPageLink">First Page</span></div>`
      : `<div class="PageLink"><a href="?currentpage=${i + 1}">${i + 1}</a></div>`,
  ).join("");
  return `<html><body>${blocks.join("\n")}<table><tr><td class="PageNavigation">${pageLinks}</td></tr></table></body></html>`;
}

/**
 * Minimalna strona detalu — AKTUALNY layout tibia.com (parser v2):
 * `.AuctionCharacterName` + header pól, `.ShortAuctionData*`, `.AuctionTimer`,
 * `.CharacterDetailsBlock`. Musi przechodzić guard parsera (inaczej upsert
 * nie następuje i testy „loop" nie mają czego liczyć).
 */
function makeDetailPage(opts: { id: bigint | number; level?: number }): string {
  const { id, level = 250 } = opts;
  return `<html><body>
    <div class="AuctionHeader">
      <div class="AuctionCharacterName">TestChar${id}</div>
      Level: ${level} | Vocation: Elite Knight | Male | World: Antica<br>
    </div>
    <div class="AuctionBody">
      <div class="AuctionBodyBlock AuctionDisplay">
        <img class="AuctionOutfitImage" src="https://static.tibia.com/images/charactertrade/outfits/962_3.gif">
      </div>
      <div class="ShortAuctionDataBidRow">
        <div class="ShortAuctionDataLabel">Current Bid:</div>
        <div class="ShortAuctionDataValue"><b>1500</b></div>
      </div>
      <div class="ShortAuctionDataLabel">Auction Start:</div>
      <div class="ShortAuctionDataValue">Sep 16 2026, 10:06 CEST</div>
      <div class="ShortAuctionDataLabel">Auction End:</div>
      <div class="ShortAuctionDataValue">Sep 17 2026, 19:00 CEST</div>
      <div class="AuctionTimer" data-timestamp="1789664400"></div>
      <div class="CharacterDetailsBlock">
        <div class="CaptionInnerContainer"><span class="Text">General</span></div>
        <table class="TableContent">
          <tr><td class="LabelColumn"><b>Magic Level</b></td><td class="LevelColumn">100</td></tr>
          <tr><td class="LabelColumn"><b>Sword Fighting</b></td><td class="LevelColumn">110</td></tr>
        </table>
        <table class="TableContent">
          <tr><td><span class="LabelV">Blessings:</span><div>7/7</div></td></tr>
        </table>
      </div>
    </div>
  </body></html>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Pomocnicze: FakeRequester
// ──────────────────────────────────────────────────────────────────────────

interface Scripted {
  statusCode?: number;
  body?: string;
  throw?: Error;
}

interface FakeRequester {
  impl: Requester;
  calls: Array<{ url: string }>;
  setQueue(q: Scripted[]): void;
  setDefault(s: Scripted): void;
}

function makeFakeRequester(initial: Scripted[] = []): FakeRequester {
  const calls: Array<{ url: string }> = [];
  let queue = [...initial];
  let defaultResponse: Scripted = { body: makeDetailPage({ id: 0n }) };
  const fake: FakeRequester = {
    impl: undefined as unknown as Requester,
    calls,
    setQueue(q) {
      queue = [...q];
    },
    setDefault(s) {
      defaultResponse = s;
    },
  };
  fake.impl = {
    async request(url, options) {
      calls.push({ url });
      const next = queue.shift() ?? defaultResponse;
      if (next.throw) throw next.throw;
      if (options.signal.aborted) {
        throw Object.assign(new Error("aborted"), { name: "AbortError", code: "ABORT_ERR" });
      }
      const status = next.statusCode ?? 200;
      const body = next.body ?? "";
      return {
        statusCode: status,
        headers: { "content-type": "text/html" },
        body: { text: async () => body },
      };
    },
  };
  return fake;
}

function makeSilentLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Mock SchedulerDb (kontrakt T34)
// ──────────────────────────────────────────────────────────────────────────

interface MockDb extends SchedulerDb {
  calls: {
    createScrapeRun: number;
    finishScrapeRun: number;
    upsertAuction: number;
    archiveFinishedAuctions: number;
    getEndingSoonIds: number;
    fetchAllAuctionSummaries: number;
    refreshFacetCounts: number;
    upsertItems: number;
    upsertOutfits: number;
    upsertMounts: number;
    recordScrapeError: number;
    fetchCalibrationSamples: number;
    recordCalibrationRun: number;
    computeValuations: number;
  };
}

function makeMockDb(overrides: Partial<SchedulerDb> = {}): MockDb {
  const calls = {
    createScrapeRun: 0,
    finishScrapeRun: 0,
    upsertAuction: 0,
    archiveFinishedAuctions: 0,
    getEndingSoonIds: 0,
    fetchAllAuctionSummaries: 0,
    refreshFacetCounts: 0,
    upsertItems: 0,
    upsertOutfits: 0,
    upsertMounts: 0,
    recordScrapeError: 0,
    fetchCalibrationSamples: 0,
    recordCalibrationRun: 0,
    computeValuations: 0,
  };
  let runCounter = 0n;

  const db: MockDb = {
    calls,
    async createScrapeRun({ runType }) {
      calls.createScrapeRun += 1;
      runCounter += 1n;
      const rt = (db as unknown as { _runTypes: Array<{ id: bigint; runType: string }> })._runTypes;
      (db as unknown as { _runTypes: Array<{ id: bigint; runType: string }> })._runTypes = [
        ...(rt ?? []),
        { id: runCounter, runType },
      ];
      return runCounter;
    },
    async finishScrapeRun(id, payload) {
      calls.finishScrapeRun += 1;
      const runs =
        (
          db as unknown as {
            _runs: Map<
              bigint,
              {
                id: bigint;
                status: string;
                pagesFetched: number;
                auctionsFound: number;
                auctionsNew: number;
                auctionsUpd: number;
                auctionsArch: number;
                errorsCount: number;
                errorSummary?: Record<string, unknown> | undefined;
              }
            >;
          }
        )._runs ?? new Map();
      const record: {
        id: bigint;
        status: string;
        pagesFetched: number;
        auctionsFound: number;
        auctionsNew: number;
        auctionsUpd: number;
        auctionsArch: number;
        errorsCount: number;
        errorSummary?: Record<string, unknown>;
      } = {
        id,
        status: payload.status,
        pagesFetched: payload.pagesFetched,
        auctionsFound: payload.auctionsFound,
        auctionsNew: payload.auctionsNew,
        auctionsUpd: payload.auctionsUpd,
        auctionsArch: payload.auctionsArch,
        errorsCount: payload.errorsCount,
      };
      if (payload.errorSummary !== undefined) record.errorSummary = payload.errorSummary;
      runs.set(id, record);
      (db as unknown as { _runs: typeof runs })._runs = runs;
    },
    async fetchAllAuctionSummaries() {
      calls.fetchAllAuctionSummaries += 1;
      const fallback = (): Awaited<ReturnType<SchedulerDb["fetchAllAuctionSummaries"]>> => [];
      return (overrides.fetchAllAuctionSummaries ?? (async () => fallback()))();
    },
    async upsertAuction(input) {
      calls.upsertAuction += 1;
      return (overrides.upsertAuction ?? (async () => ({ kind: "new" as const })))(input);
    },
    async archiveFinishedAuctions(ids) {
      calls.archiveFinishedAuctions += 1;
      return (overrides.archiveFinishedAuctions ?? (async () => ids.length))(ids);
    },
    async getEndingSoonIds(withinHours) {
      calls.getEndingSoonIds += 1;
      return (overrides.getEndingSoonIds ?? (async () => [] as readonly bigint[]))(withinHours);
    },
    async upsertItems(items) {
      calls.upsertItems += 1;
      return (overrides.upsertItems ?? (async () => items.length))(items);
    },
    async upsertOutfits(outfits) {
      calls.upsertOutfits += 1;
      return (overrides.upsertOutfits ?? (async () => outfits.length))(outfits);
    },
    async upsertMounts(mounts) {
      calls.upsertMounts += 1;
      return (overrides.upsertMounts ?? (async () => mounts.length))(mounts);
    },
    async refreshFacetCounts() {
      calls.refreshFacetCounts += 1;
      return (overrides.refreshFacetCounts ?? (async () => undefined))();
    },
    async recordScrapeError(input) {
      calls.recordScrapeError += 1;
      return (overrides.recordScrapeError ?? (async () => undefined))(input);
    },
    // ── Calibration (T57) — domyślnie: 0 próbek, no-op persist. ─────
    async fetchCalibrationSamples(opts) {
      calls.fetchCalibrationSamples += 1;
      const fallback = (): Awaited<ReturnType<SchedulerDb["fetchCalibrationSamples"]>> => [];
      return (overrides.fetchCalibrationSamples ?? (async () => fallback()))({
        windowHours: opts.windowHours,
      });
    },
    async recordCalibrationRun(input) {
      calls.recordCalibrationRun += 1;
      return (overrides.recordCalibrationRun ?? (async () => undefined))(input);
    },

    async computeValuations() {
      calls.computeValuations += 1;
      return (
        overrides.computeValuations ?? (async () => ({ computed: 0, skipped: 0, failed: 0 }))
      )();
    },
    async end() {
      // no-op
    },
  };

  return db;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** HttpClient z retry=0 (instant fail), delayMs=0, no jitter. */
function makeFastClient(fake: FakeRequester) {
  return createHttpClient({
    requester: fake.impl,
    sleepFn: () => Promise.resolve(),
    random: () => 0.5,
    delayMs: 0,
    maxConcurrent: 4,
    config: { maxRetries: 0, backoffBaseMs: 0, backoffCapMs: 0, timeoutMs: 1000 },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Testy
// ──────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetBudget();
  resetBudgetConfig();
  delete process.env.SCRAPER_MAX_TIBIA_REQS_PER_MIN;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createScheduler — start/stop lifecycle", () => {
  it("start() aktywuje 3 timery + natychmiastowy kickoff (full + endingSoon)", () => {
    const db = makeMockDb();
    const fake = makeFakeRequester();
    const handle = createScheduler(db, makeFastClient(fake), {
      logger: makeSilentLogger(),
      intervals: { fullMs: 10_000, endingSoonMs: 10_000, referenceMs: 10_000 },
    });

    expect(handle.isStopped()).toBe(false);
    expect(handle.getStats().intervalsActive).toBe(0);

    handle.start();
    expect(handle.getStats().intervalsActive).toBe(3);
    // Kickoff: 2 iteracje (full + endingSoon) startują od razu, bez czekania
    // interwału — po restarcie kontenera dane płyną natychmiast, nie po 15 min.
    expect(handle.getStats().inFlight).toBe(2);

    void handle.stop();
  });

  it("stop() jest idempotentny (podwójne wywołanie bez throw)", async () => {
    const db = makeMockDb();
    const fake = makeFakeRequester();
    const handle = createScheduler(db, makeFastClient(fake), { logger: makeSilentLogger() });
    handle.start();
    await handle.stop();
    await expect(handle.stop()).resolves.toBeUndefined();
    expect(handle.isStopped()).toBe(true);
  });

  it("runOnce() wywołuje pojedynczą iterację bez start() (manual trigger)", async () => {
    const db = makeMockDb();
    // 1 aukcja → 1 detail fetch (default).
    const fake = makeFakeRequester([{ body: makeListPage({ count: 1, totalPages: 1 }) }]);
    const handle = createScheduler(db, makeFastClient(fake), { logger: makeSilentLogger() });

    await handle.runOnce("full");

    expect(db.calls.createScrapeRun).toBe(1);
    expect(db.calls.finishScrapeRun).toBe(1);
    expect(handle.getStats().full.executed).toBe(1);
  });
});

describe("createScheduler — Full loop (15 min)", () => {
  it("po 2 iteracjach: 2 scrape_runs + REFRESH MV + revalidate webhook", async () => {
    const db = makeMockDb();
    const fake = makeFakeRequester([
      { body: makeListPage({ count: 1, totalPages: 1 }) },
      { body: makeListPage({ count: 1, totalPages: 1, auctionIdPrefix: 200n }) },
    ]);
    const revalidate = { revalidate: vi.fn().mockResolvedValue(undefined) };
    const handle = createScheduler(db, makeFastClient(fake), {
      logger: makeSilentLogger(),
      revalidate,
    });

    await handle.runOnce("full");
    await handle.runOnce("full");

    expect(db.calls.createScrapeRun).toBe(2);
    expect(db.calls.finishScrapeRun).toBe(2);
    expect(db.calls.refreshFacetCounts).toBe(2);
    expect(revalidate.revalidate).toHaveBeenCalledTimes(2);
    expect(revalidate.revalidate).toHaveBeenCalledWith({
      tags: ["auctions", "auction-list"],
    });
  });

  it("upsert detail dla 'new' aukcji z diff (Full loop)", async () => {
    // Diff: poprzednia lista pusta → wszystkie 3 aukcje są 'new'.
    const db = makeMockDb();
    const fake = makeFakeRequester([
      { body: makeListPage({ count: 3, totalPages: 1, auctionIdPrefix: 500n }) },
    ]);
    fake.setDefault({ body: makeDetailPage({ id: 999n }) });
    const handle = createScheduler(db, makeFastClient(fake), { logger: makeSilentLogger() });

    await handle.runOnce("full");

    expect(db.calls.upsertAuction).toBe(3);
    expect(db.calls.fetchAllAuctionSummaries).toBe(1);
    expect(handle.getStats().full.upserted).toBe(3);
  });
});

describe("createScheduler — EndingSoon loop (30 s)", () => {
  it("fetch detail TYLKO dla IDs z getEndingSoonIds()", async () => {
    const endingSoonIds = [1n, 2n, 3n];
    const db = makeMockDb({
      getEndingSoonIds: async () => endingSoonIds,
    });
    const fake = makeFakeRequester(endingSoonIds.map((id) => ({ body: makeDetailPage({ id }) })));
    const handle = createScheduler(db, makeFastClient(fake), { logger: makeSilentLogger() });

    await handle.runOnce("endingSoon");

    expect(db.calls.getEndingSoonIds).toBe(1);
    expect(db.calls.upsertAuction).toBe(3);
    expect(fake.calls).toHaveLength(3);
    expect(fake.calls.every((c) => c.url.includes("auctionid="))).toBe(true);
    expect(db.calls.refreshFacetCounts).toBe(0);
  });

  it("EndingSoon NIE wywołuje refresh ani revalidate (live SSE flow)", async () => {
    const db = makeMockDb({
      getEndingSoonIds: async () => [42n],
    });
    const fake = makeFakeRequester([{ body: makeDetailPage({ id: 42n }) }]);
    const revalidate = { revalidate: vi.fn() };
    const handle = createScheduler(db, makeFastClient(fake), {
      logger: makeSilentLogger(),
      revalidate,
    });

    await handle.runOnce("endingSoon");

    expect(db.calls.refreshFacetCounts).toBe(0);
    expect(revalidate.revalidate).not.toHaveBeenCalled();
  });
});

describe("createScheduler — Reference loop (24 h)", () => {
  it("Reference: po scrape wywołuje runCalibration (T57 — pętla feedbacku valuation_history vs final_price)", async () => {
    // T57: kalibracja wyceny — po każdym Reference loop scheduler wywołuje
    // `runCalibration(db)`, która:
    //   1. fetchCalibrationSamples({ windowHours: 168 })
    //   2. recordCalibrationRun({ report })
    //
    // Testujemy WIRING (nie logikę kalibracji — ta jest w calibration.test.ts).
    const db = makeMockDb();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("forced network failure")) as unknown as typeof fetch;

    try {
      const handle = createScheduler(db, undefined, { logger: makeSilentLogger() });
      await handle.runOnce("reference");

      // scrape run (reference) został utworzony + zamknięty.
      expect(db.calls.createScrapeRun).toBe(1);
      expect(db.calls.finishScrapeRun).toBe(1);

      // Calibration methods wywołane.
      expect(db.calls.fetchCalibrationSamples).toBe(1);
      expect(db.calls.recordCalibrationRun).toBe(1);

      // Stats: calibrationsRun inkrementowany (T57).
      expect(handle.getStats().reference.calibrationsRun).toBe(1);
      expect(handle.getStats().reference.executed).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Reference: scrapeReferenceData error → raportowany w scrape_runs (status=partial/failed)", async () => {
    // Pełny `scrapeReferenceData` (T32) skanuje 500×4 outfitów + 300 mountów
    // + 6 items = ~2300 HEAD requests → zbyt wolny dla testów.
    //
    // Testujemy ścieżkę BŁĘDU: wymuszamy throw z fetch → scheduler raportuje
    // to jako failed run. Weryfikujemy pipeline (createScrapeRun + finishScrapeRun
    // + zapis runType='reference'), zamiast samej logiki scrapeReferenceData
    // (która ma własne testy w scrapers/reference-data.test.ts).
    const db = makeMockDb();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("forced network failure")) as unknown as typeof fetch;

    try {
      const handle = createScheduler(db, undefined, { logger: makeSilentLogger() });
      await handle.runOnce("reference");

      expect(db.calls.createScrapeRun).toBe(1);
      expect(db.calls.finishScrapeRun).toBe(1);
      const runs = (db as unknown as { _runTypes: Array<{ id: bigint; runType: string }> })
        ._runTypes;
      expect(runs?.[0]?.runType).toBe("reference");
      // Upsert NIE został wywołany (fetch error → brak danych do upsert).
      // Scheduler raportuje to jako 'failed'.
      const finished = (
        db as unknown as { _runs: Map<bigint, { status: string; errorsCount: number }> }
      )._runs;
      const firstRun = [...finished.values()][0];
      expect(firstRun?.status).toBe("failed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("createScheduler — Error handling", () => {
  it("per-auction HTTP 500 → loop KONTYNUUJE (NIE crashuje)", async () => {
    // 4 IDs: 2× fail (retry exhausted → throw), 2× success.
    const ids = [10n, 11n, 12n, 13n];
    const db = makeMockDb({
      getEndingSoonIds: async () => ids,
    });
    const fake = makeFakeRequester([
      { statusCode: 500 }, // 10n
      { statusCode: 500 }, // 11n
      { body: makeDetailPage({ id: 12n }) },
      { body: makeDetailPage({ id: 13n }) },
    ]);
    const handle = createScheduler(db, makeFastClient(fake), { logger: makeSilentLogger() });

    await handle.runOnce("endingSoon");

    expect(db.calls.recordScrapeError).toBeGreaterThanOrEqual(2);
    expect(handle.getStats().endingSoon.upserted).toBe(2);
    expect(handle.getStats().endingSoon.executed).toBe(1);
  });

  it("getEndingSoonIds throws → loop raportuje error w scrape_runs (status=failed)", async () => {
    const db = makeMockDb({
      getEndingSoonIds: async () => {
        throw new Error("DB connection lost");
      },
    });
    const fake = makeFakeRequester();
    const handle = createScheduler(db, makeFastClient(fake), { logger: makeSilentLogger() });

    await handle.runOnce("endingSoon");

    expect(db.calls.createScrapeRun).toBe(1);
    expect(db.calls.finishScrapeRun).toBe(1);
    const runs = (
      db as unknown as {
        _runs: Map<
          bigint,
          { status: string; errorsCount: number; errorSummary?: Record<string, unknown> }
        >;
      }
    )._runs;
    const firstRun = [...runs.values()][0];
    expect(firstRun?.status).toBe("failed");
    expect(firstRun?.errorsCount).toBe(1);
    expect(firstRun?.errorSummary?.stage).toBe("getEndingSoonIds");
  });
});

describe("createScheduler — R11 budget coordination", () => {
  it("R11 budget exceeded → throttling blokuje loop (test kończy przed czasem)", async () => {
    process.env.SCRAPER_MAX_TIBIA_REQS_PER_MIN = "2";

    const db = makeMockDb();
    // 5 aukcji na 1 stronie → 1 page fetch + 5 detail fetches = 6 requestów.
    const fake = makeFakeRequester([
      { body: makeListPage({ count: 5, totalPages: 1, auctionIdPrefix: 700n }) },
    ]);
    fake.setDefault({ body: makeDetailPage({ id: 0n }) });
    const handle = createScheduler(db, makeFastClient(fake), { logger: makeSilentLogger() });

    const promise = handle.runOnce("full");
    const result = await Promise.race([promise, sleep(1500).then(() => "throttled" as const)]);

    // Jeśli budget nie został przekroczony, pętla kończy się normalnie.
    // Tu mamy 6 requestów z limitem 2 → throttle blokuje → test musi skończyć
    // się przez zewnętrzny timeout (1.5s).
    expect(result).toBe("throttled");
    // Stop z await — in-flight throttle czeka do 5s grace period.
    await handle.stop();
    delete process.env.SCRAPER_MAX_TIBIA_REQS_PER_MIN;
    resetBudgetConfig();
  }, 10_000);
});

describe("createScheduler — Advisory lock", () => {
  it("advisory lock BUSY (inny proces) → iteracja skipped (stats.skipped++)", async () => {
    const busyLockClient = {
      tryAdvisoryLock: vi.fn().mockResolvedValue(false),
      releaseAdvisoryLock: vi.fn().mockResolvedValue(undefined),
    };

    const db = makeMockDb();
    const fake = makeFakeRequester();
    const handle = createScheduler(db, makeFastClient(fake), {
      logger: makeSilentLogger(),
      lockClient: busyLockClient,
    });

    await handle.runOnce("full");

    expect(busyLockClient.tryAdvisoryLock).toHaveBeenCalled();
    expect(db.calls.createScrapeRun).toBe(0);
    expect(handle.getStats().full.skipped).toBeGreaterThanOrEqual(1);
    expect(handle.getStats().full.executed).toBe(0);
  });

  it("advisory lock ACQUIRED → iteracja executed, lock RELEASED", async () => {
    let acquired = false;
    let released = false;
    const lockClient = {
      tryAdvisoryLock: vi.fn().mockImplementation(() => {
        acquired = true;
        return Promise.resolve(true);
      }),
      releaseAdvisoryLock: vi.fn().mockImplementation(() => {
        released = true;
        return Promise.resolve();
      }),
    };

    const db = makeMockDb();
    const fake = makeFakeRequester([{ body: makeListPage({ count: 1, totalPages: 1 }) }]);
    const handle = createScheduler(db, makeFastClient(fake), {
      logger: makeSilentLogger(),
      lockClient,
    });

    await handle.runOnce("full");

    expect(acquired).toBe(true);
    expect(released).toBe(true);
    expect(lockClient.tryAdvisoryLock).toHaveBeenCalledTimes(1);
    expect(lockClient.releaseAdvisoryLock).toHaveBeenCalledTimes(1);
    expect(handle.getStats().full.executed).toBe(1);
  });
});

describe("createScheduler — Graceful shutdown", () => {
  it("stop() podczas iteracji → in-flight awaited + intervals cleared", async () => {
    const db = makeMockDb();
    // Symulacja wolnej sieci: page fetch szybki, detail fetch honoruje AbortSignal
    // (rzuca AbortError gdy signal.aborted = true — jak prawdziwy undici).
    let abortListener: (() => void) | undefined;
    const slowFetcher: FakeRequester = {
      impl: undefined as unknown as Requester,
      calls: [],
      setQueue: () => undefined,
      setDefault: () => undefined,
    };
    slowFetcher.impl = {
      async request(url: string, options: { signal: AbortSignal }) {
        if (url.includes("currentpage=")) {
          return {
            statusCode: 200,
            headers: { "content-type": "text/html" },
            body: { text: async () => makeListPage({ count: 1, totalPages: 1 }) },
          };
        }
        // Detail fetch: czekaj na abort lub 500 ms (cokolwiek pierwsze).
        // Gdy signal abortuje → rzuć AbortError (jak undici).
        await new Promise<void>((resolve) => {
          abortListener = () => resolve();
          if (options.signal.aborted) {
            resolve();
            return;
          }
          options.signal.addEventListener("abort", () => resolve(), { once: true });
          setTimeout(resolve, 5_000); // safety timeout
        });
        if (options.signal.aborted) {
          throw Object.assign(new Error("aborted"), { name: "AbortError", code: "ABORT_ERR" });
        }
        return {
          statusCode: 200,
          headers: { "content-type": "text/html" },
          body: { text: async () => makeDetailPage({ id: 1n }) },
        };
      },
    };
    const http = createHttpClient({
      requester: slowFetcher.impl,
      sleepFn: () => Promise.resolve(),
      random: () => 0.5,
      delayMs: 0,
      maxConcurrent: 4,
      config: { maxRetries: 0, timeoutMs: 5_000 },
    });

    const handle = createScheduler(db, http, {
      logger: makeSilentLogger(),
      intervals: { fullMs: 30, endingSoonMs: 60_000, referenceMs: 60_000 },
    });
    handle.start();

    await sleep(80);
    expect(handle.getStats().inFlight).toBeGreaterThan(0);

    const stopStart = Date.now();
    await handle.stop();
    const stopDuration = Date.now() - stopStart;

    expect(handle.isStopped()).toBe(true);
    expect(handle.getStats().intervalsActive).toBe(0);
    expect(handle.getStats().inFlight).toBe(0);
    expect(stopDuration).toBeLessThan(2_000);
    void abortListener; // silence unused
  });

  it("stop() force-exit po 5s jeśli in-flight nie kończy się", async () => {
    const db = makeMockDb();
    let neverResolves: Promise<string> | undefined;
    const hungFetcher: FakeRequester = {
      impl: undefined as unknown as Requester,
      calls: [],
      setQueue: () => undefined,
      setDefault: () => undefined,
    };
    hungFetcher.impl = {
      async request(url: string) {
        if (url.includes("currentpage=")) {
          return {
            statusCode: 200,
            headers: { "content-type": "text/html" },
            body: { text: async () => makeListPage({ count: 1, totalPages: 1 }) },
          };
        }
        neverResolves = new Promise<string>(() => {
          /* never */
        });
        return {
          statusCode: 200,
          headers: { "content-type": "text/html" },
          body: { text: async (): Promise<string> => await (neverResolves as Promise<string>) },
        };
      },
    };
    const http = createHttpClient({
      requester: hungFetcher.impl,
      sleepFn: () => Promise.resolve(),
      random: () => 0.5,
      delayMs: 0,
      maxConcurrent: 4,
      config: { maxRetries: 0, timeoutMs: 5_000 },
    });
    const logger = makeSilentLogger();
    const handle = createScheduler(db, http, {
      logger,
      intervals: { fullMs: 30, endingSoonMs: 60_000, referenceMs: 60_000 },
    });
    handle.start();
    await sleep(60);
    expect(handle.getStats().inFlight).toBeGreaterThan(0);

    const start = Date.now();
    await handle.stop();
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThanOrEqual(4_500);
    expect(duration).toBeLessThan(7_000);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Graceful shutdown timeout"),
      expect.any(Object),
    );
  }, 10_000);
});

describe("createScheduler — Periodic execution", () => {
  it("start() z krótkimi interwałami → loop wykonuje się N razy", async () => {
    const db = makeMockDb({
      getEndingSoonIds: async () => [],
    });
    const fake = makeFakeRequester([{ body: makeListPage({ count: 0, totalPages: 1 }) }]);
    const handle = createScheduler(db, makeFastClient(fake), {
      logger: makeSilentLogger(),
      intervals: { fullMs: 50, endingSoonMs: 60_000, referenceMs: 60_000 },
    });

    handle.start();
    await sleep(280);

    const beforeStop = db.calls.createScrapeRun;
    expect(beforeStop).toBeGreaterThanOrEqual(3);

    await handle.stop();
  });
});
