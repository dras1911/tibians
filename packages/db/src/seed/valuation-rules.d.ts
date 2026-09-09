/**
 * Seed: valuation_rules — wagi komponentów algorytmu (arch §8.4 + task 35).
 *
 * Algorytm: `estimated_value = Σ (component_value × rule.weight)`.
 *
 * Wagi startowe — strojone iteracyjnie na podstawie `valuation_history`
 * (porównanie nasza_wycena vs final_price po zakończeniu aukcji → regresja).
 *
 * Idempotentny: `onConflictDoUpdate` na `rule_key` (patrz `seed/index.ts`).
 *
 * Konwencja kluczy (task 35):
 *   - `base_*` — bazowy level × waga (niezależne od vocation)
 *   - `skill_*` — skille (per vocation relevance w kodzie; jedna waga dla wszystkich)
 *   - `feature_*` — stałe kwoty TC za posiadanie flagi (Soul War, Primal, ...)
 *   - `progression_*` — liniowe wagi za metryki (charms × waga, boss × waga, ...)
 *   - `cosmetic_*` — store + gemy
 *   - `asset_*` — gold → TC + tc_invested bezpośrednio
 */
import type { NewValuationRule } from '../schema/valuation';
export interface ValuationRuleSeed {
    readonly ruleKey: string;
    readonly category: 'base' | 'feature' | 'skill' | 'item' | 'cosmetic' | 'progression' | 'asset';
    /** numeric(10,4) — przechowujemy jako string dla precyzji. */
    readonly weight: string;
    readonly formula: string;
}
export declare const VALUATION_RULES_SEED: readonly ValuationRuleSeed[];
export declare const toValuationRuleRows: () => NewValuationRule[];
//# sourceMappingURL=valuation-rules.d.ts.map