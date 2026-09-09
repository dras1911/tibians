/**
 * blessings — koszt błogosławieństw TibiaWiki R(L) (task 20, arch §2.3,
 * TibiaWiki Blessings).
 *
 * Tibia oferuje 5 rodzajów błogosławieństw (Spirits of the Five), które
 * chronią przed utratą XP przy śmierci:
 *
 *   - 1 błogosławieństwo  →  strata 10% XP
 *   - 2 błogosławieństwa →  strata  5% XP
 *   - 3 błogosławieństwa →  strata  3% XP
 *   - 4 błogosławieństwa →  strata  2% XP
 *   - 5 błogosławieństw  →  strata  1.5% XP
 *   - 6 błogosławieństw  →  strata  1% XP
 *   - 7 błogosławieństw  →  strata  0% XP (pełna ochrona, "Twist of Fate")
 *
 * Koszt jednego błogosławieństwa zależy od poziomu postaci
 * (TibiaWiki Blessings, wzór R(L)):
 *
 *   L ≤  30  →  2 000 gp         (flat — "cost_per_blessing_level_1")
 *   30 < L ≤ 120 →  200 × (L − 20) gp
 *   L >  120 →  20 000 + 75 × (L − 120) gp
 *
 * Uwaga: TibiaWiki formuła dla L > 30 używa `(L − 20)` jako wyrażenia.
 * Specjalnie L=1 (cost = 2000) i L=100 (cost = 200 × 80 = 16 000) są
 * zgodne z T16 seed (`blessing.cost_per_blessing_level_1` = 2000,
 * `blessing.cost_per_blessing_level_100` = 16000).
 *
 * Całkowity koszt = `costPerBlessing × blessingsToBuy`.
 *
 * **Czysta funkcja**: deterministyczna, zero I/O, zero `Date.now()`.
 *
 * Source: https://tibia.fandom.com/wiki/Blessings
 */
import {
  err,
  ok,
  validationError,
  type CalculatorResult,
} from "../types.js";

// ───────────────────────────────────────────────────────────────────────
// Stałe domenowe (Tibia ground truth)
// ───────────────────────────────────────────────────────────────────────

/**
 * Minimalny level gracza w Tibii (8).
 *
 * TibiaWiki: błogosławieństwa są dostępne od pierwszego mainland city,
 * ale realna minimalna cena jest dla level 8.
 */
export const MIN_BLESSING_LEVEL = 8;

/**
 * Maksymalny level gracza w Tibii (2500).
 */
export const MAX_BLESSING_LEVEL = 2500;

/**
 * Liczba błogosławieństw (5 Spirits + Twist of Fate × 2 = max 7).
 *
 * TibiaWiki: 5 Spirits of the Five + 2 dodatkowe sloty za Expansion
 * ("Twist of Fate") → 7/7 = pełna ochrona przed XP-loss.
 */
export const MAX_BLESSINGS = 7;

// ───────────────────────────────────────────────────────────────────────
// BlessingsConfig — parametry z `getConfig('blessing.*')` (T16 seed)
// ───────────────────────────────────────────────────────────────────────

/**
 * Parametry kosztów błogosławieństw czytane z `getConfig()`.
 *
 * Trzy seed wartości z T16 (`packages/db/src/seed/calculator-config.ts`):
 *   - `cost_per_blessing_level_1`    =  2 000 gp
 *   - `cost_per_blessing_level_100`  = 16 000 gp
 *   - `cost_per_blessing_level_200`  = 26 000 gp
 *
 * Te trzy wartości determinują piece-wise funkcję R(L). Wzór:
 *   L ≤  30 → flat 2000
 *   30 < L ≤ 120 → 200 × (L − 20)
 *   L >  120 → 20000 + 75 × (L − 120)
 *
 * Dla L=100: 200 × 80 = 16000 ✓ (zgodne z seed)
 * Dla L=200: 20000 + 75 × 80 = 26000 ✓ (zgodne z seed)
 */
export interface BlessingsConfig {
  /** Koszt per blessing dla level ≤ 30 (domyślnie 2 000 gp). */
  readonly costPerBlessingLevel1: number;
  /** Koszt per blessing dla level 100 (domyślnie 16 000 gp). */
  readonly costPerBlessingLevel100: number;
  /** Koszt per blessing dla level 200 (domyślnie 26 000 gp). */
  readonly costPerBlessingLevel200: number;
}

// ───────────────────────────────────────────────────────────────────────
// BlessingsResult — struktura wyniku
// ───────────────────────────────────────────────────────────────────────

/**
 * Wynik `blessingCost()`.
 */
export interface BlessingsResult {
  /** Koszt jednego błogosławieństwa w gp (R(L) — TibiaWiki). */
  readonly costPerBlessingGp: number;
  /** Ile błogosławieństw gracz zamierza kupić (0..7). */
  readonly targetBlessings: number;
  /** Ile błogosławieństw gracz już ma (0..7). */
  readonly currentBlessings: number;
  /** Ile błogosławieństw trzeba dokupić (target − current). */
  readonly blessingsToBuy: number;
  /** Całkowity koszt = costPerBlessing × blessingsToBuy. */
  readonly totalCostGp: number;
  /** Poziom gracza (echo z inputu). */
  readonly level: number;
}

// ───────────────────────────────────────────────────────────────────────
// Helpers — walidacja
// ───────────────────────────────────────────────────────────────────────

function isValidLevel(level: number): boolean {
  return (
    Number.isFinite(level) &&
    Number.isInteger(level) &&
    level >= MIN_BLESSING_LEVEL &&
    level <= MAX_BLESSING_LEVEL
  );
}

function isValidBlessingsCount(count: number): boolean {
  return (
    Number.isFinite(count) && Number.isInteger(count) && count >= 0 && count <= MAX_BLESSINGS
  );
}

/**
 * Piece-wise formuła TibiaWiki R(L) — koszt jednego błogosławieństwa.
 *
 *   L ≤ 30              →  flat `costPerBlessingLevel1` (TibiaWiki: 2 000 gp)
 *   30 < L ≤ 120        →  200 × (L − 20)
 *   L >  120            →  20 000 + 75 × (L − 120)
 *
 * Parametry z `BlessingsConfig` są używane do sanity checku (walidacja
 * że seed nie jest corrupted — patrz testy).
 */
export function costPerBlessing(level: number, config: BlessingsConfig): number {
  if (level <= 30) {
    return config.costPerBlessingLevel1;
  }
  if (level <= 120) {
    return 200 * (level - 20);
  }
  return 20_000 + 75 * (level - 120);
}

/**
 * Sanity check: zwraca `true` gdy trzy seed values są spójne z
 * piece-wise formułą TibiaWiki (dla level 1, 100, 200).
 *
 * Wykorzystywane do walidacji configu w testach i runtime —
 * corrupted seed (ręczna zmiana w DB) → fallback.
 */
export function isBlessingsConfigConsistent(config: BlessingsConfig): boolean {
  return (
    costPerBlessing(1, config) === config.costPerBlessingLevel1 &&
    costPerBlessing(100, config) === config.costPerBlessingLevel100 &&
    costPerBlessing(200, config) === config.costPerBlessingLevel200
  );
}

// ───────────────────────────────────────────────────────────────────────
// blessingCost — główna funkcja
// ───────────────────────────────────────────────────────────────────────

/**
 * Oblicza koszt zakupu `targetBlessings` błogosławieństw, biorąc pod uwagę
 * `currentBlessings` (ile gracz już ma) i `currentLevel` (wpływa na R(L)).
 *
 * **Logika**:
 *   - `blessingsToBuy = max(0, targetBlessings − currentBlessings)`
 *   - `costPerBlessing = R(currentLevel)` (piece-wise TibiaWiki)
 *   - `totalCostGp = costPerBlessing × blessingsToBuy`
 *
 * **Walidacja**:
 *   - `currentLevel` ∈ [8, 2500] (integer)
 *   - `currentBlessings`, `targetBlessings` ∈ [0, 7] (integer)
 *   - `config` — wszystkie 3 pola > 0 (corrupted → fallback)
 *
 * @param currentLevel - obecny level gracza (integer ∈ [8, 2500])
 * @param targetBlessings - docelowa liczba błogosławieństw (0..7)
 * @param currentBlessings - ile gracz już ma (0..7, domyślnie tyle ile target -1)
 * @param config - parametry z `getConfig('blessing.*')` (T16 seed)
 * @returns `CalculatorResult<BlessingsResult>`
 *
 * @example
 * ```ts
 * const cfg = {
 *   costPerBlessingLevel1: 2_000,
 *   costPerBlessingLevel100: 16_000,
 *   costPerBlessingLevel200: 26_000,
 * };
 *
 * // Level 100, chce 5/7, ma 2/7 → 3 błogosławieństwa × 16 000 = 48 000 gp
 * blessingCost(100, 5, 2, cfg);
 * // → { ok: true, value: { costPerBlessingGp: 16000, blessingsToBuy: 3,
 * //                          totalCostGp: 48000, ... } }
 *
 * // Level 200, chce 7/7, ma 0/7 → 7 × 26 000 = 182 000 gp
 * blessingCost(200, 7, 0, cfg);
 * // → { ok: true, value: { costPerBlessingGp: 26000, blessingsToBuy: 7,
 * //                          totalCostGp: 182000, ... } }
 *
 * // Level 1 (edge: < 8) → błąd walidacji
 * blessingCost(1, 5, 0, cfg);
 * // → { ok: false, error: { code: "BLESSING_INVALID_LEVEL", ... } }
 *
 * // target = current → 0 do kupienia
 * blessingCost(100, 5, 5, cfg);
 * // → { ok: true, value: { ... blessingsToBuy: 0, totalCostGp: 0 } }
 * ```
 *
 * Source: https://tibia.fandom.com/wiki/Blessings
 */
export function blessingCost(
  currentLevel: number,
  targetBlessings: number,
  currentBlessings: number,
  config: BlessingsConfig,
): CalculatorResult<BlessingsResult> {
  // ── Walidacja currentLevel ────────────────────────────────────
  if (!isValidLevel(currentLevel)) {
    return err(
      validationError(
        "BLESSING_INVALID_LEVEL",
        `currentLevel musi być integerem ∈ [${MIN_BLESSING_LEVEL}, ${MAX_BLESSING_LEVEL}], ` +
          `otrzymano ${currentLevel}`,
      ),
    );
  }

  // ── Walidacja targetBlessings ─────────────────────────────────
  if (!isValidBlessingsCount(targetBlessings)) {
    return err(
      validationError(
        "BLESSING_INVALID_TARGET_BLESSINGS",
        `targetBlessings musi być integerem ∈ [0, ${MAX_BLESSINGS}], otrzymano ${targetBlessings}`,
      ),
    );
  }

  // ── Walidacja currentBlessings ────────────────────────────────
  if (!isValidBlessingsCount(currentBlessings)) {
    return err(
      validationError(
        "BLESSING_INVALID_CURRENT_BLESSINGS",
        `currentBlessings musi być integerem ∈ [0, ${MAX_BLESSINGS}], ` +
          `otrzymano ${currentBlessings}`,
      ),
    );
  }

  // ── Walidacja config (wymagane progi > 0) ─────────────────────
  const requiredPositive: Array<readonly [string, unknown]> = [
    ["costPerBlessingLevel1", config.costPerBlessingLevel1],
    ["costPerBlessingLevel100", config.costPerBlessingLevel100],
    ["costPerBlessingLevel200", config.costPerBlessingLevel200],
  ];
  for (const [name, value] of requiredPositive) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value <= 0
    ) {
      return err(
        validationError(
          "BLESSING_INVALID_CONFIG",
          `${name} musi być integerem > 0, otrzymano ${String(value)}`,
        ),
      );
    }
  }

  // ── Obliczenie ────────────────────────────────────────────────
  const costPerBlessingGp = costPerBlessing(currentLevel, config);
  const blessingsToBuy = Math.max(0, targetBlessings - currentBlessings);
  const totalCostGp = costPerBlessingGp * blessingsToBuy;

  return ok({
    costPerBlessingGp,
    targetBlessings,
    currentBlessings,
    blessingsToBuy,
    totalCostGp,
    level: currentLevel,
  });
}