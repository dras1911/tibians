/**
 * Testy source helpers — task 13 (100% coverage).
 *
 * Pokrycie:
 *   1. isAuctionSource / isManualSource / isImportedSource
 *   2. hasAuctionContext (z auction i bez auction)
 *   3. auctionIdToNumber (konwersja bigint → number)
 */
import { describe, expect, it } from "vitest";
import {
  auctionIdToNumber,
  CharacterSnapshotSchema,
  hasAuctionContext,
  isAuctionSource,
  isImportedSource,
  isManualSource,
  type CharacterSnapshot,
} from "../index.js";

// ──────────────────────────────────────────────────────────────────────────
// Fixture helpers
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

function zeroProgression(): CharacterSnapshot["progression"] {
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

function emptyAssets(): CharacterSnapshot["assets"] {
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

function emptyFlags(): CharacterSnapshot["flags"] {
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

function fixtureAuction(): CharacterSnapshot {
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

function fixtureManual(): CharacterSnapshot {
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
// Type guards
// ──────────────────────────────────────────────────────────────────────────

describe("source type guards", () => {
  it("isAuctionSource — true tylko dla kind='auction'", () => {
    expect(isAuctionSource(fixtureAuction().source)).toBe(true);
    expect(isAuctionSource(fixtureManual().source)).toBe(false);
    expect(isAuctionSource(fixtureImported().source)).toBe(false);
  });

  it("isManualSource — true tylko dla kind='manual'", () => {
    expect(isManualSource(fixtureManual().source)).toBe(true);
    expect(isManualSource(fixtureAuction().source)).toBe(false);
    expect(isManualSource(fixtureImported().source)).toBe(false);
  });

  it("isImportedSource — true tylko dla kind='imported'", () => {
    expect(isImportedSource(fixtureImported().source)).toBe(true);
    expect(isImportedSource(fixtureAuction().source)).toBe(false);
    expect(isImportedSource(fixtureManual().source)).toBe(false);
  });

  it("type guards zawężają typ (TS narrowing)", () => {
    const source = fixtureAuction().source;
    if (isAuctionSource(source)) {
      // W tym bloku TS wie, że source.auctionId istnieje.
      expect(typeof source.auctionId).toBe("bigint");
    } else {
      throw new Error("should be auction");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// hasAuctionContext
// ──────────────────────────────────────────────────────────────────────────

describe("hasAuctionContext", () => {
  it("true dla snapshotu z auction + source.kind='auction'", () => {
    expect(hasAuctionContext(fixtureAuction())).toBe(true);
  });

  it("false dla manual (brak auction)", () => {
    expect(hasAuctionContext(fixtureManual())).toBe(false);
  });

  it("false dla imported (brak auction)", () => {
    expect(hasAuctionContext(fixtureImported())).toBe(false);
  });

  it("false dla source.kind='auction' ale bez pola auction", () => {
    const snap = fixtureAuction();
    const noAuction: CharacterSnapshot = {
      ...snap,
      auction: undefined,
    };
    expect(hasAuctionContext(noAuction)).toBe(false);
  });

  it("zawęża typ: po true, auction jest dostępne", () => {
    const snap = fixtureAuction();
    if (hasAuctionContext(snap)) {
      expect(snap.auction.bid).toBe(25501);
      expect(snap.source.auctionId).toBe(2173376n);
    } else {
      throw new Error("should have auction context");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// auctionIdToNumber
// ──────────────────────────────────────────────────────────────────────────

describe("auctionIdToNumber", () => {
  it("konwertuje bigint → number", () => {
    expect(auctionIdToNumber({ kind: "auction", auctionId: 2173376n })).toBe(
      2173376,
    );
  });

  it("obsługuje małe ID", () => {
    expect(auctionIdToNumber({ kind: "auction", auctionId: 1n })).toBe(1);
  });

  it("obsługuje ID w zakresie MAX_SAFE_INTEGER", () => {
    expect(
      auctionIdToNumber({ kind: "auction", auctionId: 9_007_199_254_740_991n }),
    ).toBe(9_007_199_254_740_991);
  });

  it("zwraca number (typeof)", () => {
    const result = auctionIdToNumber({ kind: "auction", auctionId: 42n });
    expect(typeof result).toBe("number");
  });
});