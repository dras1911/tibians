/**
 * @tibians/calc — wspólne typy dla czystych funkcji kalkulacyjnych.
 *
 * Wszystkie kalkulatory zwracają `CalculatorResult<T>` — discriminated union
 * `{ ok: true; value: T } | { ok: false; error: ValidationError }`.
 * To wzorzec Result/Either bez zewnętrznych zależności (zero `neverthrow`,
 * `oxide.ts` itp.) — kompozycja przez `if (!result.ok) return result`.
 *
 * Konwencje (arch. §13.1, §2.1):
 *   - Każdy kalkulator przyjmuje `CharacterSnapshot` (peer @tibians/character-context).
 *   - `LoyaltyBonus` to procentowy bonus lojalności — Tibia używa go jako
 *     `displayed = base × (1 + loyaltyBonus/100)`.
 *   - `VocationSkillCategory` to 8 par vocation/skill z §2.1 (TibiaPal).
 *   - `ExerciseWeaponType` to 3 klasy broni treningowych z §2.1.
 *   - `VocationSkillPair` łączy kategorię + `SkillKey` ze `snapshot.skills`.
 */

import type {
  CharacterSnapshot,
  SkillKey,
  VocationPromoted,
} from "@tibians/character-context";

// ──────────────────────────────────────────────────────────────────────────
// LoyaltyBonus — procent bonusu lojalności (arch. §2.2 / §13.1)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Procentowy bonus lojalności dodawany do bazowego skilla w grze.
 * Tibia daje 5% co 360 punktów loyalty (max 50% przy 3600 pkt).
 *
 * Zakres (0..50 co 5) — identyczny z `CharacterLoyaltyPct` z
 * `@tibians/character-context`. Tutaj zdefiniowany lokalnie, żeby
 * `packages/calc` nie zależał od konkretnego Zod schema konsumenta.
 */
export type LoyaltyBonus =
  | 0
  | 5
  | 10
  | 15
  | 20
  | 25
  | 30
  | 35
  | 40
  | 45
  | 50;

// ──────────────────────────────────────────────────────────────────────────
// ExerciseWeaponType — typy broni treningowych (arch. §2.1)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Trzy klasy broni do ćwiczenia skilla (TibiaPal benchmark §2.1):
 *   - `lasting`  — broń lastingowa (precyzyjna, ale droga)
 *   - `durable`  — broń durable (pośrednia — zależna od charges)
 *   - `regular`  — broń regular (najtańsza, „zużywa się" — przybliżona)
 *
 * Tylko `regular` daje precyzyjny wynik (TibiaWiki §2.2) — kalkulatory
 * powinny oznaczać inne typy jako „szacunkowe".
 */
export type ExerciseWeaponType = "lasting" | "durable" | "regular";

// ──────────────────────────────────────────────────────────────────────────
// VocationSkillCategory — 8 par vocation/skill (arch. §2.1)
// ──────────────────────────────────────────────────────────────────────────

/**
 * 8 par vocation/skill z architektury §2.1 (TibiaPal benchmark):
 *
 *   1. `knightMelee`      — Knight       → sword   (główny skill melee)
 *   2. `knightShielding`  — Knight       → shielding
 *   3. `knightMagic`      — Knight       → magic
 *   4. `paladinMagic`     — Paladin      → magic
 *   5. `paladinDistance`  — Paladin      → distance
 *   6. `mageMagic`        — Druid/Sorcerer → magic
 *   7. `monkMagic`        — Monk         → magic
 *   8. `monkFist`         — Monk         → fist
 *
 * Uwaga: Tibia ma osobne skille `sword`, `axe`, `club`, ale w kontekście
 * par vocation/skill traktujemy je łącznie jako „melee". Domyślnym
 * melee dla Knighta jest `sword` (najpopularniejsza broń 2H).
 */
export const VOCATION_SKILL_CATEGORIES = [
  "knightMelee",
  "knightShielding",
  "knightMagic",
  "paladinMagic",
  "paladinDistance",
  "mageMagic",
  "monkMagic",
  "monkFist",
] as const;

export type VocationSkillCategory = (typeof VOCATION_SKILL_CATEGORIES)[number];

/**
 * Para vocation/skill — reifikacja kategorii z konkretnym `SkillKey`.
 * Używana przez `getRelevantSkill` (utils) do wyciągania wartości
 * z `snapshot.skills[pair.skillKey].base`.
 */
export interface VocationSkillPair {
  /** Kategoria z 8 par arch. §2.1 (TibiaPal). */
  readonly category: VocationSkillCategory;
  /** Promowana klasa postaci, do której należy ta para. */
  readonly vocation: VocationPromoted;
  /** Klucz w `snapshot.skills`, pod którym jest bazowy skill tej pary. */
  readonly skillKey: SkillKey;
}

// ──────────────────────────────────────────────────────────────────────────
// ValidationError + CalculatorResult<T>
// ──────────────────────────────────────────────────────────────────────────

/**
 * Błąd walidacji wejścia kalkulatora. Zawsze ma:
 *   - `code` — stabilny identyfikator (do i18n, telemetry)
 *   - `message` — domyślny komunikat po polsku (UI może nadpisać)
 *
 * Konstruktor walidatora powinien używać kodów z `ErrorCode` (jeśli dostępny)
 * lub własnych stringów opisujących dziedzinę.
 */
export interface ValidationError {
  readonly code: string;
  readonly message: string;
}

/**
 * Dyskryminowany union wyniku kalkulatora.
 *
 *   - `ok: true`  → sukces; `value` zawiera obliczoną wartość
 *   - `ok: false` → błąd walidacji; `error` opisuje przyczynę
 *
 * Konsumpcja (arch. §13.1):
 * ```ts
 * const result = exerciseWeaponsOnSnapshot(snapshot, options);
 * if (!result.ok) return { error: result.error };
 * const { time, cost } = result.value;
 * ```
 */
export type CalculatorResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ValidationError };

// ──────────────────────────────────────────────────────────────────────────
// Helpers — tworzenie ValidationError + CalculatorResult
// ──────────────────────────────────────────────────────────────────────────

/** Konstruuje błąd walidacji z podanym kodem + komunikatem. */
export function validationError(
  code: string,
  message: string,
): ValidationError {
  return { code, message };
}

/** Konstruuje sukces kalkulatora. */
export function ok<T>(value: T): CalculatorResult<T> {
  return { ok: true, value };
}

/** Konstruuje błąd kalkulatora. */
export function err<T = never>(error: ValidationError): CalculatorResult<T> {
  return { ok: false, error };
}

// ──────────────────────────────────────────────────────────────────────────
// Re-eksporty dla wygody konsumentów
// ──────────────────────────────────────────────────────────────────────────

/** Główny kontrakt konsumowany przez kalkulatory (arch. §13.1). */
export type { CharacterSnapshot };
/** 8 kluczy skilli z `snapshot.skills`. */
export type { SkillKey };
/** 5 promowanych klas postaci. */
export type { VocationPromoted };
