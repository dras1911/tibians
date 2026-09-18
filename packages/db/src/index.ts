/**
 * @tibians/db — publiczny punkt wejścia.
 *
 * Eksportuje:
 * - `db`           — singleton puli połączeń (node-postgres + Drizzle)
 * - `pool`         — pg.Pool (do raw queries / migracji)
 * - `schema`       — pełny obiekt schema dla type-safe queries
 * - `createDb`     — fabryka dla wielu baz (np. testy, multi-tenant)
 * - `runSeeds`     — orkiestrator seedów
 * - `*`            — re-eksport tabel, typów, helperów migracyjnych
 *
 * Użycie:
 *   import { db } from '@tibians/db';
 *   import { auctions } from '@tibians/db/schema';
 *   const rows = await db.select().from(auctions).where(...);
 *
 * Połączenie jest lazy: dopiero pierwsze wywołanie `db`/`pool` otwiera pulę.
 * Pozwala to na typecheck/build bez ustawionego DATABASE_URL.
 */
import "dotenv/config";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { schema } from "./schema";

export * from "./schema";
export * from "./seed";
export * from "./config-loader";
export * from "./queries";

/**
 * Tworzy nowy pg.Pool + Drizzle wrapper.
 * Używane przez `createDb` (testy) oraz przez `scripts/migrate.ts`.
 */
export function createDb(connectionString: string): {
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
} {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

/* ════════════════════════════════════════════════════════════════
 *  Singleton (lazy) — jeden Pool per proces
 * ════════════════════════════════════════════════════════════════ */

interface DbState {
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
}

const globalForDb = globalThis as unknown as {
  __tibiansDbState?: DbState | undefined;
};

function getState(): DbState {
  if (!globalForDb.__tibiansDbState) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "[@tibians/db] DATABASE_URL is not set. Copy .env.example to .env and configure it.",
      );
    }
    const pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      // Nazwa aplikacji w `pg_stat_activity` — pozwala m.in. ubijać zombie
      // sesje po restarcie kontenera (cleanup w `apps/scraper/src/start.ts`).
      ...(process.env.PG_APP_NAME ? { application_name: process.env.PG_APP_NAME } : {}),
    });
    const db = drizzle(pool, { schema });
    globalForDb.__tibiansDbState = { pool, db };
  }
  return globalForDb.__tibiansDbState;
}

/**
 * Główny klient DB. Pierwsze użycie otwiera pulę.
 *
 * NOTE: eksportujemy `db` przez getter, żeby inicjalizacja była leniwa
 * (typecheck/build nie wymaga DATABASE_URL). Konsumenci traktują to jak
 * zwykły obiekt — `db.select()`, `db.insert()`, `db.execute(sql\`...\`)`.
 */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    const { db: realDb } = getState();
    const value = (realDb as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(realDb) : value;
  },
}) as NodePgDatabase<typeof schema>;

/**
 * pg.Pool — do raw queries, migracji, transakcji.
 */
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const { pool: realPool } = getState();
    const value = (realPool as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(realPool) : value;
  },
}) as Pool;

/**
 * Graceful shutdown — wywołaj w handler SIGTERM/SIGINT w long-running workerach
 * (scraper, scheduler) żeby nie zostawiać otwartych połączeń.
 */
export async function closeDb(): Promise<void> {
  if (globalForDb.__tibiansDbState) {
    await globalForDb.__tibiansDbState.pool.end();
    delete globalForDb.__tibiansDbState;
  }
}
