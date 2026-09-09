/**
 * Auction relations — tabele 1:N dla danych szczegółowych aukcji.
 *
 * Zasada: te tabele NIE służą do filtrowania (gorące filtry są zdenormalizowane
 * w `auctions`). Służą do prezentacji detalu i do agregacji typu
 * „pokaż aukcje z Ferumbras' Hat" (idx_ai_item).
 *
 * ON DELETE CASCADE — gdy aukcja znika (np. purge), szczegóły idą z nią.
 */
import { bigint, index, integer, pgEnum, pgTable, primaryKey, smallint, text, } from 'drizzle-orm/pg-core';
import { auctions } from './auctions';
import { bosses, imbuements, items, mounts, outfits, quests } from './reference';
/* ════════════════════════════════════════════════════════════════
 *  ENUMS
 * ════════════════════════════════════════════════════════════════ */
/**
 * Kategorie USP z tibia.com (arch §2.5):
 * 0=skill, 1=gold, 2=achievements, 3=blessings, 4=store items,
 * 5=mounts/outfits/slots, 6=imbuements, 7=charms, 11=world transfer, 13=boss points
 */
export const uspCategoryEnum = pgEnum('usp_category', [
    'skill',
    'gold',
    'achievement',
    'blessing',
    'store',
    'cosmetic',
    'imbuement',
    'charm',
    'other',
    'world_transfer',
    'rare_item',
    'progression',
    'boss',
]);
export const skillLoyaltyEnum = pgEnum('skill_loyalty_skill', [
    'magic',
    'club',
    'fist',
    'sword',
    'axe',
    'distance',
    'shielding',
    'fishing',
]);
/* ════════════════════════════════════════════════════════════════
 *  AUCTION_ITEMS — przedmioty w ekwipunku
 * ════════════════════════════════════════════════════════════════ */
export const auctionItems = pgTable('auction_items', {
    auctionId: bigint('auction_id', { mode: 'bigint' })
        .notNull()
        .references(() => auctions.auctionId, { onDelete: 'cascade' }),
    itemId: integer('item_id')
        .notNull()
        .references(() => items.id),
    quantity: integer('quantity').notNull().default(1),
    tier: smallint('tier'), // 0|1|2|3 (forging)
}, (table) => [
    primaryKey({ columns: [table.auctionId, table.itemId, table.tier] }),
    // „pokaż aukcje z Ferumbras' Hat"
    index('idx_ai_item').on(table.itemId),
]);
/* ════════════════════════════════════════════════════════════════
 *  AUCTION_OUTFITS — outfit z addonami
 * ════════════════════════════════════════════════════════════════ */
export const auctionOutfits = pgTable('auction_outfits', {
    auctionId: bigint('auction_id', { mode: 'bigint' })
        .notNull()
        .references(() => auctions.auctionId, { onDelete: 'cascade' }),
    outfitId: integer('outfit_id')
        .notNull()
        .references(() => outfits.id),
    addons: smallint('addons').notNull().default(0), // 0|1|2|3
}, (table) => [primaryKey({ columns: [table.auctionId, table.outfitId] })]);
/* ════════════════════════════════════════════════════════════════
 *  AUCTION_MOUNTS — mounty (w tym store/rare)
 * ════════════════════════════════════════════════════════════════ */
export const auctionMounts = pgTable('auction_mounts', {
    auctionId: bigint('auction_id', { mode: 'bigint' })
        .notNull()
        .references(() => auctions.auctionId, { onDelete: 'cascade' }),
    mountId: integer('mount_id')
        .notNull()
        .references(() => mounts.id),
}, (table) => [
    primaryKey({ columns: [table.auctionId, table.mountId] }),
    index('idx_am_mount').on(table.mountId),
]);
/* ════════════════════════════════════════════════════════════════
 *  AUCTION_QUESTS — ukończone questa
 * ════════════════════════════════════════════════════════════════ */
export const auctionQuests = pgTable('auction_quests', {
    auctionId: bigint('auction_id', { mode: 'bigint' })
        .notNull()
        .references(() => auctions.auctionId, { onDelete: 'cascade' }),
    questId: integer('quest_id')
        .notNull()
        .references(() => quests.id),
}, (table) => [
    primaryKey({ columns: [table.auctionId, table.questId] }),
    index('idx_aq_quest').on(table.questId),
]);
/* ════════════════════════════════════════════════════════════════
 *  AUCTION_BOSSES — zabici bossowie
 * ════════════════════════════════════════════════════════════════ */
export const auctionBosses = pgTable('auction_bosses', {
    auctionId: bigint('auction_id', { mode: 'bigint' })
        .notNull()
        .references(() => auctions.auctionId, { onDelete: 'cascade' }),
    bossId: integer('boss_id')
        .notNull()
        .references(() => bosses.id),
}, (table) => [
    primaryKey({ columns: [table.auctionId, table.bossId] }),
    index('idx_ab_boss').on(table.bossId),
]);
/* ════════════════════════════════════════════════════════════════
 *  AUCTION_USPS — Unique Selling Points (kolorowe linijki Tibii)
 * ════════════════════════════════════════════════════════════════ */
export const auctionUsps = pgTable('auction_usps', {
    id: bigint('id', { mode: 'bigint' })
        .primaryKey()
        .generatedAlwaysAsIdentity(),
    auctionId: bigint('auction_id', { mode: 'bigint' })
        .notNull()
        .references(() => auctions.auctionId, { onDelete: 'cascade' }),
    category: uspCategoryEnum('category').notNull(),
    text: text('text').notNull(),
    sortOrder: smallint('sort_order').notNull().default(0),
}, (table) => [
    index('idx_usp_auction').on(table.auctionId, table.sortOrder),
    index('idx_usp_category').on(table.category),
]);
/* ════════════════════════════════════════════════════════════════
 *  AUCTION_SKILL_LOYALTY — base vs displayed (do kalk. „true skill")
 * ════════════════════════════════════════════════════════════════ */
export const auctionSkillLoyalty = pgTable('auction_skill_loyalty', {
    auctionId: bigint('auction_id', { mode: 'bigint' })
        .notNull()
        .references(() => auctions.auctionId, { onDelete: 'cascade' }),
    skill: skillLoyaltyEnum('skill').notNull(),
    baseValue: smallint('base_value').notNull(), // bez bonusu (to pokazuje Bazaar)
    loyaltyPct: smallint('loyalty_pct'), // 0|5|10|...|50
}, (table) => [
    primaryKey({ columns: [table.auctionId, table.skill] }),
    index('idx_asl_skill').on(table.skill),
]);
/**
 * Alias dla imbuements relacji — referencja używana przez scraper.
 * Nie ma dedykowanej tabeli `auction_imbuements` (proporcja 11/23 wystarcza),
 * ale eksportujemy import dla czytelności w kodzie scrapera.
 */
export { imbuements as auctionImbuements };
//# sourceMappingURL=auction-relations.js.map