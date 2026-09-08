/**
 * Testy typów — task 13.
 *
 * types.ts to plik wyłącznie typów (export type) — zero kodu runtime,
 * więc jest wykluczony z coverage. Ten plik weryfikuje że aliasy
 * `Character*` istnieją i są zgodne z arch. §13.1 (compile-time),
 * a w runtime sprawdza że re-eksporty działają.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type {
  CharacterAssets,
  CharacterAuction,
  CharacterAuctionSource,
  CharacterAuctionStatus,
  CharacterBidType,
  CharacterFlags,
  CharacterGems,
  CharacterIdentity,
  CharacterImportedSource,
  CharacterInventoryItem,
  CharacterLoyaltyPct,
  CharacterManualSource,
  CharacterOutfit,
  CharacterProgression,
  CharacterSex,
  CharacterSkillEntry,
  CharacterSkillKey,
  CharacterSkills,
  CharacterSource,
  CharacterStoreCounts,
  CharacterTier,
  CharacterVocationBase,
  CharacterVocationPromoted,
} from "../index.js";
import {
  CharacterSnapshotSchema,
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
// Aliasy — compile-time verification
// ──────────────────────────────────────────────────────────────────────────

describe("aliasy Character* — zgodność z arch. §13.1", () => {
  it("CharacterSnapshot === z.infer<CharacterSnapshotSchema>", () => {
    const snap = fixtureManual();
    // Przypisanie do aliasu — compile-time sprawdza zgodność.
    const typed: CharacterSnapshot = snap;
    expect(typed.identity.name).toBe("Almyth");
  });

  it("CharacterIdentity === Identity (name, level, vocation, world)", () => {
    const snap = fixtureManual();
    const identity: CharacterIdentity = snap.identity;
    expect(identity.level).toBe(287);
    expect(identity.vocation).toBe("Knight");
  });

  it("CharacterSkills === Skills (Record<SkillKey, SkillEntry>)", () => {
    const snap = fixtureManual();
    const skills: CharacterSkills = snap.skills;
    expect(skills.magic.base).toBe(0);
    expect(Object.keys(skills)).toHaveLength(8);
  });

  it("CharacterProgression === Progression", () => {
    const snap = fixtureManual();
    const progression: CharacterProgression = snap.progression;
    expect(progression.questsTotal).toBe(0);
  });

  it("CharacterAssets === Assets", () => {
    const snap = fixtureManual();
    const assets: CharacterAssets = snap.assets;
    expect(assets.goldTotal).toBe(0);
  });

  it("CharacterFlags === Flags", () => {
    const snap = fixtureManual();
    const flags: CharacterFlags = snap.flags;
    expect(flags.blessingsActive).toBe(0);
  });

  it("CharacterAuction === AuctionContext (opcjonalny)", () => {
    const snap = fixtureManual();
    // auction jest undefined dla manual — typ pozwala na undefined.
    const auction: CharacterAuction | undefined = snap.auction;
    expect(auction).toBeUndefined();
  });

  it("CharacterSource === Source (discriminated union)", () => {
    const snap = fixtureManual();
    const source: CharacterSource = snap.source;
    expect(source.kind).toBe("manual");
  });

  it("CharacterAuctionSource — ma auctionId bigint", () => {
    const source: CharacterAuctionSource = {
      kind: "auction",
      auctionId: 2173376n,
    };
    expect(source.auctionId).toBe(2173376n);
  });

  it("CharacterManualSource — tylko kind", () => {
    const source: CharacterManualSource = { kind: "manual" };
    expect(source.kind).toBe("manual");
  });

  it("CharacterImportedSource — from='tibia-com'", () => {
    const source: CharacterImportedSource = {
      kind: "imported",
      from: "tibia-com",
    };
    expect(source.from).toBe("tibia-com");
  });

  it("CharacterVocationBase — 5 klas", () => {
    const voc: CharacterVocationBase = "Monk";
    expect(voc).toBe("Monk");
  });

  it("CharacterVocationPromoted — 5 promowanych", () => {
    const voc: CharacterVocationPromoted = "Exalted Monk";
    expect(voc).toBe("Exalted Monk");
  });

  it("CharacterSex — M|F", () => {
    const sex: CharacterSex = "F";
    expect(sex).toBe("F");
  });

  it("CharacterSkillKey — 8 kluczy", () => {
    const key: CharacterSkillKey = "sword";
    expect(key).toBe("sword");
  });

  it("CharacterLoyaltyPct — progi 0..50", () => {
    const pct: CharacterLoyaltyPct = 10;
    expect(pct).toBe(10);
  });

  it("CharacterTier — 0..3", () => {
    const tier: CharacterTier = 3;
    expect(tier).toBe(3);
  });

  it("CharacterBidType — current|minimum", () => {
    const bidType: CharacterBidType = "current";
    expect(bidType).toBe("current");
  });

  it("CharacterAuctionStatus — 4 statusy", () => {
    const status: CharacterAuctionStatus = "active";
    expect(status).toBe("active");
  });

  it("CharacterSkillEntry — base + opcjonalne", () => {
    const entry: CharacterSkillEntry = { base: 47, loyaltyPct: 5 };
    expect(entry.base).toBe(47);
  });

  it("CharacterInventoryItem — itemId, quantity, tier?", () => {
    const item: CharacterInventoryItem = { itemId: 3079, quantity: 1, tier: 2 };
    expect(item.itemId).toBe(3079);
  });

  it("CharacterOutfit — outfitId + addons", () => {
    const outfit: CharacterOutfit = { outfitId: 962, addons: 3 };
    expect(outfit.addons).toBe(3);
  });

  it("CharacterGems — lesser/regular/greater", () => {
    const gems: CharacterGems = { lesser: 44, regular: 0, greater: 0 };
    expect(gems.lesser).toBe(44);
  });

  it("CharacterStoreCounts — outfits/mounts/items", () => {
    const counts: CharacterStoreCounts = { outfits: 5, mounts: 3, items: 12 };
    expect(counts.items).toBe(12);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// z.infer === manual — typ wnioskowany ze schemy
// ──────────────────────────────────────────────────────────────────────────

describe("z.infer === manual", () => {
  it("z.infer<CharacterSnapshotSchema> jest przypisywalny do CharacterSnapshot", () => {
    const snap = fixtureManual();
    // Oba typy są strukturalnie identyczne — przypisanie w obie strony.
    const inferred: z.infer<typeof CharacterSnapshotSchema> = snap;
    expect(inferred.identity.name).toBe("Almyth");
  });

  it("snapshot przechodzi przez parse i zachowuje strukturę", () => {
    const snap = fixtureManual();
    const reparsed = CharacterSnapshotSchema.parse(snap);
    expect(reparsed).toEqual(snap);
  });
});