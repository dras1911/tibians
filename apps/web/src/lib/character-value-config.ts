/**
 * Server-side helper: buduje `ValuationConfig` (T22, arch §8.4) z
 * `VALUATION_RULES_SEED` (T16 — `packages/db/src/seed/valuation-rules.ts`).
 *
 * Architektura mówi: "wagi z `valuation_rules` (arch §7.2) — NIE hardcoded"
 * (task 22 MUST DO). Ten helper realizuje to:
 *   - T22 commit: czyta z `VALUATION_RULES_SEED` (build-time, zero DB query)
 *     → strona działa bez postawionego Postgresa.
 *   - Faza 2+: rozszerzenie do prawdziwego query `valuation_rules` z DB
 *     (LRU cache + fallback do seeda, wzorzec z `blessings-config.ts`).
 *
 * Wzorzec mirrorowany z `blessings-config.ts` (T20) i `stamina-config.ts`
 * (T18) — spójność obsługi config w całej aplikacji.
 */
import {
  VALUATION_CONFIG_DEFAULT,
  type ValuationConfig,
} from "@tibians/calc";
import { VALUATION_RULES_SEED } from "@tibians/db/seed";

// ───────────────────────────────────────────────────────────────────────
// Seed → ValuationConfig
// ───────────────────────────────────────────────────────────────────────

/**
 * Mapowanie `valuation_rules.ruleKey` → klucz w `ValuationConfig`.
 *
 * Reguły w seed używają snake_case (`feature_soul_war`), a `ValuationConfig`
 * używa camelCase (`ruleFeatureSoulWar`). To mapowanie jest kontraktem
 * między T16 seed a T22 calc — zmiana w jednym wymaga aktualizacji drugu.
 *
 * Zasada grupowania (arch §8.4):
 *   - `level`, `vocation_*`              → base
 *   - `skill_*_per_point`                → skills
 *   - `feature_*`                        → features
 *   - `progression_*`                    → progression
 *   - `cosmetic_*`                       → cosmetics
 *   - `asset_*`                          → assets
 */
const RULE_TO_CONFIG_KEY: Readonly<Record<string, keyof ValuationConfig>> = {
  level: "ruleLevel",
  vocation_knight: "ruleVocationKnight",
  vocation_paladin: "ruleVocationPaladin",
  vocation_mage: "ruleVocationMage",
  vocation_monk: "ruleVocationMonk",

  skill_magic_per_point: "ruleSkillMagic",
  skill_distance_per_point: "ruleSkillDistance",
  skill_sword_per_point: "ruleSkillSword",
  skill_axe_per_point: "ruleSkillAxe",
  skill_club_per_point: "ruleSkillClub",
  skill_fist_per_point: "ruleSkillFist",
  skill_shielding_per_point: "ruleSkillShielding",

  feature_soul_war: "ruleFeatureSoulWar",
  feature_primal_ordeal: "ruleFeaturePrimalOrdeal",
  feature_world_transfer: "ruleFeatureWorldTransfer",
  feature_prey_slot: "ruleFeaturePreySlot",
  feature_charm_expansion: "ruleFeatureCharmExpansion",
  feature_weekly_task_exp: "ruleFeatureWeeklyTaskExp",
  feature_twist_of_fate: "ruleFeatureTwistOfFate",
  feature_blessing_per_active: "ruleFeatureBlessingPerActive",

  progression_charm_points_base: "ruleProgressionCharmBase",
  progression_charm_threshold_bonus: "ruleProgressionCharmThresholdBonus",
  progression_boss_points: "ruleProgressionBossPoints",
  progression_quests_per: "ruleProgressionQuestsPer",
  progression_imbuements_per: "ruleProgressionImbuementsPer",
  progression_imbuements_full_bonus: "ruleProgressionImbuementsFullBonus",
  progression_animus: "ruleProgressionAnimus",
  progression_achievement_points: "ruleProgressionAchievementPoints",

  cosmetic_store_outfit_per: "ruleCosmeticStoreOutfit",
  cosmetic_store_mount_per: "ruleCosmeticStoreMount",
  cosmetic_gem_lesser_per: "ruleCosmeticGemLesser",
  cosmetic_gem_regular_per: "ruleCosmeticGemRegular",
  cosmetic_gem_greater_per: "ruleCosmeticGemGreater",
  cosmetic_rare_items_multiplier: "ruleCosmeticRareItemsMultiplier",

  asset_gold_to_tc: "ruleAssetGoldToTc",
  asset_tc_invested_direct: "ruleAssetTcInvestedDirect",
};

/**
 * Progi dodatkowe (np. `charm_threshold` = 7 000) — nie ma ich w seed
 * `valuation_rules` (to parametr algorytmu, nie waga), ale są potrzebne
 * w configu. Hardcoded tutaj jako "feature flag" zgodny z dokumentacją
 * algorytmu (`progression_charm_threshold_bonus` formuła).
 *
 * Jeśli w przyszłości seed się rozszerzy o `charm_threshold` jako regułę,
 * dodaj mapowanie powyżej.
 */
const HARDCODED_THRESHOLDS = {
  charmThreshold: 7_000,
} as const;

/**
 * Parsuje wagę z seed (string NUMERIC) na number. Waliduje skończoność.
 */
function parseWeight(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `[character-value-config] Invalid weight value: "${value}"`,
    );
  }
  return parsed;
}

/**
 * Czyta wagę pojedynczej reguły z `VALUATION_RULES_SEED`.
 */
function readSeedWeight(ruleKey: string): number {
  const rule = VALUATION_RULES_SEED.find((r) => r.ruleKey === ruleKey);
  if (!rule) {
    throw new Error(
      `[character-value-config] Missing valuation rule "${ruleKey}" in seed`,
    );
  }
  return parseWeight(rule.weight);
}

/**
 * Bezpieczny odczyt wagi — przy brakującej regule zwraca default.
 * (Nie powinno się zdarzyć w seed, ale defensive coding dla Fazy 2+
 *  gdy reguły będą edytowane w DB.)
 */
function safeReadWeight(
  ruleKey: string,
  fallback: number,
): number {
  try {
    return readSeedWeight(ruleKey);
  } catch {
    return fallback;
  }
}

/**
 * Buduje `ValuationConfig` z `VALUATION_RULES_SEED` (T16).
 *
 * Zasada (arch §7.2 + §16 Faza 1B): wagi z DB / seed, NIE hardcoded.
 * Ta funkcja jest **jedynym** miejscem, gdzie seed jest czytany — strona
 * `/calculators/character-value/page.tsx` wywołuje ją raz i przekazuje
 * config do klienta (compound `<CharacterValueCalculator>`).
 *
 * @example
 * ```ts
 * // apps/web/src/app/[locale]/calculators/character-value/page.tsx
 * const config = await loadValuationConfig();
 * ```
 */
export async function loadValuationConfig(): Promise<ValuationConfig> {
  // T22 commit: zero DB query — seed jest static.
  // Faza 2+: tu będzie query do `valuation_rules` z cache 60s,
  //          z fallbackiem do tej samej logiki.
  return {
    ruleLevel: safeReadWeight("level", VALUATION_CONFIG_DEFAULT.ruleLevel),
    ruleVocationKnight: safeReadWeight(
      "vocation_knight",
      VALUATION_CONFIG_DEFAULT.ruleVocationKnight,
    ),
    ruleVocationPaladin: safeReadWeight(
      "vocation_paladin",
      VALUATION_CONFIG_DEFAULT.ruleVocationPaladin,
    ),
    ruleVocationMage: safeReadWeight(
      "vocation_mage",
      VALUATION_CONFIG_DEFAULT.ruleVocationMage,
    ),
    ruleVocationMonk: safeReadWeight(
      "vocation_monk",
      VALUATION_CONFIG_DEFAULT.ruleVocationMonk,
    ),

    ruleSkillMagic: safeReadWeight(
      "skill_magic_per_point",
      VALUATION_CONFIG_DEFAULT.ruleSkillMagic,
    ),
    ruleSkillDistance: safeReadWeight(
      "skill_distance_per_point",
      VALUATION_CONFIG_DEFAULT.ruleSkillDistance,
    ),
    ruleSkillSword: safeReadWeight(
      "skill_sword_per_point",
      VALUATION_CONFIG_DEFAULT.ruleSkillSword,
    ),
    ruleSkillAxe: safeReadWeight(
      "skill_axe_per_point",
      VALUATION_CONFIG_DEFAULT.ruleSkillAxe,
    ),
    ruleSkillClub: safeReadWeight(
      "skill_club_per_point",
      VALUATION_CONFIG_DEFAULT.ruleSkillClub,
    ),
    ruleSkillFist: safeReadWeight(
      "skill_fist_per_point",
      VALUATION_CONFIG_DEFAULT.ruleSkillFist,
    ),
    ruleSkillShielding: safeReadWeight(
      "skill_shielding_per_point",
      VALUATION_CONFIG_DEFAULT.ruleSkillShielding,
    ),

    ruleFeatureSoulWar: safeReadWeight(
      "feature_soul_war",
      VALUATION_CONFIG_DEFAULT.ruleFeatureSoulWar,
    ),
    ruleFeaturePrimalOrdeal: safeReadWeight(
      "feature_primal_ordeal",
      VALUATION_CONFIG_DEFAULT.ruleFeaturePrimalOrdeal,
    ),
    ruleFeatureWorldTransfer: safeReadWeight(
      "feature_world_transfer",
      VALUATION_CONFIG_DEFAULT.ruleFeatureWorldTransfer,
    ),
    ruleFeaturePreySlot: safeReadWeight(
      "feature_prey_slot",
      VALUATION_CONFIG_DEFAULT.ruleFeaturePreySlot,
    ),
    ruleFeatureCharmExpansion: safeReadWeight(
      "feature_charm_expansion",
      VALUATION_CONFIG_DEFAULT.ruleFeatureCharmExpansion,
    ),
    ruleFeatureWeeklyTaskExp: safeReadWeight(
      "feature_weekly_task_exp",
      VALUATION_CONFIG_DEFAULT.ruleFeatureWeeklyTaskExp,
    ),
    ruleFeatureTwistOfFate: safeReadWeight(
      "feature_twist_of_fate",
      VALUATION_CONFIG_DEFAULT.ruleFeatureTwistOfFate,
    ),
    ruleFeatureBlessingPerActive: safeReadWeight(
      "feature_blessing_per_active",
      VALUATION_CONFIG_DEFAULT.ruleFeatureBlessingPerActive,
    ),

    ruleProgressionCharmBase: safeReadWeight(
      "progression_charm_points_base",
      VALUATION_CONFIG_DEFAULT.ruleProgressionCharmBase,
    ),
    ruleProgressionCharmThresholdBonus: safeReadWeight(
      "progression_charm_threshold_bonus",
      VALUATION_CONFIG_DEFAULT.ruleProgressionCharmThresholdBonus,
    ),
    charmThreshold: HARDCODED_THRESHOLDS.charmThreshold,
    ruleProgressionBossPoints: safeReadWeight(
      "progression_boss_points",
      VALUATION_CONFIG_DEFAULT.ruleProgressionBossPoints,
    ),
    ruleProgressionQuestsPer: safeReadWeight(
      "progression_quests_per",
      VALUATION_CONFIG_DEFAULT.ruleProgressionQuestsPer,
    ),
    ruleProgressionImbuementsPer: safeReadWeight(
      "progression_imbuements_per",
      VALUATION_CONFIG_DEFAULT.ruleProgressionImbuementsPer,
    ),
    ruleProgressionImbuementsFullBonus: safeReadWeight(
      "progression_imbuements_full_bonus",
      VALUATION_CONFIG_DEFAULT.ruleProgressionImbuementsFullBonus,
    ),
    ruleProgressionAnimus: safeReadWeight(
      "progression_animus",
      VALUATION_CONFIG_DEFAULT.ruleProgressionAnimus,
    ),
    ruleProgressionAchievementPoints: safeReadWeight(
      "progression_achievement_points",
      VALUATION_CONFIG_DEFAULT.ruleProgressionAchievementPoints,
    ),

    ruleCosmeticStoreOutfit: safeReadWeight(
      "cosmetic_store_outfit_per",
      VALUATION_CONFIG_DEFAULT.ruleCosmeticStoreOutfit,
    ),
    ruleCosmeticStoreMount: safeReadWeight(
      "cosmetic_store_mount_per",
      VALUATION_CONFIG_DEFAULT.ruleCosmeticStoreMount,
    ),
    ruleCosmeticGemLesser: safeReadWeight(
      "cosmetic_gem_lesser_per",
      VALUATION_CONFIG_DEFAULT.ruleCosmeticGemLesser,
    ),
    ruleCosmeticGemRegular: safeReadWeight(
      "cosmetic_gem_regular_per",
      VALUATION_CONFIG_DEFAULT.ruleCosmeticGemRegular,
    ),
    ruleCosmeticGemGreater: safeReadWeight(
      "cosmetic_gem_greater_per",
      VALUATION_CONFIG_DEFAULT.ruleCosmeticGemGreater,
    ),
    ruleCosmeticRareItemsMultiplier: safeReadWeight(
      "cosmetic_rare_items_multiplier",
      VALUATION_CONFIG_DEFAULT.ruleCosmeticRareItemsMultiplier,
    ),

    ruleAssetGoldToTc: safeReadWeight(
      "asset_gold_to_tc",
      VALUATION_CONFIG_DEFAULT.ruleAssetGoldToTc,
    ),
    ruleAssetTcInvestedDirect: safeReadWeight(
      "asset_tc_invested_direct",
      VALUATION_CONFIG_DEFAULT.ruleAssetTcInvestedDirect,
    ),
  };
}

/**
 * Re-eksport dla wygody komponentów UI, które chcą pokazać listę reguł
 * w breakdownie (np. tooltip "reguła: feature_soul_war = +6 400 TC").
 */
export { RULE_TO_CONFIG_KEY };