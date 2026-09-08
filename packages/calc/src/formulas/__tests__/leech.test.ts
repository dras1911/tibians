/**
 * Testy leech — task 15, ground truth TibiaWiki + CipSoft.
 *
 * **Ground truth**:
 *   - CipSoft official: legal level range L_low ≥ 2/3 × L_high
 *     (https://tibia.com/support/?entryid=91).
 *   - TibiaWiki Party: przykłady 40+60, 200+300 są legal; 200+100, 40+20 illegal.
 *
 * **Community convention (assumption)**:
 *   - "Leech reduction per level diff" — NIE TibiaWiki, ale community rule of
 *     thumb: niższy level w party dostaje lekko mniej XP. Implementacja
 *     modeluje to jako `share = 50% × (1 − levelDiff × reductionPerLevel)`.
 *   - Default reduction = 5% per level diff (konfigurowalne przez options).
 *
 * **Strategia testów**:
 *   - Ground truth CipSoft (legal/illegal level range).
 *   - Property: same level = 50%, leech upward = 0%, leech downward > 0.
 *   - Walidacja (negative level, > MAX_LEVEL, invalid reductionPerLevel).
 *   - Edge: level = MIN_LEVEL=8, level = MAX_LEVEL=2500.
 */
import { describe, expect, it } from "vitest";
import {
  leechPercent,
  LEECH_BASE_SHARE_PCT,
  LEECH_LEVEL_RATIO_MAX,
  LEECH_MIN_SHARE_PCT,
  LEECH_REDUCTION_PER_LEVEL_DEFAULT,
  MIN_LEVEL,
  type LeechOptions,
} from "../leech.js";

// ──────────────────────────────────────────────────────────────────────────
// Ground truth CipSoft — legal level range
// ──────────────────────────────────────────────────────────────────────────

describe("leechPercent — Tibia legal level range (CipSoft)", () => {
  it("40+60 → ratio 1.5 → LEGAL (TibiaWiki Party przykład)", () => {
    const r = leechPercent(40, 60, "Knight");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.withinLegalRange).toBe(true);
  });

  it("200+300 → ratio 1.5 → LEGAL (popular benchmark)", () => {
    const r = leechPercent(200, 300, "Knight");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.withinLegalRange).toBe(true);
  });

  it("200+100 → ratio 2.0 → ILLEGAL (TibiaWiki: level 100 cannot share with 200)", () => {
    const r = leechPercent(200, 100, "Knight");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.withinLegalRange).toBe(false);
    expect(r.value.sharePct).toBe(0);
  });

  it("40+20 → ratio 2.0 → ILLEGAL (TibiaWiki: level 40 cannot share with 20)", () => {
    const r = leechPercent(40, 20, "Knight");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.withinLegalRange).toBe(false);
    expect(r.value.sharePct).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Property testy — share %
// ──────────────────────────────────────────────────────────────────────────

describe("leechPercent — property testy share %", () => {
  it("ten sam level → 50% (Tibia equal split, equalSplit=true)", () => {
    const r = leechPercent(100, 100, "Knight");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sharePct).toBe(LEECH_BASE_SHARE_PCT);
    expect(r.value.equalSplit).toBe(true);
  });

  it("solo (postac = party member, level 200) → 50%", () => {
    const r = leechPercent(200, 200, "Elite Knight" as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sharePct).toBe(50);
    expect(r.value.equalSplit).toBe(true);
  });

  it("leech upward (characterLevel < partyMemberLevel) → 0% (community convention)", () => {
    const r = leechPercent(100, 110, "Knight");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.isLeechUpward).toBe(true);
    expect(r.value.sharePct).toBe(0);
  });

  it("różnica 10 leveli w dół (110→100, default reduction 5%/lvl) → 0% (50 − 10×2.5 = 25%, ale floor do 0)", () => {
    // 50 − 10×0.05×50 = 50 − 25 = 25%
    const r = leechPercent(110, 100, "Knight");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sharePct).toBeCloseTo(25, 5);
    expect(r.value.levelDiff).toBe(10);
  });

  it("różnica 1 level w dół (101→100, default reduction 5%/lvl) → 47.5%", () => {
    // 50 − 1×0.05×50 = 50 − 2.5 = 47.5%
    const r = leechPercent(101, 100, "Knight");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sharePct).toBeCloseTo(47.5, 5);
    expect(r.value.levelDiff).toBe(1);
  });

  it("większy level diff → mniejszy share (monotoniczność)", () => {
    const d1 = leechPercent(101, 100, "Knight");
    const d5 = leechPercent(105, 100, "Knight");
    expect(d1.ok && d5.ok).toBe(true);
    if (!d1.ok || !d5.ok) return;
    expect(d5.value.sharePct).toBeLessThan(d1.value.sharePct);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Custom reductionPerLevel
// ──────────────────────────────────────────────────────────────────────────

describe("leechPercent — reductionPerLevel custom", () => {
  const opts: LeechOptions = { reductionPerLevel: 0.10 };

  it("reductionPerLevel = 10% → szybsza redukcja", () => {
    // 50 − 1×0.10×50 = 45%
    const r = leechPercent(101, 100, "Knight", opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sharePct).toBeCloseTo(45, 5);
  });

  it("reductionPerLevel = 0% → brak redukcji (zawsze 50%)", () => {
    const r = leechPercent(105, 100, "Knight", { reductionPerLevel: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sharePct).toBe(50);
    expect(r.value.equalSplit).toBe(false);
  });

  it("reductionPerLevel = 1.0 → share floor do 0 szybko", () => {
    const r = leechPercent(101, 100, "Knight", { reductionPerLevel: 1.0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sharePct).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Walidacja
// ──────────────────────────────────────────────────────────────────────────

describe("leechPercent — walidacja inputu", () => {
  it("characterLevel = 0 → błąd LEECH_INVALID_LEVEL", () => {
    const r = leechPercent(0, 100, "Knight");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("LEECH_INVALID_LEVEL");
    }
  });

  it("characterLevel < MIN_LEVEL → błąd", () => {
    const r = leechPercent(MIN_LEVEL - 1, 100, "Knight");
    expect(r.ok).toBe(false);
  });

  it("characterLevel > MAX_LEVEL → błąd", () => {
    const r = leechPercent(2501, 100, "Knight");
    expect(r.ok).toBe(false);
  });

  it("characterLevel = 100.5 (float) → błąd", () => {
    const r = leechPercent(100.5, 100, "Knight");
    expect(r.ok).toBe(false);
  });

  it("characterLevel = NaN → błąd", () => {
    const r = leechPercent(Number.NaN, 100, "Knight");
    expect(r.ok).toBe(false);
  });

  it("partyMemberLevel = 0 → błąd LEECH_INVALID_LEVEL", () => {
    const r = leechPercent(100, 0, "Knight");
    expect(r.ok).toBe(false);
  });

  it("partyMemberLevel > MAX_LEVEL → błąd", () => {
    const r = leechPercent(100, 2501, "Knight");
    expect(r.ok).toBe(false);
  });

  it("reductionPerLevel = 1.5 (poza zakresem) → błąd LEECH_INVALID_OPTIONS", () => {
    const r = leechPercent(100, 100, "Knight", { reductionPerLevel: 1.5 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("LEECH_INVALID_OPTIONS");
    }
  });

  it("reductionPerLevel = -0.1 (ujemny) → błąd", () => {
    const r = leechPercent(100, 100, "Knight", { reductionPerLevel: -0.1 });
    expect(r.ok).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Edge cases + determinizm
// ──────────────────────────────────────────────────────────────────────────

describe("leechPercent — edge cases i determinizm", () => {
  it("MIN_LEVEL = 8 (Tibia: minimalny level gracza)", () => {
    expect(MIN_LEVEL).toBe(8);
  });

  it("LEECH_LEVEL_RATIO_MAX = 1.5 (CipSoft official: 2/3 ratio)", () => {
    expect(LEECH_LEVEL_RATIO_MAX).toBe(1.5);
  });

  it("LEECH_BASE_SHARE_PCT = 50 (Tibia equal split)", () => {
    expect(LEECH_BASE_SHARE_PCT).toBe(50);
  });

  it("LEECH_REDUCTION_PER_LEVEL_DEFAULT = 0.05 (5%/poziom — community assumption)", () => {
    expect(LEECH_REDUCTION_PER_LEVEL_DEFAULT).toBe(0.05);
  });

  it("LEECH_MIN_SHARE_PCT = 0", () => {
    expect(LEECH_MIN_SHARE_PCT).toBe(0);
  });

  it("min level (8,8) → 50% (edge case)", () => {
    const r = leechPercent(8, 8, "Knight");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sharePct).toBe(50);
  });

  it("max level (2500,2500) → 50% (edge case)", () => {
    const r = leechPercent(2500, 2500, "Knight");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sharePct).toBe(50);
  });

  it("funkcja jest deterministyczna", () => {
    const r1 = leechPercent(150, 160, "Knight");
    const r2 = leechPercent(150, 160, "Knight");
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value.sharePct).toBe(r2.value.sharePct);
  });

  it("vocation parameter jest akceptowany (5 wariantów — nie wpływa na wynik)", () => {
    const vocations = ["Knight", "Paladin", "Druid", "Sorcerer", "Monk"] as const;
    for (const voc of vocations) {
      const r = leechPercent(100, 100, voc);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      // Tibia nie różnicuje XP share per vocation; wynik taki sam.
      expect(r.value.sharePct).toBe(50);
    }
  });
});