/**
 * Aukcje — rdzeń systemu (arch §7.2).
 *
 * Zasady arch §7.1:
 * 1. DENORMALIZACJA — 8 skillów + 20+ innych gorących filtrów jako KOLUMNY,
 *    NIE join do auction_skills. Różnica 5ms vs 250ms na 2500 aukcjach (§7.1 pkt 1).
 * 2. `raw_json JSONB` — pełny payload scrapera; ubezpieczenie R1 (gdy Tibia zmieni
 *    HTML, mamy dane do backfill zamiast re-scrapować miesiące).
 * 3. PARTIAL INDEXES na `status='active'` — aktywnych aukcji ~2500, historycznych
 *    będą miliony. Partial index jest 1000× mniejszy i mieści się w RAM.
 *
 * Filtry faceted: `mv_facet_counts` w `views.ts` daje szybkie count() per vocation.
 */
import { sql } from 'drizzle-orm';
import { bigint, boolean, customType, index, integer, jsonb, numeric, pgEnum, pgTable, smallint, text, timestamp, } from 'drizzle-orm/pg-core';
import { worlds } from './reference';
/* ════════════════════════════════════════════════════════════════
 *  ENUMS
 * ════════════════════════════════════════════════════════════════ */
export const auctionStatusEnum = pgEnum('auction_status', [
    'active',
    'finished',
    'cancelled',
    'sold',
]);
export const auctionBidTypeEnum = pgEnum('auction_bid_type', [
    'current', // aktualna oferta (aukcja z minimum osiągniętym)
    'minimum', // oferta minimalna (aukcja jeszcze bez biderów)
]);
export const auctionSexEnum = pgEnum('auction_sex', ['M', 'F']);
/* ════════════════════════════════════════════════════════════════
 *  CUSTOM TYPES
 * ════════════════════════════════════════════════════════════════ */
/**
 * `tsvector` — typ wynikowy `to_tsvector()`. Drizzle nie ma natywnego wsparcia,
 * używamy customType. GIN index na tej kolumnie umożliwia full-text search.
 */
const tsvector = customType({
    dataType() {
        return `tsvector`;
    },
});
/* ════════════════════════════════════════════════════════════════
 *  AUCTIONS — tabela centralna
 * ════════════════════════════════════════════════════════════════ */
export const auctions = pgTable('auctions', {
    /* ── IDENTITY ──────────────────────────────────────────────── */
    auctionId: bigint('auction_id', { mode: 'bigint' })
        .primaryKey(), // z tibia.com (?auctionid=2173376)
    characterName: text('character_name').notNull(),
    level: smallint('level').notNull(),
    vocation: text('vocation').notNull(), // 'Elite Knight' | 'Exalted Monk' | ...
    vocationBase: text('vocation_base').notNull(), // 'Knight' | 'Monk' | ... (do filtrowania)
    sex: auctionSexEnum('sex').notNull(),
    worldId: smallint('world_id')
        .notNull()
        .references(() => worlds.id),
    outfitId: integer('outfit_id'),
    /* ── AUCTION ───────────────────────────────────────────────── */
    bid: integer('bid').notNull(), // aktualna lub minimalna
    bidType: auctionBidTypeEnum('bid_type').notNull(),
    auctionStart: timestamp('auction_start', { withTimezone: true }).notNull(),
    auctionEnd: timestamp('auction_end', { withTimezone: true }).notNull(),
    status: auctionStatusEnum('status').notNull().default('active'),
    finalPrice: integer('final_price'), // uzupełniane po zakończeniu
    /* ── ★ DENORMALIZOWANE GORĄCE FILTRY (wydajność!) ──────────── */
    skillMagic: smallint('skill_magic').notNull().default(0),
    skillClub: smallint('skill_club').notNull().default(0),
    skillFist: smallint('skill_fist').notNull().default(0),
    skillSword: smallint('skill_sword').notNull().default(0),
    skillAxe: smallint('skill_axe').notNull().default(0),
    skillDistance: smallint('skill_distance').notNull().default(0),
    skillShielding: smallint('skill_shielding').notNull().default(0),
    skillFishing: smallint('skill_fishing').notNull().default(0),
    charmPoints: integer('charm_points').notNull().default(0),
    charmPointsUnused: integer('charm_points_unused').notNull().default(0),
    minorCharmEchoes: integer('minor_charm_echoes').notNull().default(0),
    bossPoints: integer('boss_points').notNull().default(0),
    imbuementsUnlocked: smallint('imbuements_unlocked').notNull().default(0), // np. 11 z „11/23"
    imbuementsTotal: smallint('imbuements_total').notNull().default(23),
    questsCompleted: smallint('quests_completed').notNull().default(0),
    questsTotal: smallint('quests_total').notNull().default(42),
    achievementPoints: integer('achievement_points').notNull().default(0),
    animusMasteries: smallint('animus_masteries').notNull().default(0),
    gemsLesser: smallint('gems_lesser').notNull().default(0), // format „44-0-0"
    gemsRegular: smallint('gems_regular').notNull().default(0),
    gemsGreater: smallint('gems_greater').notNull().default(0),
    storeOutfitsCount: smallint('store_outfits_count').notNull().default(0),
    storeMountsCount: smallint('store_mounts_count').notNull().default(0),
    storeItemsCount: smallint('store_items_count').notNull().default(0),
    hirelingsCount: smallint('hirelings_count').notNull().default(0),
    goldTotal: bigint('gold_total', { mode: 'bigint' }).notNull().default(sql `0`), // bank+inventory+depot
    tcInvested: integer('tc_invested'), // ★ „zainwestowane" (Exevo Pan chowa za paywallem)
    /* ── ★ FLAGI BOOLEAN (filtry „must-have") ─────────────────── */
    hasSoulWar: boolean('has_soul_war').notNull().default(false),
    hasPrimalOrdeal: boolean('has_primal_ordeal').notNull().default(false),
    hasWorldTransfer: boolean('has_world_transfer').notNull().default(false),
    hasPreySlot: boolean('has_prey_slot').notNull().default(false),
    hasCharmExpansion: boolean('has_charm_expansion').notNull().default(false),
    hasWeeklyTaskExp: boolean('has_weekly_task_exp').notNull().default(false),
    hasTwistOfFate: boolean('has_twist_of_fate').notNull().default(false),
    blessingsActive: smallint('blessings_active').notNull().default(0), // np. 5 z „5/7"
    /* ── ★ POLA WYLICZANE (nasza wartość dodana) ─────────────── */
    estimatedValue: integer('estimated_value'), // algorytm waloryzacji w TC
    valueConfidence: numeric('value_confidence', { precision: 3, scale: 2 }), // 0.00-1.00
    // GENERATED: bid / NULLIF(level, 0) → cena za poziom
    // np. bid=25501, level=619 → price_per_level ≈ 41.20
    pricePerLevel: numeric('price_per_level', { precision: 10, scale: 2 })
        .generatedAlwaysAs(() => sql `(${auctions.bid})::numeric / NULLIF(${auctions.level}, 0)`),
    /* ── PAYLOAD I META ───────────────────────────────────────── */
    // pełny scrape — future-proof na zmiany HTML Tibii (ubezpieczenie R1)
    rawJson: jsonb('raw_json')
        .$type() // walidacja struktury po stronie aplikacji (Zod w scraperze)
        .notNull(),
    // GENERATED: full-text search na character_name
    searchVector: tsvector('search_vector').generatedAlwaysAs(() => sql `to_tsvector('simple', ${auctions.characterName})`),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    scrapedAt: timestamp('scraped_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => [
    /* ── ★ PARTIAL INDEXES na `status='active'` ─────────────── */
    // end-date scan: „kończące się najwcześniej"
    index('idx_au_active_end').on(table.auctionEnd).where(sql `status = 'active'`),
    // vocation + level: filtry po klasie i zakresie poziomu
    index('idx_au_active_voc_lvl')
        .on(table.vocationBase, table.level)
        .where(sql `status = 'active'`),
    // world filter: pojedyncze zapytanie „ten świat"
    index('idx_au_active_world')
        .on(table.worldId)
        .where(sql `status = 'active'`),
    // bid sort: najtańsze / najdroższe
    index('idx_au_active_bid')
        .on(table.bid)
        .where(sql `status = 'active'`),
    // skill filter: „magic ≥ 100"
    index('idx_au_active_magic')
        .on(table.skillMagic)
        .where(sql `status = 'active'`),
    // level sort: najwyższe poziomy
    index('idx_au_active_lvl')
        .on(table.level)
        .where(sql `status = 'active'`),
    // ★ INDEKS ZŁOŻONY pod najczęstsze zapytanie (voc + level + bid)
    // — plan: Index Scan using idx_au_filter_main → 3-8ms na 2500 aktywnych (§7.3)
    index('idx_au_filter_main')
        .on(table.vocationBase, table.level, table.bid)
        .where(sql `status = 'active'`),
    /* ── Boolean flagi — partial na TRUE ─────────────────────── */
    index('idx_au_soulwar')
        .on(table.auctionId)
        .where(sql `status = 'active' AND has_soul_war = true`),
    index('idx_au_primal')
        .on(table.auctionId)
        .where(sql `status = 'active' AND has_primal_ordeal = true`),
    index('idx_au_wtransfer')
        .on(table.auctionId)
        .where(sql `status = 'active' AND has_world_transfer = true`),
    /* ── Full-text + JSONB ───────────────────────────────────── */
    index('idx_au_search').using('gin', table.searchVector),
    // jsonb_path_ops → mniejszy indeks, wystarczający do naszych zapytań (path lookup, nie fulltext wewnątrz JSON)
    index('idx_au_raw').using('gin', sql `${table.rawJson} jsonb_path_ops`),
    /* ── Historia / archiwum ─────────────────────────────────── */
    index('idx_au_finished_end')
        .on(table.auctionEnd)
        .where(sql `status = 'finished'`),
    index('idx_au_name').on(table.characterName),
]);
//# sourceMappingURL=auctions.js.map