/**
 * Testy xpForLevel + levelForXp — task 14.
 *
 * Ground truth: TibiaWiki Experience Table (https://tibia.fandom.com/wiki/Experience_Table).
 *
 * Wzór CipSoft: (50L³)/3 − 100L² + (850L)/3 − 200 dla L ≥ 2
 *
 * Równoważna forma (użyta w implementacji): 50/3 × (L³ − 6L² + 17L − 12)
 *
 * Kluczowe punkty kontrolne (TibiaWiki Experience_Table, zweryfikowane 2026-09):
 *   L=2    → 100
 *   L=8    → 4 200
 *   L=50   → 1 847 300
 *   L=100  → 15 694 800
 *   L=200  → 129 389 800
 *   L=500  → 2 058 474 800
 */
import { describe, expect, it } from "vitest";
import {
  MAX_LEVEL,
  levelForXp,
  safeXpForLevel,
  xpForLevel,
} from "../../index.js";

// ──────────────────────────────────────────────────────────────────────────
// xpForLevel — formuła Tibia (TibiaWiki ground truth)
// ──────────────────────────────────────────────────────────────────────────

describe("xpForLevel — formuła Tibia (TibiaWiki ground truth)", () => {
  it("L=0 → 0n", () => {
    expect(xpForLevel(0)).toBe(0n);
  });

  it("L=1 → 0n (formuła daje ≤ 0 dla L < 2)", () => {
    expect(xpForLevel(1)).toBe(0n);
  });

  it("L=2 → 100n (TibiaWiki)", () => {
    expect(xpForLevel(2)).toBe(100n);
  });

  it("L=8 → 4 200n (TibiaWiki — minimalny level gracza)", () => {
    expect(xpForLevel(8)).toBe(4_200n);
  });

  it("L=50 → 1 847 300n (TibiaWiki)", () => {
    expect(xpForLevel(50)).toBe(1_847_300n);
  });

  it("L=100 → 15 694 800n (TibiaWiki)", () => {
    expect(xpForLevel(100)).toBe(15_694_800n);
  });

  it("L=200 → 129 389 800n (TibiaWiki — popularny benchmark)", () => {
    expect(xpForLevel(200)).toBe(129_389_800n);
  });

  it("L=500 → 2 058 474 800n (formuła CipSoft)", () => {
    // Wartość zweryfikowana analitycznie z zamkniętego wzoru CipSoft:
    //   50/3 × (500³ − 6×500² + 17×500 − 12)
    // = 50/3 × (125 000 000 − 1 500 000 + 8 500 − 12)
    // = 50/3 × 123 508 488
    // = 2 058 474 800
    // TibiaWiki Experience_Table potwierdza wzór dla L=8/50/100/200;
    // L=500 wpada w zakres wzoru zamkniętego (formuła stała dla L ≥ 2).
    expect(xpForLevel(500)).toBe(2_058_474_800n);
  });

  it("zwraca bigint (nie number)", () => {
    expect(typeof xpForLevel(100)).toBe("bigint");
  });

  it("funkcja jest deterministyczna (ten sam input → ten sam output)", () => {
    expect(xpForLevel(100)).toBe(xpForLevel(100));
    expect(xpForLevel(100)).toBe(15_694_800n);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// xpForLevel — walidacja inputu
// ──────────────────────────────────────────────────────────────────────────

describe("xpForLevel — walidacja inputu", () => {
  it("rzuca RangeError dla level < 0", () => {
    expect(() => xpForLevel(-1)).toThrow(RangeError);
  });

  it("rzuca RangeError dla level > MAX_LEVEL", () => {
    expect(() => xpForLevel(MAX_LEVEL + 1)).toThrow(RangeError);
  });

  it("rzuca RangeError dla level nie-integer", () => {
    expect(() => xpForLevel(100.5)).toThrow(RangeError);
  });

  it("rzuca RangeError dla NaN", () => {
    expect(() => xpForLevel(Number.NaN)).toThrow(RangeError);
  });

  it("akceptuje level === MAX_LEVEL (2500)", () => {
    // Nie rzuca, zwraca bigint
    expect(typeof xpForLevel(MAX_LEVEL)).toBe("bigint");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// levelForXp — binary search (odwrotność xpForLevel)
// ──────────────────────────────────────────────────────────────────────────

describe("levelForXp — binary search (odwrotność xpForLevel)", () => {
  it("0n XP → level 0", () => {
    expect(levelForXp(0n)).toBe(0);
  });

  it("100n XP (= xpForLevel(2)) → level 2", () => {
    expect(levelForXp(100n)).toBe(2);
  });

  it("4 200n XP (= xpForLevel(8)) → level 8", () => {
    expect(levelForXp(4_200n)).toBe(8);
  });

  it("15 694 800n XP (= xpForLevel(100)) → level 100", () => {
    expect(levelForXp(15_694_800n)).toBe(100);
  });

  it("129 389 800n XP (= xpForLevel(200)) → level 200", () => {
    expect(levelForXp(129_389_800n)).toBe(200);
  });

  it("1 XP poniżej progu → level niższy", () => {
    // xpForLevel(200) = 129_389_800
    // 129_389_799 → level 199
    expect(levelForXp(129_389_799n)).toBe(199);
  });

  it("XP między progami → floor do niższego levelu", () => {
    // xpForLevel(8) = 4_200, xpForLevel(9) = ?
    // 4_300 XP → level 8 (bo 4300 < xpForLevel(9))
    expect(levelForXp(4_300n)).toBe(8);
  });

  it("bardzo duży XP (> xpForLevel(MAX_LEVEL)) → MAX_LEVEL", () => {
    // XP powyżej progu MAX → zwraca MAX
    const veryBig = xpForLevel(MAX_LEVEL) + 1_000_000n;
    expect(levelForXp(veryBig)).toBe(MAX_LEVEL);
  });

  it("zwraca number (nie bigint)", () => {
    expect(typeof levelForXp(100n)).toBe("number");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// levelForXp — walidacja
// ──────────────────────────────────────────────────────────────────────────

describe("levelForXp — walidacja inputu", () => {
  it("rzuca RangeError dla ujemnego XP", () => {
    expect(() => levelForXp(-1n)).toThrow(RangeError);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// xpForLevel ↔ levelForXp — round-trip
// ──────────────────────────────────────────────────────────────────────────

describe("xpForLevel ↔ levelForXp — round-trip", () => {
  it("levelForXp(xpForLevel(L)) === L dla L ∈ [8, MAX_LEVEL]", () => {
    for (const L of [8, 50, 100, 200, 500, 1000, 1500, 2000, 2500]) {
      const xp = xpForLevel(L);
      expect(levelForXp(xp)).toBe(L);
    }
  });

  it("xpForLevel(levelForXp(xp)) ≤ xp (monotoniczność)", () => {
    // Niezmiennik: levelForXp(xp) = L wtw. xpForLevel(L) ≤ xp < xpForLevel(L+1).
    // Tutaj weryfikujemy lewą stronę nierówności: xpForLevel(L) nigdy nie
    // przekracza xp (bo L to najwyższy osiągalny level przy danym XP).
    const samples = [100n, 4_200n, 50_000n, 1_000_000n, 50_000_000n];
    for (const xp of samples) {
      const L = levelForXp(xp);
      expect(xpForLevel(L) <= xp).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// safeXpForLevel — Result wrapper
// ──────────────────────────────────────────────────────────────────────────

describe("safeXpForLevel — Result wrapper", () => {
  it("poprawny input → { ok: true, value: bigint }", () => {
    const result = safeXpForLevel(100);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(15_694_800n);
    }
  });

  it("niepoprawny input (level > MAX) → { ok: false, error: ValidationError }", () => {
    const result = safeXpForLevel(MAX_LEVEL + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("XP_LEVEL_OUT_OF_RANGE");
      expect(typeof result.error.message).toBe("string");
    }
  });

  it("niepoprawny input (level < 0) → { ok: false, ... }", () => {
    const result = safeXpForLevel(-5);
    expect(result.ok).toBe(false);
  });

  it("niepoprawny input (float) → { ok: false, ... }", () => {
    const result = safeXpForLevel(50.5);
    expect(result.ok).toBe(false);
  });
});
