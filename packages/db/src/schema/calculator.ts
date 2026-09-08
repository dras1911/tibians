/**
 * Kalkulatory — schema dla zapisanych buildów + konfiguracja formuł.
 *
 * Zasada (arch §7.2 komentarz): kalkulatory są CZYSTO KLIENTOWSKIE.
 * Stan normalnie żyje w URL (?voc=knight&skill=sword&...).
 * Te tabele TYLKO dla zapisanych/nazwanych buildów (Faza 4+).
 *
 * `calculator_config` — współczynniki formuł w DB, żeby zmieniać balans
 * bez deploya (loader z cache 60s — task 16).
 */
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/* ════════════════════════════════════════════════════════════════
 *  CALCULATOR_SAVES — zapisane buildy kalkulatorów
 *  share_token: nanoid(10) → /pl/calculators/exercise-weapons?s=Ab3xK9mQ2p
 * ════════════════════════════════════════════════════════════════ */

export const calculatorSaves = pgTable(
  'calculator_saves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    calcSlug: text('calc_slug').notNull(), // 'exercise-weapons'
    shareToken: text('share_token').notNull().unique(), // nanoid(10)
    name: text('name'), // opcjonalna nazwa użytkownika
    inputs: jsonb('inputs')
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_cs_slug').on(table.calcSlug, table.createdAt),
    // share_token ma już UNIQUE → automatyczny index btree
  ],
);

/* ════════════════════════════════════════════════════════════════
 *  CALCULATOR_CONFIG — współczynniki formuł (klucz → JSONB)
 *  Przykłady: 'exercise.weapon.durable.charges', 'stamina.regen.premium'
 *  Seed w `packages/db/src/seed/calculator-config.ts`.
 * ════════════════════════════════════════════════════════════════ */

export const calculatorConfig = pgTable('calculator_config', {
  key: text('key').primaryKey(), // 'exercise.weapon.durable.charges'
  value: jsonb('value')
    .$type<unknown>() // typ zależy od klucza — walidacja po stronie loadera
    .notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type CalculatorSave = typeof calculatorSaves.$inferSelect;
export type NewCalculatorSave = typeof calculatorSaves.$inferInsert;
export type CalculatorConfig = typeof calculatorConfig.$inferSelect;
export type NewCalculatorConfig = typeof calculatorConfig.$inferInsert;
