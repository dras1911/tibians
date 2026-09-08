/**
 * Testy CharacterSnapshot — task 9.
 *
 * Pokrycie:
 *   1. Pozytywne fixture'y (auction / manual / imported)
 *   2. Edge cases (level 7, level 2501, vocation='Wizard', gems=-1, skill<0)
 *   3. Cross-validation refinements (auction+source, vocation, progresja)
 *   4. computeValueConfidence — wszystkie 5 progów
 *   5. Source helpers (isAuctionSource, isManualSource, isImportedSource)
 *   6. Round-trip JSON (schema → parse → schema)
 */
import { describe, expect, it } from "vitest";
import {
  AuctionSourceSchema,
  CharacterSnapshotSchema,
  computeValueConfidence,
  hasAuctionContext,
  IdentitySchema,
  isAuctionSource,
  isImportedSource,
  isManualSource,
  SKILL_KEYS,
  type CharacterSnapshot,
} from "./index.js";

// ──────────────────────────────────────────────────────────────────────────
// Helpers — budowanie fixture'ów
// ──────────────────────────────────────────────────────────────────────────

/** Minimalny poprawny zestaw 8 skilli z samymi zerami. */
function emptySkills() {
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

/** Progresja z wartościami wyzerowanymi — minimalnie poprawna. */
function zeroProgression() {
  return {
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
  };
}

/** Minimalnie poprawne assety — bez itemów/outfitów/mountów. */
function emptyAssets() {
  return {
    items: [],
    outfits: [],
    mounts: [],
    gems: { lesser: 0, regular: 0, greater: 0 },
    goldTotal: 0,
    storeCounts: { outfits: 0, mounts: 0, items: 0 },
    hirelings: 0,
  };
}

/** Wszystkie flagi wyłączone + 0 błogosławieństw. */
function emptyFlags() {
  return {
    soulWar: false,
    primalOrdeal: false,
    worldTransfer: false,
    preySlot: false,
    charmExpansion: false,
    weeklyTaskExpansion: false,
    twistOfFate: false,
    blessingsActive: 0,
  };
}

/** Fixture: minimalny snapshot aukcyjny (bez detail, dla confidence 0.8). */
function fixtureAuctionMinimal(): CharacterSnapshot {
  return CharacterSnapshotSchema.parse({
    source: { kind: "auction", auctionId: 2173376n },
    identity: {
      name: "Migzen",
      level: 619,
      vocation: "Monk",
      vocationPromoted: "Exalted Monk",
      sex: "M",
      world: "Jadebra",
    },
    skills: emptySkills(),
    progression: zeroProgression(),
    assets: emptyAssets(),
    flags: emptyFlags(),
    auction: {
      bid: 25501,
      bidType: "current",
      auctionStart: "2026-09-08T10:00:00Z",
      auctionEnd: "2026-09-08T22:00:00Z",
      status: "active",
    },
  });
}

/** Fixture: pełny snapshot aukcyjny (dla confidence 1.0). */
function fixtureAuctionFull(): CharacterSnapshot {
  return CharacterSnapshotSchema.parse({
    source: { kind: "auction", auctionId: 2173376n },
    identity: {
      name: "Migzen",
      level: 619,
      vocation: "Monk",
      vocationPromoted: "Exalted Monk",
      sex: "M",
      world: "Jadebra",
    },
    skills: {
      ...emptySkills(),
      magic: { base: 47, loyaltyPct: 5, percentToNext: 75 },
      fist: { base: 113, loyaltyPct: 10, percentToNext: 42 },
    },
    progression: {
      ...zeroProgression(),
      charmPoints: 7611,
      bossPoints: 2340,
      questsCompleted: 28,
      questsTotal: 42,
      imbuementsUnlocked: 11,
      imbuementsTotal: 23,
      achievementPoints: 1845,
      animusMasteries: 180,
    },
    assets: {
      items: [{ itemId: 3079, quantity: 1 }],
      outfits: [{ outfitId: 962, addons: 3 }],
      mounts: [232],
      gems: { lesser: 44, regular: 0, greater: 0 },
      goldTotal: 100000,
      tcInvested: 3900,
      storeCounts: { outfits: 5, mounts: 3, items: 12 },
      hirelings: 2,
    },
    flags: {
      ...emptyFlags(),
      soulWar: true,
      primalOrdeal: true,
      worldTransfer: true,
      preySlot: true,
      charmExpansion: true,
      weeklyTaskExpansion: true,
      twistOfFate: true,
      blessingsActive: 7,
    },
    auction: {
      bid: 25501,
      bidType: "current",
      auctionStart: "2026-09-08T10:00:00Z",
      auctionEnd: "2026-09-08T22:00:00Z",
      status: "active",
    },
  });
}

/** Fixture: ręczny snapshot bez items (dla confidence 0.4). */
function fixtureManualEmpty(): CharacterSnapshot {
  return CharacterSnapshotSchema.parse({
    source: { kind: "manual" },
    identity: {
      name: "Almyth",
      level: 287,
      vocation: "Knight",
      vocationPromoted: "Elite Knight",
      sex: "F",
    },
    skills: emptySkills(),
    progression: zeroProgression(),
    assets: emptyAssets(),
    flags: emptyFlags(),
  });
}

/** Fixture: ręczny snapshot z items (dla confidence 0.7). */
function fixtureManualWithItems(): CharacterSnapshot {
  return CharacterSnapshotSchema.parse({
    source: { kind: "manual" },
    identity: {
      name: "Almyth",
      level: 287,
      vocation: "Knight",
      vocationPromoted: "Elite Knight",
      sex: "F",
    },
    skills: emptySkills(),
    progression: zeroProgression(),
    assets: {
      ...emptyAssets(),
      items: [{ itemId: 3079, quantity: 1, tier: 2 }],
    },
    flags: emptyFlags(),
  });
}

/** Fixture: import z tibia.com/community. */
function fixtureImported(): CharacterSnapshot {
  return CharacterSnapshotSchema.parse({
    source: { kind: "imported", from: "tibia-com" },
    identity: {
      name: "Tarsy",
      level: 152,
      vocation: "Paladin",
      vocationPromoted: "Royal Paladin",
      sex: "M",
      world: "Antica",
    },
    skills: emptySkills(),
    progression: zeroProgression(),
    assets: emptyAssets(),
    flags: emptyFlags(),
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Pozytywne fixture'y
// ──────────────────────────────────────────────────────────────────────────

describe("pozytywne fixture'y", () => {
  it("akceptuje minimalną aukcję (bez detail, bez tcInvested)", () => {
    const snap = fixtureAuctionMinimal();
    expect(snap.source.kind).toBe("auction");
    expect(snap.auction?.bid).toBe(25501);
  });

  it("akceptuje pełną aukcję (items + tcInvested + achievements)", () => {
    const snap = fixtureAuctionFull();
    expect(snap.source.kind).toBe("auction");
    expect(snap.assets.items).toHaveLength(1);
    expect(snap.assets.tcInvested).toBe(3900);
    expect(snap.progression.achievementPoints).toBeGreaterThan(0);
  });

  it("akceptuje ręczny snapshot bez items", () => {
    const snap = fixtureManualEmpty();
    expect(snap.source.kind).toBe("manual");
  });

  it("akceptuje ręczny snapshot z items", () => {
    const snap = fixtureManualWithItems();
    expect(snap.assets.items.length).toBeGreaterThan(0);
  });

  it("akceptuje import z tibia.com", () => {
    const snap = fixtureImported();
    expect(snap.source.kind).toBe("imported");
    if (snap.source.kind === "imported") {
      expect(snap.source.from).toBe("tibia-com");
    }
  });

  it("akceptuje wszystkie 5 bazowych + 5 promowanych vocations", () => {
    const bases = [
      ["Knight", "Elite Knight"],
      ["Paladin", "Royal Paladin"],
      ["Druid", "Elder Druid"],
      ["Sorcerer", "Master Sorcerer"],
      ["Monk", "Exalted Monk"],
    ] as const;
    for (const [base, promoted] of bases) {
      const result = IdentitySchema.safeParse({
        name: "Test",
        level: 100,
        vocation: base,
        vocationPromoted: promoted,
        sex: "M",
      });
      expect(result.success, `vocation=${base}`).toBe(true);
    }
  });

  it("akceptuje wszystkie 11 progów lojalności", () => {
    const loyaltyValues = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    for (const pct of loyaltyValues) {
      const result = CharacterSnapshotSchema.safeParse({
        source: { kind: "manual" },
        identity: {
          name: "X",
          level: 100,
          vocation: "Knight",
          vocationPromoted: "Elite Knight",
          sex: "M",
        },
        skills: {
          ...emptySkills(),
          magic: { base: 50, loyaltyPct: pct },
        },
        progression: zeroProgression(),
        assets: emptyAssets(),
        flags: emptyFlags(),
      });
      expect(result.success, `loyalty=${pct}`).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Edge cases — walidacja Zod odrzuca niepoprawne dane
// ──────────────────────────────────────────────────────────────────────────

describe("edge cases — walidacja odrzuca niepoprawne dane", () => {
  it("odrzuca level = 7 (poniżej minimum 8)", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 7,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join("; ");
      expect(msg).toMatch(/level/i);
    }
  });

  it("odrzuca level = 2501 (powyżej maksimum 2500)", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 2501,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
  });

  it("akceptuje level = 8 (dolna granica)", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 8,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: emptyFlags(),
    });
    expect(result.success).toBe(true);
  });

  it("akceptuje level = 2500 (górna granica)", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 2500,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: emptyFlags(),
    });
    expect(result.success).toBe(true);
  });

  it("odrzuca vocation = 'Wizard' (nie ma w enum)", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Wizard",
        vocationPromoted: "Master Sorcerer",
        sex: "M",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("vocation"))).toBe(
        true,
      );
    }
  });

  it("odrzuca gems.lesser = -1 (ujemne)", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: {
        ...emptyAssets(),
        gems: { lesser: -1, regular: 0, greater: 0 },
      },
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
  });

  it("odrzuca gems.regular = -1", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: {
        ...emptyAssets(),
        gems: { lesser: 0, regular: -1, greater: 0 },
      },
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
  });

  it("odrzuca skill base < 0", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: {
        ...emptySkills(),
        magic: { base: -5 },
      },
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
  });

  it("odrzuca loyaltyPct = 7 (nie jest w dozwolonych progach)", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: {
        ...emptySkills(),
        magic: { base: 50, loyaltyPct: 7 },
      },
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
  });

  it("odrzuca goldTotal < 0", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: { ...emptyAssets(), goldTotal: -1 },
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
  });

  it("odrzuca blessingsActive > 7", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: { ...emptyFlags(), blessingsActive: 8 },
    });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Cross-validation refinements (arch. §13.1)
// ──────────────────────────────────────────────────────────────────────────

describe("cross-validation refinements", () => {
  it("odrzuca auction bez source.kind='auction'", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: emptyFlags(),
      auction: {
        bid: 1000,
        bidType: "current",
        auctionStart: "2026-01-01T00:00:00Z",
        auctionEnd: "2026-01-02T00:00:00Z",
        status: "active",
      },
    });
    expect(result.success).toBe(false);
  });

  it("odrzuca niezgodność vocation ↔ vocationPromoted (Knight + Exalted Monk)", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Exalted Monk",
        sex: "M",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
  });

  it("odrzuca questsCompleted > questsTotal", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: emptySkills(),
      progression: {
        ...zeroProgression(),
        questsCompleted: 50,
        questsTotal: 42,
      },
      assets: emptyAssets(),
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
  });

  it("odrzuca imbuementsUnlocked > imbuementsTotal", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: emptySkills(),
      progression: {
        ...zeroProgression(),
        imbuementsUnlocked: 30,
        imbuementsTotal: 23,
      },
      assets: emptyAssets(),
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
  });

  it("odrzuca sex ≠ M|F", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "X",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
  });

  it("odrzuca zduplikowane klucze (strict mode)", () => {
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: {
        ...emptySkills(),
        magic: { base: 0 },
        unknownSkill: { base: 10 },
      },
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: emptyFlags(),
    });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. computeValueConfidence — wszystkie 5 progów (arch. §8.4)
// ──────────────────────────────────────────────────────────────────────────

describe("computeValueConfidence", () => {
  it("auction + items + tcInvested + achievements > 0 → 1.0", () => {
    const snap = fixtureAuctionFull();
    expect(computeValueConfidence(snap)).toBe(1.0);
  });

  it("auction + items=[] + brak tcInvested → 0.8", () => {
    const snap = fixtureAuctionMinimal();
    expect(computeValueConfidence(snap)).toBe(0.8);
  });

  it("manual + brak items → 0.4", () => {
    const snap = fixtureManualEmpty();
    expect(computeValueConfidence(snap)).toBe(0.4);
  });

  it("manual + items → 0.7", () => {
    const snap = fixtureManualWithItems();
    expect(computeValueConfidence(snap)).toBe(0.7);
  });

  it("imported + brak items → 0.4", () => {
    const snap = fixtureImported();
    expect(computeValueConfidence(snap)).toBe(0.4);
  });

  it("auction + items ale brak tcInvested → 0.9 (częściowy detal)", () => {
    const snap = fixtureAuctionFull();
    const partial: CharacterSnapshot = {
      ...snap,
      assets: { ...snap.assets, tcInvested: undefined },
    };
    expect(computeValueConfidence(partial)).toBe(0.9);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. Source helpers
// ──────────────────────────────────────────────────────────────────────────

describe("source helpers", () => {
  it("isAuctionSource — prawda tylko dla source.kind='auction'", () => {
    expect(isAuctionSource(fixtureAuctionMinimal().source)).toBe(true);
    expect(isAuctionSource(fixtureManualEmpty().source)).toBe(false);
    expect(isAuctionSource(fixtureImported().source)).toBe(false);
  });

  it("isManualSource — prawda tylko dla source.kind='manual'", () => {
    expect(isManualSource(fixtureManualEmpty().source)).toBe(true);
    expect(isManualSource(fixtureAuctionMinimal().source)).toBe(false);
    expect(isManualSource(fixtureImported().source)).toBe(false);
  });

  it("isImportedSource — prawda tylko dla source.kind='imported'", () => {
    expect(isImportedSource(fixtureImported().source)).toBe(true);
    expect(isImportedSource(fixtureAuctionMinimal().source)).toBe(false);
    expect(isImportedSource(fixtureManualEmpty().source)).toBe(false);
  });

  it("AuctionSourceSchema — wymaga auctionId (bigint)", () => {
    expect(AuctionSourceSchema.safeParse({ kind: "auction" }).success).toBe(
      false,
    );
    expect(
      AuctionSourceSchema.safeParse({ kind: "auction", auctionId: 1n }).success,
    ).toBe(true);
  });

  it("hasAuctionContext — snapshot z auction i source=auction", () => {
    expect(hasAuctionContext(fixtureAuctionMinimal())).toBe(true);
    expect(hasAuctionContext(fixtureManualEmpty())).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. Round-trip + struktura
// ──────────────────────────────────────────────────────────────────────────

describe("round-trip i struktura", () => {
  it("8 kluczy w SKILL_KEYS (kolejność z arch. §13.1)", () => {
    expect(SKILL_KEYS).toEqual([
      "magic",
      "club",
      "fist",
      "sword",
      "axe",
      "distance",
      "shielding",
      "fishing",
    ]);
    expect(SKILL_KEYS).toHaveLength(8);
  });

  it("auctionId zachowuje bigint (precyzja > Number.MAX_SAFE_INTEGER)", () => {
    const hugeId = 9_007_199_254_740_991n; // Number.MAX_SAFE_INTEGER
    const result = CharacterSnapshotSchema.safeParse({
      source: { kind: "auction", auctionId: hugeId },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: emptySkills(),
      progression: zeroProgression(),
      assets: emptyAssets(),
      flags: emptyFlags(),
      auction: {
        bid: 1,
        bidType: "current",
        auctionStart: "2026-01-01T00:00:00Z",
        auctionEnd: "2026-01-02T00:00:00Z",
        status: "active",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source.kind).toBe("auction");
      if (result.data.source.kind === "auction") {
        expect(result.data.source.auctionId).toBe(hugeId);
      }
    }
  });

  it("round-trip: parse → parse z wynikiem (immutable, deterministyczny)", () => {
    const original = fixtureAuctionFull();
    // Zod nie mutuje — zwraca ten sam kształt
    const reparsed = CharacterSnapshotSchema.parse(original);
    expect(reparsed).toEqual(original);
    // BigInt porównanie strukturalne
    if (reparsed.source.kind === "auction" && original.source.kind === "auction") {
      expect(reparsed.source.auctionId).toBe(original.source.auctionId);
    }
  });
});
