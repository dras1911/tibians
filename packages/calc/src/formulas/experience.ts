/**
 * experience — XP calculations: xpToTarget, timeToTarget (task 15).
 *
 * Rozszerzenie `xpForLevel` / `levelForXp` z `utils/xp-table.ts` o:
 *   - `xpToTarget(currentLevel, targetLevel)` — ile XP do targetu (bigint)
 *   - `timeToTarget(currentLevel, targetLevel, xpPerHour)` — czas przy danym XP/h
 *   - `timeToTargetFromXp(currentXp, targetLevel, xpPerHour)` — wariant z XP
 *
 * Wszystkie operacje na XP używają **bigint** (Tibia XP dla level 2500 ≈ 2.6×10¹⁰,
 * ale sumowanie z wielu źródeł przekracza MAX_SAFE_INTEGER).
 *
 * **Czysta funkcja**: deterministyczna, brak I/O, brak `Date.now()`.
 *
 * Source: https://tibia.fandom.com/wiki/Experience_Table
 */

import {
  err,
  ok,
  validationError,
  type CalculatorResult,
} from "../types.js";
import {
  MAX_LEVEL,
  safeXpForLevel,
  levelForXp,
  xpForLevel,
} from "../utils/xp-table.js";

// ──────────────────────────────────────────────────────────────────────────
// xpToTarget(currentLevel, targetLevel) → CalculatorResult<bigint>
// ──────────────────────────────────────────────────────────────────────────

/**
 * Ile XP potrzeba, żeby z `currentLevel` dojść do `targetLevel`.
 *
 * Reguły:
 *   - `currentLevel === targetLevel` → `0n` (już tam jesteś)
 *   - `currentLevel > targetLevel` → `0n` (nie potrzebujesz XP)
 *   - `currentLevel < 0` lub `targetLevel > MAX_LEVEL` → błąd walidacji
 *   - Non-integer → błąd walidacji
 *
 * @example
 * ```ts
 * xpToTarget(8, 100);     // → 15_690_600n
 * xpToTarget(100, 200);   // → 113_695_000n
 * xpToTarget(200, 200);   // → 0n
 * ```
 *
 * Source: https://tibia.fandom.com/wiki/Experience_Table
 */
export function xpToTarget(
  currentLevel: number,
  targetLevel: number,
): CalculatorResult<bigint> {
  if (!Number.isInteger(currentLevel)) {
    return err(
      validationError(
        "EXPERIENCE_INVALID_LEVEL",
        `currentLevel musi być integerem, otrzymano ${currentLevel}`,
      ),
    );
  }
  if (!Number.isInteger(targetLevel)) {
    return err(
      validationError(
        "EXPERIENCE_INVALID_LEVEL",
        `targetLevel musi być integerem, otrzymano ${targetLevel}`,
      ),
    );
  }
  if (currentLevel < 0) {
    return err(
      validationError(
        "EXPERIENCE_INVALID_LEVEL",
        `currentLevel nie może być ujemny, otrzymano ${currentLevel}`,
      ),
    );
  }
  if (currentLevel > MAX_LEVEL) {
    return err(
      validationError(
        "EXPERIENCE_INVALID_LEVEL",
        `currentLevel > ${MAX_LEVEL} jest poza zakresem Tibii, otrzymano ${currentLevel}`,
      ),
    );
  }
  if (targetLevel < 0) {
    return err(
      validationError(
        "EXPERIENCE_INVALID_LEVEL",
        `targetLevel nie może być ujemny, otrzymano ${targetLevel}`,
      ),
    );
  }
  if (targetLevel > MAX_LEVEL) {
    return err(
      validationError(
        "EXPERIENCE_INVALID_LEVEL",
        `targetLevel > ${MAX_LEVEL} jest poza zakresem Tibii, otrzymano ${targetLevel}`,
      ),
    );
  }
  if (currentLevel >= targetLevel) {
    return ok(0n);
  }

  // Formuła TibiaWiki: różnica dwóch wartości xpForLevel
  const xpCurrent = xpForLevel(currentLevel);
  const xpTarget = xpForLevel(targetLevel);
  return ok(xpTarget - xpCurrent);
}

// ──────────────────────────────────────────────────────────────────────────
// timeToTarget — wariant z poziomami
// ──────────────────────────────────────────────────────────────────────────

/**
 * Ile czasu zajmie przejście z `currentLevel` do `targetLevel` przy zadanym
 * `xpPerHour`. Zwraca czas w sekundach i godzinach.
 *
 * @param currentLevel - obecny level (integer ≥ 0)
 * @param targetLevel - docelowy level (integer ≥ currentLevel, ≤ MAX_LEVEL)
 * @param xpPerHour - tempo XP/h (integer > 0)
 * @returns `CalculatorResult<{ seconds: number, hours: number }>`
 *
 * @example
 * ```ts
 * // Druid level 100→110 przy 250k XP/h (typowe tempo solo hunt):
 * timeToTarget(100, 110, 250_000);
 * //   xpToTarget(100,110) = 5_309_500n
 * //   hours ≈ 21.24 → seconds ≈ 76 460
 * ```
 *
 * **Założenie**: `xpPerHour` jest stałe przez cały czas treningu.
 * W Tibia tempo zmienia się z levelem (wyższy level = wolniejsze tempo),
 * więc UI powinien dodać disclaimer lub iterować per level.
 *
 * Source: https://tibia.fandom.com/wiki/Experience_Table (formuła CipSoft)
 */
export function timeToTarget(
  currentLevel: number,
  targetLevel: number,
  xpPerHour: number,
): CalculatorResult<{ seconds: number; hours: number }> {
  // Walidacja xpPerHour
  if (!Number.isFinite(xpPerHour)) {
    return err(
      validationError(
        "EXPERIENCE_INVALID_RATE",
        `xpPerHour musi być liczbą skończoną, otrzymano ${xpPerHour}`,
      ),
    );
  }
  if (!Number.isInteger(xpPerHour)) {
    return err(
      validationError(
        "EXPERIENCE_INVALID_RATE",
        `xpPerHour musi być integerem, otrzymano ${xpPerHour}`,
      ),
    );
  }
  if (xpPerHour <= 0) {
    return err(
      validationError(
        "EXPERIENCE_INVALID_RATE",
        `xpPerHour musi być > 0, otrzymano ${xpPerHour}`,
      ),
    );
  }

  // xpToTarget
  const xpNeededResult = xpToTarget(currentLevel, targetLevel);
  if (!xpNeededResult.ok) {
    return err(xpNeededResult.error);
  }

  // time = xp / (xpPerHour / 3600) = xp * 3600 / xpPerHour
  // Zachowujemy precyzję: używamy bigint do mnożenia przez 3600,
  // a potem dzielimy przez xpPerHour (number) dostając float sekund.
  const xpNeeded = xpNeededResult.value;
  const secondsBig = (xpNeeded * 3600n) / BigInt(xpPerHour);
  // Jeśli wynik > MAX_SAFE_INTEGER (mało prawdopodobne: 2.6e10 * 3600 ≈ 9.4e13),
  // konwertujemy na number ostrożnie — ale dla typowych leveli (do 1000) jesteśmy bezpieczni.
  const seconds = Number(secondsBig);
  const hours = seconds / 3600;

  return ok({ seconds, hours });
}

// ──────────────────────────────────────────────────────────────────────────
// timeToTargetFromXp — wariant z konkretną ilością XP
// ──────────────────────────────────────────────────────────────────────────

/**
 * Ile czasu zajmie zbicie `xpNeeded` XP przy zadanym `xpPerHour`.
 * Wariant `timeToTarget` dla konsumentów, którzy już mają `xpNeeded`
 * (np. z `xpToTarget` złożonego z wielu źródeł).
 *
 * @param xpNeeded - ile XP trzeba zbić (bigint ≥ 0)
 * @param xpPerHour - tempo XP/h (integer > 0)
 * @returns `CalculatorResult<{ seconds: number, hours: number }>`
 *
 * @example
 * ```ts
 * timeToTargetFromXp(5_309_500n, 250_000);
 * //   hours ≈ 21.24 → seconds ≈ 76 460
 * ```
 *
 * Source: https://tibia.fandom.com/wiki/Experience_Table
 */
export function timeToTargetFromXp(
  xpNeeded: bigint,
  xpPerHour: number,
): CalculatorResult<{ seconds: number; hours: number }> {
  if (xpNeeded < 0n) {
    return err(
      validationError(
        "EXPERIENCE_INVALID_XP",
        `xpNeeded nie może być ujemny, otrzymano ${xpNeeded}`,
      ),
    );
  }
  if (!Number.isFinite(xpPerHour) || !Number.isInteger(xpPerHour) || xpPerHour <= 0) {
    return err(
      validationError(
        "EXPERIENCE_INVALID_RATE",
        `xpPerHour musi być integerem > 0, otrzymano ${xpPerHour}`,
      ),
    );
  }

  if (xpNeeded === 0n) {
    return ok({ seconds: 0, hours: 0 });
  }

  const secondsBig = (xpNeeded * 3600n) / BigInt(xpPerHour);
  const seconds = Number(secondsBig);
  const hours = seconds / 3600;
  return ok({ seconds, hours });
}

// ──────────────────────────────────────────────────────────────────────────
// Re-eksport wygodnych helperów z xp-table
// ──────────────────────────────────────────────────────────────────────────

/** Re-eksport `xpForLevel` z utils dla wygody konsumentów. */
export { xpForLevel, levelForXp, MAX_LEVEL, safeXpForLevel };
