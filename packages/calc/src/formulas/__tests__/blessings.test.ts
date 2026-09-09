/**
 * Testy blessings — task 20, ground truth TibiaWiki Blessings.
 *
 * **Ground truth**:
 *   - TibiaWiki Blessings (https://tibia.fandom.com/wiki/Blessings):
 *     - L ≤ 30: cost = 2 000 gp (flat)
 *     - 30 < L ≤ 120: cost = 200 × (L − 20)
 *     - L > 120: cost = 20 000 + 75 × (L − 120)
 *
 *   - Przykłady z seed (T16):
 *     - L=1   →  2 000 gp (cost_per_blessing_level_1)
 *     - L=100 → 16 000 gp (cost_per_blessing_level_100)
 *     - L=200 → 26 000 gp (cost_per_blessing_level_200)
 *
 * **Strategia testów**:
 *   - 3 punkty graniczne piece-wise (1, 30, 31, 120, 121, 200, 619).
 *   - 7 × cost_per_blessing = totalCostGp.
 *   - Walidacja (level, target/current blessings, corrupted config).
 *   - Edge cases (target < current → 0 do kupienia, blessings = 0).
 */
import { describe, expect, it } from "vitest";

import {
  blessingCost,
  costPerBlessing,
  isBlessingsConfigConsistent,
  MAX_BLESSINGS,
  MAX_BLESSING_LEVEL,
  MIN_BLESSING_LEVEL,
  type BlessingsConfig,
} from "../blessings.js";

// ───────────────────────────────────────────────────────────────────────
// Ground truth fixtures
// ───────────────────────────────────────────────────────────────────────

/**
 * Standardowy config zgodny z T16 seed (calculator-config.ts).
 * Wartości zweryfikowane z piece-wise formułą TibiaWiki.
 */
const STANDARD_CONFIG: BlessingsConfig = Object.freeze({
  costPerBlessingLevel1: 2_000,
  costPerBlessingLevel100: 16_000,
  costPerBlessingLevel200: 26_000,
});

// ───────────────────────────────────────────────────────────────────────
// costPerBlessing — piece-wise ground truth
// ───────────────────────────────────────────────────────────────────────

describe("costPerBlessing — TibiaWiki R(L)", () => {
  it("L=1: flat 2 000 (cost_per_blessing_level_1)", () => {
    expect(costPerBlessing(1, STANDARD_CONFIG)).toBe(2_000);
  });

  it("L=8: flat 2 000 (minimal Tibia level)", () => {
    expect(costPerBlessing(8, STANDARD_CONFIG)).toBe(2_000);
  });

  it("L=30: flat 2 000 (boundary, jeszcze flat)", () => {
    expect(costPerBlessing(30, STANDARD_CONFIG)).toBe(2_000);
  });

  it("L=31: 200 × 11 = 2 200 (pierwszy L > 30)", () => {
    expect(costPerBlessing(31, STANDARD_CONFIG)).toBe(2_200);
  });

  it("L=100: 200 × 80 = 16 000 (seed cost_per_blessing_level_100)", () => {
    expect(costPerBlessing(100, STANDARD_CONFIG)).toBe(16_000);
  });

  it("L=120: 200 × 100 = 20 000 (boundary, jeszcze mid)", () => {
    expect(costPerBlessing(120, STANDARD_CONFIG)).toBe(20_000);
  });

  it("L=121: 20 000 + 75 × 1 = 20 075 (pierwszy L > 120)", () => {
    expect(costPerBlessing(121, STANDARD_CONFIG)).toBe(20_075);
  });

  it("L=200: 20 000 + 75 × 80 = 26 000 (seed cost_per_blessing_level_200)", () => {
    expect(costPerBlessing(200, STANDARD_CONFIG)).toBe(26_000);
  });

  it("L=619: 20 000 + 75 × 499 = 57 425 (popular benchmark level)", () => {
    // Architekt benchmark: Imbuement na level 619 = potent cost
    expect(costPerBlessing(619, STANDARD_CONFIG)).toBe(57_425);
  });

  it("monotoniczność: R(L) rośnie z L (dla L > 30)", () => {
    let prev = costPerBlessing(31, STANDARD_CONFIG);
    for (let l = 32; l <= 2500; l += 50) {
      const cur = costPerBlessing(l, STANDARD_CONFIG);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// isBlessingsConfigConsistent — sanity check
// ───────────────────────────────────────────────────────────────────────

describe("isBlessingsConfigConsistent — walidacja spójności seeda", () => {
  it("standardowy seed jest spójny", () => {
    expect(isBlessingsConfigConsistent(STANDARD_CONFIG)).toBe(true);
  });

  it("corrupted seed (costPerBlessingLevel100 ≠ 16 000) → false", () => {
    const corrupted: BlessingsConfig = {
      ...STANDARD_CONFIG,
      costPerBlessingLevel100: 15_000,
    };
    expect(isBlessingsConfigConsistent(corrupted)).toBe(false);
  });

  it("corrupted seed (costPerBlessingLevel200 ≠ 26 000) → false", () => {
    const corrupted: BlessingsConfig = {
      ...STANDARD_CONFIG,
      costPerBlessingLevel200: 25_000,
    };
    expect(isBlessingsConfigConsistent(corrupted)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────
// blessingCost — ground truth total cost
// ───────────────────────────────────────────────────────────────────────

describe("blessingCost — całkowity koszt", () => {
  it("Level 100, chce 5/7, ma 2/7 → 3 × 16 000 = 48 000 gp", () => {
    const r = blessingCost(100, 5, 2, STANDARD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.costPerBlessingGp).toBe(16_000);
    expect(r.value.blessingsToBuy).toBe(3);
    expect(r.value.totalCostGp).toBe(48_000);
  });

  it("Level 200, chce 7/7, ma 0/7 → 7 × 26 000 = 182 000 gp", () => {
    const r = blessingCost(200, 7, 0, STANDARD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.costPerBlessingGp).toBe(26_000);
    expect(r.value.blessingsToBuy).toBe(7);
    expect(r.value.totalCostGp).toBe(182_000);
  });

  it("Level 8 (minimal Tibia level, flat zone), chce 7/7, ma 0/7 → 7 × 2 000 = 14 000 gp", () => {
    const r = blessingCost(8, 7, 0, STANDARD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.costPerBlessingGp).toBe(2_000);
    expect(r.value.blessingsToBuy).toBe(7);
    expect(r.value.totalCostGp).toBe(14_000);
  });

  it("target = current → 0 do kupienia, totalCostGp = 0", () => {
    const r = blessingCost(100, 5, 5, STANDARD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.blessingsToBuy).toBe(0);
    expect(r.value.totalCostGp).toBe(0);
  });

  it("target < current → clamped do 0 (bezpieczne dla UI)", () => {
    // np. gracz ma 5/7, przypadkiem wpisał 3 → 0 do kupienia
    const r = blessingCost(100, 3, 5, STANDARD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.blessingsToBuy).toBe(0);
    expect(r.value.totalCostGp).toBe(0);
  });

  it("target = 0, current = 0 → 0 do kupienia (gracz rezygnuje z blessów)", () => {
    const r = blessingCost(100, 0, 0, STANDARD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.blessingsToBuy).toBe(0);
    expect(r.value.totalCostGp).toBe(0);
  });

  it("Level 619 (popular benchmark), 7/7 from 0/7 → 7 × 57 425 = 401 975 gp", () => {
    const r = blessingCost(619, 7, 0, STANDARD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.costPerBlessingGp).toBe(57_425);
    expect(r.value.blessingsToBuy).toBe(7);
    expect(r.value.totalCostGp).toBe(401_975);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Walidacja
// ───────────────────────────────────────────────────────────────────────

describe("blessingCost — walidacja inputu", () => {
  it("currentLevel < MIN_BLESSING_LEVEL (8) → błąd", () => {
    const r = blessingCost(7, 5, 0, STANDARD_CONFIG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("BLESSING_INVALID_LEVEL");
    }
  });

  it("currentLevel > MAX_BLESSING_LEVEL (2500) → błąd", () => {
    const r = blessingCost(2501, 5, 0, STANDARD_CONFIG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("BLESSING_INVALID_LEVEL");
    }
  });

  it("currentLevel = 100.5 (non-integer) → błąd", () => {
    const r = blessingCost(100.5, 5, 0, STANDARD_CONFIG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("BLESSING_INVALID_LEVEL");
    }
  });

  it("targetBlessings = 8 (> MAX_BLESSINGS) → błąd", () => {
    const r = blessingCost(100, 8, 0, STANDARD_CONFIG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("BLESSING_INVALID_TARGET_BLESSINGS");
    }
  });

  it("currentBlessings = -1 → błąd", () => {
    const r = blessingCost(100, 5, -1, STANDARD_CONFIG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("BLESSING_INVALID_CURRENT_BLESSINGS");
    }
  });

  it("config.costPerBlessingLevel1 = 0 → błąd", () => {
    const r = blessingCost(100, 5, 0, {
      ...STANDARD_CONFIG,
      costPerBlessingLevel1: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("BLESSING_INVALID_CONFIG");
    }
  });

  it("config.costPerBlessingLevel200 = -100 (ujemne) → błąd", () => {
    const r = blessingCost(100, 5, 0, {
      ...STANDARD_CONFIG,
      costPerBlessingLevel200: -100,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("BLESSING_INVALID_CONFIG");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// Edge case: granice MAX_BLESSINGS, MIN/MAX_BLESSING_LEVEL
// ───────────────────────────────────────────────────────────────────────

describe("blessingCost — edge cases", () => {
  it("MAX_BLESSINGS = 7 (zgodne z TibiaWiki Spirits of Five + Twist of Fate × 2)", () => {
    expect(MAX_BLESSINGS).toBe(7);
  });

  it("MIN_BLESSING_LEVEL = 8 (minimal Tibia level)", () => {
    expect(MIN_BLESSING_LEVEL).toBe(8);
  });

  it("MAX_BLESSING_LEVEL = 2500 (Tibia max)", () => {
    expect(MAX_BLESSING_LEVEL).toBe(2500);
  });

  it("Level MIN_BLESSING_LEVEL (8), 1 blessing → flat 2 000", () => {
    const r = blessingCost(8, 1, 0, STANDARD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.costPerBlessingGp).toBe(2_000);
    expect(r.value.totalCostGp).toBe(2_000);
  });

  it("Level MAX_BLESSING_LEVEL (2500), 1 blessing → highest cost", () => {
    // L=2500: 20000 + 75 × (2500-120) = 20000 + 178500 = 198500
    const r = blessingCost(2500, 1, 0, STANDARD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.costPerBlessingGp).toBe(198_500);
    expect(r.value.totalCostGp).toBe(198_500);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Determinizm
// ───────────────────────────────────────────────────────────────────────

describe("blessingCost — determinizm", () => {
  it("ten sam input → ten sam output (100 wywołań)", () => {
    for (let i = 0; i < 100; i++) {
      const r1 = blessingCost(100, 5, 2, STANDARD_CONFIG);
      const r2 = blessingCost(100, 5, 2, STANDARD_CONFIG);
      expect(r1.ok && r2.ok).toBe(true);
      if (!r1.ok || !r2.ok) return;
      expect(r1.value).toEqual(r2.value);
    }
  });
});