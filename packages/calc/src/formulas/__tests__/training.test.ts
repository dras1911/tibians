/**
 * Testy training — task 15, ground truth TibiaWiki Skills_Calculator.
 *
 * **Ground truth**:
 *   - TibiaWiki Skills_Calculator — "select the Regular weapon type. When
 *     selecting the other types the time and cost will be calculated assuming
 *     total usage of the weapons, which may be far superior to the time/cost
 *     required to get a certain skill."
 *     (https://tibia.fandom.com/wiki/Skills_Calculator)
 *   - TibiaWiki Formulae — skill constants (A) + vocation constants (b) +
 *     skill offset (c).
 *
 * **Strategia testów**:
 *   - Walidacja (currentSkill, targetSkill, percentToNext, category).
 *   - Proste property testy (monotoniczność, approximate flag, regular precision).
 *   - Edge cases: percentToNext 0/100, currentSkill 0.
 *   - Deterministyczność (brak Date.now/random).
 */
import { describe, expect, it } from "vitest";
import {
  trainingTime,
  type TrainingOptions,
} from "../training.js";

// ──────────────────────────────────────────────────────────────────────────
// Helper fixture
// ──────────────────────────────────────────────────────────────────────────

function fixture(overrides: Partial<TrainingOptions> = {}): TrainingOptions {
  return {
    category: "knightMelee",
    currentSkill: 100,
    targetSkill: 110,
    percentToNext: 0,
    weaponType: "regular",
    offline: false,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Podstawowe property testy
// ──────────────────────────────────────────────────────────────────────────

describe("trainingTime — podstawowe przypadki", () => {
  it("zwraca { timeSeconds, timeHours, costGp, costTc, hitsRequired, approximate, warning }", () => {
    const r = trainingTime(fixture());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.value.timeSeconds).toBe("number");
    expect(typeof r.value.timeHours).toBe("number");
    expect(typeof r.value.hitsRequired).toBe("number");
    expect(typeof r.value.costGp).toBe("number");
    expect(r.value.costTc).toBe(0);
    expect(r.value.category).toBe("knightMelee");
  });

  it("regular weapon → approximate = false (precyzyjne)", () => {
    const r = trainingTime(fixture({ weaponType: "regular" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.approximate).toBe(false);
  });

  it("durable weapon → approximate = true (TibiaWiki ostrzeżenie)", () => {
    const r = trainingTime(fixture({ weaponType: "durable" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.approximate).toBe(true);
    expect(r.value.warning).toMatch(/TibiaWiki/);
  });

  it("lasting weapon → approximate = true (TibiaWiki ostrzeżenie)", () => {
    const r = trainingTime(fixture({ weaponType: "lasting" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.approximate).toBe(true);
    expect(r.value.warning).toMatch(/TibiaWiki/);
  });

  it("większy level range → więcej hits (monotoniczność)", () => {
    const small = trainingTime(
      fixture({ currentSkill: 100, targetSkill: 105 }),
    );
    const large = trainingTime(
      fixture({ currentSkill: 100, targetSkill: 120 }),
    );
    expect(small.ok && large.ok).toBe(true);
    if (!small.ok || !large.ok) return;
    expect(large.value.hitsRequired).toBeGreaterThan(small.value.hitsRequired);
  });

  it("percentToNext=100 zwiększa hits vs percentToNext=0 (Tibia convention)", () => {
    // Tibia konwencja: percentToNext = % REMAINING XP. 100% = 0 XP
    // progress = gracz zaczyna od zera w levelu. 0% = gracz ma pełne XP
    // = jest na Tp(L+1). Zatem percentToNext=100 wymaga więcej hits.
    const p0 = trainingTime(fixture({ percentToNext: 0 }));
    const p100 = trainingTime(fixture({ percentToNext: 100 }));
    expect(p0.ok && p100.ok).toBe(true);
    if (!p0.ok || !p100.ok) return;
    expect(p100.value.hitsRequired).toBeGreaterThan(p0.value.hitsRequired);
  });

  it("percentToNext=99 zwiększa hits vs percentToNext=0", () => {
    const p0 = trainingTime(fixture({ percentToNext: 0 }));
    const p99 = trainingTime(fixture({ percentToNext: 99 }));
    expect(p0.ok && p99.ok).toBe(true);
    if (!p0.ok || !p99.ok) return;
    expect(p99.value.hitsRequired).toBeGreaterThanOrEqual(p0.value.hitsRequired);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Różne vocation/skill categories
// ──────────────────────────────────────────────────────────────────────────

describe("trainingTime — różne pary vocation/skill (arch. §2.1)", () => {
  it("knightMelee (sword, A=50, b=1.1)", () => {
    const r = trainingTime(fixture({ category: "knightMelee" }));
    expect(r.ok).toBe(true);
  });

  it("knightShielding (shielding, A=100, b=1.1)", () => {
    const r = trainingTime(
      fixture({ category: "knightShielding", targetSkill: 105 }),
    );
    expect(r.ok).toBe(true);
  });

  it("knightMagic (magic, A=1600, b=3.0 — wolne)", () => {
    const r = trainingTime(
      fixture({ category: "knightMagic", targetSkill: 105 }),
    );
    expect(r.ok).toBe(true);
  });

  it("paladinDistance (distance, A=30, b=1.1)", () => {
    const r = trainingTime(
      fixture({ category: "paladinDistance", targetSkill: 105 }),
    );
    expect(r.ok).toBe(true);
  });

  it("mageMagic (druid/sorcerer, magic, A=1600, b=1.1)", () => {
    const r = trainingTime(
      fixture({ category: "mageMagic", targetSkill: 105 }),
    );
    expect(r.ok).toBe(true);
  });

  it("monkFist (fist, A=50, b=1.1)", () => {
    const r = trainingTime(
      fixture({ category: "monkFist", targetSkill: 105 }),
    );
    expect(r.ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Walidacja
// ──────────────────────────────────────────────────────────────────────────

describe("trainingTime — walidacja inputu", () => {
  it("currentSkill ujemny → błąd TRAINING_INVALID_CURRENT", () => {
    const r = trainingTime(fixture({ currentSkill: -5 }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("TRAINING_INVALID_CURRENT");
    }
  });

  it("currentSkill nie-integer → błąd", () => {
    const r = trainingTime(fixture({ currentSkill: 10.5 }));
    expect(r.ok).toBe(false);
  });

  it("targetSkill = 0 → błąd TRAINING_INVALID_TARGET", () => {
    const r = trainingTime(fixture({ targetSkill: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("TRAINING_INVALID_TARGET");
    }
  });

  it("targetSkill === currentSkill → błąd TRAINING_TARGET_LOWER", () => {
    const r = trainingTime(fixture({ currentSkill: 50, targetSkill: 50 }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("TRAINING_TARGET_LOWER");
    }
  });

  it("percentToNext > 100 → błąd TRAINING_INVALID_PERCENT", () => {
    const r = trainingTime(fixture({ percentToNext: 150 }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("TRAINING_INVALID_PERCENT");
    }
  });

  it("percentToNext < 0 → błąd TRAINING_INVALID_PERCENT", () => {
    const r = trainingTime(fixture({ percentToNext: -10 }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("TRAINING_INVALID_PERCENT");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Edge cases + determinizm
// ──────────────────────────────────────────────────────────────────────────

describe("trainingTime — edge cases i determinizm", () => {
  it("currentSkill = 0 → brak efektu początkowego (offline training start)", () => {
    const r = trainingTime(
      fixture({ currentSkill: 0, targetSkill: 10, percentToNext: 0 }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.hitsRequired).toBeGreaterThan(0);
    expect(r.value.timeSeconds).toBeGreaterThan(0);
  });

  it("offline = true nie zmienia wyniku (bo koszt = 0, Faza 2/T18 doda stamina)", () => {
    const online = trainingTime(fixture({ offline: false }));
    const offline = trainingTime(fixture({ offline: true }));
    expect(online.ok && offline.ok).toBe(true);
    if (!online.ok || !offline.ok) return;
    expect(online.value.costGp).toBe(offline.value.costGp);
    expect(online.value.costTc).toBe(offline.value.costTc);
    expect(online.value.timeSeconds).toBe(offline.value.timeSeconds);
  });

  it("funkcja jest deterministyczna (ten sam input → ten sam output)", () => {
    const f = fixture();
    const r1 = trainingTime(f);
    const r2 = trainingTime(f);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value.timeSeconds).toBe(r2.value.timeSeconds);
    expect(r1.value.hitsRequired).toBe(r2.value.hitsRequired);
  });

  it("timeHours = timeSeconds / 3600 (spójność)", () => {
    const r = trainingTime(fixture());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expectedHours = r.value.timeSeconds / 3600;
    expect(Math.abs(r.value.timeHours - expectedHours)).toBeLessThan(0.01);
  });
});