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
import 'dotenv/config';
import { type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from './schema';
export * from './schema';
export * from './seed';
export * from './config-loader';
/**
 * Tworzy nowy pg.Pool + Drizzle wrapper.
 * Używane przez `createDb` (testy) oraz przez `scripts/migrate.ts`.
 */
export declare function createDb(connectionString: string): {
    pool: Pool;
    db: NodePgDatabase<typeof schema>;
};
/**
 * Główny klient DB. Pierwsze użycie otwiera pulę.
 *
 * NOTE: eksportujemy `db` przez getter, żeby inicjalizacja była leniwa
 * (typecheck/build nie wymaga DATABASE_URL). Konsumenci traktują to jak
 * zwykły obiekt — `db.select()`, `db.insert()`, `db.execute(sql\`...\`)`.
 */
export declare const db: NodePgDatabase<typeof schema>;
/**
 * pg.Pool — do raw queries, migracji, transakcji.
 */
export declare const pool: Pool;
/**
 * Graceful shutdown — wywołaj w handler SIGTERM/SIGINT w long-running workerach
 * (scraper, scheduler) żeby nie zostawiać otwartych połączeń.
 */
export declare function closeDb(): Promise<void>;
//# sourceMappingURL=index.d.ts.map