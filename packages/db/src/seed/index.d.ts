/**
 * Seed orchestrator — uruchamia wszystkie seedy w poprawnej kolejności.
 *
 * Kolejność MA ZNACZENIE (FK constraints):
 *   1. calculator_config (zero FK)
 *   2. valuation_rules (zero FK)
 *   3. imbuements (zero FK; reference data — reszta scrape'owana, task 32)
 *
 * UWAGA: items/outfits/mounts/worlds/quests/bosses NIE są seedowane — dane
 * pochodzą ze scrapera (task 32) i TibiaData self-host.
 *
 * Każdy seed jest idempotentny (onConflictDoUpdate na kluczu unikalnym).
 */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '../schema';
import { CALCULATOR_CONFIG_SEED, seedCalculatorConfig, toCalculatorConfigRows } from './calculator-config';
import { IMBUEMENTS_SEED, toImbuementRows } from './imbuements';
import { VALUATION_RULES_SEED, toValuationRuleRows } from './valuation-rules';
export { CALCULATOR_CONFIG_SEED, IMBUEMENTS_SEED, VALUATION_RULES_SEED };
export { seedCalculatorConfig, toCalculatorConfigRows, toImbuementRows, toValuationRuleRows };
export interface SeedReport {
    readonly calculatorConfig: number;
    readonly valuationRules: number;
    readonly imbuements: number;
    readonly elapsedMs: number;
}
/**
 * Uruchamia wszystkie seedy na danym db połączeniu.
 * Wywoływane z `scripts/seed.ts`.
 */
export declare function runSeeds(db: NodePgDatabase<typeof schema>): Promise<SeedReport>;
//# sourceMappingURL=index.d.ts.map