import { sql } from 'drizzle-orm';
import { imbuements, valuationRules } from '../schema';
import { CALCULATOR_CONFIG_SEED, seedCalculatorConfig, toCalculatorConfigRows, } from './calculator-config';
import { IMBUEMENTS_SEED, toImbuementRows } from './imbuements';
import { VALUATION_RULES_SEED, toValuationRuleRows } from './valuation-rules';
export { CALCULATOR_CONFIG_SEED, IMBUEMENTS_SEED, VALUATION_RULES_SEED };
export { seedCalculatorConfig, toCalculatorConfigRows, toImbuementRows, toValuationRuleRows };
/**
 * Uruchamia wszystkie seedy na danym db połączeniu.
 * Wywoływane z `scripts/seed.ts`.
 */
export async function runSeeds(db) {
    const started = Date.now();
    // ── 1. calculator_config ────────────────────────────────────
    const cfgCount = await seedCalculatorConfig(db);
    // ── 2. valuation_rules ──────────────────────────────────────
    const ruleRows = toValuationRuleRows();
    const ruleInserted = await db
        .insert(valuationRules)
        .values(ruleRows)
        .onConflictDoUpdate({
        target: valuationRules.ruleKey,
        set: {
            category: sql `excluded.category`,
            weight: sql `excluded.weight`,
            formula: sql `excluded.formula`,
            isActive: sql `excluded.is_active`,
            updatedAt: sql `now()`,
        },
    });
    const ruleCount = 'rowCount' in ruleInserted && typeof ruleInserted.rowCount === 'number'
        ? ruleInserted.rowCount
        : ruleRows.length;
    // ── 3. imbuements (słownik PL/EN z Intibia §2.3) ────────────
    const imbRows = toImbuementRows();
    const imbInserted = await db
        .insert(imbuements)
        .values(imbRows)
        .onConflictDoUpdate({
        target: imbuements.name,
        set: {
            namePl: sql `excluded.name_pl`,
            tier: sql `excluded.tier`,
            category: sql `excluded.category`,
            description: sql `excluded.description`,
        },
    });
    const imbCount = 'rowCount' in imbInserted && typeof imbInserted.rowCount === 'number'
        ? imbInserted.rowCount
        : imbRows.length;
    return {
        calculatorConfig: cfgCount,
        valuationRules: ruleCount,
        imbuements: imbCount,
        elapsedMs: Date.now() - started,
    };
}
//# sourceMappingURL=index.js.map