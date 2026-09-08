/**
 * Testy true-skill — task 15, ground truth TibiaWiki Loyalty_System.
 *
 * **Ground truth**:
 *   - TibiaWiki Loyalty_System — 360 loyalty points = 5% bonus,
 *     max 50% przy 3600 points (~9.86 lat premium).
 *     (https://tibia.fandom.com/wiki/Loyalty_System)
 *   - TibiaWiki Skills_Calculator sekcja "Skills without Loyalty" —
 *     odwrotność bonusu lojalności.
 *
 * **Strategia testów**:
 *   - 11 progów loyalty (0, 5, 10, ..., 50) × typowe displayed skill (50, 100, 150, 200).
 *   - Walidacja (negative, non-integer, invalid loyaltyPct).
 *   - Property: base < displayed dla loyalty > 0; base === displayed dla loyalty = 0.
 *   - Edge: displayed = 0, displayed = 1, max loyalty 50%.
 *   - Deterministyczność.
 */
import { describe, expect, it } from "vitest";
import { trueSkill } from "../true-skill.js";
import { ALL_LOYALTY_PCTS } from "./fixtures.js";

// ──────────────────────────────────────────────────────────────────────────
// Edge cases i property testy
// ──────────────────────────────────────────────────────────────────────────

describe("trueSkill — edge cases i property", () => {
  it("loyaltyPct = 0 → base = displayed (brak bonusu)", () => {
    for (const displayed of [0, 50, 100, 150, 200]) {
      const r = trueSkill(displayed, 0);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toBe(displayed);
    }
  });

  it("loyaltyPct > 0 → base < displayed (monotoniczność)", () => {
    for (const loyalty of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]) {
      const r = trueSkill(100, loyalty);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toBeLessThan(100);
    }
  });

  it("wyższe loyalty → niższy base (dla stałego displayed)", () => {
    let prev = Number.POSITIVE_INFINITY;
    for (const loyalty of ALL_LOYALTY_PCTS) {
      const r = trueSkill(200, loyalty);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      if (loyalty > 0) {
        expect(r.value).toBeLessThan(prev);
      }
      prev = r.value;
    }
  });

  it("displayed = 0 → base = 0 dla każdego loyalty", () => {
    for (const loyalty of ALL_LOYALTY_PCTS) {
      const r = trueSkill(0, loyalty);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toBe(0);
    }
  });

  it("displayed = 100, loyalty = 5% → base = 100/1.05 = 95.24 (TibiaWiki przykład)", () => {
    const r = trueSkill(100, 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(95.238, 2);
  });

  it("displayed = 105, loyalty = 5% → base = 100 (TibiaWiki przykład odwrotny)", () => {
    // Inverse case: 105 displayed = 100 base × 1.05
    const r = trueSkill(105, 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(100);
  });

  it("displayed = 100, loyalty = 50% → base = 100/1.5 ≈ 66.67", () => {
    const r = trueSkill(100, 50);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(66.667, 2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Walidacja
// ──────────────────────────────────────────────────────────────────────────

describe("trueSkill — walidacja inputu", () => {
  it("displayedSkill ujemny → błąd TRUE_SKILL_INVALID_INPUT", () => {
    const r = trueSkill(-1, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("TRUE_SKILL_INVALID_INPUT");
    }
  });

  it("displayedSkill nie-integer → błąd TRUE_SKILL_INVALID_INPUT", () => {
    const r = trueSkill(10.5, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("TRUE_SKILL_INVALID_INPUT");
    }
  });

  it("displayedSkill = NaN → błąd", () => {
    const r = trueSkill(Number.NaN, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("TRUE_SKILL_INVALID_INPUT");
    }
  });

  it("loyaltyPct spoza {0,5,...,50} → błąd TRUE_SKILL_INVALID_LOYALTY", () => {
    const r = trueSkill(100, 7);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("TRUE_SKILL_INVALID_LOYALTY");
    }
  });

  it("loyaltyPct = 3 → błąd (TibiaWiki: 360 pkt = 5%, 3% nie istnieje)", () => {
    const r = trueSkill(100, 3);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("TRUE_SKILL_INVALID_LOYALTY");
    }
  });

  it("loyaltyPct = 50 → poprawne (max loyalty z 3600 pkt)", () => {
    const r = trueSkill(100, 50);
    expect(r.ok).toBe(true);
  });

  it("loyaltyPct = 0 → poprawne (brak lojalności)", () => {
    const r = trueSkill(100, 0);
    expect(r.ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Deterministyczność i round-trip
// ──────────────────────────────────────────────────────────────────────────

describe("trueSkill — determinizm i round-trip", () => {
  it("funkcja jest deterministyczna (ten sam input → ten sam output)", () => {
    const r1 = trueSkill(150, 25);
    const r2 = trueSkill(150, 25);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value).toBe(r2.value);
  });

  it("forward round-trip: integer base × (1 + loyalty/100) ≈ integer displayed", () => {
    // Jeśli base = 100, loyalty = 10%, to displayed (integer) = round(110) = 110.
    // W drugą stronę: trueSkill(110, 10) ≈ 100.
    const base = 100;
    const loyalty = 10;
    const displayed = Math.round(base * (1 + loyalty / 100));
    const r = trueSkill(displayed, loyalty);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(base, 1);
  });

  it("edge: max displayed value (250) → poprawne base", () => {
    const r = trueSkill(250, 50);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(250 / 1.5, 5);
    expect(r.value).toBeGreaterThan(0);
  });
});