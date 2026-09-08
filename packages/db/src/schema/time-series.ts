/**
 * Time-series: auction_price_history — append-only log zmian bidu.
 *
 * Partycjonowanie (arch §7.2): PARTITION BY RANGE (recorded_at) miesięcznie.
 *
 * UWAGA: Drizzle ORM nie ma natywnego API dla PostgreSQL PARTITION BY
 * (stan na 0.36.x). Schemat Drizzle definiuje tabelę normalnie dla type-safety,
 * a w migracji początkowej (`0001_init.sql` lub custom migration) dołączamy:
 *
 *   CREATE TABLE auction_price_history (...) PARTITION BY RANGE (recorded_at);
 *   CREATE TABLE auction_price_history_default
 *     PARTITION OF auction_price_history DEFAULT;
 *   -- partycje miesięczne tworzone automatycznie przez pg_partman lub cron
 *     (np. CREATE TABLE auction_price_history_2026_09
 *        PARTITION OF auction_price_history
 *        FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');)
 *
 * Dlaczego partycjonowanie:
 * - DROP starej partycji = natychmiastowy zamiast DELETE milionów wierszy
 * - query planner: predicate pushdown na partycję → skan tylko istotnych miesięcy
 * - maintenance VACUUM na małych tabelach, nie na jednej 500 GB
 */
import { bigint, integer, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';

export const auctionPriceHistory = pgTable(
  'auction_price_history',
  {
    auctionId: bigint('auction_id', { mode: 'bigint' }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    bid: integer('bid').notNull(),
  },
  (table) => [primaryKey({ columns: [table.auctionId, table.recordedAt] })],
);

export type AuctionPriceHistoryPoint = typeof auctionPriceHistory.$inferSelect;
export type NewAuctionPriceHistoryPoint = typeof auctionPriceHistory.$inferInsert;
