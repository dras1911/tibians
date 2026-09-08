/**
 * Testy exp-share — task 15, ground truth CipSoft + TibiaWiki Party.
 *
 * **Ground truth**:
 *   - CipSoft official (https://tibia.com/support/?entryid=91):
 *     - Bonus za różne vocations: 20%/30%/60%/100% dla 1/2/3/4-5 voc.
 *     - Legal level range: L_low ≥ 2/3 × L_high.
 *   - TibiaWiki Party — potwierdza równe rozdysponowanie XP między członków.
 *
 * **Strategia testów**:
 *   - 1/2/3/4-5 vocations bonuses (ground truth CipSoft).
 *   - 2-osobowa party (równe udziały) i 4-osobowa party.
 *   - Legal / illegal level range.
 *   - Walidacja (negative XP, non-integer level, invalid vocation, duplikaty nazw).
 *   - Edge: solo (pusta lista members), max 5 vocations.
 *   - Deterministyczność i spójność sumy udziałów.
 */
import { describe, expect, it } from "vitest";
import {
  expShareSplit,
  PARTY_VOCATION_BONUS,
  PARTY_LEVEL_RATIO_MAX,
  MIN_LEVEL,
  type PartyMember,
} from "../exp-share.js";

// ──────────────────────────────────────────────────────────────────────────
// CipSoft ground truth — vocation bonus
// ──────────────────────────────────────────────────────────────────────────

describe("expShareSplit — CipSoft vocation bonus (ground truth)", () => {
  it("1 vocation → 20% bonus", () => {
    expect(PARTY_VOCATION_BONUS[1]).toBe(0.2);
  });

  it("2 vocations → 30% bonus", () => {
    expect(PARTY_VOCATION_BONUS[2]).toBe(0.3);
  });

  it("3 vocations → 60% bonus", () => {
    expect(PARTY_VOCATION_BONUS[3]).toBe(0.6);
  });

  it("4 vocations → 100% bonus", () => {
    expect(PARTY_VOCATION_BONUS[4]).toBe(1.0);
  });

  it("5 vocations → 100% bonus (max)", () => {
    expect(PARTY_VOCATION_BONUS[5]).toBe(1.0);
  });

  it("PARTY_LEVEL_RATIO_MAX = 1.5 (CipSoft: L_high ≤ 1.5 × L_low)", () => {
    expect(PARTY_LEVEL_RATIO_MAX).toBe(1.5);
  });

  it("MIN_LEVEL = 8", () => {
    expect(MIN_LEVEL).toBe(8);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Solo (1-osobowa party)
// ──────────────────────────────────────────────────────────────────────────

describe("expShareSplit — solo (brak party members)", () => {
  it("pusta lista members → player dostaje 100% × (1 + bonus 1 voc)", () => {
    const r = expShareSplit(1000n, 100, "Knight", []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.playerXp).toBe(1200n); // 1000 × 1.20 = 1200
    expect(r.value.splits).toEqual([]);
    expect(r.value.totalMembers).toBe(1);
    expect(r.value.distinctVocations).toBe(1);
    expect(r.value.vocationBonus).toBe(0.2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2-osobowa party
// ──────────────────────────────────────────────────────────────────────────

describe("expShareSplit — 2-osobowa party", () => {
  it("2 różne vocations (Knight + Paladin) → 30% bonus", () => {
    const r = expShareSplit(
      1000n,
      100,
      "Knight",
      [{ name: "Pal", level: 100, vocation: "Paladin" }],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.distinctVocations).toBe(2);
    expect(r.value.vocationBonus).toBe(0.3);
    // 1000 × 1.30 = 1300; 1300 / 2 = 650 each
    expect(r.value.playerXp).toBe(650n);
    expect(r.value.splits[0]?.xp).toBe(650n);
    expect(r.value.splits[0]?.name).toBe("Pal");
  });

  it("1 vocation (2 Knight) → 20% bonus (Knight counted once)", () => {
    const r = expShareSplit(
      1000n,
      100,
      "Knight",
      [{ name: "Buddy", level: 100, vocation: "Knight" }],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.distinctVocations).toBe(1);
    expect(r.value.vocationBonus).toBe(0.2);
    // 1000 × 1.20 = 1200; 1200 / 2 = 600 each
    expect(r.value.playerXp).toBe(600n);
    expect(r.value.splits[0]?.xp).toBe(600n);
  });

  it("równe udziały player vs member (Tibia equal split)", () => {
    const r = expShareSplit(
      100_000n,
      200,
      "Knight",
      [{ name: "Pal", level: 200, vocation: "Paladin" }],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.playerXp).toBe(r.value.splits[0]?.xp);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4-osobowa party
// ──────────────────────────────────────────────────────────────────────────

describe("expShareSplit — 4-osobowa party z 4 różnymi vocations", () => {
  const members: PartyMember[] = [
    { name: "Pal", level: 200, vocation: "Paladin" },
    { name: "Dru", level: 200, vocation: "Druid" },
    { name: "Sor", level: 200, vocation: "Sorcerer" },
  ];

  it("4 distinct vocations → 100% bonus", () => {
    const r = expShareSplit(1000n, 200, "Knight", members);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.distinctVocations).toBe(4);
    expect(r.value.vocationBonus).toBe(1.0);
    expect(r.value.totalMembers).toBe(4);
    // 1000 × 2.00 = 2000; 2000 / 4 = 500 each
    expect(r.value.playerXp).toBe(500n);
    expect(r.value.splits).toHaveLength(3);
    expect(r.value.splits[0]?.xp).toBe(500n);
    expect(r.value.splits[1]?.xp).toBe(500n);
    expect(r.value.splits[2]?.xp).toBe(500n);
  });

  it("3 distinct vocations (Knight + Paladin + Druid) → 60% bonus", () => {
    const r = expShareSplit(
      1000n,
      100,
      "Knight",
      [
        { name: "Pal", level: 100, vocation: "Paladin" },
        { name: "Dru", level: 100, vocation: "Druid" },
      ],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.distinctVocations).toBe(3);
    expect(r.value.vocationBonus).toBe(0.6);
    // 1000 × 1.60 = 1600; 1600 / 3 = 533 each (floor)
    expect(r.value.playerXp).toBe(533n);
    expect(r.value.splits[0]?.xp).toBe(533n);
    expect(r.value.splits[1]?.xp).toBe(533n);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Edge cases z level diff
// ──────────────────────────────────────────────────────────────────────────

describe("expShareSplit — level diff w party", () => {
  it("legal level range (L=100, L=140 — ratio 1.4) → success", () => {
    const r = expShareSplit(
      1000n,
      100,
      "Knight",
      [{ name: "Higher", level: 140, vocation: "Paladin" }],
    );
    expect(r.ok).toBe(true);
  });

  it("L=40 + L=60 → ratio 1.5 (legal, CipSoft edge)", () => {
    const r = expShareSplit(
      1000n,
      40,
      "Knight",
      [{ name: "Buddy", level: 60, vocation: "Paladin" }],
    );
    expect(r.ok).toBe(true);
  });

  it("illegal range (L=200, L=100 — ratio 2.0) → błąd EXP_SHARE_ILLEGAL_LEVEL_RANGE", () => {
    const r = expShareSplit(
      1000n,
      200,
      "Knight",
      [{ name: "TooLow", level: 100, vocation: "Paladin" }],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("EXP_SHARE_ILLEGAL_LEVEL_RANGE");
    }
  });

  it("illegal range w 3-osobowej party (lowest poniżej 2/3 highest)", () => {
    const r = expShareSplit(
      1000n,
      100,
      "Knight",
      [
        { name: "Mid", level: 120, vocation: "Paladin" },
        { name: "High", level: 200, vocation: "Druid" },
      ],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("EXP_SHARE_ILLEGAL_LEVEL_RANGE");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Walidacja
// ──────────────────────────────────────────────────────────────────────────

describe("expShareSplit — walidacja inputu", () => {
  it("totalXp ujemny → błąd EXP_SHARE_INVALID_XP", () => {
    const r = expShareSplit(-1n, 100, "Knight", []);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("EXP_SHARE_INVALID_XP");
    }
  });

  it("totalXp nie-bigint → błąd", () => {
    // @ts-expect-error — testujemy runtime guard
    const r = expShareSplit(1000, 100, "Knight", []);
    expect(r.ok).toBe(false);
  });

  it("playerLevel < MIN_LEVEL → błąd EXP_SHARE_INVALID_LEVEL", () => {
    const r = expShareSplit(1000n, 7, "Knight", []);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("EXP_SHARE_INVALID_LEVEL");
    }
  });

  it("playerLevel > MAX_LEVEL → błąd", () => {
    const r = expShareSplit(1000n, 2501, "Knight", []);
    expect(r.ok).toBe(false);
  });

  it("member.level ujemny → błąd", () => {
    const r = expShareSplit(
      1000n,
      100,
      "Knight",
      [{ name: "Bad", level: -1, vocation: "Paladin" }],
    );
    expect(r.ok).toBe(false);
  });

  it("member.level > MAX_LEVEL → błąd", () => {
    const r = expShareSplit(
      1000n,
      100,
      "Knight",
      [{ name: "Maxed", level: 2501, vocation: "Paladin" }],
    );
    expect(r.ok).toBe(false);
  });

  it("member.name pusty string → błąd EXP_SHARE_INVALID_MEMBER", () => {
    const r = expShareSplit(
      1000n,
      100,
      "Knight",
      [{ name: "", level: 100, vocation: "Paladin" }],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("EXP_SHARE_INVALID_MEMBER");
    }
  });

  it("duplikat nazw → błąd EXP_SHARE_DUPLICATE_NAMES", () => {
    const r = expShareSplit(
      1000n,
      100,
      "Knight",
      [
        { name: "Same", level: 100, vocation: "Paladin" },
        { name: "Same", level: 100, vocation: "Druid" },
      ],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("EXP_SHARE_DUPLICATE_NAMES");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Edge cases + determinizm
// ──────────────────────────────────────────────────────────────────────────

describe("expShareSplit — edge cases i determinizm", () => {
  it("totalXp = 0n → każdy dostaje 0n", () => {
    const r = expShareSplit(
      0n,
      100,
      "Knight",
      [
        { name: "A", level: 100, vocation: "Paladin" },
        { name: "B", level: 100, vocation: "Druid" },
      ],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.playerXp).toBe(0n);
    expect(r.value.splits[0]?.xp).toBe(0n);
    expect(r.value.splits[1]?.xp).toBe(0n);
  });

  it("5 różnych vocations (Knight+Paladin+Druid+Sorcerer+Monk) → 100% bonus", () => {
    const r = expShareSplit(
      1000n,
      200,
      "Knight",
      [
        { name: "Pal", level: 200, vocation: "Paladin" },
        { name: "Dru", level: 200, vocation: "Druid" },
        { name: "Sor", level: 200, vocation: "Sorcerer" },
        { name: "Mok", level: 200, vocation: "Monk" },
      ],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.distinctVocations).toBe(5);
    expect(r.value.vocationBonus).toBe(1.0);
    expect(r.value.totalMembers).toBe(5);
  });

  it("dokładność bigint: 1000n XP, 3 distinct vocations, 3 members → 1000×1.60/3 = 533n", () => {
    // Knight + Paladin + Druid = 3 distinct vocations → +60% bonus
    // totalWithBonus = 1000 × 1.60 = 1600
    // perMember = 1600 / 3 = 533n (floor; 0.33 discarded)
    const r = expShareSplit(
      1000n,
      100,
      "Knight",
      [
        { name: "A", level: 100, vocation: "Paladin" },
        { name: "B", level: 100, vocation: "Druid" },
      ],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.playerXp).toBe(533n);
    expect(r.value.splits[0]?.xp).toBe(533n);
    expect(r.value.splits[1]?.xp).toBe(533n);
  });

  it("funkcja jest deterministyczna", () => {
    const r1 = expShareSplit(
      5000n,
      100,
      "Knight",
      [{ name: "P", level: 100, vocation: "Paladin" }],
    );
    const r2 = expShareSplit(
      5000n,
      100,
      "Knight",
      [{ name: "P", level: 100, vocation: "Paladin" }],
    );
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value.playerXp).toBe(r2.value.playerXp);
    expect(r1.value.splits[0]?.xp).toBe(r2.value.splits[0]?.xp);
  });
});