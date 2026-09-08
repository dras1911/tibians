/**
 * Testy computeValueConfidence — task 13 (100% coverage).
 *
 * Pokrycie:
 *   1. Wszystkie 5 progów: 1.0 / 0.9 / 0.8 / 0.7 / 0.4
 *   2. Fallback 0.2 (nieosiągalny przez schema — test przez cast)
 *   3. Wszystkie kombinacje warunków w gałęzi auction
 */
import { describe, expect, it } from "vitest";
import {
  CharacterSnapshotSchema,
  computeValueConfidence,
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

/** Bazowy snapshot aukcyjny — do mutacji per test. */
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

/** Bazowy snapshot manualny. */
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

// ──────────────────────────────────────────────────────────────────────────
// Progi confidence
// ──────────────────────────────────────────────────────────────────────────

describe("computeValueConfidence — progi", () => {
  it("auction + items + tcInvested + achievements > 0 → 1.0", () => {
    const snap = fixtureAuction();
    const full: CharacterSnapshot = {
      ...snap,
      progression: { ...snap.progression, achievementPoints: 1845 },
      assets: {
        ...snap.assets,
        items: [{ itemId: 3079, quantity: 1 }],
        tcInvested: 3900,
      },
    };
    expect(computeValueConfidence(full)).toBe(1.0);
  });

  it("auction + items + tcInvested ale achievements == 0 → 0.9", () => {
    const snap = fixtureAuction();
    const partial: CharacterSnapshot = {
      ...snap,
      assets: {
        ...snap.assets,
        items: [{ itemId: 3079, quantity: 1 }],
        tcInvested: 3900,
      },
    };
    expect(computeValueConfidence(partial)).toBe(0.9);
  });

  it("auction + items + achievements ale brak tcInvested → 0.9", () => {
    const snap = fixtureAuction();
    const partial: CharacterSnapshot = {
      ...snap,
      progression: { ...snap.progression, achievementPoints: 100 },
      assets: {
        ...snap.assets,
        items: [{ itemId: 3079, quantity: 1 }],
      },
    };
    expect(computeValueConfidence(partial)).toBe(0.9);
  });

  it("auction + tcInvested + achievements ale brak items → 0.9", () => {
    const snap = fixtureAuction();
    const partial: CharacterSnapshot = {
      ...snap,
      progression: { ...snap.progression, achievementPoints: 100 },
      assets: { ...snap.assets, tcInvested: 100 },
    };
    expect(computeValueConfidence(partial)).toBe(0.9);
  });

  it("auction + brak items + brak tcInvested → 0.8 (nawet z achievements)", () => {
    const snap = fixtureAuction();
    const minimal: CharacterSnapshot = {
      ...snap,
      progression: { ...snap.progression, achievementPoints: 500 },
    };
    expect(computeValueConfidence(minimal)).toBe(0.8);
  });

  it("auction + brak items + brak tcInvested + brak achievements → 0.8", () => {
    const snap = fixtureAuction();
    expect(computeValueConfidence(snap)).toBe(0.8);
  });

  it("manual + items → 0.7", () => {
    const snap = fixtureManual();
    const withItems: CharacterSnapshot = {
      ...snap,
      assets: {
        ...snap.assets,
        items: [{ itemId: 3079, quantity: 1 }],
      },
    };
    expect(computeValueConfidence(withItems)).toBe(0.7);
  });

  it("manual + brak items → 0.4", () => {
    expect(computeValueConfidence(fixtureManual())).toBe(0.4);
  });

  it("imported + items → 0.7", () => {
    const snap = fixtureManual();
    const imported: CharacterSnapshot = {
      ...snap,
      source: { kind: "imported", from: "tibia-com" },
      assets: {
        ...snap.assets,
        items: [{ itemId: 3079, quantity: 1 }],
      },
    };
    expect(computeValueConfidence(imported)).toBe(0.7);
  });

  it("imported + brak items → 0.4", () => {
    const snap = fixtureManual();
    const imported: CharacterSnapshot = {
      ...snap,
      source: { kind: "imported", from: "tibia-com" },
    };
    expect(computeValueConfidence(imported)).toBe(0.4);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Fallback 0.2 — nieosiągalny przez schema (kind jest enumem),
// ale funkcja ma defensywny fallback. Testujemy przez cast.
// ──────────────────────────────────────────────────────────────────────────

describe("computeValueConfidence — fallback", () => {
  it("nieznany source.kind → 0.2 (defensywny fallback)", () => {
    const snap = fixtureManual();
    const weird = {
      ...snap,
      source: { kind: "unknown" },
    } as unknown as CharacterSnapshot;
    expect(computeValueConfidence(weird)).toBe(0.2);
  });
});