/**
 * Operacje scrapera — observability (arch §7.2).
 *
 * Każdy run scrapera zapisuje metryki (`scrape_runs`) i błędy (`scrape_errors`).
 * Daje to podstawę do monitoringu + dashboardu „ile % aukcji zmieniło cenę?".
 */
import { bigint, index, integer, jsonb, pgEnum, pgTable, text, timestamp, } from 'drizzle-orm/pg-core';
/* ════════════════════════════════════════════════════════════════
 *  ENUMS
 * ════════════════════════════════════════════════════════════════ */
export const scrapeRunTypeEnum = pgEnum('scrape_run_type', [
    'full', // pełny przegląd listy (101 stron, 2500 aukcji)
    'ending_soon', // aukcje kończące się <1h (SSE feed)
    'detail', // detail page pojedynczej aukcji
    'history', // zapis do auction_price_history
    'reference', // worlds/items/outfits/mounts/quests/bosses
    'calibration', // pętla kalibracji wyceny (T57, arch §8.4 + §10 R3)
]);
export const scrapeRunStatusEnum = pgEnum('scrape_run_status', [
    'running',
    'success',
    'partial',
    'failed',
]);
export const scrapeErrorTypeEnum = pgEnum('scrape_error_type', [
    'timeout',
    'rate_limit',
    'parse',
    'http_4xx',
    'http_5xx',
    'db',
    'other',
]);
/* ════════════════════════════════════════════════════════════════
 *  SCRAPE_RUNS
 * ════════════════════════════════════════════════════════════════ */
export const scrapeRuns = pgTable('scrape_runs', {
    id: bigint('id', { mode: 'bigint' })
        .primaryKey()
        .generatedAlwaysAsIdentity(),
    runType: scrapeRunTypeEnum('run_type').notNull(),
    status: scrapeRunStatusEnum('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    pagesFetched: integer('pages_fetched').notNull().default(0),
    auctionsFound: integer('auctions_found').notNull().default(0),
    auctionsNew: integer('auctions_new').notNull().default(0),
    auctionsUpd: integer('auctions_upd').notNull().default(0),
    auctionsArch: integer('auctions_arch').notNull().default(0),
    errorsCount: integer('errors_count').notNull().default(0),
    errorSummary: jsonb('error_summary').$type(),
}, (table) => [index('idx_sr_recent').on(table.startedAt)]);
/* ════════════════════════════════════════════════════════════════
 *  SCRAPE_ERRORS
 * ════════════════════════════════════════════════════════════════ */
export const scrapeErrors = pgTable('scrape_errors', {
    id: bigint('id', { mode: 'bigint' })
        .primaryKey()
        .generatedAlwaysAsIdentity(),
    runId: bigint('run_id', { mode: 'bigint' }).references(() => scrapeRuns.id, {
        onDelete: 'cascade',
    }),
    url: text('url'),
    auctionId: bigint('auction_id', { mode: 'bigint' }),
    errorType: scrapeErrorTypeEnum('error_type').notNull(),
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
}, (table) => [
    index('idx_se_run').on(table.runId),
    index('idx_se_auction').on(table.auctionId),
    index('idx_se_type').on(table.errorType),
    index('idx_se_recent').on(table.createdAt),
]);
//# sourceMappingURL=ops.js.map