/**
 * Testy experience — task 15, ground truth TibiaWiki Experience_Table.
 *
 * **Ground truth**:
 *   - TibiaWiki Experience_Table (https://tibia.fandom.com/wiki/Experience_Table)
 *     formuła CipSoft: 50/3 × (L³ − 6L² + 17L − 12) dla L ≥ 2.
 *   - Punkty kontrolne: L=1→0, L=8→4200, L=50→1 847 300,
 *     L=100→15 694 800, L=200→129 389 800.
 *
 * **Strategia testów**:
 *   - TibiaWiki ground truth dla 8+ levels (1, 8, 50, 100, 200, 500, 1000, 2500).
 *   - `xpForLevel` + `levelForXp` round-trip.
 *   - `xpToTarget` (suma różnic) i `timeToTarget`.
 *   - Walidacja (negative, non-integer, > MAX_LEVEL).
 *   - Deterministyczność.
 */
import { describe, expect, it } from "vitest";
import {
  xpForLevel,
  levelForXp,
  timeToTarget,
  timeToTargetFromXp,
  MAX_LEVEL,
} from "../experience.js";
import { safeXpForLevel, safeXpToTarget, xpToTarget as xpToTargetUtil } from "../../utils/xp-table.js";
import { TIBIA_XP_TABLE_FIXTURES } from "./fixtures.js";

// ──────────────────────────────────────────────────────────────────────────
// xpForLevel — TibiaWiki Experience_Table ground truth
// ──────────────────────────────────────────────────────────────────────────

describe("xpForLevel — TibiaWiki Experience_Table ground truth", () => {
  for (const [level, expectedXp] of TIBIA_XP_TABLE_FIXTURES) {
    it(`L=${level} → ${expectedXp.toString()}n`, () => {
      expect(xpForLevel(level)).toBe(expectedXp);
    });
  }
});

describe("xpForLevel — property testy", () => {
  it("zwraca bigint (nie number)", () => {
    expect(typeof xpForLevel(100)).toBe("bigint");
  });

  it("monotonicznie rosnąca: xpForLevel(L) < xpForLevel(L+1) dla L ∈ [8, 2499]", () => {
    const samples = [8, 50, 100, 200, 500, 999, 1999, 2499];
    for (const L of samples) {
      expect(xpForLevel(L)).toBeLessThan(xpForLevel(L + 1));
    }
  });

  it("rzuca RangeError dla level < 0", () => {
    expect(() => xpForLevel(-1)).toThrow(RangeError);
  });

  it("rzuca RangeError dla level > MAX_LEVEL", () => {
    expect(() => xpForLevel(MAX_LEVEL + 1)).toThrow(RangeError);
  });

  it("rzuca RangeError dla non-integer level", () => {
    expect(() => xpForLevel(100.5)).toThrow(RangeError);
  });

  it("akceptuje level = MAX_LEVEL (2500)", () => {
    expect(typeof xpForLevel(MAX_LEVEL)).toBe("bigint");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// levelForXp — odwrotność xpForLevel (binary search)
// ──────────────────────────────────────────────────────────────────────────

describe("levelForXp — odwrotność xpForLevel", () => {
  it("xpForLevel ↔ levelForXp round-trip (8 leveli)", () => {
    for (const [level, xp] of TIBIA_XP_TABLE_FIXTURES) {
      if (level === 0 || level === 1) continue; // L=1 → xp=0 → level 0
      expect(levelForXp(xp)).toBe(level);
    }
  });

  it("0n XP → level 0", () => {
    expect(levelForXp(0n)).toBe(0);
  });

  it("1 XP poniżej progu → level niższy", () => {
    // xpForLevel(200) = 129_389_800; 129_389_799 → level 199
    expect(levelForXp(129_389_799n)).toBe(199);
  });

  it("XP powyżej MAX → MAX_LEVEL", () => {
    const xp = xpForLevel(MAX_LEVEL) + 1_000_000n;
    expect(levelForXp(xp)).toBe(MAX_LEVEL);
  });

  it("rzuca RangeError dla ujemnego XP", () => {
    expect(() => levelForXp(-1n)).toThrow(RangeError);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// xpToTarget (util) — różnica XP, rzuca RangeError
// ──────────────────────────────────────────────────────────────────────────

describe("xpToTarget — TibiaWiki formuła CipSoft", () => {
  it("L=8 → L=100: 15 690 600n (= xpForLevel(100) − xpForLevel(8))", () => {
    expect(xpToTargetUtil(8, 100)).toBe(15_690_600n);
  });

  it("L=100 → L=200: 113 695 000n (= 129 389 800 − 15 694 800)", () => {
    expect(xpToTargetUtil(100, 200)).toBe(113_695_000n);
  });

  it("L=200 → L=200 → 0n (już tam jesteś)", () => {
    expect(xpToTargetUtil(200, 200)).toBe(0n);
  });

  it("L=200 → L=100 → 0n (już powyżej targetu)", () => {
    expect(xpToTargetUtil(200, 100)).toBe(0n);
  });

  it("rzuca RangeError dla from < 0", () => {
    expect(() => xpToTargetUtil(-1, 100)).toThrow(RangeError);
  });

  it("rzuca RangeError dla to > MAX_LEVEL", () => {
    expect(() => xpToTargetUtil(100, MAX_LEVEL + 1)).toThrow(RangeError);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// timeToTarget + timeToTargetFromXp
// ──────────────────────────────────────────────────────────────────────────

describe("timeToTarget — czas przy zadanym XP/h", () => {
  it("L=100 → L=110 przy 250 000 XP/h → ~76 457s ≈ 21.24h", () => {
    // xpToTarget(100, 110) = xpForLevel(110) − xpForLevel(100)
    // xpForLevel(110) = 50/3 × (110³ − 6×110² + 17×110 − 12)
    //                = 50/3 × (1,331,000 − 72,600 + 1,870 − 12)
    //                = 50/3 × 1,260,258 = 21,004,300
    // xpForLevel(100) = 15,694,800
    // diff = 5,309,500
    // seconds = 5,309,500 × 3600 / 250,000 = 76,456.8
    const r = timeToTarget(100, 110, 250_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.seconds).toBeGreaterThan(70_000);
    expect(r.value.seconds).toBeLessThan(80_000);
    expect(r.value.hours).toBeGreaterThan(20);
    expect(r.value.hours).toBeLessThan(25);
  });

  it("xpPerHour = 0 → błąd EXPERIENCE_INVALID_RATE", () => {
    const r = timeToTarget(100, 110, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("EXPERIENCE_INVALID_RATE");
    }
  });

  it("xpPerHour ujemny → błąd", () => {
    const r = timeToTarget(100, 110, -100);
    expect(r.ok).toBe(false);
  });

  it("xpPerHour nie-integer → błąd", () => {
    const r = timeToTarget(100, 110, 100.5);
    expect(r.ok).toBe(false);
  });

  it("hours = seconds / 3600 (spójność)", () => {
    const r = timeToTarget(8, 100, 100_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.hours).toBeCloseTo(r.value.seconds / 3600, 5);
  });
});

describe("timeToTargetFromXp — wariant z bigint xpNeeded", () => {
  it("5,309,500n XP przy 250 000/h → ~76 457s", () => {
    const r = timeToTargetFromXp(5_309_500n, 250_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.seconds).toBeGreaterThan(70_000);
    expect(r.value.seconds).toBeLessThan(80_000);
  });

  it("xpNeeded = 0n → 0s (instant)", () => {
    const r = timeToTargetFromXp(0n, 100_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.seconds).toBe(0);
  });

  it("xpNeeded ujemny → błąd EXPERIENCE_INVALID_XP", () => {
    const r = timeToTargetFromXp(-1n, 100_000);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("EXPERIENCE_INVALID_XP");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// safeXpForLevel + safeXpToTarget — Result wrapper
// ──────────────────────────────────────────────────────────────────────────

describe("safeXpForLevel + safeXpToTarget — Result wrapper", () => {
  it("safeXpForLevel: poprawny level → { ok: true, value: bigint }", () => {
    const r = safeXpForLevel(100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(15_694_800n);
  });

  it("safeXpForLevel: level > MAX → { ok: false, code: XP_LEVEL_OUT_OF_RANGE }", () => {
    const r = safeXpForLevel(MAX_LEVEL + 1);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("XP_LEVEL_OUT_OF_RANGE");
    }
  });

  it("safeXpToTarget: poprawne wejście → { ok: true }", () => {
    const r = safeXpToTarget(8, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(15_690_600n);
  });

  it("safeXpToTarget: from < 0 → { ok: false, code: XP_LEVEL_OUT_OF_RANGE }", () => {
    const r = safeXpToTarget(-1, 100);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("XP_LEVEL_OUT_OF_RANGE");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Deterministyczność
// ──────────────────────────────────────────────────────────────────────────

describe("experience — determinizm", () => {
  it("xpForLevel jest deterministyczna", () => {
    expect(xpForLevel(100)).toBe(xpForLevel(100));
    expect(xpForLevel(100)).toBe(15_694_800n);
  });

  it("levelForXp jest deterministyczna", () => {
    expect(levelForXp(15_694_800n)).toBe(levelForXp(15_694_800n));
  });
});