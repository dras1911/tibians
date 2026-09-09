/**
 * @tibians/calc — public API.
 *
 * Czyste funkcje kalkulacyjne nad `CharacterSnapshot` (arch. §13.1).
 * Zero React, zero I/O, zero `Date.now()`/`Math.random()` — wszystkie
 * funkcje deterministyczne, testowalne w izolacji.
 *
 * Konsumenci (arch. §8.4):
 *   - apps/web — 14 kalkulatorów (Exercise Weapons, Training, True Skill,
 *     Experience, Leech, Exp Share, Imbuement, Blessings, Weekly Tasks,
 *     Charms, Character Value, Charm Planner, Wheel Planner, Stamina)
 *   - packages/ui — komponenty wyświetlające wyniki (liczby + rekomendacja)
 *
 * Zasady (task 14-15):
 *   - Każda kalkulacja: `(snapshot: CharacterSnapshot, options?) => Result`
 *   - Helpers utils w `src/utils/*` testowalne osobno (Vitest)
 *   - Kalkulatory w `src/formulas/*` weryfikowane przeciw TibiaWiki
 */

// ──────────────────────────────────────────────────────────────────────────
// Typy publiczne
// ──────────────────────────────────────────────────────────────────────────

export type {
  // Wynik kalkulatora (discriminated union)
  CalculatorResult,
  ValidationError,
  // Pary vocation/skill (arch. §2.1)
  VocationSkillPair,
  VocationSkillCategory,
  // Typy domenowe kalkulatorów
  ExerciseWeaponType,
  LoyaltyBonus,
  // Re-eksporty dla wygody konsumentów
  CharacterSnapshot,
  SkillKey,
  VocationPromoted,
} from "./types.js";

// ──────────────────────────────────────────────────────────────────────────
// Stałe domenowe
// ──────────────────────────────────────────────────────────────────────────

export {
  VOCATION_SKILL_CATEGORIES,
  validationError,
  ok,
  err,
} from "./types.js";

// ──────────────────────────────────────────────────────────────────────────
// Utils — getRelevantSkill (arch. §2.1, 8 par vocation/skill)
// ──────────────────────────────────────────────────────────────────────────

export {
  VOCATION_SKILL_PAIRS,
  PRIMARY_SKILL_PER_VOCATION,
  getRelevantSkill,
  getRelevantSkills,
  getPrimarySkill,
} from "./utils/get-relevant-skill.js";

// ──────────────────────────────────────────────────────────────────────────
// Utils — getCurrentSkill (helper do wyciągania bazowego skilla)
// ──────────────────────────────────────────────────────────────────────────

export { getCurrentSkill } from "./utils/get-current-skill.js";

// ──────────────────────────────────────────────────────────────────────────
// Utils — xp-table (Tibia Experience Table, TibiaWiki ground truth)
// ──────────────────────────────────────────────────────────────────────────

export {
  MAX_LEVEL,
  xpForLevel,
  levelForXp,
  xpToTarget,
  safeXpForLevel,
  safeXpToTarget,
} from "./utils/xp-table.js";

// ──────────────────────────────────────────────────────────────────────────
// Utils — time-format (rozkład sekund na h/m/s)
// ──────────────────────────────────────────────────────────────────────────

export type { DurationParts } from "./utils/time-format.js";
export { formatDuration, formatDurationString } from "./utils/time-format.js";

// ──────────────────────────────────────────────────────────────────────────
// Formulas — Exercise Weapons (T15, arch. §2.1, TibiaPal benchmark)
// ──────────────────────────────────────────────────────────────────────────

export {
  // Stałe domenowe (TibiaWiki/TibiaPal ground truth)
  SKILL_CONSTANTS,
  TC_PRICE_THRESHOLD_GP,
  // Typy
  type ExerciseWeaponsMode,
  type ExerciseWeaponsRecommendation,
  type ExerciseWeaponsOptions,
  type ExerciseWeaponsResult,
  // Główna funkcja
  exerciseWeapons,
  // Helpery współdzielone z training.ts
  totalSkillPointsAt,
  getFormulaParams,
} from "./formulas/exercise-weapons.js";

// ──────────────────────────────────────────────────────────────────────────
// Formulas — Training (T15, arch. §2.1)
// ──────────────────────────────────────────────────────────────────────────

export {
  type TrainingOptions,
  type TrainingResult,
  trainingTime,
} from "./formulas/training.js";

// ──────────────────────────────────────────────────────────────────────────
// Formulas — True Skill (T15, arch. §2.2)
// ──────────────────────────────────────────────────────────────────────────

export { trueSkill } from "./formulas/true-skill.js";

// ──────────────────────────────────────────────────────────────────────────
// Formulas — Stamina (T18, arch. §2.1, TibiaWiki Stamina)
// ──────────────────────────────────────────────────────────────────────────

export {
  staminaRegen,
  type StaminaConfig,
  type StaminaResult,
  type StaminaSegment,
  type StaminaZone,
} from "./formulas/stamina.js";

// ──────────────────────────────────────────────────────────────────────────
// Formulas — Experience (T15, TibiaWiki Experience_Table)
// ──────────────────────────────────────────────────────────────────────────

export {
  xpToTarget as xpToTargetFn,
  timeToTarget,
  timeToTargetFromXp,
} from "./formulas/experience.js";

// ──────────────────────────────────────────────────────────────────────────
// Formulas — Leech (T15, CipSoft legal level range + community convention)
// ──────────────────────────────────────────────────────────────────────────

export {
  LEECH_BASE_SHARE_PCT,
  LEECH_LEVEL_RATIO_MAX,
  LEECH_MIN_SHARE_PCT,
  LEECH_REDUCTION_PER_LEVEL_DEFAULT,
  MIN_LEVEL as LEECH_MIN_LEVEL,
  type LeechOptions,
  type LeechResult,
  type LeechVocation,
  leechPercent,
} from "./formulas/leech.js";

// ──────────────────────────────────────────────────────────────────────────
// Formulas — Exp Share (T15, CipSoft vocation bonus + TibiaWiki Party)
// ──────────────────────────────────────────────────────────────────────────

export {
  PARTY_LEVEL_RATIO_MAX,
  PARTY_VOCATION_BONUS,
  MIN_LEVEL as EXP_SHARE_MIN_LEVEL,
  type PartyMember,
  type PartyMemberSplit,
  type PartyVocation,
  type ExpShareResult,
  expShareSplit,
} from "./formulas/exp-share.js";

// ──────────────────────────────────────────────────────────────────────────
// Formulas — Weekly Tasks (T21, TibiaWiki BR Weekly_Tasks ground truth)
// ──────────────────────────────────────────────────────────────────────────

export {
  MIN_LEVEL as WEEKLY_TASK_MIN_LEVEL_BOUND,
  MAX_LEVEL as WEEKLY_TASK_MAX_LEVEL,
  WEEKLY_TASK_XP_PER_LEVEL,
  WEEKLY_TASK_XP_CAP,
  WEEKLY_TASK_DIFFICULTIES,
  WEEKLY_TASK_TYPES,
  WEEKLY_TASK_MIN_LEVEL,
  type WeeklyTaskDifficulty,
  type WeeklyTaskType,
  type WeeklyTaskResult,
  weeklyTaskReward,
} from "./formulas/weekly-tasks.js";

// ──────────────────────────────────────────────────────────────────────────
// Formulas — Charms (T21, TibiaPal benchmark + TibiaWiki Major_Charms)
// ──────────────────────────────────────────────────────────────────────────

export {
  CHARM_IDS,
  CHARM_ELEMENTS,
  CHARM_VOCATIONS,
  CHARM_SKILLS,
  MONSTER_SENSITIVITIES,
  CHARM_BASE_PERCENT,
  CHARM_ELEMENT_MAP,
  SENSITIVITY_MULTIPLIER,
  VOCATION_CHARM_MOD,
  SKILL_CHARM_MOD,
  SENSITIVITY_LABEL_KEY,
  type CharmId,
  type CharmElement,
  type CharmVocation,
  type CharmSkill,
  type MonsterSensitivity,
  type CharmDamageResult,
  charmDamage,
} from "./formulas/charms.js";

// ──────────────────────────────────────────────────────────────────────────
// Formulas — Imbuement (T20, TibiaWiki Imbuing, basic/intricate/powerful)
// ──────────────────────────────────────────────────────────────────────────

export {
  imbuementCost,
  type ImbuementConfig,
  type ImbuementResult,
  type ImbuementTier,
} from "./formulas/imbuement.js";

// ──────────────────────────────────────────────────────────────────────────
// Formulas — Blessings (T20, TibiaWiki Blessings, R(L) piece-wise)
// ──────────────────────────────────────────────────────────────────────────

export {
  blessingCost,
  costPerBlessing,
  isBlessingsConfigConsistent,
  MAX_BLESSINGS,
  MAX_BLESSING_LEVEL,
  MIN_BLESSING_LEVEL,
  type BlessingsConfig,
  type BlessingsResult,
} from "./formulas/blessings.js";
