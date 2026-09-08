/**
 * Testy getCurrentSkill — task 14.
 *
 * Weryfikacja, że helper poprawnie wyciąga `snapshot.skills[skillKey].base`
 * dla danej kategorii vocation/skill (arch. §2.1).
 */
import { describe, expect, it } from "vitest";
import type { CharacterSnapshot } from "@tibians/character-context";
import { getCurrentSkill } from "../../index.js";

// ──────────────────────────────────────────────────────────────────────────
// Fixture
// ──────────────────────────────────────────────────────────────────────────

function fixture(skills: CharacterSnapshot["skills"]): CharacterSnapshot {
  return {
    source: { kind: "manual" },
    identity: {
      name: "Tester",
      level: 100,
      vocation: "Knight",
      vocationPromoted: "Elite Knight",
      sex: "M",
    },
    skills,
    progression: {
      charmPoints: 0,
      charmPointsUnused: 0,
      minorCharmEchoes: 0,
      bossPoints: 0,
      questsCompleted: 0,
      questsTotal: 0,
      imbuementsUnlocked: 0,
      imbuementsTotal: 0,
      achievementPoints: 0,
      animusMasteries: 0,
    },
    assets: {
      items: [],
      outfits: [],
      mounts: [],
      gems: { lesser: 0, regular: 0, greater: 0 },
      goldTotal: 0,
      storeCounts: { outfits: 0, mounts: 0, items: 0 },
      hirelings: 0,
    },
    flags: {
      soulWar: false,
      primalOrdeal: false,
      worldTransfer: false,
      preySlot: false,
      charmExpansion: false,
      weeklyTaskExpansion: false,
      twistOfFate: false,
      blessingsActive: 0,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// getCurrentSkill
// ──────────────────────────────────────────────────────────────────────────

describe("getCurrentSkill — zwraca bazowy skill (bez loyalty)", () => {
  it("knightMelee → skills.sword.base", () => {
    const snap = fixture({
      magic: { base: 10 },
      club: { base: 0 },
      fist: { base: 0 },
      sword: { base: 120 },
      axe: { base: 0 },
      distance: { base: 0 },
      shielding: { base: 90 },
      fishing: { base: 0 },
    });
    expect(getCurrentSkill(snap, "knightMelee")).toBe(120);
  });

  it("knightShielding → skills.shielding.base", () => {
    const snap = fixture({
      magic: { base: 10 },
      club: { base: 0 },
      fist: { base: 0 },
      sword: { base: 120 },
      axe: { base: 0 },
      distance: { base: 0 },
      shielding: { base: 95 },
      fishing: { base: 0 },
    });
    expect(getCurrentSkill(snap, "knightShielding")).toBe(95);
  });

  it("knightMagic → skills.magic.base", () => {
    const snap = fixture({
      magic: { base: 25 },
      club: { base: 0 },
      fist: { base: 0 },
      sword: { base: 0 },
      axe: { base: 0 },
      distance: { base: 0 },
      shielding: { base: 0 },
      fishing: { base: 0 },
    });
    expect(getCurrentSkill(snap, "knightMagic")).toBe(25);
  });

  it("paladinDistance → skills.distance.base", () => {
    const snap = fixture({
      magic: { base: 110 },
      club: { base: 0 },
      fist: { base: 0 },
      sword: { base: 0 },
      axe: { base: 0 },
      distance: { base: 130 },
      shielding: { base: 0 },
      fishing: { base: 0 },
    });
    expect(getCurrentSkill(snap, "paladinDistance")).toBe(130);
  });

  it("monkFist → skills.fist.base", () => {
    const snap = fixture({
      magic: { base: 100 },
      club: { base: 0 },
      fist: { base: 150 },
      sword: { base: 0 },
      axe: { base: 0 },
      distance: { base: 0 },
      shielding: { base: 0 },
      fishing: { base: 0 },
    });
    expect(getCurrentSkill(snap, "monkFist")).toBe(150);
  });

  it("zwraca 0 gdy skill = 0", () => {
    const snap = fixture({
      magic: { base: 0 },
      club: { base: 0 },
      fist: { base: 0 },
      sword: { base: 0 },
      axe: { base: 0 },
      distance: { base: 0 },
      shielding: { base: 0 },
      fishing: { base: 0 },
    });
    expect(getCurrentSkill(snap, "knightMelee")).toBe(0);
    expect(getCurrentSkill(snap, "knightShielding")).toBe(0);
  });

  it("ignoruje loyaltyPct (zwraca tylko base)", () => {
    const snap = fixture({
      magic: { base: 100, loyaltyPct: 25, percentToNext: 50 },
      club: { base: 0 },
      fist: { base: 0 },
      sword: { base: 0 },
      axe: { base: 0 },
      distance: { base: 0 },
      shielding: { base: 0 },
      fishing: { base: 0 },
    });
    // 100 displayed = 80 base * 1.25 loyalty → getCurrentSkill zwraca 100
    // (to jest "current skill with loyalty" — konsument sam decyduje,
    // czy użyć prawdziwego base via True Skill w T18)
    expect(getCurrentSkill(snap, "knightMagic")).toBe(100);
  });
});
