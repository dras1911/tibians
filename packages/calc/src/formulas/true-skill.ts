/**
 * true-skill — odwrotność bonusu lojalności (arch. §2.2).
 *
 * ── POPRAWIONA FORMUŁA (2026-09-16) ──────────────────────────────────
 *
 * POPRZEDNIO (BŁĄD): `base = displayed / (1 + loyaltyPct / 100)`.
 * Traktowało bonus jako procent POZIOMU skilla. Efekt: Knight ze Sword 123
 * i 40% lojalności dawał wynik 90,71 zamiast 123.
 *
 * JAK JEST NAPRAWDĘ (TibiaWiki, Loyalty_System):
 *   „This bonus [...] **modifies the underlying skill point value** rather
 *    than the displayed skill level."
 *   „A paladin with a base distance skill of 100 will **not gain 25 additional
 *    skill levels** (25% of 100), but rather **3-4 skill levels**."
 *
 * Bonus mnoży PUNKTY skilla, a te rosną wykładniczo (TibiaWiki, Formulae §Skills):
 *
 *   Tp(skill) = A · (b^(skill − c) − 1) / (b − 1)
 *
 * gdzie:
 *   A — stała skilla (Magic 1600, Melee 50, Distance 30, Shielding 100, Fishing 20)
 *   b — stała profesji (Knight melee 1.1, Paladin distance 1.1, Mage magic 1.1, …)
 *   c — offset (0 dla Magic Level, 10 dla pozostałych)
 *
 * Odwrócenie z bonusem `(1 + bonus)`:
 *
 *   Tp_base = Tp_displayed / (1 + bonus)
 *   base    = log_b( Tp_base · (b − 1) / A + 1 ) + c
 *
 * Po podstawieniu Tp_displayed **A oraz (b − 1) się skracają**, więc wynik
 * zależy WYŁĄCZNIE od `b` i `c` — nie trzeba znać stałej skilla:
 *
 *   base = log_b( (b^(displayed − c) − 1) / (1 + bonus) + 1 ) + c
 *
 * ── WERYFIKACJA (realne dane użytkownika) ────────────────────────────
 *   Knight, Sword, displayed = 127, lojalność 40% (bonus 1.4):
 *     b = 1.1, c = 10
 *     = log_1.1( (1.1^117 − 1) / 1.4 + 1 ) + 10
 *     = log_1.1( 69 750 / 1.4 + 1 ) + 10
 *     = 113,48 + 10
 *     = 123,48  →  123   ✅ (zgadza się z bazowym skillem postaci)
 *
 * ── PROGI LOJALNOŚCI (TibiaWiki) ─────────────────────────────────────
 *   Punkty   Bonus
 *   360      5%      ← 1 punkt = 1 dzień premium
 *   3600     50%     (maksimum, ~9,86 lat premium)
 *   Progi co 360 punktów = +5%. Wartości z dropdownu (0,5,…,50) to
 *   BEZPOŚREDNIO procenty bonusu.
 *
 * **Czysta funkcja**: deterministyczna, brak I/O, brak `Date.now()`.
 *
 * Source: https://tibia.fandom.com/wiki/Loyalty_System
 *         https://tibia.fandom.com/wiki/Formulae  (§Skills)
 */

import {
  err,
  ok,
  validationError,
  type CalculatorResult,
  type LoyaltyBonus,
} from "../types.js";

// ──────────────────────────────────────────────────────────────────────
// Dopuszczalne wartości loyaltyPct (arch. §2.2 / §13.1)
// ──────────────────────────────────────────────────────────────────────

const VALID_LOYALTY_PCTS: readonly LoyaltyBonus[] = Object.freeze([
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
] as const);

function isValidLoyaltyPct(pct: number): pct is LoyaltyBonus {
  return (VALID_LOYALTY_PCTS as readonly number[]).includes(pct);
}

// ──────────────────────────────────────────────────────────────────────
// Stałe profesji (b) — TibiaWiki Formulae §Skills
// ──────────────────────────────────────────────────────────────────────

/** Skille obsługiwane przez kalkulator. */
export const TRUE_SKILL_SKILLS = [
  "sword",
  "axe",
  "club",
  "fist",
  "distance",
  "shielding",
  "magic",
  "fishing",
] as const;
export type TrueSkillSkill = (typeof TRUE_SKILL_SKILLS)[number];

/** Profesje obsługiwane przez kalkulator (`none` = brak promocji / Rookgaard). */
export const TRUE_SKILL_VOCATIONS = [
  "knight",
  "paladin",
  "sorcerer",
  "druid",
  "monk",
  "none",
] as const;
export type TrueSkillVocation = (typeof TRUE_SKILL_VOCATIONS)[number];

/**
 * Stałe profesji `b` (TibiaWiki Formulae, tabela „Vocation Constants").
 *
 * Im wyższa stała, tym więcej punktów potrzeba na kolejny poziom — czyli tym
 * WOLNIEJ skill rośnie. Knight ma 1.1 w melee (najszybciej), a 3.0 w magic
 * (najwolniej). To dlatego ta sama wartość bazowa daje różne „displayed"
 * w zależności od profesji i skilla.
 *
 * UWAGA: kolumna „Axe/Club/Sword" w Wiki jest wspólna dla całego melee —
 * wszystkie trzy bronie mają identyczną stałą per profesja.
 */
const VOCATION_CONSTANTS: Readonly<
  Record<TrueSkillVocation, Readonly<Record<TrueSkillSkill, number>>>
> = Object.freeze({
  knight: Object.freeze({
    sword: 1.1,
    axe: 1.1,
    club: 1.1,
    fist: 1.1,
    distance: 1.4,
    shielding: 1.1,
    magic: 3.0,
    fishing: 1.1,
  }),
  paladin: Object.freeze({
    sword: 1.2,
    axe: 1.2,
    club: 1.2,
    fist: 1.2,
    distance: 1.1,
    shielding: 1.1,
    magic: 1.4,
    fishing: 1.1,
  }),
  sorcerer: Object.freeze({
    sword: 2.0,
    axe: 2.0,
    club: 2.0,
    fist: 1.5,
    distance: 2.0,
    shielding: 1.5,
    magic: 1.1,
    fishing: 1.1,
  }),
  druid: Object.freeze({
    sword: 1.8,
    axe: 1.8,
    club: 1.8,
    fist: 1.5,
    distance: 1.8,
    shielding: 1.5,
    magic: 1.1,
    fishing: 1.1,
  }),
  monk: Object.freeze({
    sword: 1.4,
    axe: 1.4,
    club: 1.4,
    fist: 1.1,
    distance: 1.5,
    shielding: 1.15,
    magic: 1.25,
    fishing: 1.1,
  }),
  none: Object.freeze({
    sword: 2.0,
    axe: 2.0,
    club: 2.0,
    fist: 1.5,
    distance: 2.0,
    shielding: 1.5,
    magic: 3.0,
    fishing: 1.1,
  }),
});

/**
 * Offset `c` (TibiaWiki): 0 dla Magic Level, 10 dla wszystkich pozostałych.
 * Wynika z tego, że postać zaczyna grę z Magic Level 0, a pozostałe skille
 * od 10.
 */
function skillOffset(skill: TrueSkillSkill): number {
  return skill === "magic" ? 0 : 10;
}

/** Stała profesji `b` dla pary (profesja, skill). */
export function vocationConstant(
  vocation: TrueSkillVocation,
  skill: TrueSkillSkill,
): number {
  return VOCATION_CONSTANTS[vocation][skill];
}

// ──────────────────────────────────────────────────────────────────────
// trueSkill(displayedSkill, loyaltyPct, skill, vocation) → CalculatorResult<number>
// ──────────────────────────────────────────────────────────────────────

/**
 * Odwraca bonus lojalności: zamienia wyświetlany skill (z gry) na bazowy
 * skill (z Bazaar / highscores).
 *
 *   base = log_b( (b^(displayed − c) − 1) / (1 + loyaltyPct/100) + 1 ) + c
 *
 * @param displayedSkill - skill widoczny w grze (integer ≥ 0)
 * @param loyaltyPct - procent bonusu lojalności ∈ {0,5,10,…,50}
 * @param skill - który skill (decyduje o stałej `b` i offsecie `c`).
 *                 Domyślnie `sword` — najczęstszy przypadek w Bazaar.
 * @param vocation - profesja postaci (decyduje o stałej `b`).
 *                    Domyślnie `knight`.
 * @returns `CalculatorResult<number>`:
 *   - `{ ok: true, value: baseSkill }` — sukces
 *   - `{ ok: false, error: ... }` — błąd walidacji:
 *     - `displayedSkill` nie jest integerem / < 0 → `TRUE_SKILL_INVALID_INPUT`
 *     - `loyaltyPct` nie ∈ {0,5,…,50} → `TRUE_SKILL_INVALID_LOYALTY`
 *
 * @example
 * ```ts
 * // Knight, Sword 127 w grze, 40% lojalności → baza 123 (realne dane)
 * trueSkill(127, 40, "sword", "knight");  // → ~123.5
 *
 * // Brak lojalności → wynik = displayed (żadnej transformacji)
 * trueSkill(100, 0);                       // → 100
 * ```
 *
 * **Zaokrąglenie**: Tibia wyświetla skille jako integery, więc dla
 * `loyaltyPct > 0` wynik jest ułamkowy. UI powinien pokazać 2 miejsca po
 * przecinku, żeby zachować precyzję.
 */
export function trueSkill(
  displayedSkill: number,
  loyaltyPct: number,
  skill: TrueSkillSkill = "sword",
  vocation: TrueSkillVocation = "knight",
): CalculatorResult<number> {
  // Walidacja displayedSkill
  if (!Number.isFinite(displayedSkill)) {
    return err(
      validationError(
        "TRUE_SKILL_INVALID_INPUT",
        `displayedSkill musi być liczbą skończoną, otrzymano ${displayedSkill}`,
      ),
    );
  }
  if (!Number.isInteger(displayedSkill)) {
    return err(
      validationError(
        "TRUE_SKILL_INVALID_INPUT",
        `displayedSkill musi być integerem, otrzymano ${displayedSkill}`,
      ),
    );
  }
  if (displayedSkill < 0) {
    return err(
      validationError(
        "TRUE_SKILL_INVALID_INPUT",
        `displayedSkill nie może być ujemny, otrzymano ${displayedSkill}`,
      ),
    );
  }

  // Walidacja loyaltyPct — musi być ∈ {0,5,10,…,50}
  if (!isValidLoyaltyPct(loyaltyPct)) {
    return err(
      validationError(
        "TRUE_SKILL_INVALID_LOYALTY",
        `loyaltyPct musi być ∈ {0,5,10,...,50}, otrzymano ${loyaltyPct}`,
      ),
    );
  }

  // Brak lojalności → brak transformacji (bonus = 1.0 daje ten sam wynik,
  // ale zwracamy wprost, żeby uniknąć błędów zmiennoprzecinkowych).
  if (loyaltyPct === 0) {
    return ok(displayedSkill);
  }

  const b = VOCATION_CONSTANTS[vocation][skill];
  const c = skillOffset(skill);
  const bonusMultiplier = 1 + loyaltyPct / 100;

  /**
   * `b^(displayed − c)` — punkty skilla w skali „jednostek A".
   * Przy dużych skillach (200+) wartość jest ogromna (1.1^200 ≈ 1.9e8),
   * ale mieści się w `Number` z dużym zapasem (max skill w Tibii to 250 →
   * 1.1^240 ≈ 8.6e9). Bez BigInt, bez utraty precyzji na poziomie 0.01.
   */
  const pointsAtDisplayed = Math.pow(b, displayedSkill - c);

  // Tp_base = Tp_displayed / (1 + bonus), a A oraz (b−1) się skracają.
  const pointsFactor = (pointsAtDisplayed - 1) / bonusMultiplier + 1;

  // base = log_b(pointsFactor) + c
  const baseSkill = Math.log(pointsFactor) / Math.log(b) + c;

  return ok(baseSkill);
}

// ──────────────────────────────────────────────────────────────────────
// Pomocnicze: skill wyświetlany (odwrotność) — do podglądu „co zobaczę w grze"
// ──────────────────────────────────────────────────────────────────────

/**
 * Kierunek odwrotny: jaki skill ZOBACZYSZ w grze mając daną bazę.
 *
 *   displayed = log_b( (b^(base − c) − 1) · (1 + bonus) + 1 ) + c
 *
 * Używane przez UI do pokazania „Bazaar pokaże 123, w grze zobaczysz 127".
 */
export function displayedSkill(
  baseSkill: number,
  loyaltyPct: number,
  skill: TrueSkillSkill = "sword",
  vocation: TrueSkillVocation = "knight",
): CalculatorResult<number> {
  if (!Number.isFinite(baseSkill) || !Number.isInteger(baseSkill)) {
    return err(
      validationError(
        "TRUE_SKILL_INVALID_INPUT",
        `baseSkill musi być integerem, otrzymano ${baseSkill}`,
      ),
    );
  }
  if (!isValidLoyaltyPct(loyaltyPct)) {
    return err(
      validationError(
        "TRUE_SKILL_INVALID_LOYALTY",
        `loyaltyPct musi być ∈ {0,5,10,...,50}, otrzymano ${loyaltyPct}`,
      ),
    );
  }
  if (loyaltyPct === 0) {
    return ok(baseSkill);
  }

  const b = VOCATION_CONSTANTS[vocation][skill];
  const c = skillOffset(skill);
  const bonusMultiplier = 1 + loyaltyPct / 100;

  const pointsAtBase = Math.pow(b, baseSkill - c);
  const pointsFactor = (pointsAtBase - 1) * bonusMultiplier + 1;
  const displayed = Math.log(pointsFactor) / Math.log(b) + c;

  return ok(displayed);
}
