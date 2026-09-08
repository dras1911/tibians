/**
 * training — czas + koszt treningu bronią (task 15, arch. §2.1 / §2.2).
 *
 * Rozdziela **Training** od Exercise Weapons (TibiaWiki Skills_Calculator):
 *
 *   "For a precise calculation of the time and cost to get a certain skill,
 *    select the *Regular* weapon type. When selecting the other types the
 *    time and cost will be calculated assuming total usage of the weapons,
 *    which may be far superior to the time/cost required to get a certain skill."
 *                                                              — TibiaWiki Skills_Calculator
 *
 * Implementacja: trening offline / online na dummym.
 * Wzór (TibiaWiki Formulae):
 *   P(L) = A × b^(L − c)       (points/hits to next level)
 *   Tp(L) = A × (b^(L−c) − 1) / (b − 1)   (total points at level)
 *
 * **Wzór czasu treningu**:
 *   - Dla melee (sword/axe/club/fist): 1 hit per ~1 sek (typowy czas ataku)
 *   - Dla distance (bow): 1 hit per ~1.5 sek (charging time)
 *   - Dla magic (wand): 1 hit per ~1.5 sek
 *   - Dla shielding: 1 block per ~1 sek
 *   - Dla fishing: 1 attempt per ~3 sek
 *
 * **Uwaga**: TibiaWiki nie podaje dokładnego "time per hit" — podane wartości
 * to typowe średnie z community. Dokumentujemy jako **przyjęte założenie**.
 *
 * **Koszt**: trening nie wymaga kupowania broni — gracz używa własnej
 * broni. Jedynym kosztem jest regeneracja staminy, którą pomijamy w tym
 * kalkulatorze (Faza 2 — T18). Dla treningu **online** koszt = 0 gp,
 * dla treningu **offline** = 0 gp (ale zużywa stamina).
 *
 * **Czysta funkcja**: deterministyczna, brak I/O, brak `Date.now()`.
 *
 * Source: https://tibia.fandom.com/wiki/Skills_Calculator  (sekcja "Training")
 *         https://tibia.fandom.com/wiki/Formulae
 */

import {
  err,
  ok,
  validationError,
  type CalculatorResult,
  type ExerciseWeaponType,
  type VocationSkillCategory,
} from "../types.js";
import { totalSkillPointsAt, getFormulaParams } from "./exercise-weapons.js";

// ──────────────────────────────────────────────────────────────────────────
// Stałe — przyjęte założenia (TibiaWiki nie podaje explicite)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Średni czas per "point" (hit/block/cast) w sekundach.
 *
 * **Przyjęte założenie** (community-sourced, brak oficjalnych danych TibiaWiki):
 *   - melee: 1.0s/hit (sword/axe/club)
 *   - fist: 1.0s/hit (monk wraps)
 *   - distance: 1.5s/hit (bow charging time)
 *   - magic: 1.5s/cast (cast time)
 *   - shielding: 1.0s/block
 *   - fishing: 3.0s/attempt (fishing cycle)
 */
const SECONDS_PER_POINT: Readonly<Record<string, number>> = Object.freeze({
  magic: 1.5,
  melee: 1.0,
  fist: 1.0,
  distance: 1.5,
  shielding: 1.0,
  fishing: 3.0,
});

/**
 * TC koszt treningu offline (TibiaWiki Training Cost).
 * Training nie zużywa TC bezpośrednio — ale offline training ma
 * "training cost" w złocie (zależy od levelu). Pomijamy (poza zakresem).
 */
const TRAINING_COST_GP_PER_HOUR = 0;

// ──────────────────────────────────────────────────────────────────────────
// Typy wejścia/wyjścia
// ──────────────────────────────────────────────────────────────────────────

export interface TrainingOptions {
  /** Para vocation/skill (arch. §2.1 — 8 par). */
  readonly category: VocationSkillCategory;

  /** Skill obecny (integer ≥ 0). */
  readonly currentSkill: number;

  /** Skill docelowy (integer > currentSkill). */
  readonly targetSkill: number;

  /** % do następnego levelu (0..100). */
  readonly percentToNext: number;

  /**
   * Typ treningu — "regular" symuluje normalny atak z pełną precyzją.
   * Pozostałe typy ("durable", "lasting") to exercise weapons,
   * których użycie jest tu przybliżone (TibiaWiki ostrzega).
   *
   * Domyślnie "regular".
   */
  readonly weaponType?: ExerciseWeaponType;

  /**
   * Czy trening jest offline (zużywa stamina).
   * Domyślnie `false` (= online training, bez utraty staminy).
   */
  readonly offline?: boolean;
}

export interface TrainingResult {
  readonly category: VocationSkillCategory;
  readonly timeSeconds: number;
  readonly timeHours: number;
  readonly costGp: number;
  readonly costTc: number;
  readonly hitsRequired: number;
  /** Czy to przybliżenie (durable/lasting) czy precyzyjne (regular). */
  readonly approximate: boolean;
  /**
   * Ostrzeżenie TibiaWiki: "only Regular weapon gives precise time/cost".
   * Pole `warning` opcjonalnie zwraca tekst po polsku. `string | undefined`
   * jest konieczne dla `exactOptionalPropertyTypes: true` — pozwala jawnie
   * zwrócić `undefined` jako wartość.
   */
  readonly warning?: string | undefined;
}

// ──────────────────────────────────────────────────────────────────────────
// trainingTime — główna funkcja
// ──────────────────────────────────────────────────────────────────────────

/**
 * Kalkulator czasu i kosztu treningu bronią (TibiaWiki Skills_Calculator).
 *
 * @param options - {@link TrainingOptions}
 * @returns `CalculatorResult<TrainingResult>`
 *
 * @example
 * ```ts
 * // Knight Sword 100→110 (regular weapon, online)
 * trainingTime({
 *   category: 'knightMelee',
 *   currentSkill: 100,
 *   targetSkill: 110,
 *   percentToNext: 0,
 *   weaponType: 'regular',
 * });
 *
 * // Druid Magic 200→210 (offline training, bez staminy)
 * trainingTime({
 *   category: 'mageMagic',
 *   currentSkill: 200,
 *   targetSkill: 210,
 *   percentToNext: 50,
 *   offline: true,
 * });
 * ```
 *
 * Source: https://tibia.fandom.com/wiki/Skills_Calculator
 *         https://tibia.fandom.com/wiki/Formulae
 */
export function trainingTime(
  options: TrainingOptions,
): CalculatorResult<TrainingResult> {
  // ── Walidacja ──
  if (
    !Number.isInteger(options.currentSkill) ||
    options.currentSkill < 0
  ) {
    return err(
      validationError(
        "TRAINING_INVALID_CURRENT",
        `currentSkill musi być integerem ≥ 0, otrzymano ${options.currentSkill}`,
      ),
    );
  }
  if (
    options.targetSkill === undefined ||
    !Number.isInteger(options.targetSkill) ||
    options.targetSkill <= 0
  ) {
    return err(
      validationError(
        "TRAINING_INVALID_TARGET",
        `targetSkill jest wymagany i musi być integerem > 0`,
      ),
    );
  }
  if (options.targetSkill <= options.currentSkill) {
    return err(
      validationError(
        "TRAINING_TARGET_LOWER",
        `targetSkill (${options.targetSkill}) musi być > currentSkill (${options.currentSkill})`,
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
        "TRAINING_INVALID_PERCENT",
        `percentToNext musi być w [0, 100], otrzymano ${options.percentToNext}`,
      ),
    );
  }

  // ── Parametry formuły ──
  let params: ReturnType<typeof getFormulaParams>;
  try {
    params = getFormulaParams(options.category);
  } catch (e) {
    return err(
      validationError(
        "TRAINING_INVALID_CATEGORY",
        e instanceof Error ? e.message : String(e),
      ),
    );
  }
  const { b, A, c, skillType } = params;

  // ── Oblicz punkty potrzebne ──
  const currentFloor = Math.floor(options.currentSkill);
  const targetFloor = Math.floor(options.targetSkill);

  const totalPointsCurrent = totalSkillPointsAt(currentFloor + 1, A, b, c);
  const pointsPerLevel = A * Math.pow(b, currentFloor - c);
  const pointsRemainingInLevel =
    pointsPerLevel * (options.percentToNext / 100);
  const effectiveCurrentPoints =
    totalPointsCurrent - pointsRemainingInLevel;

  const totalPointsTarget = totalSkillPointsAt(targetFloor + 1, A, b, c);
  let hitsRequired = totalPointsTarget - effectiveCurrentPoints;
  if (hitsRequired < 0) hitsRequired = 0;

  // ── Czas ──
  const weaponType = options.weaponType ?? "regular";
  const secondsPerPoint = SECONDS_PER_POINT[skillType] ?? 1.5;
  const timeSeconds = Math.ceil(hitsRequired * secondsPerPoint);
  const timeHours = timeSeconds / 3600;

  // ── Koszt ──
  // Training nie kosztuje bezpośrednio — koszt = stamina (offline) lub 0
  // Dla uproszczenia zwracamy 0 gp / 0 TC (T18 doda stamina cost).
  const costGp = Math.ceil(timeHours * TRAINING_COST_GP_PER_HOUR);
  const costTc = 0;

  // ── Approximate flag + warning ──
  const approximate = weaponType !== "regular";
  const warning = approximate
    ? "TibiaWiki: tylko broń 'Regular' daje precyzyjny czas/koszt. " +
      "Inne typy zakładają pełne zużycie broni — mogą przeszacować wynik."
    : undefined;

  return ok({
    category: options.category,
    timeSeconds,
    timeHours,
    costGp,
    costTc,
    hitsRequired: Math.ceil(hitsRequired),
    approximate,
    warning,
  });
}
