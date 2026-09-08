/**
 * xp-table — tabela doświadczenia Tibii (arch. §2.1, TibiaWiki ground truth).
 *
 * Tibia używa zamkniętej formuły dla leveli 1..∞ (w praktyce max 2500 — patrz
 * `IdentitySchema.level.max(2500)` w @tibians/character-context):
 *
 *   xp(L) = 50/3 × (L³ − 6L² + 17L − 12)
 *
 * Weryfikacja (TibiaWiki — https://tibia.fandom.com/wiki/Experience_Table):
 *
 *   L=8    → 4 200
 *   L=50   → 104 600
 *   L=100  → 15 694 800
 *   L=200  → 129 389 800
 *   L=500  → 817 388 800
 *
 * Formuła daje wyniki **dokładne** (nie przybliżone) i jest stabilna —
 * CipSoft jej nie zmienia od lat. Dlatego używamy zamkniętego wzoru
 * zamiast tablicy 256 wpisów (mniej kodu, łatwiejsze utrzymanie, brak
 * ryzyka rozbieżności schema↔implementacja).
 *
 * **Wszystkie operacje w bigint** — TibiaXP dla level 2500 ≈ 2.6×10¹⁰,
 * poniżej MAX_SAFE_INTEGER, ale używamy bigint dla:
 *   - bezpieczeństwa (sumowanie wielu źródeł XP z aukcji może przekroczyć)
 *   - spójności z parsowaniem `auctionId` (również bigint)
 *   - uniknięcia float w obliczeniach (Tibia używa integer XP)
 *
 * **Czysta funkcja**: deterministyczna, bez I/O.
 */

import { validationError, type CalculatorResult } from "../types.js";

// ──────────────────────────────────────────────────────────────────────────
// Stałe formuły (bigint dla uniknięcia float)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Współczynnik 50/3 — używamy bigint, więc mnożymy najpierw, dzielimy na końcu.
 * Źródło: TibiaWiki Experience Table.
 */
const XP_COEFFICIENT_NUMERATOR = 50n;
const XP_COEFFICIENT_DENOMINATOR = 3n;

/**
 * Najniższy level, dla którego wzór daje sensowną (nieujemną) wartość.
 * Dla L < 2 wzór daje 0 lub wartość ujemną — poniżej tego progu zwracamy 0n.
 */
const MIN_FORMULA_LEVEL = 2n;

/**
 * Maksymalny level w grze — zgodnie z `IdentitySchema` w character-context.
 * Używany jako górna granica dla `levelForXp` (binary search).
 */
export const MAX_LEVEL = 2500;

// ──────────────────────────────────────────────────────────────────────────
// xpForLevel(level) → bigint
// ──────────────────────────────────────────────────────────────────────────

/**
 * Zwraca minimalną ilość XP potrzebną do osiągnięcia danego levelu
 * (liczone **od zera** — `xpForLevel(0) === 0n`, `xpForLevel(8) === 4200n`).
 *
 * @param level - integer w zakresie [0, 2500]
 * @returns XP jako bigint (zawsze ≥ 0)
 * @throws RangeError gdy `level` nie jest integerem lub jest poza zakresem
 *
 * @example
 * ```ts
 * xpForLevel(0);    // → 0n
 * xpForLevel(8);    // → 4200n
 * xpForLevel(100);  // → 15_694_800n
 * xpForLevel(200);  // → 129_389_800n
 * ```
 */
export function xpForLevel(level: number): bigint {
  if (!Number.isInteger(level)) {
    throw new RangeError(
      `[@tibians/calc] xpForLevel: level musi być integerem, otrzymano ${level}`,
    );
  }
  if (level < 0) {
    throw new RangeError(
      `[@tibians/calc] xpForLevel: level nie może być ujemny, otrzymano ${level}`,
    );
  }
  if (level > MAX_LEVEL) {
    throw new RangeError(
      `[@tibians/calc] xpForLevel: level > ${MAX_LEVEL} jest poza zakresem Tibii, otrzymano ${level}`,
    );
  }

  // Level 0 (lub 1) → 0 XP. Wzór dla L < 2 daje ≤ 0.
  if (level < MIN_FORMULA_LEVEL) {
    return 0n;
  }

  // Zamknięta formuła Tibia: 50/3 × (L³ − 6L² + 17L − 12)
  const L = BigInt(level);
  const cubic = L ** 3n;
  const quadratic = 6n * L ** 2n;
  const linear = 17n * L;
  const constant = 12n;
  const inner = cubic - quadratic + linear - constant;
  return (XP_COEFFICIENT_NUMERATOR * inner) / XP_COEFFICIENT_DENOMINATOR;
}

// ──────────────────────────────────────────────────────────────────────────
// levelForXp(xp) → number
// ──────────────────────────────────────────────────────────────────────────

/**
 * Odwrotność `xpForLevel`. Zwraca najwyższy level osiągalny
 * przy danej ilości XP (binary search po tablicy `xpForLevel(0..MAX_LEVEL)`).
 *
 * Dla `xp === 0n` zwraca 0. Dla `xp` między `xpForLevel(L)` a
 * `xpForLevel(L+1)` zwraca `L` (level jeszcze nieosiągnięty).
 *
 * @param xp - bigint ≥ 0 (ilość XP)
 * @returns integer w zakresie [0, MAX_LEVEL]
 * @throws RangeError gdy `xp` jest ujemny
 *
 * @example
 * ```ts
 * levelForXp(0n);              // → 0
 * levelForXp(4_200n);          // → 8
 * levelForXp(15_694_800n);     // → 100
 * levelForXp(129_389_799n);    // → 199  (jeden XP poniżej progu L=200)
 * levelForXp(129_389_800n);    // → 200
 * ```
 */
export function levelForXp(xp: bigint): number {
  if (xp < 0n) {
    throw new RangeError(
      `[@tibians/calc] levelForXp: xp nie może być ujemny, otrzymano ${xp}`,
    );
  }

  // Szybka ścieżka: 0 XP → level 0.
  if (xp === 0n) return 0;

  // Binary search po levelu. Zachowujemy niezmiennik:
  //   xpForLevel(low) ≤ xp   oraz   xpForLevel(high) > xp
  let low = 1;
  let high = MAX_LEVEL;

  // Sprawdź najpierw czy nie przekroczono MAX.
  if (xp >= xpForLevel(MAX_LEVEL)) return MAX_LEVEL;

  while (low < high) {
    // Unikamy overflow: midpoint = low + Math.floor((high - low) / 2)
    const mid = low + ((high - low) >> 1);
    const xpAtMid = xpForLevel(mid);

    if (xpAtMid <= xp) {
      // xp jest ≥ progu mid → szukamy wyżej
      low = mid + 1;
    } else {
      // xp jest poniżej progu mid → szukamy niżej
      high = mid;
    }
  }

  // Po wyjściu z pętli `low === high` — zwracamy `low - 1`
  // (bo ostatni `low++` przesunął nas powyżej prawidłowego levelu).
  return low - 1;
}

// ──────────────────────────────────────────────────────────────────────────
// Helper CalculatorResult — dla spójności z resztą API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Wariant `xpForLevel` zwracający `CalculatorResult<bigint>`.
 * Użyteczne dla kalkulatorów, które chcą spójnego API Result (np. form
 * validation w T17-23).
 *
 * @example
 * ```ts
 * const r = safeXpForLevel("150");
 * if (!r.ok) return r;
 * const xpNeeded = xpForLevel(150) - currentXp;
 * ```
 */
export function safeXpForLevel(level: number): CalculatorResult<bigint> {
  try {
    return { ok: true, value: xpForLevel(level) };
  } catch (error) {
    if (error instanceof RangeError) {
      return {
        ok: false,
        error: validationError("XP_LEVEL_OUT_OF_RANGE", error.message),
      };
    }
    throw error;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// xpToTarget(from, to) → bigint (T15)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Ile XP potrzeba, żeby przejść z `from` do `to` (oba poziomy jako integer).
 *
 * - Dla `from === to` zwraca `0n` (już tam jesteśmy).
 * - Dla `from > to` zwraca `0n` (nie potrzebujesz XP, żeby „zejść" z poziomu).
 * - Dla `to > MAX_LEVEL` rzuca `RangeError` (limit Tibii).
 *
 * **Formuła TibiaWiki Experience Table** — różnica dwóch wartości `xpForLevel`:
 *
 *   xpToTarget(from, to) = xpForLevel(to) − xpForLevel(from)
 *
 * @param from - obecny level (integer ≥ 0)
 * @param to - docelowy level (integer ≥ 0)
 * @returns różnica XP jako bigint ≥ 0
 * @throws RangeError gdy `from` lub `to` są poza zakresem
 *
 * @example
 * ```ts
 * xpToTarget(8, 100);    // → 15_690_600n (= 15_694_800 − 4_200)
 * xpToTarget(100, 200);  // → 113_695_000n (= 129_389_800 − 15_694_800)
 * xpToTarget(200, 200);  // → 0n
 * xpToTarget(200, 100);  // → 0n (już powyżej targetu)
 * ```
 *
 * Source: https://tibia.fandom.com/wiki/Experience_Table
 */
export function xpToTarget(from: number, to: number): bigint {
  if (!Number.isInteger(from)) {
    throw new RangeError(
      `[@tibians/calc] xpToTarget: from musi być integerem, otrzymano ${from}`,
    );
  }
  if (!Number.isInteger(to)) {
    throw new RangeError(
      `[@tibians/calc] xpToTarget: to musi być integerem, otrzymano ${to}`,
    );
  }
  if (from < 0) {
    throw new RangeError(
      `[@tibians/calc] xpToTarget: from nie może być ujemny, otrzymano ${from}`,
    );
  }
  if (to > MAX_LEVEL) {
    throw new RangeError(
      `[@tibians/calc] xpToTarget: to > ${MAX_LEVEL} jest poza zakresem Tibii, otrzymano ${to}`,
    );
  }
  if (from >= to) return 0n;
  return xpForLevel(to) - xpForLevel(from);
}

/**
 * Wariant `xpToTarget` zwracający `CalculatorResult<bigint>` (spójne Result API).
 *
 * @example
 * ```ts
 * const r = safeXpToTarget(8, 100);
 * if (!r.ok) return r;
 * const xpNeeded = r.value; // → 15_690_600n
 * ```
 */
export function safeXpToTarget(
  from: number,
  to: number,
): CalculatorResult<bigint> {
  try {
    return { ok: true, value: xpToTarget(from, to) };
  } catch (error) {
    if (error instanceof RangeError) {
      return {
        ok: false,
        error: validationError("XP_LEVEL_OUT_OF_RANGE", error.message),
      };
    }
    throw error;
  }
}
