/**
 * Materialised view: mv_facet_counts (arch §7.2).
 *
 * Drizzle ORM (stan na 0.36.x) nie ma natywnego API dla PostgreSQL
 * MATERIALIZED VIEW. Definiujemy ją jako Drizzle `pgView` (dostępne w core)
 * z `materialized: true`, plus unikalny indeks pod `REFRESH CONCURRENTLY`
 * (wymóg PostgreSQL — bez UNIQUE INDEX nie można robić REFRESH CONCURRENTLY).
 *
 * Użycie:
 *   - sidebar filtry pokazują „Knight (812)", „Sorcerer (123)"
 *   - po każdym full scrape: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts;`
 *   - CONCURRENTLY wymaga UNIQUE INDEX → dlatego `vocation_base` musi być UNIQUE
 *     w widoku (a jest, bo to GROUP BY + liczymy per vocation).
 */
import { sql } from 'drizzle-orm';
import { integer, numeric, pgMaterializedView, text } from 'drizzle-orm/pg-core';

export const mvFacetCounts = pgMaterializedView('mv_facet_counts', {
  vocationBase: text('vocation_base').notNull(),
  total: integer('total').notNull(),
  withSoulWar: integer('with_soul_war').notNull(),
  withPrimal: integer('with_primal').notNull(),
  withTransfer: integer('with_transfer').notNull(),
  minLevel: integer('min_level').notNull(),
  maxLevel: integer('max_level').notNull(),
  minBid: integer('min_bid').notNull(),
  maxBid: integer('max_bid').notNull(),
  medianBid: numeric('median_bid', { precision: 12, scale: 2 }).notNull(),
}).existing();

/**
 * SQL do zbudowania widoku + UNIQUE INDEX.
 * Wywoływane z migracji początkowej (`0001_init.sql`) przez drizzle-kit.
 *
 * UWAGA: Drizzle Kit NIE wygeneruje tego automatycznie dla `pgMaterializedView` —
 * musimy dodać ręcznie w custom migration SQL.
 */
export const MV_FACET_COUNTS_DDL = sql`
  CREATE MATERIALIZED VIEW mv_facet_counts AS
  SELECT
    vocation_base,
    COUNT(*)                                        AS total,
    COUNT(*) FILTER (WHERE has_soul_war)            AS with_soul_war,
    COUNT(*) FILTER (WHERE has_primal_ordeal)       AS with_primal,
    COUNT(*) FILTER (WHERE has_world_transfer)      AS with_transfer,
    MIN(level) AS min_level, MAX(level) AS max_level,
    MIN(bid)   AS min_bid,   MAX(bid)   AS max_bid,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bid) AS median_bid
  FROM auctions
  WHERE status = 'active'
  GROUP BY vocation_base;
`;

/**
 * UNIQUE INDEX — wymóg `REFRESH MATERIALIZED VIEW CONCURRENTLY`.
 * Bez tego REFRESH CONCURRENTLY rzuci:
 *   "cannot refresh materialized view concurrently without unique index"
 */
export const MV_FACET_COUNTS_INDEX_DDL = sql`
  CREATE UNIQUE INDEX idx_mvf ON mv_facet_counts (vocation_base);
`;

/**
 * Polecenie do odświeżenia po każdym full scrape.
 * Wywoływane przez scraper na koniec runu:
 *   await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts;`);
 */
export const MV_FACET_COUNTS_REFRESH = sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts`;

export type MvFacetCount = {
  vocationBase: string;
  total: number;
  withSoulWar: number;
  withPrimal: number;
  withTransfer: number;
  minLevel: number;
  maxLevel: number;
  minBid: number;
  maxBid: number;
  medianBid: string;
};
