/**
 * Waloryzacja — transparentność algorytmu (arch §7.2 + §8.4).
 *
 * `valuation_rules` — wagi komponentów algorytmu. Każdy komponent wyceny ma
 * regułę z wagą. Algorytm: `estimated_value = Σ (component_value × rule.weight)`.
 *
 * `valuation_history` — pętla feedbacku: każda wycena zapisywana razem z
 * `auctions.final_price` po zakończeniu aukcji → po 30 dniach mamy dataset
 * „nasza wycena vs realna cena sprzedaży" → regresja do strojenia wag
 * (długoterminowa przewaga arch §8.4).
 */
import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, serial, text, timestamp, } from 'drizzle-orm/pg-core';
import { auctions } from './auctions';
/* ════════════════════════════════════════════════════════════════
 *  ENUMS
 * ════════════════════════════════════════════════════════════════ */
export const valuationCategoryEnum = pgEnum('valuation_category', [
    'base', // level, vocation modifier
    'feature', // Soul War, Primal Ordeal, World Transfer, Prey, Charms Exp, Weekly Exp, Twist of Fate, Blessings
    'skill', // per-vocation skills, shielding, magic
    'item', // rare items, imbuements, charms
    'cosmetic', // store outfits, mounts, store items
    'progression', // charm points, boss points, quests, achievements, animus
    'asset', // gold, tc_invested
]);
/* ════════════════════════════════════════════════════════════════
 *  VALUATION_RULES — wagi komponentów algorytmu
 *  Seed w `packages/db/src/seed/valuation-rules.ts`.
 * ════════════════════════════════════════════════════════════════ */
export const valuationRules = pgTable('valuation_rules', {
    id: serial('id').primaryKey(),
    ruleKey: text('rule_key').notNull().unique(), // 'level', 'soul_war', 'charm_points'
    category: valuationCategoryEnum('category').notNull(),
    weight: numeric('weight', { precision: 10, scale: 4 }).notNull(), // mnożnik
    formula: text('formula'), // dokumentacja czytelna dla człowieka
    isActive: boolean('is_active').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
}, (table) => [
    index('idx_vr_category').on(table.category),
    index('idx_vr_active').on(table.ruleKey).where(sql `is_active = true`),
]);
/* ════════════════════════════════════════════════════════════════
 *  VALUATION_HISTORY — log wycen (pętla feedbacku)
 * ════════════════════════════════════════════════════════════════ */
export const valuationHistory = pgTable('valuation_history', {
    auctionId: bigint('auction_id', { mode: 'bigint' })
        .notNull()
        .references(() => auctions.auctionId, { onDelete: 'cascade' }),
    computedAt: timestamp('computed_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    estimatedTc: integer('estimated_tc').notNull(),
    breakdown: jsonb('breakdown')
        .$type()
        .notNull(), // {'level':12000,'soul_war':6400,...}
}, (table) => [
    primaryKey({ columns: [table.auctionId, table.computedAt] }),
    index('idx_vh_estimated').on(table.estimatedTc),
]);
//# sourceMappingURL=valuation.js.map