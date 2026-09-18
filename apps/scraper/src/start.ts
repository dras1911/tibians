/**
 * Produkcyjny bootstrap scrapera — entrypoint kontenera `scraper`.
 *
 * To jest plik, na który wskazuje `Dockerfile.scraper` (CMD). Wcześniej
 * kontener uruchamiał `dist/index.js`, który jedynie **eksportował**
 * funkcje — nic nie startował, więc baza zostawała pusta, a Bazaar
 * pokazywał 0 aukcji.
 *
 * DLACZEGO W `src/`, A NIE W `scripts/`:
 *   `apps/scraper/tsconfig.json` ma `rootDir: "src"` i include ograniczony
 *   do katalogu `src`. Plik w `scripts/` byłby poza projektem → nie byłby
 *   ani typecheckowany, ani kompilowany. Trzymanie bootstrapu w `src/`
 *   gwarantuje, że podlega tej samej weryfikacji co reszta kodu scrapera.
 *
 * Co robi:
 *   1. tworzy `SchedulerDb` na realnym poolu Postgresa (`createSchedulerDb`),
 *   2. tworzy `AdvisoryLockClient` (`createPgAdvisoryLockClient`) — mutex
 *      przeciw nakładaniu się 3 pętli (arch §8.3),
 *   3. startuje scheduler (`startScheduler` → 3 pętle),
 *   4. instaluje graceful shutdown na SIGTERM/SIGINT.
 *
 * ── DLACZEGO GRACEFUL SHUTDOWN MA ZNACZENIE ──────────────────────────
 * `SchedulerHandle.stop()` czeka na iteracje w locie (max ~5 s) i zamyka
 * zasoby. Bez tego `docker compose down` ucina zapis w połowie transakcji
 * i zostawia niezwolniony advisory lock (kolejny start zostałby pominięty
 * jako „lock zajęty"). Handlery rejestrujemy TYLKO tutaj — `src/index.ts`
 * celowo ich nie ma (wołał `process.exit(0)` natychmiast, psując shutdown).
 */
import { pool } from "@tibians/db";

import { createPgAdvisoryLockClient } from "./pg-advisory-lock.js";
import { startScheduler } from "./index.js";
import { createSchedulerDb } from "./wiring.js";

async function main(): Promise<void> {
  console.log("[start] Tibians scraper — bootstrap produkcyjny");

  // ── Cleanup zombie-sesji po poprzednim życiu kontenera ───────────────
  // Advisory locki są session-scoped: gdy proces scrapera zginie bez
  // graceful shutdownu (deploy/crash), stara sesja po stronie serwera żyje
  // dalej i trzyma lock → pętle dostają „Advisory lock busy" w kółko
  // (na produkcji ending-soon stał tak godzinami). Ubijamy sesje o naszej
  // nazwie aplikacji — `pg_terminate_backend` zwalnia ich locki.
  const appName = process.env.PG_APP_NAME;
  if (appName !== undefined && appName !== "") {
    try {
      const res = await pool.query(
        "SELECT pg_terminate_backend(pid) AS killed FROM pg_stat_activity WHERE application_name = $1 AND pid <> pg_backend_pid()",
        [appName],
      );
      if ((res.rowCount ?? 0) > 0) {
        console.log(`[start] ubitych zombie-sesji "${appName}": ${res.rowCount}`);
      }
    } catch (error) {
      console.warn("[start] cleanup zombie-sesji nie powiódł się:", error);
    }
  }

  const schedulerDb = createSchedulerDb();
  const lockClient = createPgAdvisoryLockClient(pool);

  const handle = startScheduler(schedulerDb, { lockClient });

  /**
   * Idempotentny shutdown: SIGTERM może przyjść dwa razy (np. `docker stop`
   * + własny timeout). Drugie wywołanie musi być no-opem.
   */
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`[start] ${signal} — graceful shutdown…`);
    try {
      // `stop()` zamyka pętle, czeka na in-flight i zamyka zasoby DB.
      await handle.stop();
      await lockClient.end?.();
      console.log("[start] shutdown zakończony");
    } catch (error) {
      console.error("[start] błąd podczas shutdownu:", error);
      process.exitCode = 1;
    }
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  console.log("[start] scheduler wystartował (Full 15min / EndingSoon 30s / Reference 24h)");
}

void main().catch((error: unknown) => {
  console.error("[start] FATAL — bootstrap nie powiódł się:", error);
  process.exit(1);
});
