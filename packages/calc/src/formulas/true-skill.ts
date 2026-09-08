/**
 * true-skill — odwrotność bonusu lojalności (arch. §2.2).
 *
 * Tibia wyświetla w grze skill PO dodaniu bonusu lojalności:
 *
 *   displayed = base × (1 + loyaltyPct / 100)
 *
 * Bazaar/highscores raportują skill BEZ bonusu (arch. §13.1).
 * Ten kalkulator odwraca wzór, żeby z tego co widzi gracz (displayed)
 * wyciągnąć bazowy skill (to, co widzi Bazaar / highscores).
 *
 * **Edge case** (TibiaWiki Loyalty_System): 360 loyalty points = 5% bonus,
 * max 50% przy 3600 points (~9.86 lat premium). W grze są **punkty**,
 * nie procenty bezpośrednio; my przyjmujemy wejście procentowe (user-friendly
 * — arch. §2.2 mówi, że „przyjmij wejście user-friendly").
 *
 * **Czysta funkcja**: deterministyczna, brak I/O, brak `Date.now()`.
 *
 * Source: https://tibia.fandom.com/wiki/Loyalty_System
 *         https://tibia.fandom.com/wiki/Skills_Calculator  (sekcja "Skills without Loyalty")
 */

import {
  err,
  ok,
  validationError,
  type CalculatorResult,
  type LoyaltyBonus,
} from "../types.js";

// ──────────────────────────────────────────────────────────────────────────
// Dopuszczalne wartości loyaltyPct (arch. §2.2 / §13.1)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Procenty lojalności akceptowane przez kalkulator.
 * Identyczne z `LoyaltyBonus` z `types.ts` — powtórzone lokalnie dla
 * walidacji runtime (typ `LoyaltyBonus` jest tylko compile-time checkiem).
 */
const VALID_LOYALTY_PCTS: readonly LoyaltyBonus[] = Object.freeze([
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
] as const);

/** Zwraca `true` gdy `pct` jest jednym z dozwolonych progów (0,5,…,50). */
function isValidLoyaltyPct(pct: number): pct is LoyaltyBonus {
  return (VALID_LOYALTY_PCTS as readonly number[]).includes(pct);
}

// ──────────────────────────────────────────────────────────────────────────
// trueSkill(displayedSkill, loyaltyPct) → CalculatorResult<number>
// ──────────────────────────────────────────────────────────────────────────

/**
 * Odwraca bonus lojalności: zamienia wyświetlany skill (z gry) na bazowy
 * skill (z Bazaara / highscores). Wzór:
 *
 *   base = displayed / (1 + loyaltyPct / 100)
 *
 * @param displayedSkill - skill widoczny w grze (integer ≥ 0)
 * @param loyaltyPct - procent lojalności (musi być ∈ {0,5,10,...,50})
 * @returns `CalculatorResult<number>`:
 *   - `{ ok: true, value: baseSkill }` — sukces
 *   - `{ ok: false, error: ... }` — błąd walidacji:
 *     - `displayedSkill` nie jest integerem / < 0 → `TRUE_SKILL_INVALID_INPUT`
 *     - `loyaltyPct` nie ∈ {0,5,…,50} → `TRUE_SKILL_INVALID_LOYALTY`
 *
 * @example
 * ```ts
 * trueSkill(100, 0);    // → { ok: true, value: 100 }     (brak lojalności)
 * trueSkill(100, 10);   // → { ok: true, value: ~90.91 }   (10% bonus)
 * trueSkill(105, 5);    // → { ok: true, value: 100 }      (TibiaWiki przykład)
 * trueSkill(100, 25);   // → { ok: true, value: 80 }
 * trueSkill(100, 50);   // → { ok: true, value: ~66.67 }
 * ```
 *
 * **Zaokrąglenie**: Tibia wyświetla skille jako integery (zaokrągla w dół),
 * więc dla `loyaltyPct > 0` wynik jest ułamkowy. UI powinien wyświetlić
 * 2 miejsca po przecinku (np. `95.24`), żeby zachować precyzję przy
 * 5% loyalty.
 *
 * Source: https://tibia.fandom.com/wiki/Loyalty_System
 *         https://tibia.fandom.com/wiki/Skills_Calculator
 */
export function trueSkill(
  displayedSkill: number,
  loyaltyPct: number,
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

  // Specjalny przypadek: brak lojalności → base = displayed
  if (loyaltyPct === 0) {
    return ok(displayedSkill);
  }

  // Odwrócenie wzoru Tibia: base = displayed / (1 + loyaltyPct / 100)
  // Używamy zwykłego `number` (nie bigint) — skille Tibii są małe (< 250),
  // a ułamkowe wyniki (np. 95.24) są OK w tym kontekście (UI zaokrągli).
  const multiplier = 1 + loyaltyPct / 100;
  const baseSkill = displayedSkill / multiplier;

  // Wynik powinien być niższy niż displayed (dla loyalty > 0),
  // ale zachowujemy wszystkie wartości — UI decyduje o zaokrągleniu.
  return ok(baseSkill);
}
