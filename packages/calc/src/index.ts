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
 * Zasady (task 14):
 *   - Każda kalkulacja: `(snapshot: CharacterSnapshot, options?) => Result`
 *   - Helpers utils w `src/utils/*` testowalne osobno (Vitest)
 *   - Kalkulatory właściwe pojawią się w T15-23
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
  safeXpForLevel,
} from "./utils/xp-table.js";

// ──────────────────────────────────────────────────────────────────────────
// Utils — time-format (rozkład sekund na h/m/s)
// ──────────────────────────────────────────────────────────────────────────

export type { DurationParts } from "./utils/time-format.js";
export { formatDuration, formatDurationString } from "./utils/time-format.js";
