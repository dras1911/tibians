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

export const VALUATION_RULES_SEED: readonly ValuationRuleSeed[] = [
  // ── BASE ─────────────────────────────────────────────────────
  {
    ruleKey: 'base_level_weight',
    category: 'base',
    weight: '50.0000',
    formula: 'level × 50 TC (bazowa wartość postaci — 619 lvl = 30 950 TC)',
  },

  // ── SKILLS — nonlinear powyżej progu 100 ─────────────────────
  // Wzór: TC = floor((skill - 100)^1.05) × skill_above_100_weight
  // Vocation relevance jest w KODZIE (Knight → sword/axe/club/shielding, itd.)
  // — nie potrzeba osobnych wag per vocation/skill.
  // Fishing nigdy nie ma wartości (arch §8.4).
  {
    ruleKey: 'skill_above_100_weight',
    category: 'skill',
    weight: '100.0000',
    formula: 'floor((skill - 100)^1.05) × 100 TC; skill > 100 tylko dla relewantnych',
  },

  // ── FEATURES — stałe kwoty TC za posiadanie flagi ────────────
  {
    ruleKey: 'feature_soul_war',
    category: 'feature',
    weight: '12000.0000',
    formula: '+12 000 TC za ukończone Soul War',
  },
  {
    ruleKey: 'feature_primal_ordeal',
    category: 'feature',
    weight: '12000.0000',
    formula: '+12 000 TC za ukończone Primal Ordeal',
  },
  {
    ruleKey: 'feature_world_transfer',
    category: 'feature',
    weight: '15000.0000',
    formula: '+15 000 TC za dostępny World Transfer',
  },
  {
    ruleKey: 'feature_prey_slot',
    category: 'feature',
    weight: '2000.0000',
    formula: '+2 000 TC za odblokowany Prey Slot',
  },
  {
    ruleKey: 'feature_charm_expansion',
    category: 'feature',
    weight: '2000.0000',
    formula: '+2 000 TC za Charm Expansion',
  },
  {
    ruleKey: 'feature_weekly_task_expansion',
    category: 'feature',
    weight: '2000.0000',
    formula: '+2 000 TC za Weekly Task Expansion',
  },
  {
    ruleKey: 'feature_twist_of_fate',
    category: 'feature',
    weight: '3000.0000',
    formula: '+3 000 TC za Twist of Fate',
  },

  // ── PROGRESSION — liniowe (charm_points × waga, ...) ─────────
  {
    ruleKey: 'progression_charm_points_weight',
    category: 'progression',
    weight: '2.0000',
    formula: 'charm_points × 2 TC (np. 7611 pkt = 15 222 TC)',
  },
  {
    ruleKey: 'progression_boss_points_weight',
    category: 'progression',
    weight: '1.0000',
    formula: 'boss_points × 1 TC (np. 2340 pkt = 2 340 TC)',
  },
  {
    ruleKey: 'progression_quests_weight',
    category: 'progression',
    weight: '2000.0000',
    formula: 'quests_completed × 2000 TC (np. 28 questów = 56 000 TC)',
  },
  {
    ruleKey: 'progression_imbuements_weight',
    category: 'progression',
    weight: '1000.0000',
    formula: 'imbuements_unlocked × 1000 TC (np. 11 imbues = 11 000 TC)',
  },
  {
    ruleKey: 'progression_achievement_points_weight',
    category: 'progression',
    weight: '100.0000',
    formula: 'achievement_points × 100 TC (np. 5420 pkt = 542 000 TC)',
  },
  {
    ruleKey: 'progression_animus_weight',
    category: 'progression',
    weight: '500.0000',
    formula: 'animus_masteries × 500 TC (np. 180 mastery = 90 000 TC)',
  },

  // ── COSMETICS ────────────────────────────────────────────────
  {
    ruleKey: 'cosmetic_store_outfit_weight',
    category: 'cosmetic',
    weight: '1000.0000',
    formula: 'store_outfits_count × 1000 TC (np. 3 store outfity = 3 000 TC)',
  },
  {
    ruleKey: 'cosmetic_store_mount_weight',
    category: 'cosmetic',
    weight: '2000.0000',
    formula: 'store_mounts_count × 2000 TC (np. 2 mounty = 4 000 TC)',
  },
  {
    ruleKey: 'cosmetic_gem_lesser_weight',
    category: 'cosmetic',
    weight: '100.0000',
    formula: 'gems_lesser × 100 TC',
  },
  {
    ruleKey: 'cosmetic_gem_regular_weight',
    category: 'cosmetic',
    weight: '500.0000',
    formula: 'gems_regular × 500 TC',
  },
  {
    ruleKey: 'cosmetic_gem_greater_weight',
    category: 'cosmetic',
    weight: '2000.0000',
    formula: 'gems_greater × 2000 TC',
  },

  // ── ASSETS ───────────────────────────────────────────────────
  {
    ruleKey: 'asset_gold_to_tc',
    category: 'asset',
    weight: '10000.0000',
    formula: 'gold_total ÷ 10 000 (ile gp = 1 TC; z reference data)',
  },
  {
    ruleKey: 'asset_tc_invested_direct',
    category: 'asset',
    weight: '1.0000',
    formula: 'tc_invested × 1 (1:1 — zainwestowane TC jest wartością)',
  },
] as const;

export const toValuationRuleRows = (): NewValuationRule[] =>
  VALUATION_RULES_SEED.map(rule => ({
    ruleKey: rule.ruleKey,
    category: rule.category,
    weight: rule.weight,
    formula: rule.formula,
    isActive: true,
  }));