/**
 * `calculator_config` — współczynniki formuł kalkulatorów (arch §7.2).
 *
 * Zasada (arch §7.2 komentarz): kalkulatory są CZYSTO KLIENTOWSKIE, ale
 * współczynniki formuł (progi, ceny, mnożniki) żyją w DB — zmiana balansu
 * gry = UPDATE w bazie, BEZ redeploya (arch §16 Faza 1B).
 *
 * Loader `getConfig(key)` (src/config-loader.ts) czyta te wartości z cache
 * in-memory 60s. Seed w `src/seed/calculator-config.ts`.
 */
import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';

/* ════════════════════════════════════════════════════════════════
 *  CALCULATOR_CONFIG — współczynniki formuł (klucz → JSONB)
 *  Przykłady: 'exercise.weapon.durable.charges', 'stamina.regen_minutes_per_hour'
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

/**
 * Walidacja wartości configa (kolumna JSONB) przy odczycie przez `getConfig`.
 *
 * Union: number | string | boolean | object (rekord klucz→wartość).
 * Corrupted DB value → `safeParse` fail → loader loguje warning i zwraca
 * null (NIE crash).
 */
export const calculatorConfigValueSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  z.record(z.string(), z.unknown()),
]);

export type CalculatorConfigValue = z.infer<typeof calculatorConfigValueSchema>;
export type CalculatorConfig = typeof calculatorConfig.$inferSelect;
export type NewCalculatorConfig = typeof calculatorConfig.$inferInsert;
