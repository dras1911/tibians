/**
 * Punkt wejścia workera scrapera (@tibians/scraper).
 *
 * Pipeline (arch §2.4 / §8.3):
 *   - SIGTERM/SIGINT → graceful shutdown (clearInterval + drain in-flight + close DB)
 *   - 3 niezależne pętle: Full 15min / EndingSoon 30s / Reference 24h
 *   - R11 budget coordination (wspólny z self-hosted TibiaData)
 *   - pg_try_advisory_lock (anti-overlap)
 *
 * Powiązania:
 *   - T36 — `createScheduler` (ten plik + `scheduler.ts`)
 *   - T38 — `RevalidateWebhook` (placeholder — faktyczna implementacja w apps/web)
 *
 * Decyzja architektoniczna: ten moduł NIE importuje `@tibians/db` statycznie.
 * Cały dostęp do bazy idzie przez interfejs `SchedulerDb` (wstrzykiwany przez
 * `startScheduler(db)`). Dzięki temu:
 *   - typecheck/build nie wymaga DATABASE_URL,
 *   - testy wstrzykują mocka (zero real PG),
 *   - T34 może dostarczyć własną implementację `SchedulerDb` bez ruszania
 *     tego pliku.
 *
 * Produkcyjny bootstrap (np. `apps/scraper/scripts/start.ts`) wygląda tak:
 *   import { pool, closeDb } from '@tibians/db';
 *   import { startScheduler } from '@tibians/scraper';
 *   import { createPgSchedulerDb, createPgAdvisoryLockClient } from './wiring';
 *
 *   const db = createPgSchedulerDb(pool);
 *   const handle = startScheduler(db, { lockClient: createPgAdvisoryLockClient(pool) });
 */
import {
  createScheduler,
  type Logger,
  type RevalidateWebhook,
  type SchedulerDb,
  type SchedulerHandle,
} from "./scheduler.js";

/** Console-based logger — krótki alias dla wygody w `index.ts`. */
const consoleLogger: Logger = {
  debug: (msg, ctx) => console.debug(`[scraper] ${msg}`, ctx ?? {}),
  info: (msg, ctx) => console.log(`[scraper] ${msg}`, ctx ?? {}),
  warn: (msg, ctx) => console.warn(`[scraper] ${msg}`, ctx ?? {}),
  error: (msg, ctx) => console.error(`[scraper] ${msg}`, ctx ?? {}),
};

/**
 * Domyślny webhook do `/api/revalidate` (T38).
 *
 * MVP: HTTP POST z `SCRAPER_SECRET` jako `x-scraper-secret` header.
 * Pełna implementacja (HMAC, retry, circuit-breaker) przyjdzie w T38.
 * Tutaj używamy globalnego `fetch` (undici v8+ na Node 22 LTS).
 */
function makeDefaultRevalidate(): RevalidateWebhook {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const secret = process.env.SCRAPER_SECRET ?? "";
  return {
    async revalidate(payload) {
      if (!secret) {
        consoleLogger.warn("SCRAPER_SECRET not set — skipping revalidate", {});
        return;
      }
      const res = await fetch(`${siteUrl}/api/revalidate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-scraper-secret": secret,
        },
        body: JSON.stringify({
          paths: payload.paths ? [...payload.paths] : undefined,
          tags: payload.tags ? [...payload.tags] : undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(`revalidate failed: ${res.status} ${res.statusText}`);
      }
    },
  };
}

/**
 * Uruchom 3-pętlowy scheduler.
 *
 * @param db      — implementacja SchedulerDb (T34: Drizzle-backed).
 * @param options.revalidate — opcjonalny webhook; domyślnie HTTP do /api/revalidate.
 *
 * Zwraca `SchedulerHandle` z `stop()` do graceful shutdown. Handlerów
 * SIGTERM/SIGINT NIE instaluejemy automatycznie — to odpowiedzialność
 * procesu-bootstrapa (żeby uniknąć podwójnego shutdown w testach i dev).
 */
export function startScheduler(
  db: SchedulerDb,
  options: {
    revalidate?: RevalidateWebhook;
    lockClient?: import("./advisory-lock.js").AdvisoryLockClient;
  } = {},
): SchedulerHandle {
  const handle = createScheduler(db, undefined, {
    logger: consoleLogger,
    revalidate: options.revalidate ?? makeDefaultRevalidate(),
    ...(options.lockClient ? { lockClient: options.lockClient } : {}),
  });
  handle.start();
  return handle;
}

// ──────────────────────────────────────────────────────────────────────────
// ENTRYPOINT PRODUKCYJNY
// ──────────────────────────────────────────────────────────────────────────
//
// UWAGA: ten moduł jest BIBLIOTEKĄ, nie CLI. Wcześniej rejestrował tu własne
// handlery SIGTERM/SIGINT wołające `process.exit(0)` natychmiast — to psuło
// graceful shutdown, bo `SchedulerHandle.stop()` (drain in-flight iteracji +
// zwolnienie advisory locka + zamknięcie poola) nigdy się nie wykonywał.
// Handlery usunięto: shutdown należy do procesu-bootstrapa, który jako jedyny
// ma dostęp do `SchedulerHandle`.
//
// Produkcyjny entrypoint: `apps/scraper/scripts/start.ts`
// (patrz `Dockerfile.scraper` → CMD).
//
// Uruchomienie samego `src/index.ts` nie robi już nic — to celowe.

// Re-eksport API dla konsumentów (testy, docker-entrypoint, integracja).
export { createScheduler } from "./scheduler.js";
export type {
  SchedulerDb,
  SchedulerHandle,
  RevalidateWebhook,
  Logger,
  SchedulerStats,
  LoopStats,
  LoopName,
  UpsertAuctionInput,
  UpsertAuctionResult,
  RunMetrics,
  ScrapeRunType,
} from "./scheduler.js";

// Re-eksport calibration (T57 — arch §8.4 pętla feedbacku valuation_history vs final_price).
export {
  runCalibration,
  DEFAULT_CALIBRATION_WINDOW_HOURS,
  DEFAULT_WORST_CASES_LIMIT,
  computeErrorPct,
  mean,
  median,
} from "./calibration.js";
export type {
  CalibrationDb,
  CalibrationOptions,
  CalibrationSample,
  CalibrationResult,
  CalibrationReport,
  VocationCalibrationStats,
} from "./calibration.js";