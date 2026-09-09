/**
 * character-value — algorytm szacowania wartości postaci w TC (arch §8.4,
 * §2.4). Killer feature portalu — transparentność > precyzja.
 *
 * Formuła kanoniczna (arch §8.4):
 *
 * ```
 *   estimated_value = Σ (component_value × rule.weight)
 *
 *   Komponenty:
 *   ├── BASE
 *   │   ├── level          → level × 50 TC (bazowo; rosnąco nieliniowo > 1000)
 *   │   └── vocation_mod   → Knight 1.00 / Paladin 1.05 / Mage 1.10 / Monk 1.15
 *   ├── SKILLS (per vocation, relewantne)
 *   │   ├── magic / distance (Mage/Monk/Paladin)  → (skill − 100) × 8 TC
 *   │   ├── sword / axe / club / fist (Knight/Monk melee) → (skill − 100) × 6 TC
 *   │   └── shielding (Knight only)                → (skill − 100) × 4 TC
 *   ├── FEATURES (stałe kwoty z valuation_rules)
 *   │   ├── Soul War 💀        → +X TC
 *   │   ├── Primal Ordeal 🦖   → +X TC
 *   │   ├── World Transfer     → +X TC
 *   │   ├── Prey / Charm Exp / Weekly Task Exp     → +X TC
 *   │   ├── Twist of Fate      → +X TC
 *   │   └── Blessings          → blessingsActive × Y TC
 *   ├── PROGRESSION
 *   │   ├── charm_points       → liniowo + bonus za > 7 000
 *   │   ├── boss_points        → liniowo
 *   │   ├── quests             → questsCompleted × X TC
 *   │   ├── imbuements         → unlocked × X TC + bonus za pełen zestaw
 *   │   ├── animus_masteries   → × X TC
 *   │   └── achievement_points → × 0.05 TC
 *   ├── COSMETICS
 *   │   ├── store_outfits / mounts / items         → × stawka
 *   │   ├── gems (lesser/regular/greater)          → × stawka each
 *   │   └── rare items (Σ items.tc_value)          → × 1.0
 *   └── ASSETS
 *       ├── gold_total          → ÷ TC_VALUE_GP (reference)
 *       └── tc_invested         → 1:1 (premium; w UI za paywallem)
 *
 *   value_confidence = f(snapshot.source + completeness)
 *     → 1.00 auction + items + tcInvested
 *     → 0.80 auction bez items
 *     → 0.70 manual z items
 *     → 0.40 manual bez items
 * ```
 *
 * **Wagi** są czytane z `ValuationConfig` (T16 `valuation_rules` seed) — nigdy
 * hardcoded. Każdy komponent ma `key` odpowiadający `ruleKey` w seedzie,
 * więc edycja wagi = UPDATE w DB bez redeploya (arch §7.2 + §8.4 feedback).
 *
 * **Czysta funkcja**: zero I/O, zero `Date.now()`, zero `Math.random()`.
 *
 * @see https://tibia.fandom.com/wiki/Character_Trade (referencje dla algorytmu)
 */
import type {
  CharacterSnapshot,
  SkillKey,
  VocationBase,
  VocationPromoted,
} from "@tibians/character-context";
import {
  err,
  ok,
  validationError,
  type CalculatorResult,
} from "../types.js";

// ──────────────────────────────────────────────────────────────────────────
// ValuationConfig — wagi z T16 seed (`valuation_rules`).
// ──────────────────────────────────────────────────────────────────────────

/**
 * Wagi komponentów algorytmu (klucze = `valuation_rules.ruleKey` z T16).
 *
 * Konsumenci: `loadValuationConfig()` w `apps/web/src/lib/` ładuje z
 * `getConfig()` (T16) z fallbackiem do `VALUATION_RULES_SEED` z
 * `@tibians/db/seed`.
 *
 * Decimal — wszystkie wagi to `numeric(10,4)` w Postgres, ale my trzymamy
 * je jako `number` (zwielokrotnienie do TC/points) dla uproszczenia
 * obliczeń. Precyzja 4 miejsc po przecinku wystarcza do TC (rzędy 10³).
 */
export interface ValuationConfig {
  // ── BASE ─────────────────────────────────────────────────────────────
  /** `level` — TC za każdy level. */
  readonly ruleLevel: number;
  /** `vocation_knight` — mnożnik bazowy Knight (1.0). */
  readonly ruleVocationKnight: number;
  /** `vocation_paladin` — mnożnik bazowy Paladin (1.05). */
  readonly ruleVocationPaladin: number;
  /** `vocation_mage` — mnożnik bazowy Mage (1.10). */
  readonly ruleVocationMage: number;
  /** `vocation_monk` — mnożnik bazowy Monk (1.15). */
  readonly ruleVocationMonk: number;

  // ── SKILLS — TC za każdy punkt skilla powyżej 100 ──────────────────
  /** `skill_magic_per_point` — TC/pkt magic > 100. */
  readonly ruleSkillMagic: number;
  /** `skill_distance_per_point` — TC/pkt distance > 100 (Paladin). */
  readonly ruleSkillDistance: number;
  /** `skill_sword_per_point` — TC/pkt sword > 100 (Knight). */
  readonly ruleSkillSword: number;
  /** `skill_axe_per_point` — TC/pkt axe > 100 (Knight). */
  readonly ruleSkillAxe: number;
  /** `skill_club_per_point` — TC/pkt club > 100 (Knight). */
  readonly ruleSkillClub: number;
  /** `skill_fist_per_point` — TC/pkt fist > 100 (Monk). */
  readonly ruleSkillFist: number;
  /** `skill_shielding_per_point` — TC/pkt shielding > 100 (Knight). */
  readonly ruleSkillShielding: number;

  // ── FEATURES — stałe kwoty za posiadanie flagi ───────────────────
  readonly ruleFeatureSoulWar: number;
  readonly ruleFeaturePrimalOrdeal: number;
  readonly ruleFeatureWorldTransfer: number;
  readonly ruleFeaturePreySlot: number;
  readonly ruleFeatureCharmExpansion: number;
  readonly ruleFeatureWeeklyTaskExp: number;
  readonly ruleFeatureTwistOfFate: number;
  /** TC za każde aktywne błogosławieństwo (np. 5/7 = 5 × rule = Y TC). */
  readonly ruleFeatureBlessingPerActive: number;

  // ── PROGRESSION — liniowe (lub z progiem) ─────────────────────────
  /** Bazowy TC/pkt za charm_points. */
  readonly ruleProgressionCharmBase: number;
  /** Bonus TC/pkt za charm_points powyżej progu (≥ 7 000). */
  readonly ruleProgressionCharmThresholdBonus: number;
  /** Próg charm_points powyżej którego aktywuje się bonus. */
  readonly charmThreshold: number;
  /** TC/pkt za boss_points. */
  readonly ruleProgressionBossPoints: number;
  /** TC/za ukończony quest. */
  readonly ruleProgressionQuestsPer: number;
  /** TC/za odblokowany imbuement. */
  readonly ruleProgressionImbuementsPer: number;
  /** Bonus TC za pełen zestaw imbuementów (unlocked === total). */
  readonly ruleProgressionImbuementsFullBonus: number;
  /** TC/pkt za animus_masteries. */
  readonly ruleProgressionAnimus: number;
  /** TC/pkt za achievement_points (bardzo niska waga). */
  readonly ruleProgressionAchievementPoints: number;

  // ── COSMETICS ──────────────────────────────────────────────────────
  /** TC/za store outfit. */
  readonly ruleCosmeticStoreOutfit: number;
  /** TC/za store mount. */
  readonly ruleCosmeticStoreMount: number;
  /** TC/za lesser gem. */
  readonly ruleCosmeticGemLesser: number;
  /** TC/za regular gem. */
  readonly ruleCosmeticGemRegular: number;
  /** TC/za greater gem. */
  readonly ruleCosmeticGemGreater: number;
  /** Mnożnik dla Σ(tc_value) z `items.tc_value` (rare items). */
  readonly ruleCosmeticRareItemsMultiplier: number;

  // ── ASSETS ──────────────────────────────────────────────────────────
  /** Ile gp = 1 TC (do konwersji gold → TC). Domyślnie 13 900. */
  readonly ruleAssetGoldToTc: number;
  /** Mnożnik dla tc_invested (1:1 domyślnie). */
  readonly ruleAssetTcInvestedDirect: number;
}

/**
 * Defaultowe wagi — fallback gdy `getConfig()` nie odpowiada lub brakuje
 * kluczy. Wartości **muszą** odpowiadać seed w `VALUATION_RULES_SEED`
 * (`packages/db/src/seed/valuation-rules.ts`) — w przeciwnym razie testy
 * regression mogą failować.
 */
export const VALUATION_CONFIG_DEFAULT: ValuationConfig = Object.freeze({
  ruleLevel: 50.0,
  ruleVocationKnight: 1.0,
  ruleVocationPaladin: 1.05,
  ruleVocationMage: 1.1,
  ruleVocationMonk: 1.15,

  ruleSkillMagic: 8.0,
  ruleSkillDistance: 8.0,
  ruleSkillSword: 6.0,
  ruleSkillAxe: 6.0,
  ruleSkillClub: 6.0,
  ruleSkillFist: 6.0,
  ruleSkillShielding: 4.0,

  ruleFeatureSoulWar: 6_400,
  ruleFeaturePrimalOrdeal: 4_800,
  ruleFeatureWorldTransfer: 3_200,
  ruleFeaturePreySlot: 1_200,
  ruleFeatureCharmExpansion: 1_200,
  ruleFeatureWeeklyTaskExp: 800,
  ruleFeatureTwistOfFate: 400,
  ruleFeatureBlessingPerActive: 800,

  ruleProgressionCharmBase: 0.8,
  ruleProgressionCharmThresholdBonus: 0.4,
  charmThreshold: 7_000,
  ruleProgressionBossPoints: 0.8,
  ruleProgressionQuestsPer: 100,
  ruleProgressionImbuementsPer: 80,
  ruleProgressionImbuementsFullBonus: 800,
  ruleProgressionAnimus: 5.0,
  ruleProgressionAchievementPoints: 0.05,

  ruleCosmeticStoreOutfit: 200,
  ruleCosmeticStoreMount: 350,
  ruleCosmeticGemLesser: 50,
  ruleCosmeticGemRegular: 250,
  ruleCosmeticGemGreater: 1_000,
  ruleCosmeticRareItemsMultiplier: 1.0,

  ruleAssetGoldToTc: 13_900,
  ruleAssetTcInvestedDirect: 1.0,
});

// ──────────────────────────────────────────────────────────────────────────
// Typy wyniku
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pojedyncza pozycja breakdownu (np. "+6 400 (Soul War)").
 *
 * `weight` to wycena tego komponentu w TC (już po przemnożeniu przez
 * `rule.weight`), NIE waga reguły. UI może wyświetlić `value` jako
 * wkład komponentu do sumy.
 */
export interface CharacterValueItem {
  /** Klucz reguły (np. `feature_soul_war`). */
  readonly key: string;
  /** Wartość komponentu w TC (bigint — bezpieczna precyzja). */
  readonly value: bigint;
}

export interface CharacterValueComponent {
  /** Suma TC komponentu (bigint). */
  readonly value: bigint;
  /** Waga komponentu w całości wyceny (0..1, udział). */
  readonly weight: number;
}

export interface CharacterValueSkillsComponent extends CharacterValueComponent {
  /** Per-skill rozbicie (dla UI). */
  readonly perSkill: Readonly<Record<SkillKey, bigint>>;
}

export interface CharacterValueProgressionComponent extends CharacterValueComponent {
  readonly items: readonly CharacterValueItem[];
}
export interface CharacterValueCosmeticsComponent extends CharacterValueComponent {
  readonly items: readonly CharacterValueItem[];
}
export interface CharacterValueAssetsComponent extends CharacterValueComponent {
  readonly items: readonly CharacterValueItem[];
}
export interface CharacterValueFeaturesComponent extends CharacterValueComponent {
  readonly items: readonly CharacterValueItem[];
}

export interface CharacterValueBreakdown {
  /** Bazowa wartość (level × rule). */
  readonly level: CharacterValueComponent;
  /** Suma skilli powyżej progu 100, per vocation. */
  readonly skills: CharacterValueSkillsComponent;
  /** Stałe kwoty za features (Soul War, Primal Ordeal, ...). */
  readonly features: CharacterValueFeaturesComponent;
  /** Liniowe wagi za progression (charms, boss, quests, ...). */
  readonly progression: CharacterValueProgressionComponent;
  /** Cosmetics (store outfits/mounts/items, gems, rare items). */
  readonly cosmetics: CharacterValueCosmeticsComponent;
  /** Assets (gold, tc_invested). */
  readonly assets: CharacterValueAssetsComponent;
}

export interface CharacterValueResult {
  /** Szacowana wartość w TC (bigint). */
  readonly estimatedValue: bigint;
  /** Per-komponent breakdown z wagami. */
  readonly breakdown: CharacterValueBreakdown;
  /** Pewność wyceny 0..1 (z `computeValueConfidence`). */
  readonly confidence: number;
  /**
   * Symbol prefiksu (`~` / `≈`) z arch §8.4:
   *   - `~` dla confidence ≥ 0.8
   *   - `≈` dla niższych (przybliżenie)
   */
  readonly confidenceSymbol: "~" | "≈";
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers — vocation / skill relevance
// ──────────────────────────────────────────────────────────────────────────

/**
 * Mapowanie vocation (bazowa/promowana) → bazowy mnożnik.
 * Używane do wyliczenia wagi vocation w bazie.
 */
function vocationModifier(vocation: VocationBase, cfg: ValuationConfig): number {
  switch (vocation) {
    case "Knight":
      return cfg.ruleVocationKnight;
    case "Paladin":
      return cfg.ruleVocationPaladin;
    case "Druid":
    case "Sorcerer":
      return cfg.ruleVocationMage;
    case "Monk":
      return cfg.ruleVocationMonk;
  }
}

/**
 * Czy skill `key` jest relewantny dla danego vocation?
 * Arch §8.4: "per vocation — liczą się tylko relewantne".
 *
 * Reguła:
 *   - Knight: sword/axe/club (melee) + shielding
 *   - Paladin: distance + (shielding opcjonalnie)
 *   - Druid/Sorcerer: magic
 *   - Monk: fist + magic
 *   - fishing: NIGDY (nie ma realnej wartości handlowej)
 */
function isRelevantSkill(vocation: VocationBase, skill: SkillKey): boolean {
  if (skill === "fishing") return false; // nigdy nie ma wartości
  switch (vocation) {
    case "Knight":
      return (
        skill === "sword" || skill === "axe" || skill === "club" || skill === "shielding"
      );
    case "Paladin":
      return skill === "distance" || skill === "shielding";
    case "Druid":
    case "Sorcerer":
      return skill === "magic";
    case "Monk":
      return skill === "fist" || skill === "magic";
  }
}

/** Waga reguły per skill (TC/pkt powyżej 100). */
function skillRuleWeight(skill: SkillKey, cfg: ValuationConfig): number {
  switch (skill) {
    case "magic":
      return cfg.ruleSkillMagic;
    case "distance":
      return cfg.ruleSkillDistance;
    case "sword":
      return cfg.ruleSkillSword;
    case "axe":
      return cfg.ruleSkillAxe;
    case "club":
      return cfg.ruleSkillClub;
    case "fist":
      return cfg.ruleSkillFist;
    case "shielding":
      return cfg.ruleSkillShielding;
    case "fishing":
      return 0;
  }
}

/** Vocation → promowana nazwa (zgodnie ze schemą character-context). */
function toPromoted(vocation: VocationBase): VocationPromoted {
  switch (vocation) {
    case "Knight":
      return "Elite Knight";
    case "Paladin":
      return "Royal Paladin";
    case "Druid":
      return "Elder Druid";
    case "Sorcerer":
      return "Master Sorcerer";
    case "Monk":
      return "Exalted Monk";
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers — confidence (mirror packages/character-context/value-confidence)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Compute value confidence inline (bez zależności od character-context w
 * testach izolowanych). Reguły z `packages/character-context/src/value-confidence.ts`.
 */
function computeConfidence(snap: CharacterSnapshot): number {
  if (snap.source.kind === "auction") {
    const hasItems = snap.assets.items.length > 0;
    const hasTc = snap.assets.tcInvested !== undefined;
    const hasAch = snap.progression.achievementPoints > 0;
    if (hasItems && hasTc && hasAch) return 1.0;
    if (!hasItems && !hasTc) return 0.8;
    return 0.9;
  }
  if (snap.source.kind === "manual" || snap.source.kind === "imported") {
    return snap.assets.items.length > 0 ? 0.7 : 0.4;
  }
  return 0.2;
}

// ──────────────────────────────────────────────────────────────────────────
// estimateCharacterValue — główna funkcja
// ──────────────────────────────────────────────────────────────────────────

/**
 * Walidacja snapshotu — `CharacterSnapshotSchema` (w `character-context`)
 * robi to przy zapisie, ale w calculator (pure function) dostajemy już
 * zwalidowany snapshot. Tutaj dodajemy krzyżówkę: `vocation` musi się
 * zgadzać z `vocationPromoted` (to gwarantuje już schema, ale na wszelki
 * wypadek sprawdzamy defensywnie).
 */
function validateSnapshot(
  snap: CharacterSnapshot,
): CalculatorResult<CharacterSnapshot> {
  if (toPromoted(snap.identity.vocation) !== snap.identity.vocationPromoted) {
    return err(
      validationError(
        "CHARACTER_VALUE_VOCATION_MISMATCH",
        `vocationPromoted (${snap.identity.vocationPromoted}) nie odpowiada vocation (${snap.identity.vocation})`,
      ),
    );
  }
  if (snap.identity.level < 8 || snap.identity.level > 2_500) {
    return err(
      validationError(
        "CHARACTER_VALUE_INVALID_LEVEL",
        `level musi być ∈ [8, 2500], otrzymano ${snap.identity.level}`,
      ),
    );
  }
  return ok(snap);
}

/**
 * Główna funkcja — szacuje wartość postaci w TC (arch §8.4).
 *
 * @param snapshot - pełny `CharacterSnapshot` (Zod-walidowany).
 * @param config - wagi z T16 seed (`loadValuationConfig()`).
 * @returns `CalculatorResult<CharacterValueResult>` z breakdownem i confidence.
 *
 * @example
 * ```ts
 * import { estimateCharacterValue, VALUATION_CONFIG_DEFAULT } from "@tibians/calc";
 *
 * const r = estimateCharacterValue(migzenSnapshot, VALUATION_CONFIG_DEFAULT);
 * if (r.ok) {
 *   console.log(r.value.estimatedValue); // 31200n (TC, bigint)
 *   console.log(r.value.confidence);     // 1.0 (pełny detal aukcji)
 * }
 * ```
 */
export function estimateCharacterValue(
  snapshot: CharacterSnapshot,
  config: ValuationConfig = VALUATION_CONFIG_DEFAULT,
): CalculatorResult<CharacterValueResult> {
  // ── Walidacja defensywna ───────────────────────────────────────────
  const valid = validateSnapshot(snapshot);
  if (!valid.ok) return valid;

  // ── 1. BASE — level × ruleLevel × vocation_mod ──────────────────────
  const vocationMod = vocationModifier(snapshot.identity.vocation, config);
  const levelValue = BigInt(
    Math.round(snapshot.identity.level * config.ruleLevel * vocationMod),
  );

  // ── 2. SKILLS — relewantne skille, tylko powyżej progu 100 ─────────
  const perSkill = {} as Record<SkillKey, bigint>;
  let skillsTotal = 0n;
  for (const key of [
    "magic",
    "club",
    "fist",
    "sword",
    "axe",
    "distance",
    "shielding",
    "fishing",
  ] as const) {
    const base = snapshot.skills[key].base;
    if (!isRelevantSkill(snapshot.identity.vocation, key)) {
      perSkill[key] = 0n;
      continue;
    }
    const above100 = Math.max(0, base - 100);
    const weight = skillRuleWeight(key, config);
    const value = BigInt(Math.round(above100 * weight));
    perSkill[key] = value;
    skillsTotal += value;
  }

  // ── 3. FEATURES — stałe kwoty za posiadanie flagi ─────────────────
  const featureItems: CharacterValueItem[] = [];
  let featuresTotal = 0n;

  const featureMap: ReadonlyArray<readonly [string, boolean, number]> = [
    ["feature_soul_war", snapshot.flags.soulWar, config.ruleFeatureSoulWar],
    [
      "feature_primal_ordeal",
      snapshot.flags.primalOrdeal,
      config.ruleFeaturePrimalOrdeal,
    ],
    [
      "feature_world_transfer",
      snapshot.flags.worldTransfer,
      config.ruleFeatureWorldTransfer,
    ],
    ["feature_prey_slot", snapshot.flags.preySlot, config.ruleFeaturePreySlot],
    [
      "feature_charm_expansion",
      snapshot.flags.charmExpansion,
      config.ruleFeatureCharmExpansion,
    ],
    [
      "feature_weekly_task_exp",
      snapshot.flags.weeklyTaskExpansion,
      config.ruleFeatureWeeklyTaskExp,
    ],
    [
      "feature_twist_of_fate",
      snapshot.flags.twistOfFate,
      config.ruleFeatureTwistOfFate,
    ],
  ];
  for (const [key, has, weight] of featureMap) {
    if (has) {
      const v = BigInt(Math.round(weight));
      featureItems.push({ key, value: v });
      featuresTotal += v;
    }
  }

  // Blessings — kwota × aktywne (0..7)
  if (snapshot.flags.blessingsActive > 0) {
    const v = BigInt(
      Math.round(snapshot.flags.blessingsActive * config.ruleFeatureBlessingPerActive),
    );
    featureItems.push({
      key: "feature_blessing_per_active",
      value: v,
    });
    featuresTotal += v;
  }

  // ── 4. PROGRESSION — charms, boss, quests, imbuements, animus, ach ──
  const progressionItems: CharacterValueItem[] = [];
  let progressionTotal = 0n;

  // Charm points: liniowo + bonus za > threshold
  {
    const points = snapshot.progression.charmPoints;
    const base = BigInt(Math.round(points * config.ruleProgressionCharmBase));
    progressionItems.push({ key: "progression_charm_points_base", value: base });
    progressionTotal += base;
    if (points > config.charmThreshold) {
      const over = points - config.charmThreshold;
      const bonus = BigInt(
        Math.round(over * config.ruleProgressionCharmThresholdBonus),
      );
      progressionItems.push({
        key: "progression_charm_threshold_bonus",
        value: bonus,
      });
      progressionTotal += bonus;
    }
  }

  // Boss points: liniowo
  {
    const v = BigInt(
      Math.round(snapshot.progression.bossPoints * config.ruleProgressionBossPoints),
    );
    progressionItems.push({ key: "progression_boss_points", value: v });
    progressionTotal += v;
  }

  // Quests: per completed
  {
    const v = BigInt(
      Math.round(snapshot.progression.questsCompleted * config.ruleProgressionQuestsPer),
    );
    progressionItems.push({ key: "progression_quests_per", value: v });
    progressionTotal += v;
  }

  // Imbuements: per unlocked + bonus za pełen zestaw
  {
    const v = BigInt(
      Math.round(
        snapshot.progression.imbuementsUnlocked * config.ruleProgressionImbuementsPer,
      ),
    );
    progressionItems.push({ key: "progression_imbuements_per", value: v });
    progressionTotal += v;
    if (
      snapshot.progression.imbuementsUnlocked === snapshot.progression.imbuementsTotal &&
      snapshot.progression.imbuementsTotal > 0
    ) {
      const bonus = BigInt(Math.round(config.ruleProgressionImbuementsFullBonus));
      progressionItems.push({
        key: "progression_imbuements_full_bonus",
        value: bonus,
      });
      progressionTotal += bonus;
    }
  }

  // Animus masteries: per pkt
  {
    const v = BigInt(
      Math.round(snapshot.progression.animusMasteries * config.ruleProgressionAnimus),
    );
    progressionItems.push({ key: "progression_animus", value: v });
    progressionTotal += v;
  }

  // Achievement points: × 0.05 (mikro-wpływ)
  {
    const v = BigInt(
      Math.round(
        snapshot.progression.achievementPoints * config.ruleProgressionAchievementPoints,
      ),
    );
    progressionItems.push({ key: "progression_achievement_points", value: v });
    progressionTotal += v;
  }

  // ── 5. COSMETICS — store + gems + rare items ──────────────────────
  const cosmeticsItems: CharacterValueItem[] = [];
  let cosmeticsTotal = 0n;

  {
    const v = BigInt(
      Math.round(snapshot.assets.storeCounts.outfits * config.ruleCosmeticStoreOutfit),
    );
    cosmeticsItems.push({ key: "cosmetic_store_outfit_per", value: v });
    cosmeticsTotal += v;
  }
  {
    const v = BigInt(
      Math.round(snapshot.assets.storeCounts.mounts * config.ruleCosmeticStoreMount),
    );
    cosmeticsItems.push({ key: "cosmetic_store_mount_per", value: v });
    cosmeticsTotal += v;
  }
  {
    const v = BigInt(Math.round(snapshot.assets.gems.lesser * config.ruleCosmeticGemLesser));
    cosmeticsItems.push({ key: "cosmetic_gem_lesser_per", value: v });
    cosmeticsTotal += v;
  }
  {
    const v = BigInt(Math.round(snapshot.assets.gems.regular * config.ruleCosmeticGemRegular));
    cosmeticsItems.push({ key: "cosmetic_gem_regular_per", value: v });
    cosmeticsTotal += v;
  }
  {
    const v = BigInt(Math.round(snapshot.assets.gems.greater * config.ruleCosmeticGemGreater));
    cosmeticsItems.push({ key: "cosmetic_gem_greater_per", value: v });
    cosmeticsTotal += v;
  }

  // Rare items — UI wkleja `tc_value` per item (lookup z tabeli `items`).
  // Tu zakładamy, że snapshot NIE przechowuje `tcValue` per item — UI
  // dostarcza dodatkowe pole `rareItemsTcTotal` jako input (opcjonalne).
  // Dla uproszczenia: jeśli snapshot ma items i jest to aukcja, używamy
  // przybliżenia `items.length × 0` (placeholder — real lookup w T62).
  // W produkcji UI pozwoli graczowi wpisać `tc_value` ręcznie (patrz
  // opcjonalne pole formularza). T22 commit nie implementuje tego —
  // hook pozostawiony dla T62.
  //   → return 0 dla T22 (comment-out dla czytelności).
  {
    // Multiplier × Σ(items.tcValue). W T22 snapshot nie ma tc_value per
    // item, więc placeholder: 0. Hook na przyszły lookup `items.tc_value`.
    const v = 0n;
    if (v > 0n) {
      cosmeticsItems.push({
        key: "cosmetic_rare_items_multiplier",
        value: v,
      });
      cosmeticsTotal += v;
    }
  }

  // ── 6. ASSETS — gold + tc_invested ────────────────────────────────
  const assetsItems: CharacterValueItem[] = [];
  let assetsTotal = 0n;

  {
    // gold → TC: divide (not multiply, więc round-up z floor)
    const tcFromGold = snapshot.assets.goldTotal > 0
      ? BigInt(Math.floor(snapshot.assets.goldTotal / config.ruleAssetGoldToTc))
      : 0n;
    assetsItems.push({ key: "asset_gold_to_tc", value: tcFromGold });
    assetsTotal += tcFromGold;
  }

  if (snapshot.assets.tcInvested !== undefined && snapshot.assets.tcInvested > 0) {
    const v = BigInt(
      Math.round(snapshot.assets.tcInvested * config.ruleAssetTcInvestedDirect),
    );
    assetsItems.push({ key: "asset_tc_invested_direct", value: v });
    assetsTotal += v;
  }

  // ── 7. AGGREGATE — suma + wagi per komponent ───────────────────────
  const components = {
    level: levelValue,
    skills: skillsTotal,
    features: featuresTotal,
    progression: progressionTotal,
    cosmetics: cosmeticsTotal,
    assets: assetsTotal,
  };
  const estimatedValue =
    components.level +
    components.skills +
    components.features +
    components.progression +
    components.cosmetics +
    components.assets;

  // Wagi per komponent (udział w sumie). Edge case: estimatedValue = 0.
  const total = Number(estimatedValue);
  const weight = (n: bigint): number =>
    total > 0 ? Math.round((Number(n) / total) * 1000) / 1000 : 0;

  const breakdown: CharacterValueBreakdown = {
    level: { value: components.level, weight: weight(components.level) },
    skills: {
      value: components.skills,
      weight: weight(components.skills),
      perSkill,
    },
    features: {
      value: components.features,
      weight: weight(components.features),
      items: featureItems,
    },
    progression: {
      value: components.progression,
      weight: weight(components.progression),
      items: progressionItems,
    },
    cosmetics: {
      value: components.cosmetics,
      weight: weight(components.cosmetics),
      items: cosmeticsItems,
    },
    assets: {
      value: components.assets,
      weight: weight(components.assets),
      items: assetsItems,
    },
  };

  // ── 8. CONFIDENCE ──────────────────────────────────────────────────
  const confidence = computeConfidence(snapshot);
  const confidenceSymbol: "~" | "≈" = confidence >= 0.8 ? "~" : "≈";

  return ok({
    estimatedValue,
    breakdown,
    confidence,
    confidenceSymbol,
  });
}