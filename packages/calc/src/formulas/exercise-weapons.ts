/**
 * exercise-weapons — kalkulator Exercise Weapons (task 15, arch. §2.1).
 *
 * Implementuje 2 tryby z benchmarku TibiaPal:
 *   - `mode: 'targetSkill'`      → ile broni potrzeba, żeby z currentSkill dojść do targetSkill
 *   - `mode: 'targetWeaponsUsed'` → ile skillu zyskasz z N broni danego typu
 *
 * **Wzór** (TibiaWiki Formulae + TibiaWiki Exercise_Weapons):
 *
 *   Skill advance:  P(L) = A × b^(L − c)      (points to next level)
 *                   Tp(L) = A × (b^(L−c) − 1) / (b − 1)   (total points at level)
 *   Skill inverse:  Skill = log_b(Tp × (b−1) / A + 1) + c
 *
 *   gdzie:
 *     A = skill constant (Magic: 1600, Melee: 50, Distance: 30, Shielding: 100)
 *     b = vocation constant (per vocation/skill — TibiaWiki Formulae table)
 *     c = skill offset (Magic: 0, inne: 10)
 *
 *   Exercise weapon worth (TibiaWiki Exercise_Weapons):
 *     - Magic (Wand/Rod):  300,000 mana burned per Regular weapon (500 charges × 600)
 *     - Melee (Sword/Axe/Club): 3,600 hits per Regular weapon (500 × 7.2)
 *     - Distance (Bow):    1,800 hits per Regular weapon (500 × 3.6 — half efficiency)
 *     - Shielding:         7,200 blocks per Regular weapon
 *     - Durable: × 3.6     (1800 charges vs 500)
 *     - Lasting: × 28.8    (14400 charges vs 500)
 *
 * **Loyalty bonus** (TibiaWiki Loyalty_System):
 *   loyaltyMultiplier = 1 + loyaltyPct / 100
 *   Points gained from weapons = weaponCount × weaponPoints × loyaltyMultiplier
 *   (loyalty zwiększa effective points na broń)
 *
 * **Modifiers**:
 *   - `doubleEvent`: double event ON → / 2 (potrzeba 2× mniej broni do tego samego efektu)
 *   - `privateDummy`: 10% bonus → / 1.1 (Demon/Ferumbras/Monk dummies — TibiaWiki)
 *   - `tcPriceThreshold`: próg ceny TC (domyślnie 13 889 gp) — wpływa na rekomendację
 *
 * **TibiiTC price threshold**:
 *   TibiaWiki: "If the exchange rate of Tibia Coins for gold on a world is higher than 13,889
 *   gold per coin, it is more economical to buy these weapons for in-game currency."
 *   → rekomendacja: jeśli TC > 13 889 gp, kupuj za gold; jeśli TC < 13 889 gp, kupuj za TC.
 *
 * **Czysta funkcja**: deterministyczna, brak I/O, brak `Date.now()` / `Math.random()`.
 *
 * Source: https://tibia.fandom.com/wiki/Formulae
 *         https://tibia.fandom.com/wiki/Exercise_Weapons
 *         https://tibia.fandom.com/wiki/Loyalty_System
 *         https://tibia.fandom.com/wiki/Tibia_Coins
 */

import {
  err,
  ok,
  validationError,
  type CalculatorResult,
  type ExerciseWeaponType,
  type LoyaltyBonus,
  type VocationSkillCategory,
  type VocationSkillPair,
} from "../types.js";
import { VOCATION_SKILL_PAIRS } from "../utils/get-relevant-skill.js";

// ──────────────────────────────────────────────────────────────────────────
// Stałe domenowe (TibiaWiki ground truth)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Skill constants (A) z TibiaWiki Formulae.
 * https://tibia.fandom.com/wiki/Formulae
 */
export const SKILL_CONSTANTS = Object.freeze({
  magic: 1600,
  melee: 50, // sword, axe, club
  fist: 50, // TibiaWiki: fist = melee constant
  distance: 30,
  shielding: 100,
  fishing: 20,
} as const);

/** Skill offsets (c) z TibiaWiki Formulae. */
const SKILL_OFFSET_MAGIC = 0;
const SKILL_OFFSET_NON_MAGIC = 10;

/**
 * Vocation constants per (vocation, skill type) — TibiaWiki Formulae table.
 * https://tibia.fandom.com/wiki/Formulae
 */
const VOCATION_CONSTANT_TABLE: Readonly<
  Record<string, Record<string, number>>
> = Object.freeze({
  // Knight: high melee, slow magic
  knight: Object.freeze({
    magic: 3.0,
    melee: 1.1,
    fist: 1.1,
    distance: 1.4,
    shielding: 1.1,
    fishing: 1.1,
  }),
  // Paladin: balanced
  paladin: Object.freeze({
    magic: 1.4,
    melee: 1.2,
    fist: 1.2,
    distance: 1.1,
    shielding: 1.1,
    fishing: 1.1,
  }),
  // Sorcerer: best magic, slow melee
  sorcerer: Object.freeze({
    magic: 1.1,
    melee: 2.0,
    fist: 1.5,
    distance: 2.0,
    shielding: 1.5,
    fishing: 1.1,
  }),
  // Druid: best magic (b=1.1), slow fist
  druid: Object.freeze({
    magic: 1.1,
    melee: 1.8,
    fist: 1.5,
    distance: 1.8,
    shielding: 1.5,
    fishing: 1.1,
  }),
  // Monk: balanced, fast fist
  monk: Object.freeze({
    magic: 1.25,
    melee: 1.4,
    fist: 1.1,
    distance: 1.5,
    shielding: 1.15,
    fishing: 1.1,
  }),
});

/** Skill type enum (wewnętrzny, do mapowania z VocationSkillCategory). */
type SkillType = "magic" | "melee" | "fist" | "distance" | "shielding" | "fishing";

/** Vocation base → VocationConstantTable key. */
type VocationBaseKey = "knight" | "paladin" | "sorcerer" | "druid" | "monk";

/** Exercise weapon points (worth) per skill type per weapon tier. */
const WEAPON_POINTS_REGULAR: Readonly<Record<SkillType, number>> = Object.freeze({
  magic: 300_000, // 500 charges × 600 mana = 300,000 mana burned
  melee: 3_600, // 500 charges × 7.2 hits = 3,600 hits
  fist: 3_600, // fist wraps use melee formula (TibiaWiki)
  distance: 1_800, // 500 charges × 3.6 hits = 1,800 hits (half efficiency)
  shielding: 7_200, // 500 charges × 14.4 = 7,200 blocks (estimated from TibiaWiki equivalent)
  fishing: 5_000, // przybliżenie — TibiaWiki nie podaje explicite
});

/** Weapon tier multiplier (TibiaWiki Exercise_Weapons). */
const WEAPON_TIER_MULTIPLIER: Readonly<Record<ExerciseWeaponType, number>> =
  Object.freeze({
    regular: 1,
    durable: 3.6, // 1800 / 500
    lasting: 28.8, // 14400 / 500
  });

/** Cost per Regular weapon (TibiaWiki Exercise_Weapons verified). */
const COST_REGULAR_GP = 347_222;
const COST_REGULAR_TC = 25;

/** TC price threshold (TibiaWiki: 13 889 gp/TC = 13,888.88...). */
export const TC_PRICE_THRESHOLD_GP = 13_889;

// ──────────────────────────────────────────────────────────────────────────
// Typy wejścia/wyjścia
// ──────────────────────────────────────────────────────────────────────────

/**
 * Tryby kalkulatora (TibiaPal benchmark — arch. §2.1).
 *   - `targetSkill`      → ile broni potrzeba, żeby dojść do X
 *   - `targetWeaponsUsed` → ile skillu zyskasz z N broni
 */
export type ExerciseWeaponsMode = "targetSkill" | "targetWeaponsUsed";

/** Rekomendacja słowna (arch. §2.1). */
export type ExerciseWeaponsRecommendation = "buyGold" | "buyTc" | "equal";

/**
 * Opcje wejścia kalkulatora Exercise Weapons.
 *
 * Różnica per tryb:
 *   - `targetSkill`: wymaga `targetSkill`, `currentSkill`, `percentToNext`
 *   - `targetWeaponsUsed`: wymaga `numWeapons`, `weaponType`; `targetSkill` jest ignorowany
 *
 * Pola wspólne: `currentSkill`, `loyaltyPct`, `doubleEvent`, `privateDummy`,
 * `tcPriceThreshold` (default 13 889 gp).
 */
export interface ExerciseWeaponsOptions {
  /** Para vocation/skill (arch. §2.1 — 8 par). */
  readonly category: VocationSkillCategory;

  /** Tryb kalkulatora (2 tryby z benchmarku TibiaPal). */
  readonly mode: ExerciseWeaponsMode;

  /** Skill wyświetlany w grze (z loyalty jeśli dotyczy). */
  readonly currentSkill: number;

  /** % do następnego levelu (0..100) — Tibia pokazuje %, nie punkty. */
  readonly percentToNext: number;

  /** Docelowy skill (wymagany dla trybu `targetSkill`). */
  readonly targetSkill?: number;

  /** Liczba broni (wymagana dla trybu `targetWeaponsUsed`). */
  readonly numWeapons?: number;

  /** Procent lojalności {0, 5, 10, …, 50}. */
  readonly loyaltyPct: LoyaltyBonus;

  /** Typ broni (wymagany dla trybu `targetWeaponsUsed`). */
  readonly weaponType?: ExerciseWeaponType;

  /** Double event ON → /2 (potrzeba 2× mniej broni). */
  readonly doubleEvent: boolean;

  /** Private dummy (Demon/Ferumbras/Monk) → /1.1 (10% bonus). */
  readonly privateDummy: boolean;

  /** Próg ceny TC (default 13 889 gp) — wpływa na rekomendację. */
  readonly tcPriceThreshold?: number;
}

/**
 * Wynik kalkulatora Exercise Weapons.
 *
 * Pola wspólne:
 *   - `recommendation` — 'buyGold' | 'buyTc' | 'equal'
 *
 * Pola per tryb:
 *   - `targetSkill`:      `weaponsNeeded: { regular, durable, lasting }`
 *   - `targetWeaponsUsed`: `newSkillLevel: number, skillGained: number`
 */
export interface ExerciseWeaponsResult {
  readonly mode: ExerciseWeaponsMode;
  readonly weaponsNeeded: {
    readonly regular: number;
    readonly durable: number;
    readonly lasting: number;
  };
  readonly totalCostGp: number;
  readonly totalCostTc: number;
  readonly recommendation: ExerciseWeaponsRecommendation;
  readonly timeSeconds: {
    readonly regular: number;
    readonly durable: number;
    readonly lasting: number;
  };
  // Dodatkowe pola dla trybu `targetWeaponsUsed`
  readonly newSkillLevel?: number;
  readonly skillGained?: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpery — wzory TibiaWiki Formulae
// ──────────────────────────────────────────────────────────────────────────

/**
 * Który skill type odpowiada kategorii vocation/skill.
 * Mapowanie 8 par (arch. §2.1) na 6 skill types z TibiaWiki Formulae.
 */
function skillTypeFromCategory(
  category: VocationSkillCategory,
): SkillType {
  switch (category) {
    case "knightMelee":
      return "melee";
    case "knightShielding":
      return "shielding";
    case "knightMagic":
    case "paladinMagic":
    case "mageMagic":
    case "monkMagic":
      return "magic";
    case "paladinDistance":
      return "distance";
    case "monkFist":
      return "fist";
  }
}

/**
 * Zwraca parę (vocation constant, skill constant, skill offset) dla kategorii.
 * Exportowane publicznie — współdzielone z `training.ts` (oba kalkulatory
 * korzystają z tego samego TibiaWiki Formulae — arch. §2.1).
 *
 * @throws Error jeśli para nie ma odpowiednika w VOCATION_CONSTANT_TABLE.
 */
export function getFormulaParams(category: VocationSkillCategory): {
  readonly b: number;
  readonly A: number;
  readonly c: number;
  readonly vocationBase: VocationBaseKey;
  readonly skillType: SkillType;
} {
  const pair: VocationSkillPair | undefined = VOCATION_SKILL_PAIRS.find(
    (p) => p.category === category,
  );
  if (pair === undefined) {
    throw new Error(
      `[@tibians/calc] Nieznana kategoria vocation/skill: ${category}`,
    );
  }

  // Mapowanie vocation promoted → base
  const vocationBaseMap: Readonly<Record<string, VocationBaseKey>> = {
    "Elite Knight": "knight",
    "Royal Paladin": "paladin",
    "Elder Druid": "druid",
    "Master Sorcerer": "sorcerer",
    "Exalted Monk": "monk",
  };
  const vocationBase = vocationBaseMap[pair.vocation];
  if (vocationBase === undefined) {
    throw new Error(
      `[@tibians/calc] Brak vocationBase dla ${pair.vocation}`,
    );
  }

  const skillType = skillTypeFromCategory(category);
  const table = VOCATION_CONSTANT_TABLE[vocationBase];
  if (table === undefined) {
    throw new Error(
      `[@tibians/calc] Brak vocation constants dla ${vocationBase}`,
    );
  }
  const b = table[skillType];
  if (b === undefined) {
    throw new Error(
      `[@tibians/calc] Brak vocation constant dla ${vocationBase}/${skillType}`,
    );
  }

  // Skill constant A — TibiaWiki Formulae table
  const A = SKILL_CONSTANTS[skillType];
  // Skill offset c — 0 dla magic, 10 dla innych
  const c = skillType === "magic" ? SKILL_OFFSET_MAGIC : SKILL_OFFSET_NON_MAGIC;

  return { b, A, c, vocationBase, skillType };
}

/**
 * Total skill points na danym levelu (TibiaWiki Formulae):
 *   Tp(L) = A × (b^(L−c) − 1) / (b − 1)
 *
 * Exportowane publicznie, bo z tego samego helpera korzysta też
 * `training.ts` (formuła CipSoft jest wspólna dla obu kalkulatorów
 * — arch. §2.1 TibiaPal benchmark).
 *
 * @param L - level (integer ≥ 0)
 * @param A - skill constant
 * @param b - vocation constant (> 1)
 * @param c - skill offset
 * @returns total points jako number
 */
export function totalSkillPointsAt(
  L: number,
  A: number,
  b: number,
  c: number,
): number {
  if (L <= c) return 0;
  const exponent = Math.pow(b, L - c);
  // Tp(L) = A × (exponent − 1) / (b − 1)
  return (A * (exponent - 1)) / (b - 1);
}

/**
 * Skill level dla danej ilości punktów (TibiaWiki Formulae inverse):
 *   Skill = log_b(Tp × (b − 1) / A + 1) + c
 *
 * @param totalPoints - ilość punktów
 * @param A - skill constant
 * @param b - vocation constant
 * @param c - skill offset
 * @returns skill level (float)
 */
function skillFromTotalPoints(
  totalPoints: number,
  A: number,
  b: number,
  c: number,
): number {
  if (totalPoints <= 0) return c;
  const inner = (totalPoints * (b - 1)) / A + 1;
  return Math.log(inner) / Math.log(b) + c;
}

// ──────────────────────────────────────────────────────────────────────────
// exerciseWeapons — główna funkcja (tryb targetSkill / targetWeaponsUsed)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Kalkulator Exercise Weapons — 2 tryby (TibiaPal benchmark).
 *
 * @param options - {@link ExerciseWeaponsOptions}
 * @returns `CalculatorResult<ExerciseWeaponsResult>`
 *
 * @example
 * ```ts
 * // Tryb 1: ile broni dojść z Magic 100 do 110 (Druid, 10% loyalty, double event)
 * exerciseWeapons({
 *   mode: 'targetSkill',
 *   category: 'mageMagic',
 *   currentSkill: 100,
 *   percentToNext: 0,
 *   targetSkill: 110,
 *   loyaltyPct: 10,
 *   doubleEvent: true,
 *   privateDummy: false,
 * });
 *
 * // Tryb 2: ile skillu z 100 Regular Exercise Wands
 * exerciseWeapons({
 *   mode: 'targetWeaponsUsed',
 *   category: 'mageMagic',
 *   weaponType: 'regular',
 *   numWeapons: 100,
 *   currentSkill: 100,
 *   percentToNext: 0,
 *   loyaltyPct: 0,
 *   doubleEvent: false,
 *   privateDummy: false,
 * });
 * ```
 *
 * Source: https://tibia.fandom.com/wiki/Formulae
 *         https://tibia.fandom.com/wiki/Exercise_Weapons
 */
export function exerciseWeapons(
  options: ExerciseWeaponsOptions,
): CalculatorResult<ExerciseWeaponsResult> {
  // ── Walidacja parametrów wspólnych ──
  const loyaltyPct: LoyaltyBonus = options.loyaltyPct;
  if (!isLoyaltyPct(loyaltyPct)) {
    return err(
      validationError(
        "EXERCISE_WEAPONS_INVALID_LOYALTY",
        `loyaltyPct musi być ∈ {0,5,10,...,50}, otrzymano ${loyaltyPct}`,
      ),
    );
  }
  if (!Number.isInteger(options.currentSkill) || options.currentSkill < 0) {
    return err(
      validationError(
        "EXERCISE_WEAPONS_INVALID_CURRENT",
        `currentSkill musi być integerem ≥ 0, otrzymano ${options.currentSkill}`,
      ),
    );
  }
  if (
    !Number.isFinite(options.percentToNext) ||
    options.percentToNext < 0 ||
    options.percentToNext > 100
  ) {
    return err(
      validationError(
        "EXERCISE_WEAPONS_INVALID_PERCENT",
        `percentToNext musi być w [0, 100], otrzymano ${options.percentToNext}`,
      ),
    );
  }

  // ── Parametry formuły (TibiaWiki) ──
  let params: {
    readonly b: number;
    readonly A: number;
    readonly c: number;
    readonly vocationBase: VocationBaseKey;
    readonly skillType: SkillType;
  };
  try {
    params = getFormulaParams(options.category);
  } catch (e) {
    return err(
      validationError(
        "EXERCISE_WEAPONS_INVALID_CATEGORY",
        e instanceof Error ? e.message : String(e),
      ),
    );
  }

  const { b, A, c, skillType } = params;
  // Tabela WEAPON_POINTS_REGULAR zawsze ma wszystkie skillType (frozen)
  const weaponPointsRegular = WEAPON_POINTS_REGULAR[skillType];

  // ── Tryb: targetSkill ──
  if (options.mode === "targetSkill") {
    if (
      options.targetSkill === undefined ||
      !Number.isInteger(options.targetSkill) ||
      options.targetSkill <= 0
    ) {
      return err(
        validationError(
          "EXERCISE_WEAPONS_INVALID_TARGET",
          `targetSkill jest wymagany dla trybu 'targetSkill' i musi być integerem > 0`,
        ),
      );
    }
    if (options.targetSkill <= options.currentSkill) {
      return err(
        validationError(
          "EXERCISE_WEAPONS_TARGET_LOWER",
          `targetSkill (${options.targetSkill}) musi być > currentSkill (${options.currentSkill})`,
        ),
      );
    }

    // Oblicz punkty potrzebne: Tp(target) - (Tp(current) - P(current) × percentToNext/100)
    const currentSkillFloor = Math.floor(options.currentSkill);
    const targetSkillFloor = Math.floor(options.targetSkill);

    // Tp(L+1) = total points at start of level L+1
    // "Current points" = Tp(current+1) - P(current) × percentToNext/100
    // "Target points" = Tp(target+1)
    const totalPointsCurrent = totalSkillPointsAt(
      currentSkillFloor + 1,
      A,
      b,
      c,
    );
    const pointsPerLevel = (A * Math.pow(b, currentSkillFloor - c)); // P(current)
    const pointsRemainingInLevel = pointsPerLevel * (options.percentToNext / 100);
    const effectiveCurrentPoints =
      totalPointsCurrent - pointsRemainingInLevel;

    const totalPointsTarget = totalSkillPointsAt(
      targetSkillFloor + 1,
      A,
      b,
      c,
    );

    let pointsNeeded = totalPointsTarget - effectiveCurrentPoints;
    if (pointsNeeded < 0) pointsNeeded = 0;

    // Modifiers (TibiaPal)
    if (options.doubleEvent) pointsNeeded /= 2;
    if (options.privateDummy) pointsNeeded /= 1.1;

    // Loyalty multiplier (więcej punktów na broń)
    const loyaltyMul = 1 + loyaltyPct / 100;
    pointsNeeded /= loyaltyMul;

    // Weapons per type
    const regularPoints = weaponPointsRegular * WEAPON_TIER_MULTIPLIER.regular;
    const durablePoints = weaponPointsRegular * WEAPON_TIER_MULTIPLIER.durable;
    const lastingPoints = weaponPointsRegular * WEAPON_TIER_MULTIPLIER.lasting;

    const regularWeapons = Math.max(0, Math.ceil(pointsNeeded / regularPoints));
    const durableWeapons = Math.max(0, Math.ceil(pointsNeeded / durablePoints));
    const lastingWeapons = Math.max(0, Math.ceil(pointsNeeded / lastingPoints));

    // Cost (Regular weapon = 25 TC = 347,222 gp — TibiaWiki verified)
    const totalCostTc = regularWeapons * COST_REGULAR_TC;
    const totalCostGp = regularWeapons * COST_REGULAR_GP;

    // Time (TibiaWiki: charge every 2s)
    // Regular = 16min 40s = 1000s
    // Durable = 1h = 3600s
    // Lasting = 8h = 28800s
    const timeRegular = regularWeapons * 1000;
    const timeDurable = durableWeapons * 3600;
    const timeLasting = lastingWeapons * 28800;

    // Rekomendacja — kupuj za gold jeśli TC > threshold
    const threshold = options.tcPriceThreshold ?? TC_PRICE_THRESHOLD_GP;
    const costPerTcGp = totalCostGp / Math.max(1, totalCostTc);
    let recommendation: ExerciseWeaponsRecommendation;
    if (totalCostTc === 0) {
      recommendation = "equal";
    } else if (costPerTcGp > threshold) {
      recommendation = "buyGold";
    } else if (costPerTcGp < threshold) {
      recommendation = "buyTc";
    } else {
      recommendation = "equal";
    }

    return ok({
      mode: "targetSkill",
      weaponsNeeded: {
        regular: regularWeapons,
        durable: durableWeapons,
        lasting: lastingWeapons,
      },
      totalCostGp,
      totalCostTc,
      recommendation,
      timeSeconds: {
        regular: timeRegular,
        durable: timeDurable,
        lasting: timeLasting,
      },
    });
  }

  // ── Tryb: targetWeaponsUsed ──
  if (options.mode === "targetWeaponsUsed") {
    if (
      options.numWeapons === undefined ||
      !Number.isInteger(options.numWeapons) ||
      options.numWeapons < 0
    ) {
      return err(
        validationError(
          "EXERCISE_WEAPONS_INVALID_NUM",
          `numWeapons jest wymagany dla trybu 'targetWeaponsUsed' i musi być integerem ≥ 0`,
        ),
      );
    }
    if (options.weaponType === undefined) {
      return err(
        validationError(
          "EXERCISE_WEAPONS_INVALID_TYPE",
          `weaponType jest wymagany dla trybu 'targetWeaponsUsed'`,
        ),
      );
    }

    const weaponPoints =
      weaponPointsRegular * WEAPON_TIER_MULTIPLIER[options.weaponType];

    // Total points gained z N broni (z loyalty i modifierami)
    let totalPointsGained =
      options.numWeapons * weaponPoints * (1 + loyaltyPct / 100);
    if (options.doubleEvent) totalPointsGained *= 2;
    if (options.privateDummy) totalPointsGained *= 1.1;

    // Current skill floor + percentToNext
    const currentSkillFloor = Math.floor(options.currentSkill);
    const totalPointsCurrent = totalSkillPointsAt(
      currentSkillFloor + 1,
      A,
      b,
      c,
    );
    const pointsPerLevel = A * Math.pow(b, currentSkillFloor - c);
    const pointsRemainingInLevel =
      pointsPerLevel * (options.percentToNext / 100);
    const effectiveCurrentPoints =
      totalPointsCurrent - pointsRemainingInLevel;

    const newTotalPoints = effectiveCurrentPoints + totalPointsGained;
    const newSkillLevel = skillFromTotalPoints(newTotalPoints, A, b, c);
    const skillGained = newSkillLevel - options.currentSkill;

    // Cost
    const totalCostGp = options.numWeapons * COST_REGULAR_GP;
    const totalCostTc = options.numWeapons * COST_REGULAR_TC;

    // Time per type
    const timeRegular = options.numWeapons * 1000;
    const timeDurable = options.numWeapons * 3600;
    const timeLasting = options.numWeapons * 28800;

    const threshold = options.tcPriceThreshold ?? TC_PRICE_THRESHOLD_GP;
    const costPerTcGp = totalCostGp / Math.max(1, totalCostTc);
    let recommendation: ExerciseWeaponsRecommendation;
    if (totalCostTc === 0) {
      recommendation = "equal";
    } else if (costPerTcGp > threshold) {
      recommendation = "buyGold";
    } else if (costPerTcGp < threshold) {
      recommendation = "buyTc";
    } else {
      recommendation = "equal";
    }

    return ok({
      mode: "targetWeaponsUsed",
      weaponsNeeded: {
        regular:
          options.weaponType === "regular" ? options.numWeapons : 0,
        durable:
          options.weaponType === "durable" ? options.numWeapons : 0,
        lasting:
          options.weaponType === "lasting" ? options.numWeapons : 0,
      },
      totalCostGp,
      totalCostTc,
      recommendation,
      timeSeconds: {
        regular: timeRegular,
        durable: timeDurable,
        lasting: timeLasting,
      },
      newSkillLevel,
      skillGained,
    });
  }

  // Nieznany tryb
  return err(
    validationError(
      "EXERCISE_WEAPONS_INVALID_MODE",
      `mode musi być 'targetSkill' lub 'targetWeaponsUsed', otrzymano ${options.mode}`,
    ),
  );
}

/** Type guard dla LoyaltyBonus (compile-time + runtime). */
function isLoyaltyPct(pct: number): pct is LoyaltyBonus {
  return (
    pct === 0 ||
    pct === 5 ||
    pct === 10 ||
    pct === 15 ||
    pct === 20 ||
    pct === 25 ||
    pct === 30 ||
    pct === 35 ||
    pct === 40 ||
    pct === 45 ||
    pct === 50
  );
}
