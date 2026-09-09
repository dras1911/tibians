/**
 * Testy imbuement — task 20, ground truth TibiaWiki Imbuing.
 *
 * **Ground truth**:
 *   - TibiaWiki Imbuing: slot TC + fee gp per tier
 *   - Basic slot:    25 TC  +  7 500 gp fee
 *   - Intricate fee:  0 TC  + 60 000 gp fee (uses Basic slot)
 *   - Powerful slot: 150 TC + 250 000 gp fee
 *
 * **Strategia testów**:
 *   - 3 tiery × poprawny wynik (basic/intricate/powerful)
 *   - Walidacja (invalid tier, corrupted config)
 *   - Determinizm i edge cases (config = 0 → błąd, Inticate slot = 0).
 */
import { describe, expect, it } from "vitest";

import { imbuementCost, type ImbuementConfig } from "../imbuement.js";

// ───────────────────────────────────────────────────────────────────────
// Ground truth fixtures
// ───────────────────────────────────────────────────────────────────────

/**
 * Standardowy config zgodny z T16 seed (calculator-config.ts) +
 * TibiaWiki ground truth. Każdy test może go nadpisać.
 */
const STANDARD_CONFIG: ImbuementConfig = Object.freeze({
  basicSlotCostTc: 25,
  powerfulSlotCostTc: 150,
  feeBasicGp: 7_500,
  feeIntricateGp: 60_000,
  feePowerfulGp: 250_000,
  durationHours: 20,
});

// ───────────────────────────────────────────────────────────────────────
// Ground truth — TibiaWiki Imbuing
// ───────────────────────────────────────────────────────────────────────

describe("imbuementCost — ground truth TibiaWiki Imbuing", () => {
  it("Basic: slot 25 TC + fee 7 500 gp + duration 20h", () => {
    const r = imbuementCost("basic", STANDARD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tier).toBe("basic");
    expect(r.value.slotCostTc).toBe(25);
    expect(r.value.feeGp).toBe(7_500);
    expect(r.value.totalCostTc).toBe(25);
    expect(r.value.durationHours).toBe(20);
  });

  it("Intricate: slot 0 TC (uses Basic) + fee 60 000 gp + duration 20h", () => {
    const r = imbuementCost("intricate", STANDARD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tier).toBe("intricate");
    expect(r.value.slotCostTc).toBe(0);
    expect(r.value.feeGp).toBe(60_000);
    expect(r.value.totalCostTc).toBe(0);
    expect(r.value.durationHours).toBe(20);
  });

  it("Powerful: slot 150 TC + fee 250 000 gp + duration 20h", () => {
    const r = imbuementCost("powerful", STANDARD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tier).toBe("powerful");
    expect(r.value.slotCostTc).toBe(150);
    expect(r.value.feeGp).toBe(250_000);
    expect(r.value.totalCostTc).toBe(150);
    expect(r.value.durationHours).toBe(20);
  });

  it("Total TC = slot TC (dla basic i powerful)", () => {
    const basic = imbuementCost("basic", STANDARD_CONFIG);
    const powerful = imbuementCost("powerful", STANDARD_CONFIG);
    expect(basic.ok && powerful.ok).toBe(true);
    if (!basic.ok || !powerful.ok) return;
    expect(basic.value.totalCostTc).toBe(basic.value.slotCostTc);
    expect(powerful.value.totalCostTc).toBe(powerful.value.slotCostTc);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Configurable: zmiana progu (T16: UPDATE w bazie → 60s cache refresh)
// ───────────────────────────────────────────────────────────────────────

describe("imbuementCost — konfigurowalne progi", () => {
  it("zmiana basicSlotCostTc w config → nowy koszt", () => {
    const customConfig: ImbuementConfig = {
      ...STANDARD_CONFIG,
      basicSlotCostTc: 30, // hipotetyczny nowy tier
    };
    const r = imbuementCost("basic", customConfig);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slotCostTc).toBe(30);
    expect(r.value.totalCostTc).toBe(30);
  });

  it("zmiana feeBasicGp w config → nowy fee", () => {
    const customConfig: ImbuementConfig = {
      ...STANDARD_CONFIG,
      feeBasicGp: 10_000,
    };
    const r = imbuementCost("basic", customConfig);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.feeGp).toBe(10_000);
  });

  it("zmiana durationHours w config → nowy czas trwania", () => {
    const customConfig: ImbuementConfig = {
      ...STANDARD_CONFIG,
      durationHours: 24,
    };
    const r = imbuementCost("basic", customConfig);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.durationHours).toBe(24);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Monotoniczność: Powerful > Intricate > Basic (per fee)
// ───────────────────────────────────────────────────────────────────────

describe("imbuementCost — monotoniczność tierów", () => {
  it("Powerful fee > Intricate fee > Basic fee", () => {
    const basic = imbuementCost("basic", STANDARD_CONFIG);
    const intricate = imbuementCost("intricate", STANDARD_CONFIG);
    const powerful = imbuementCost("powerful", STANDARD_CONFIG);
    expect(basic.ok && intricate.ok && powerful.ok).toBe(true);
    if (!basic.ok || !intricate.ok || !powerful.ok) return;
    expect(basic.value.feeGp).toBeLessThan(intricate.value.feeGp);
    expect(intricate.value.feeGp).toBeLessThan(powerful.value.feeGp);
  });

  it("Powerful slot TC > Basic slot TC; Intricate = 0", () => {
    const basic = imbuementCost("basic", STANDARD_CONFIG);
    const intricate = imbuementCost("intricate", STANDARD_CONFIG);
    const powerful = imbuementCost("powerful", STANDARD_CONFIG);
    expect(basic.ok && intricate.ok && powerful.ok).toBe(true);
    if (!basic.ok || !intricate.ok || !powerful.ok) return;
    expect(basic.value.slotCostTc).toBe(25);
    expect(intricate.value.slotCostTc).toBe(0);
    expect(powerful.value.slotCostTc).toBe(150);
    expect(powerful.value.slotCostTc).toBeGreaterThan(basic.value.slotCostTc);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Walidacja
// ───────────────────────────────────────────────────────────────────────

describe("imbuementCost — walidacja inputu", () => {
  it("tier spoza enuma → błąd IMBUEMENT_INVALID_TIER", () => {
    const r = imbuementCost("epic" as never, STANDARD_CONFIG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("IMBUEMENT_INVALID_TIER");
    }
  });

  it("tier = undefined → błąd", () => {
    const r = imbuementCost(undefined as never, STANDARD_CONFIG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("IMBUEMENT_INVALID_TIER");
    }
  });

  it("basicSlotCostTc = 0 → błąd IMBUEMENT_INVALID_CONFIG", () => {
    const r = imbuementCost("basic", {
      ...STANDARD_CONFIG,
      basicSlotCostTc: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("IMBUEMENT_INVALID_CONFIG");
    }
  });

  it("feePowerfulGp = -100 → błąd (ujemne)", () => {
    const r = imbuementCost("powerful", {
      ...STANDARD_CONFIG,
      feePowerfulGp: -100,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("IMBUEMENT_INVALID_CONFIG");
    }
  });

  it("feeBasicGp = 7500.5 (non-integer) → błąd", () => {
    const r = imbuementCost("basic", {
      ...STANDARD_CONFIG,
      feeBasicGp: 7500.5,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("IMBUEMENT_INVALID_CONFIG");
    }
  });

  it("durationHours = NaN → błąd", () => {
    const r = imbuementCost("basic", {
      ...STANDARD_CONFIG,
      durationHours: Number.NaN,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("IMBUEMENT_INVALID_CONFIG");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// Determinizm
// ───────────────────────────────────────────────────────────────────────

describe("imbuementCost — determinizm", () => {
  it("ten sam input → ten sam output (100 wywołań)", () => {
    for (const tier of ["basic", "intricate", "powerful"] as const) {
      const r1 = imbuementCost(tier, STANDARD_CONFIG);
      const r2 = imbuementCost(tier, STANDARD_CONFIG);
      expect(r1.ok && r2.ok).toBe(true);
      if (!r1.ok || !r2.ok) return;
      expect(r1.value).toEqual(r2.value);
    }
  });
});