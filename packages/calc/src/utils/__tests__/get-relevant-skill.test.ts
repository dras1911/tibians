/**
 * Testy getRelevantSkill/getRelevantSkills/getPrimarySkill — task 14.
 *
 * Weryfikacja 8 par vocation/skill z arch. §2.1 (TibiaPal benchmark):
 *
 *   1. Knight       → sword     (knightMelee)
 *   2. Knight       → shielding (knightShielding)
 *   3. Knight       → magic     (knightMagic)
 *   4. Paladin      → magic     (paladinMagic)
 *   5. Paladin      → distance  (paladinDistance)
 *   6. Druid        → magic     (mageMagic)
 *   7. Sorcerer     → magic     (mageMagic)
 *   8. Monk         → magic     (monkMagic) — bonus
 *   9. Monk         → fist      (monkFist)
 *
 * TibiaPal ma 8 par (Druid/Sorcerer liczone jako jedna), ale my
 * indeksujemy 9 (Druid + Sorcerer osobno), więc łącznie 9 wpisów
 * w `VOCATION_SKILL_PAIRS` po obu wpisach mage.
 */
import { describe, expect, it } from "vitest";
import type { CharacterSnapshot } from "@tibians/character-context";
import {
  PRIMARY_SKILL_PER_VOCATION,
  VOCATION_SKILL_PAIRS,
  VOCATION_SKILL_CATEGORIES,
  getPrimarySkill,
  getRelevantSkill,
  getRelevantSkills,
  type VocationSkillCategory,
} from "../../index.js";

// ──────────────────────────────────────────────────────────────────────────
// Fixture — minimalny snapshot (arch. §13.1) — tylko skills/identity
// ──────────────────────────────────────────────────────────────────────────

function emptySkills(): CharacterSnapshot["skills"] {
  return {
    magic: { base: 0 },
    club: { base: 0 },
    fist: { base: 0 },
    sword: { base: 0 },
    axe: { base: 0 },
    distance: { base: 0 },
    shielding: { base: 0 },
    fishing: { base: 0 },
  };
}

function fixtureFor(
  vocationPromoted: CharacterSnapshot["identity"]["vocationPromoted"],
): CharacterSnapshot {
  const base = vocationPromoted.split(" ")[1] as
    | "Knight"
    | "Paladin"
    | "Druid"
    | "Sorcerer"
    | "Monk";
  return {
    source: { kind: "manual" },
    identity: {
      name: "Tester",
      level: 100,
      vocation: base,
      vocationPromoted,
      sex: "M",
    },
    skills: emptySkills(),
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
// VOCATION_SKILL_PAIRS — tabela 8 par (arch. §2.1)
// ──────────────────────────────────────────────────────────────────────────

describe("VOCATION_SKILL_PAIRS — tabela 8 par (arch. §2.1)", () => {
  it("zawiera dokładnie 9 wpisów (Knight×3, Paladin×2, Mage×2, Monk×2)", () => {
    // TibiaPal ma 8 par (Druid/Sorcerer wspólna), my mamy 9 wpisów
    // bo mageMagic ma 2 wpisy (Druid + Sorcerer) — sprawdzamy strukturę.
    expect(VOCATION_SKILL_PAIRS.length).toBe(9);
  });

  it("wszystkie 8 unikalnych kategorii z VOCATION_SKILL_CATEGORIES ma conajmniej 1 parę", () => {
    const seen = new Set(VOCATION_SKILL_PAIRS.map((p) => p.category));
    for (const cat of VOCATION_SKILL_CATEGORIES) {
      expect(seen.has(cat)).toBe(true);
    }
  });

  it("każda para ma wypełnione wszystkie 3 pola (category/vocation/skillKey)", () => {
    for (const pair of VOCATION_SKILL_PAIRS) {
      expect(pair.category).toBeTruthy();
      expect(pair.vocation).toBeTruthy();
      expect(pair.skillKey).toBeTruthy();
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// getRelevantSkill — mapowanie kategoria → SkillKey
// ──────────────────────────────────────────────────────────────────────────

describe("getRelevantSkill — 8 par vocation/skill", () => {
  const snapshot = fixtureFor("Elite Knight");

  const expected: ReadonlyArray<readonly [VocationSkillCategory, string]> = [
    ["knightMelee",      "sword"],
    ["knightShielding",  "shielding"],
    ["knightMagic",      "magic"],
    ["paladinMagic",     "magic"],
    ["paladinDistance",  "distance"],
    ["mageMagic",        "magic"],
    ["monkMagic",        "magic"],
    ["monkFist",         "fist"],
  ];

  for (const [category, skillKey] of expected) {
    it(`zwraca "${skillKey}" dla kategorii "${category}"`, () => {
      expect(getRelevantSkill(snapshot, category)).toBe(skillKey);
    });
  }

  it("wynik należy do dozwolonych SkillKey (magic/club/fist/sword/axe/distance/shielding/fishing)", () => {
    const validSkills = new Set([
      "magic",
      "club",
      "fist",
      "sword",
      "axe",
      "distance",
      "shielding",
      "fishing",
    ]);
    for (const category of VOCATION_SKILL_CATEGORIES) {
      expect(validSkills.has(getRelevantSkill(snapshot, category))).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// getRelevantSkills — wszystkie pary per vocation
// ──────────────────────────────────────────────────────────────────────────

describe("getRelevantSkills — wszystkie pary per promoted vocation", () => {
  it("Elite Knight → [sword, shielding, magic] (3 pary)", () => {
    const skills = getRelevantSkills(fixtureFor("Elite Knight"), "Elite Knight");
    expect(skills).toEqual(["sword", "shielding", "magic"]);
  });

  it("Royal Paladin → [magic, distance] (2 pary)", () => {
    const skills = getRelevantSkills(
      fixtureFor("Royal Paladin"),
      "Royal Paladin",
    );
    expect(skills).toEqual(["magic", "distance"]);
  });

  it("Elder Druid → [magic] (1 para)", () => {
    const skills = getRelevantSkills(fixtureFor("Elder Druid"), "Elder Druid");
    expect(skills).toEqual(["magic"]);
  });

  it("Master Sorcerer → [magic] (1 para)", () => {
    const skills = getRelevantSkills(
      fixtureFor("Master Sorcerer"),
      "Master Sorcerer",
    );
    expect(skills).toEqual(["magic"]);
  });

  it("Exalted Monk → [magic, fist] (2 pary)", () => {
    const skills = getRelevantSkills(fixtureFor("Exalted Monk"), "Exalted Monk");
    expect(skills).toEqual(["magic", "fist"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PRIMARY_SKILL_PER_VOCATION + getPrimarySkill
// ──────────────────────────────────────────────────────────────────────────

describe("PRIMARY_SKILL_PER_VOCATION — domyślny skill per promoted vocation", () => {
  it("Elite Knight → sword (główna broń melee)", () => {
    expect(PRIMARY_SKILL_PER_VOCATION["Elite Knight"]).toBe("sword");
  });

  it("Royal Paladin → distance", () => {
    expect(PRIMARY_SKILL_PER_VOCATION["Royal Paladin"]).toBe("distance");
  });

  it("Elder Druid → magic", () => {
    expect(PRIMARY_SKILL_PER_VOCATION["Elder Druid"]).toBe("magic");
  });

  it("Master Sorcerer → magic", () => {
    expect(PRIMARY_SKILL_PER_VOCATION["Master Sorcerer"]).toBe("magic");
  });

  it("Exalted Monk → fist", () => {
    expect(PRIMARY_SKILL_PER_VOCATION["Exalted Monk"]).toBe("fist");
  });
});

describe("getPrimarySkill — zwraca domyślny skill ze snapshotu", () => {
  it("Elite Knight snapshot → sword", () => {
    expect(getPrimarySkill(fixtureFor("Elite Knight"))).toBe("sword");
  });

  it("Royal Paladin snapshot → distance", () => {
    expect(getPrimarySkill(fixtureFor("Royal Paladin"))).toBe("distance");
  });

  it("Exalted Monk snapshot → fist", () => {
    expect(getPrimarySkill(fixtureFor("Exalted Monk"))).toBe("fist");
  });
});
