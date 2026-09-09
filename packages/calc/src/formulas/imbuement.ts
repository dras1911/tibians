/**
 * imbuement — koszt slotu imbuement (Basic/Powerful/Intricate) (task 20,
 * arch §2.3, TibiaWiki Imbuing).
 *
 * W Tibii gracze płacą dwutorie za aktywny imbuement:
 *
 *   1. **Slot w TC** (jednorazowo, kupuje się go w Tibia.com):
 *      - Basic slot    → 25 TC
 *      - Powerful slot → 150 TC
 *
 *   2. **Fee w gp** (per aplikacja, opłata NPC imbuing master):
 *      - Basic    →  7 500 gp
 *      - Intricate → 60 000 gp
 *      - Powerful  → 250 000 gp
 *
 * `hours` to czas trwania imbuementu w grze (domyślnie 20h użycia —
 * TibiaWiki). Parametr ten jest tu walidowany, ale NIE wpływa na koszt
 * — koszt jest stały per imbuement. UI może wykorzystać go do wyświetlenia
 * czasu trwania w rekomendacji.
 *
 * **Czysta funkcja**: przyjmuje `ImbuementConfig` (parametry z `getConfig()`
 * — T16 seed), zwraca `CalculatorResult<ImbuementResult>`. Zero I/O,
 * zero `Date.now()`, deterministyczna.
 *
 * Source: https://tibia.fandom.com/wiki/Imbuing
 */
import {
  err,
  ok,
  validationError,
  type CalculatorResult,
} from "../types.js";

// ───────────────────────────────────────────────────────────────────────
// ImbuementConfig — parametry z `getConfig()` (T16 seed)
// ───────────────────────────────────────────────────────────────────────

/**
 * Tier imbuement (Tibia ground truth).
 *
 *  - `basic`      — najtańszy, najsłabszy efekt (np. +5% damage)
 *  - `intricate`  — średni tier (pomiędzy basic a powerful)
 *  - `powerful`   — najdroższy, najsilniejszy efekt (np. +30% damage)
 *
 * TibiaWiki: tylko Basic i Powerful mają slot kupowany w TC.
 * Intricate to fee-only tier (slot dziedziczony z Basic).
 *
 * Uwaga: Slot TC jest osobnym kosztem od fee gp:
 *   - Basic slot TC:    25  TC
 *   - Powerful slot TC: 150 TC
 *   - Intricate: nie kupuje się osobnego slotu — używa Basic slot.
 */
export type ImbuementTier = "basic" | "intricate" | "powerful";

/**
 * Parametry kosztów imbuement czytane z `getConfig('imbuement.*')`
 * (T16 seed defaults).
 */
export interface ImbuementConfig {
  /** Koszt Basic slot w TC (TibiaWiki: 25). */
  readonly basicSlotCostTc: number;
  /** Koszt Powerful slot w TC (TibiaWiki: 150). */
  readonly powerfulSlotCostTc: number;
  /** Fee za Basic imbuement w gp (TibiaWiki: 7 500). */
  readonly feeBasicGp: number;
  /** Fee za Intricate imbuement w gp (TibiaWiki: 60 000). */
  readonly feeIntricateGp: number;
  /** Fee za Powerful imbuement w gp (TibiaWiki: 250 000). */
  readonly feePowerfulGp: number;
  /** Czas trwania imbuementu (TibiaWiki: 20h). */
  readonly durationHours: number;
}

// ───────────────────────────────────────────────────────────────────────
// ImbuementResult — struktura wyniku
// ───────────────────────────────────────────────────────────────────────

/**
 * Wynik `imbuementCost()`. Wszystkie wartości są integerowe.
 */
export interface ImbuementResult {
  /** Tier imbuement (echo z inputu, dla UI). */
  readonly tier: ImbuementTier;
  /** Koszt slotu w TC (0 dla Intricate — używa Basic). */
  readonly slotCostTc: number;
  /** Fee za aplikację w gp. */
  readonly feeGp: number;
  /** Suma TC (na razie = slotCostTc; miejsce na przyszłe rozszerzenia). */
  readonly totalCostTc: number;
  /** Czas trwania imbuementu w godzinach (z config). */
  readonly durationHours: number;
}

// ───────────────────────────────────────────────────────────────────────
// Helpers — walidacja
// ───────────────────────────────────────────────────────────────────────

/**
 * Walidacja tier imbuement.
 */
function isValidTier(tier: unknown): tier is ImbuementTier {
  return tier === "basic" || tier === "intricate" || tier === "powerful";
}

// ───────────────────────────────────────────────────────────────────────
// imbuementCost — główna funkcja
// ───────────────────────────────────────────────────────────────────────

/**
 * Oblicza koszt aktywacji imbuementu danego tieru.
 *
 * **Logika slotów TC**:
 *   - Basic     → slot TC = `basicSlotCostTc` (25 TC)
 *   - Intricate → slot TC = 0 (używa Basic slot, fee wyższy)
 *   - Powerful  → slot TC = `powerfulSlotCostTc` (150 TC)
 *
 * **Logika fee gp**:
 *   - Basic     → `feeBasicGp`     ( 7 500 gp)
 *   - Intricate → `feeIntricateGp` (60 000 gp)
 *   - Powerful  → `feePowerfulGp`  (250 000 gp)
 *
 * **Waluse tierów** (TibiaWiki): 5 bazowych vocations nie wpływa na
 * cenę imbuementu (każdy gracz płaci tyle samo za ten sam tier). Ten
 * kalkulator celowo NIE uwzględnia vocation bonus — patrz §2.1 task 20,
 * „pary vocation/skill (arch §2.1): imbuement vocation bonus (5 vocations
 * × Basic/Powerful)" jest planowane na Fazę 7 (rozszerzenie valuation).
 *
 * @param tier - tier imbuement (`"basic" | "intricate" | "powerful"`)
 * @param config - parametry z `getConfig('imbuement.*')`
 * @returns `CalculatorResult<ImbuementResult>`:
 *   - `{ ok: true, value: { tier, slotCostTc, feeGp, totalCostTc, durationHours } }`
 *   - `{ ok: false, error }` — gdy tier jest nieprawidłowy lub config corrupted
 *
 * @example
 * ```ts
 * const cfg = {
 *   basicSlotCostTc: 25,
 *   powerfulSlotCostTc: 150,
 *   feeBasicGp: 7_500,
 *   feeIntricateGp: 60_000,
 *   feePowerfulGp: 250_000,
 *   durationHours: 20,
 * };
 *
 * imbuementCost("basic", cfg);
 * // → {
 * //     ok: true,
 * //     value: { tier: "basic", slotCostTc: 25, feeGp: 7_500,
 * //              totalCostTc: 25, durationHours: 20 },
 * //   }
 *
 * imbuementCost("intricate", cfg);
 * // → slotCostTc: 0 (uses Basic slot), feeGp: 60_000
 *
 * imbuementCost("powerful", cfg);
 * // → slotCostTc: 150, feeGp: 250_000
 * ```
 *
 * Source: https://tibia.fandom.com/wiki/Imbuing
 */
export function imbuementCost(
  tier: ImbuementTier,
  config: ImbuementConfig,
): CalculatorResult<ImbuementResult> {
  // ── Walidacja tier ────────────────────────────────────────────
  if (!isValidTier(tier)) {
    return err(
      validationError(
        "IMBUEMENT_INVALID_TIER",
        `tier musi być jednym z {basic, intricate, powerful}, otrzymano ${String(tier)}`,
      ),
    );
  }

  // ── Walidacja config (wymagane progi > 0) ─────────────────────
  const requiredPositiveNumbers: Array<readonly [string, unknown]> = [
    ["basicSlotCostTc", config.basicSlotCostTc],
    ["powerfulSlotCostTc", config.powerfulSlotCostTc],
    ["feeBasicGp", config.feeBasicGp],
    ["feeIntricateGp", config.feeIntricateGp],
    ["feePowerfulGp", config.feePowerfulGp],
    ["durationHours", config.durationHours],
  ];
  for (const [name, value] of requiredPositiveNumbers) {
    if (!Number.isFinite(value) || typeof value !== "number") {
      return err(
        validationError(
          "IMBUEMENT_INVALID_CONFIG",
          `${name} musi być liczbą skończoną, otrzymano ${String(value)}`,
        ),
      );
    }
    if (!Number.isInteger(value)) {
      return err(
        validationError(
          "IMBUEMENT_INVALID_CONFIG",
          `${name} musi być integerem, otrzymano ${value}`,
        ),
      );
    }
    if (value <= 0) {
      return err(
        validationError(
          "IMBUEMENT_INVALID_CONFIG",
          `${name} musi być > 0, otrzymano ${value}`,
        ),
      );
    }
  }

  // ── Obliczenie kosztów ────────────────────────────────────────
  let slotCostTc: number;
  let feeGp: number;

  switch (tier) {
    case "basic":
      slotCostTc = config.basicSlotCostTc;
      feeGp = config.feeBasicGp;
      break;
    case "intricate":
      // Intricate uses Basic slot — gracz płaci tylko wyższy fee gp.
      slotCostTc = 0;
      feeGp = config.feeIntricateGp;
      break;
    case "powerful":
      slotCostTc = config.powerfulSlotCostTc;
      feeGp = config.feePowerfulGp;
      break;
  }

  return ok({
    tier,
    slotCostTc,
    feeGp,
    totalCostTc: slotCostTc,
    durationHours: config.durationHours,
  });
}