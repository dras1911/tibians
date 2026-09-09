/**
 * Weryfikacja seedu calculator_config (task 16).
 *
 * Sprawdza: ≥10 kluczy, unikalność, walidację Zod każdej wartości,
 * obecność description oraz kluczowe progi z arch §2.1 / TibiaWiki.
 */
import { describe, expect, it } from 'vitest';
import { CALCULATOR_CONFIG_SEED, toCalculatorConfigRows, } from '../seed/calculator-config';
import { calculatorConfigValueSchema } from '../schema/calculator-config';
describe('calculator_config seed', () => {
    it('zawiera ≥ 10 kluczy konfiguracyjnych (acceptance: ≥10)', () => {
        expect(CALCULATOR_CONFIG_SEED.length).toBeGreaterThanOrEqual(10);
    });
    it('klucze są unikalne (PK key)', () => {
        const keys = CALCULATOR_CONFIG_SEED.map(cfg => cfg.key);
        expect(new Set(keys).size).toBe(keys.length);
    });
    it('każda wartość przechodzi calculatorConfigValueSchema', () => {
        for (const cfg of CALCULATOR_CONFIG_SEED) {
            const parsed = calculatorConfigValueSchema.safeParse(cfg.value);
            expect(parsed.success, `key=${cfg.key} value=${JSON.stringify(cfg.value)}`).toBe(true);
        }
    });
    it('każdy wpis ma niepusty description', () => {
        for (const cfg of CALCULATOR_CONFIG_SEED) {
            expect(cfg.description.length, `key=${cfg.key}`).toBeGreaterThan(0);
        }
    });
    it('kluczowe progi mają oczekiwane wartości (arch §2.1 + TibiaWiki)', () => {
        const byKey = new Map(CALCULATOR_CONFIG_SEED.map(cfg => [cfg.key, cfg.value]));
        // Ekonomia (TibiaPal §2.1)
        expect(byKey.get('economy.tc_price_gold_threshold')).toBe(13900);
        expect(byKey.get('economy.tc_value_gold')).toBe(10000);
        expect(byKey.get('economy.gold_to_tc_fee')).toBe(0.02);
        // Exercise Weapons (TibiaWiki)
        expect(byKey.get('exercise.weapon.regular.charges')).toBe(500);
        expect(byKey.get('exercise.weapon.durable.charges')).toBe(1800);
        expect(byKey.get('exercise.weapon.lasting.charges')).toBe(14400);
        // Loyalty (TibiaWiki §2.2)
        expect(byKey.get('loyalty.points_per_5_percent')).toBe(360);
        // Stamina (TibiaWiki)
        expect(byKey.get('stamina.regen_minutes_per_hour')).toBe(3);
        expect(byKey.get('stamina.regen_minutes_per_hour_free')).toBe(6);
        expect(byKey.get('stamina.hours_per_day_full')).toBe(42);
        // Blessings (TibiaWiki wzór R(L))
        expect(byKey.get('blessing.cost_per_blessing_level_1')).toBe(2000);
        expect(byKey.get('blessing.cost_per_blessing_level_100')).toBe(16000);
        expect(byKey.get('blessing.cost_per_blessing_level_200')).toBe(26000);
        // Imbuement (TibiaWiki)
        expect(byKey.get('imbuement.fee_basic_gp')).toBe(7500);
        expect(byKey.get('imbuement.fee_powerful_gp')).toBe(250000);
    });
    it('toCalculatorConfigRows produkuje poprawne wiersze dla insertu', () => {
        const rows = toCalculatorConfigRows();
        expect(rows).toHaveLength(CALCULATOR_CONFIG_SEED.length);
        for (const row of rows) {
            expect(row.key).toBeTruthy();
            expect(row.value).toBeDefined();
            expect(row.description).toBeTruthy();
        }
    });
});
//# sourceMappingURL=calculator-config-seed.test.js.map