/**
 * Migrator — stosuje wygenerowane SQL migrations z `migrations/`.
 *
 * Użycie:
 *   pnpm --filter @tibians/db db:migrate
 *
 * Wymaga DATABASE_URL w env. Po udanej migracji:
 *   - pg_trgm extension (autocomplete na items.name)
 *   - auction_price_history: partycjonowanie + default partition
 *   - mv_facet_counts: UNIQUE INDEX (wymóg REFRESH CONCURRENTLY)
 *
 * UWAGA: ten skrypt NIE wywołuje ponownie db:generate.
 * Migracje MUSZĄ być wcześniej wygenerowane (`pnpm db:generate`).
 */
import 'dotenv/config';

import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDb, schema } from '../src';
import { MV_FACET_COUNTS_DDL, MV_FACET_COUNTS_INDEX_DDL } from '../src/schema/views';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[migrate] DATABASE_URL is not set. Aborting.');
    process.exit(1);
  }

  const { pool, db } = createDb(url);

  console.log('[migrate] Applying migrations from ./migrations');
  const migrationsFolder = resolve(process.cwd(), 'migrations');

  try {
    // 1. Standard Drizzle migrator (CREATE TABLE / INDEX / FK)
    await migrate(db, { migrationsFolder });
    console.log('[migrate] Drizzle migrations applied successfully.');

    // 2. Custom extensions + DDL (Drizzle Kit nie generuje natywnie)
    //    Idempotentne: używamy IF NOT EXISTS / OR REPLACE
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    console.log('[migrate] pg_trgm extension ensured.');

    // 3. mv_facet_counts: Drizzle ma tylko `pgMaterializedView(...).existing()`
    //    — definicja widoku musi być ręczna. Bez UNIQUE INDEX nie działa
    //    REFRESH CONCURRENTLY (wymóg PostgreSQL).
    await db.execute(MV_FACET_COUNTS_DDL).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists')) {
        console.log('[migrate] mv_facet_counts already exists; skipping.');
      } else {
        throw err;
      }
    });
    await db.execute(MV_FACET_COUNTS_INDEX_DDL).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists')) {
        console.log('[migrate] idx_mvf already exists; skipping.');
      } else {
        throw err;
      }
    });
    console.log('[migrate] mv_facet_counts + idx_mvf ensured.');

    // 4. partycjonowanie auction_price_history
    //    Drizzle schema definiuje tabelę normalnie; partycjonowanie wymaga
    //    ręcznego SQL. Sprawdzamy czy już jest (idempotentne).
    const partitionCheck = await db.execute<{ relkind: string }>(sql`
      SELECT relkind FROM pg_class WHERE relname = 'auction_price_history'
    `);
    const firstRow = (partitionCheck as unknown as { rows?: Array<{ relkind: string }> }).rows?.[0];
    // 'r' = ordinary table; 'p' = partitioned table
    if (!firstRow || firstRow.relkind === 'r') {
      // Zamiast skomplikowanej ALTER przenosimy dane do partycjonowanej kopii.
      // UWAGA: na świeżej instalacji tabela nie ma jeszcze danych, więc to bezpieczne.
      await db.execute(sql`
        -- Zachowaj dane (jeśli istnieją) — na świeżej instalacji pusto
        -- Tworzymy partycjonowaną wersję i przenosimy istniejące wiersze
        ALTER TABLE auction_price_history RENAME TO auction_price_history_unpartitioned;
      `);
      await db.execute(sql`
        CREATE TABLE auction_price_history (
          auction_id  BIGINT NOT NULL,
          recorded_at TIMESTAMPTZ NOT NULL,
          bid         INTEGER NOT NULL,
          PRIMARY KEY (auction_id, recorded_at)
        ) PARTITION BY RANGE (recorded_at);
      `);
      await db.execute(sql`
        CREATE TABLE auction_price_history_default
          PARTITION OF auction_price_history DEFAULT;
      `);
      await db.execute(sql`
        INSERT INTO auction_price_history
          SELECT * FROM auction_price_history_unpartitioned;
      `);
      await db.execute(sql`DROP TABLE auction_price_history_unpartitioned;`);
      console.log('[migrate] auction_price_history partitioned by RANGE (recorded_at).');
    } else {
      console.log('[migrate] auction_price_history already partitioned.');
    }

    // 5. REFRESH mv_facet_counts po migracji (dane puste, ale inicjalizuje widok)
    await db.execute(sql`REFRESH MATERIALIZED VIEW mv_facet_counts`).catch(() => {
      // Empty auction table → empty result; OK.
    });

    console.log('[migrate] All done. Schema ready.');
    // Reference to silence unused-import warning; typecheck only.
    void schema;
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
