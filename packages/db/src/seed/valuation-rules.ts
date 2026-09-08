/**
 * Seed: valuation_rules — wagi komponentów algorytmu (arch §8.4).
 *
 * Algorytm: `estimated_value = Σ (component_value × rule.weight)`.
 *
 * Wagi wstępne — strojone iteracyjnie na podstawie `valuation_history`
 * (porównanie nasza_wycena vs final_price po zakończeniu aukcji → regresja).
 *
 * Idempotentny: `onConflictDoUpdate` na `rule_key`.
 */
import type { NewValuationRule } from '../schema/valuation';

export interface ValuationRuleSeed {
  readonly ruleKey: string;
  readonly category: 'base' | 'feature' | 'skill' | 'item' | 'cosmetic' | 'progression' | 'asset';
  readonly weight: string; // numeric(10,4) — przechowujemy jako string dla precyzji
  readonly formula: string;
}

export const VALUATION_RULES_SEED: readonly ValuationRuleSeed[] = [
  // ── BASE ─────────────────────────────────────────────────────
  {
    ruleKey: 'level',
    category: 'base',
    weight: '50.0000',
    formula: 'level × 50 TC (bazowa wartość); rosnąco nieliniowo dla level > 1000',
  },
  {
    ruleKey: 'vocation_knight',
    category: 'base',
    weight: '1.0000',
    formula: 'mnożnik bazowy Knight (Elite Knight, wszystkie melee vocations)',
  },
  {
    ruleKey: 'vocation_paladin',
    category: 'base',
    weight: '1.0500',
    formula: 'mnożnik bazowy Paladin (Royal Paladin)',
  },
  {
    ruleKey: 'vocation_mage',
    category: 'base',
    weight: '1.1000',
    formula: 'mnożnik bazowy Mage (Master Sorcerer, Elder Druid)',
  },
  {
    ruleKey: 'vocation_monk',
    category: 'base',
    weight: '1.1500',
    formula: 'mnożnik bazowy Monk (Exalted Monk) — premium vocation',
  },

  // ── SKILLS (per vocation) ────────────────────────────────────
  // Wartość rośnie nieliniowo dla skill > 100 (110 >> 100). Wagi to TC/point > 100.
  {
    ruleKey: 'skill_magic_per_point',
    category: 'skill',
    weight: '8.0000',
    formula: '(skill_magic - 100) × 8 TC dla magic > 100; Mage/Monk vocation weight',
  },
  {
    ruleKey: 'skill_distance_per_point',
    category: 'skill',
    weight: '8.0000',
    formula: '(skill_distance - 100) × 8 TC dla distance > 100; Paladin main skill',
  },
  {
    ruleKey: 'skill_sword_per_point',
    category: 'skill',
    weight: '6.0000',
    formula: '(skill_sword - 100) × 6 TC; Knight main skill',
  },
  {
    ruleKey: 'skill_axe_per_point',
    category: 'skill',
    weight: '6.0000',
    formula: '(skill_axe - 100) × 6 TC; Knight main skill',
  },
  {
    ruleKey: 'skill_club_per_point',
    category: 'skill',
    weight: '6.0000',
    formula: '(skill_club - 100) × 6 TC; Knight main skill',
  },
  {
    ruleKey: 'skill_fist_per_point',
    category: 'skill',
    weight: '6.0000',
    formula: '(skill_fist - 100) × 6 TC; Monk main skill',
  },
  {
    ruleKey: 'skill_shielding_per_point',
    category: 'skill',
    weight: '4.0000',
    formula: '(skill_shielding - 100) × 4 TC; Knight tylko',
  },

  // ── FEATURES (stałe kwoty TC za posiadanie feature) ──────────
  {
    ruleKey: 'feature_soul_war',
    category: 'feature',
    weight: '6400.0000',
    formula: '+6400 TC za ukończone Soul War (najrzadszy quest)',
  },
  {
    ruleKey: 'feature_primal_ordeal',
    category: 'feature',
    weight: '4800.0000',
    formula: '+4800 TC za ukończone Primal Ordeal',
  },
  {
    ruleKey: 'feature_world_transfer',
    category: 'feature',
    weight: '3200.0000',
    formula: '+3200 TC za dostępny World Transfer',
  },
  {
    ruleKey: 'feature_prey_slot',
    category: 'feature',
    weight: '1200.0000',
    formula: '+1200 TC za odblokowany Prey Slot',
  },
  {
    ruleKey: 'feature_charm_expansion',
    category: 'feature',
    weight: '1200.0000',
    formula: '+1200 TC za Charm Expansion',
  },
  {
    ruleKey: 'feature_weekly_task_exp',
    category: 'feature',
    weight: '800.0000',
    formula: '+800 TC za Weekly Task Expansion',
  },
  {
    ruleKey: 'feature_twist_of_fate',
    category: 'feature',
    weight: '400.0000',
    formula: '+400 TC za Twist of Fate',
  },
  {
    ruleKey: 'feature_blessing_per_active',
    category: 'feature',
    weight: '800.0000',
    formula: 'blessings_active × 800 TC (np. 5/7 = 5×800 = 4000 TC)',
  },

  // ── PROGRESSION (liniowo/proporcjonalnie z metryki) ──────────
  {
    ruleKey: 'progression_charm_points_base',
    category: 'progression',
    weight: '0.8000',
    formula: 'charm_points × 0.8 TC (bazowo); próg 7000+ daje ×1.5',
  },
  {
    ruleKey: 'progression_charm_threshold_bonus',
    category: 'progression',
    weight: '0.4000',
    formula: 'dodatkowy bonus za charm_points > 7000: (points-7000) × 0.4 TC',
  },
  {
    ruleKey: 'progression_boss_points',
    category: 'progression',
    weight: '0.8000',
    formula: 'boss_points × 0.8 TC',
  },
  {
    ruleKey: 'progression_quests_per',
    category: 'progression',
    weight: '100.0000',
    formula: 'quests_completed × 100 TC (np. 28 quests = 2800 TC)',
  },
  {
    ruleKey: 'progression_imbuements_per',
    category: 'progression',
    weight: '80.0000',
    formula: 'imbuements_unlocked × 80 TC (np. 11/23 = 880 TC)',
  },
  {
    ruleKey: 'progression_imbuements_full_bonus',
    category: 'progression',
    weight: '800.0000',
    formula: '+800 TC bonus gdy imbuements_unlocked === imbuements_total',
  },
  {
    ruleKey: 'progression_animus',
    category: 'progression',
    weight: '5.0000',
    formula: 'animus_masteries × 5 TC',
  },
  {
    ruleKey: 'progression_achievement_points',
    category: 'progression',
    weight: '0.0500',
    formula: 'achievement_points × 0.05 TC',
  },

  // ── COSMETICS ────────────────────────────────────────────────
  {
    ruleKey: 'cosmetic_store_outfit_per',
    category: 'cosmetic',
    weight: '200.0000',
    formula: 'store_outfits_count × 200 TC',
  },
  {
    ruleKey: 'cosmetic_store_mount_per',
    category: 'cosmetic',
    weight: '350.0000',
    formula: 'store_mounts_count × 350 TC; rare mounts dodatkowo × 2',
  },
  {
    ruleKey: 'cosmetic_gem_lesser_per',
    category: 'cosmetic',
    weight: '50.0000',
    formula: 'gems_lesser × 50 TC',
  },
  {
    ruleKey: 'cosmetic_gem_regular_per',
    category: 'cosmetic',
    weight: '250.0000',
    formula: 'gems_regular × 250 TC',
  },
  {
    ruleKey: 'cosmetic_gem_greater_per',
    category: 'cosmetic',
    weight: '1000.0000',
    formula: 'gems_greater × 1000 TC',
  },
  {
    ruleKey: 'cosmetic_rare_items_multiplier',
    category: 'cosmetic',
    weight: '1.0000',
    formula: 'Σ(items.tc_value) WHERE items.is_rare = TRUE × 1.0',
  },

  // ── ASSETS ───────────────────────────────────────────────────
  {
    ruleKey: 'asset_gold_to_tc',
    category: 'asset',
    weight: '13900.0000',
    formula: 'gold_total ÷ 13900 (TC price in gold — z reference)',
  },
  {
    ruleKey: 'asset_tc_invested_direct',
    category: 'asset',
    weight: '1.0000',
    formula: 'tc_invested × 1.0 (1:1 — zainwestowane TC jest wartością)',
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
