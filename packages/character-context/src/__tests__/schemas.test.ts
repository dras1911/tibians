/**
 * Testy CharacterSnapshotSchema — task 13 (100% coverage).
 *
 * Pokrycie:
 *   1. Wszystkie enums (VocationBase, VocationPromoted, Sex, BidType,
 *      AuctionStatus, Tier, SkillKey, LoyaltyPct)
 *   2. Wszystkie refinements (auction↔source, vocation↔vocationPromoted,
 *      questsCompleted≤questsTotal, imbuementsUnlocked≤imbuementsTotal)
 *   3. Edge values (level 7/8/2500/2501, vocation='Wizard', gems=-1,
 *      skill.base=-5, loyaltyPct=7, goldTotal=-1, blessingsActive=8)
 *   4. Bigint precision (auctionId 9_007_199_254_740_991n)
 *   5. 8 SKILL_KEYS w kolejności, 11 progów lojalności,
 *      5 par vocation/vocationPromoted, 3 source kinds
 *   6. strict() — odrzuca nieznane pola (R1 future-proof)
 *   7. Wszystkie zagnieżdżone schemy (Identity, Skills, Progression,
 *      Assets, Flags, AuctionContext, InventoryItem, OwnedOutfit, Gems,
 *      StoreCounts, Tier, Source)
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AuctionContextSchema,
  AuctionSourceSchema,
  AuctionStatusSchema,
  AssetsSchema,
  BidTypeSchema,
  CharacterSnapshotSchema,
  FlagsSchema,
  GemsSchema,
  IdentitySchema,
  ImportedSourceSchema,
  InventoryItemSchema,
  LoyaltyPctSchema,
  ManualSourceSchema,
  OwnedOutfitSchema,
  ProgressionSchema,
  SexSchema,
  SkillKeySchema,
  SkillsSchema,
  SKILL_KEYS,
  SourceSchema,
  StoreCountsSchema,
  TierSchema,
  VocationBaseSchema,
  VocationPromotedSchema,
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

/** Minimalny poprawny snapshot (manual). */
function fixtureManual(): CharacterSnapshot {
  return CharacterSnapshotSchema.parse({
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
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Enums — wszystkie wartości
// ──────────────────────────────────────────────────────────────────────────

describe("enums — wszystkie wartości", () => {
  it("VocationBaseSchema: 5 bazowych klas", () => {
    const values = ["Knight", "Paladin", "Druid", "Sorcerer", "Monk"];
    for (const v of values) {
      expect(VocationBaseSchema.safeParse(v).success).toBe(true);
    }
    expect(VocationBaseSchema.safeParse("Wizard").success).toBe(false);
    expect(VocationBaseSchema.safeParse("knight").success).toBe(false);
  });

  it("VocationPromotedSchema: 5 promowanych klas", () => {
    const values = [
      "Elite Knight",
      "Royal Paladin",
      "Elder Druid",
      "Master Sorcerer",
      "Exalted Monk",
    ];
    for (const v of values) {
      expect(VocationPromotedSchema.safeParse(v).success).toBe(true);
    }
    expect(VocationPromotedSchema.safeParse("Wizard").success).toBe(false);
  });

  it("SexSchema: M i F", () => {
    expect(SexSchema.safeParse("M").success).toBe(true);
    expect(SexSchema.safeParse("F").success).toBe(true);
    expect(SexSchema.safeParse("X").success).toBe(false);
    expect(SexSchema.safeParse("m").success).toBe(false);
  });

  it("BidTypeSchema: current i minimum", () => {
    expect(BidTypeSchema.safeParse("current").success).toBe(true);
    expect(BidTypeSchema.safeParse("minimum").success).toBe(true);
    expect(BidTypeSchema.safeParse("max").success).toBe(false);
  });

  it("AuctionStatusSchema: 4 statusy", () => {
    for (const s of ["active", "finished", "cancelled", "sold"]) {
      expect(AuctionStatusSchema.safeParse(s).success).toBe(true);
    }
    expect(AuctionStatusSchema.safeParse("pending").success).toBe(false);
  });

  it("TierSchema: 0..3", () => {
    for (const t of [0, 1, 2, 3]) {
      expect(TierSchema.safeParse(t).success).toBe(true);
    }
    expect(TierSchema.safeParse(4).success).toBe(false);
    expect(TierSchema.safeParse(-1).success).toBe(false);
  });

  it("SkillKeySchema: 8 kluczy", () => {
    for (const k of SKILL_KEYS) {
      expect(SkillKeySchema.safeParse(k).success).toBe(true);
    }
    expect(SkillKeySchema.safeParse("bow").success).toBe(false);
  });

  it("LoyaltyPctSchema: 11 progów 0..50 co 5", () => {
    for (const p of [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]) {
      expect(LoyaltyPctSchema.safeParse(p).success).toBe(true);
    }
    expect(LoyaltyPctSchema.safeParse(7).success).toBe(false);
    expect(LoyaltyPctSchema.safeParse(55).success).toBe(false);
    expect(LoyaltyPctSchema.safeParse(-5).success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Source — discriminated union
// ──────────────────────────────────────────────────────────────────────────

describe("SourceSchema — discriminated union", () => {
  it("akceptuje 3 source kinds", () => {
    expect(
      SourceSchema.safeParse({ kind: "auction", auctionId: 1n }).success,
    ).toBe(true);
    expect(SourceSchema.safeParse({ kind: "manual" }).success).toBe(true);
    expect(
      SourceSchema.safeParse({ kind: "imported", from: "tibia-com" }).success,
    ).toBe(true);
  });

  it("AuctionSourceSchema wymaga bigint auctionId", () => {
    expect(AuctionSourceSchema.safeParse({ kind: "auction" }).success).toBe(
      false,
    );
    expect(
      AuctionSourceSchema.safeParse({ kind: "auction", auctionId: 1n }).success,
    ).toBe(true);
    // number NIE jest akceptowany (bigint wymagany).
    expect(
      AuctionSourceSchema.safeParse({ kind: "auction", auctionId: 1 }).success,
    ).toBe(false);
  });

  it("ManualSourceSchema — tylko kind (extra pola stripowane)", () => {
    expect(ManualSourceSchema.safeParse({ kind: "manual" }).success).toBe(true);
    // Zod default: nieznane pola są stripowane (nie odrzucane) — brak .strict().
    const result = ManualSourceSchema.safeParse({ kind: "manual", extra: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ kind: "manual" });
    }
  });

  it("ImportedSourceSchema — wymaga from='tibia-com'", () => {
    expect(
      ImportedSourceSchema.safeParse({ kind: "imported", from: "tibia-com" })
        .success,
    ).toBe(true);
    expect(
      ImportedSourceSchema.safeParse({ kind: "imported", from: "other" })
        .success,
    ).toBe(false);
    expect(ImportedSourceSchema.safeParse({ kind: "imported" }).success).toBe(
      false,
    );
  });

  it("odrzuca nieznany kind", () => {
    expect(SourceSchema.safeParse({ kind: "unknown" }).success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Edge values — granice i off-by-one
// ──────────────────────────────────────────────────────────────────────────

describe("edge values — granice", () => {
  it("level: 8 akceptowany, 7 odrzucony", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        identity: { ...base.identity, level: 8 },
      }).success,
    ).toBe(true);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        identity: { ...base.identity, level: 7 },
      }).success,
    ).toBe(false);
  });

  it("level: 2500 akceptowany, 2501 odrzucony", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        identity: { ...base.identity, level: 2500 },
      }).success,
    ).toBe(true);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        identity: { ...base.identity, level: 2501 },
      }).success,
    ).toBe(false);
  });

  it("level: nie-integer odrzucony (250.5)", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        identity: { ...base.identity, level: 250.5 },
      }).success,
    ).toBe(false);
  });

  it("vocation='Wizard' odrzucony", () => {
    const base = fixtureManual();
    const result = CharacterSnapshotSchema.safeParse({
      ...base,
      identity: {
        ...base.identity,
        vocation: "Wizard" as unknown as "Knight",
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("vocation")),
      ).toBe(true);
    }
  });

  it("gems: -1 odrzucony dla każdego z 3 pól", () => {
    const base = fixtureManual();
    for (const field of ["lesser", "regular", "greater"] as const) {
      const result = CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          gems: { lesser: 0, regular: 0, greater: 0, [field]: -1 },
        },
      });
      expect(result.success, `gems.${field}=-1`).toBe(false);
    }
  });

  it("skill.base: -5 odrzucony, 0 akceptowany", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        skills: { ...emptySkills(), magic: { base: -5 } },
      }).success,
    ).toBe(false);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        skills: { ...emptySkills(), magic: { base: 0 } },
      }).success,
    ).toBe(true);
  });

  it("skill.base: nie-integer odrzucony (10.5)", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        skills: { ...emptySkills(), magic: { base: 10.5 } },
      }).success,
    ).toBe(false);
  });

  it("loyaltyPct=7 odrzucony", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        skills: { ...emptySkills(), magic: { base: 50, loyaltyPct: 7 } },
      }).success,
    ).toBe(false);
  });

  it("percentToNext: -1 i 101 odrzucone, 0 i 100 akceptowane", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        skills: { ...emptySkills(), magic: { base: 0, percentToNext: -1 } },
      }).success,
    ).toBe(false);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        skills: { ...emptySkills(), magic: { base: 0, percentToNext: 101 } },
      }).success,
    ).toBe(false);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        skills: { ...emptySkills(), magic: { base: 0, percentToNext: 0 } },
      }).success,
    ).toBe(true);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        skills: { ...emptySkills(), magic: { base: 0, percentToNext: 100 } },
      }).success,
    ).toBe(true);
  });

  it("goldTotal: -1 odrzucony", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: { ...base.assets, goldTotal: -1 },
      }).success,
    ).toBe(false);
  });

  it("blessingsActive: 8 odrzucony, 7 akceptowany", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        flags: { ...base.flags, blessingsActive: 8 },
      }).success,
    ).toBe(false);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        flags: { ...base.flags, blessingsActive: 7 },
      }).success,
    ).toBe(true);
  });

  it("name: pusty string odrzucony", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        identity: { ...base.identity, name: "" },
      }).success,
    ).toBe(false);
  });

  it("world: pusty string odrzucony (gdy obecny)", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        identity: { ...base.identity, world: "" },
      }).success,
    ).toBe(false);
  });

  it("itemId: 0 i ujemne odrzucone, 1 akceptowany", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          items: [{ itemId: 0, quantity: 1 }],
        },
      }).success,
    ).toBe(false);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          items: [{ itemId: -5, quantity: 1 }],
        },
      }).success,
    ).toBe(false);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          items: [{ itemId: 1, quantity: 1 }],
        },
      }).success,
    ).toBe(true);
  });

  it("quantity: 0 odrzucone (positive wymagane)", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          items: [{ itemId: 3079, quantity: 0 }],
        },
      }).success,
    ).toBe(false);
  });

  it("outfit addons: -1 i 8 odrzucone, 0 i 7 akceptowane", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          outfits: [{ outfitId: 962, addons: -1 }],
        },
      }).success,
    ).toBe(false);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          outfits: [{ outfitId: 962, addons: 8 }],
        },
      }).success,
    ).toBe(false);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          outfits: [{ outfitId: 962, addons: 0 }],
        },
      }).success,
    ).toBe(true);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          outfits: [{ outfitId: 962, addons: 7 }],
        },
      }).success,
    ).toBe(true);
  });

  it("mounts: 0 i ujemne odrzucone", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: { ...base.assets, mounts: [0] },
      }).success,
    ).toBe(false);
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: { ...base.assets, mounts: [-1] },
      }).success,
    ).toBe(false);
  });

  it("auction.bid: -1 odrzucony", () => {
    const base = fixtureManual();
    const auctionSnap = {
      ...base,
      source: { kind: "auction", auctionId: 1n },
      auction: {
        bid: -1,
        bidType: "current" as const,
        auctionStart: "2026-01-01T00:00:00Z",
        auctionEnd: "2026-01-02T00:00:00Z",
        status: "active" as const,
      },
    };
    expect(CharacterSnapshotSchema.safeParse(auctionSnap).success).toBe(false);
  });

  it("auction: puste auctionStart/auctionEnd odrzucone", () => {
    const base = fixtureManual();
    const auctionSnap = {
      ...base,
      source: { kind: "auction", auctionId: 1n },
      auction: {
        bid: 100,
        bidType: "current" as const,
        auctionStart: "",
        auctionEnd: "2026-01-02T00:00:00Z",
        status: "active" as const,
      },
    };
    expect(CharacterSnapshotSchema.safeParse(auctionSnap).success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Cross-validation refinements
// ──────────────────────────────────────────────────────────────────────────

describe("cross-validation refinements", () => {
  it("auction obecny ale source.kind != 'auction' → odrzucony", () => {
    const base = fixtureManual();
    const result = CharacterSnapshotSchema.safeParse({
      ...base,
      auction: {
        bid: 100,
        bidType: "current",
        auctionStart: "2026-01-01T00:00:00Z",
        auctionEnd: "2026-01-02T00:00:00Z",
        status: "active",
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("auction"))).toBe(
        true,
      );
    }
  });

  it("source.kind='auction' bez pola auction → akceptowany (auction opcjonalny)", () => {
    const base = fixtureManual();
    const result = CharacterSnapshotSchema.safeParse({
      ...base,
      source: { kind: "auction", auctionId: 1n },
    });
    expect(result.success).toBe(true);
  });

  it("5×5 matrix vocation ↔ vocationPromoted", () => {
    const pairs = [
      ["Knight", "Elite Knight"],
      ["Paladin", "Royal Paladin"],
      ["Druid", "Elder Druid"],
      ["Sorcerer", "Master Sorcerer"],
      ["Monk", "Exalted Monk"],
    ] as const;
    for (const [vocation, promoted] of pairs) {
      const base = fixtureManual();
      const ok = CharacterSnapshotSchema.safeParse({
        ...base,
        identity: { ...base.identity, vocation, vocationPromoted: promoted },
      });
      expect(ok.success, `${vocation}→${promoted}`).toBe(true);
    }
  });

  it("każda z 20 niepoprawnych par vocation↔promoted odrzucona", () => {
    const bases = ["Knight", "Paladin", "Druid", "Sorcerer", "Monk"] as const;
    const promoted = [
      "Elite Knight",
      "Royal Paladin",
      "Elder Druid",
      "Master Sorcerer",
      "Exalted Monk",
    ] as const;
    for (const v of bases) {
      for (const p of promoted) {
        const correct = {
          Knight: "Elite Knight",
          Paladin: "Royal Paladin",
          Druid: "Elder Druid",
          Sorcerer: "Master Sorcerer",
          Monk: "Exalted Monk",
        }[v];
        if (p === correct) continue;
        const base = fixtureManual();
        const result = CharacterSnapshotSchema.safeParse({
          ...base,
          identity: {
            ...base.identity,
            vocation: v,
            vocationPromoted: p,
          },
        });
        expect(result.success, `${v}→${p}`).toBe(false);
      }
    }
  });

  it("questsCompleted > questsTotal → odrzucony", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        progression: { ...base.progression, questsCompleted: 50, questsTotal: 42 },
      }).success,
    ).toBe(false);
  });

  it("questsCompleted == questsTotal → akceptowany", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        progression: { ...base.progression, questsCompleted: 42, questsTotal: 42 },
      }).success,
    ).toBe(true);
  });

  it("imbuementsUnlocked > imbuementsTotal → odrzucony", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        progression: {
          ...base.progression,
          imbuementsUnlocked: 30,
          imbuementsTotal: 23,
        },
      }).success,
    ).toBe(false);
  });

  it("imbuementsUnlocked == imbuementsTotal → akceptowany", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        progression: {
          ...base.progression,
          imbuementsUnlocked: 23,
          imbuementsTotal: 23,
        },
      }).success,
    ).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. Bigint precision
// ──────────────────────────────────────────────────────────────────────────

describe("bigint precision", () => {
  it("auctionId 9_007_199_254_740_991n (MAX_SAFE_INTEGER+1) zachowany", () => {
    const hugeId = 9_007_199_254_740_991n;
    const base = fixtureManual();
    const result = CharacterSnapshotSchema.safeParse({
      ...base,
      source: { kind: "auction", auctionId: hugeId },
      auction: {
        bid: 1,
        bidType: "current",
        auctionStart: "2026-01-01T00:00:00Z",
        auctionEnd: "2026-01-02T00:00:00Z",
        status: "active",
      },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.source.kind === "auction") {
      expect(result.data.source.auctionId).toBe(hugeId);
      expect(typeof result.data.source.auctionId).toBe("bigint");
    }
  });

  it("auctionId jako number → odrzucony (bigint wymagany)", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        source: {
          kind: "auction",
          auctionId: 2173376 as unknown as bigint,
        },
      }).success,
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. strict() — odrzuca nieznane pola (R1 future-proof)
// ──────────────────────────────────────────────────────────────────────────

describe("strict() — odrzuca nieznane pola", () => {
  it("obce pole na top-level → odrzucone", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({ ...base, extraField: 1 }).success,
    ).toBe(false);
  });

  it("obce pole w identity → stripowane (IdentitySchema nie ma .strict())", () => {
    const base = fixtureManual();
    const result = CharacterSnapshotSchema.safeParse({
      ...base,
      identity: { ...base.identity, extra: 1 },
    });
    // IdentitySchema nie ma .strict() — Zod stripuje nieznane pola.
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.identity).not.toHaveProperty("extra");
    }
  });

  it("obce pole w skills → odrzucone", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        skills: { ...emptySkills(), unknownSkill: { base: 10 } },
      }).success,
    ).toBe(false);
  });

  it("obce pole w progression → odrzucone", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        progression: { ...base.progression, extra: 1 },
      }).success,
    ).toBe(false);
  });

  it("obce pole w assets → odrzucone", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: { ...base.assets, extra: 1 },
      }).success,
    ).toBe(false);
  });

  it("obce pole w flags → odrzucone", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        flags: { ...base.flags, extra: true },
      }).success,
    ).toBe(false);
  });

  it("obce pole w auction → odrzucone", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        source: { kind: "auction", auctionId: 1n },
        auction: {
          bid: 100,
          bidType: "current",
          auctionStart: "2026-01-01T00:00:00Z",
          auctionEnd: "2026-01-02T00:00:00Z",
          status: "active",
          extra: 1,
        },
      }).success,
    ).toBe(false);
  });

  it("obce pole w item → odrzucone", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          items: [{ itemId: 3079, quantity: 1, extra: 1 }],
        },
      }).success,
    ).toBe(false);
  });

  it("obce pole w outfit → odrzucone", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          outfits: [{ outfitId: 962, addons: 3, extra: 1 }],
        },
      }).success,
    ).toBe(false);
  });

  it("obce pole w gems → odrzucone", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          gems: { lesser: 0, regular: 0, greater: 0, extra: 1 },
        },
      }).success,
    ).toBe(false);
  });

  it("obce pole w storeCounts → odrzucone", () => {
    const base = fixtureManual();
    expect(
      CharacterSnapshotSchema.safeParse({
        ...base,
        assets: {
          ...base.assets,
          storeCounts: { outfits: 0, mounts: 0, items: 0, extra: 1 },
        },
      }).success,
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 7. Zagnieżdżone schemy — bezpośrednie testy
// ──────────────────────────────────────────────────────────────────────────

describe("zagnieżdżone schemy", () => {
  it("IdentitySchema — pełny obiekt", () => {
    const ok = IdentitySchema.safeParse({
      name: "Migzen",
      level: 619,
      vocation: "Monk",
      vocationPromoted: "Exalted Monk",
      sex: "M",
      world: "Jadebra",
    });
    expect(ok.success).toBe(true);
    // world opcjonalny
    const noWorld = IdentitySchema.safeParse({
      name: "X",
      level: 100,
      vocation: "Knight",
      vocationPromoted: "Elite Knight",
      sex: "F",
    });
    expect(noWorld.success).toBe(true);
  });

  it("SkillsSchema — wymaga wszystkich 8 kluczy", () => {
    expect(SkillsSchema.safeParse(emptySkills()).success).toBe(true);
    const missing = { ...emptySkills() };
    delete (missing as Partial<typeof missing>).magic;
    expect(SkillsSchema.safeParse(missing).success).toBe(false);
  });

  it("ProgressionSchema — akceptuje pełny obiekt", () => {
    expect(ProgressionSchema.safeParse(zeroProgression()).success).toBe(true);
  });

  it("AssetsSchema — akceptuje pełny obiekt", () => {
    expect(AssetsSchema.safeParse(emptyAssets()).success).toBe(true);
  });

  it("FlagsSchema — akceptuje pełny obiekt", () => {
    expect(FlagsSchema.safeParse(emptyFlags()).success).toBe(true);
  });

  it("AuctionContextSchema — akceptuje pełny obiekt", () => {
    const ok = AuctionContextSchema.safeParse({
      bid: 25501,
      bidType: "current",
      auctionStart: "2026-09-08T10:00:00Z",
      auctionEnd: "2026-09-08T22:00:00Z",
      status: "active",
    });
    expect(ok.success).toBe(true);
  });

  it("InventoryItemSchema — tier opcjonalny", () => {
    expect(
      InventoryItemSchema.safeParse({ itemId: 3079, quantity: 1 }).success,
    ).toBe(true);
    expect(
      InventoryItemSchema.safeParse({ itemId: 3079, quantity: 1, tier: 3 })
        .success,
    ).toBe(true);
  });

  it("OwnedOutfitSchema — addons 0..7", () => {
    expect(
      OwnedOutfitSchema.safeParse({ outfitId: 962, addons: 3 }).success,
    ).toBe(true);
    expect(
      OwnedOutfitSchema.safeParse({ outfitId: 962, addons: 9 }).success,
    ).toBe(false);
  });

  it("GemsSchema — wymaga 3 pól", () => {
    expect(
      GemsSchema.safeParse({ lesser: 0, regular: 0, greater: 0 }).success,
    ).toBe(true);
    expect(GemsSchema.safeParse({ lesser: 0 }).success).toBe(false);
  });

  it("StoreCountsSchema — wymaga 3 pól", () => {
    expect(
      StoreCountsSchema.safeParse({ outfits: 0, mounts: 0, items: 0 }).success,
    ).toBe(true);
    expect(StoreCountsSchema.safeParse({ outfits: 0 }).success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 8. Struktura i stałe
// ──────────────────────────────────────────────────────────────────────────

describe("struktura i stałe", () => {
  it("SKILL_KEYS: 8 kluczy w kolejności z arch. §13.1", () => {
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

  it("z.infer<CharacterSnapshotSchema> === manual (typ)", () => {
    // Typy są sprawdzane w compile-time; w runtime weryfikujemy że
    // schema zwraca obiekt zgodny z interfejsem.
    const snap = fixtureManual();
    const typed: CharacterSnapshot = snap;
    expect(typed.source.kind).toBe("manual");
    // z.infer daje ten sam typ co CharacterSnapshot.
    const inferred: z.infer<typeof CharacterSnapshotSchema> = snap;
    expect(inferred.identity.level).toBe(100);
  });

  it("parse jest deterministyczny (immutable)", () => {
    const original = fixtureManual();
    const reparsed = CharacterSnapshotSchema.parse(original);
    expect(reparsed).toEqual(original);
    // Zod nie mutuje wejścia.
    expect(original.identity.name).toBe("Test");
  });

  it("safeParse zwraca success:false z issues dla invalid", () => {
    const base = fixtureManual();
    const result = CharacterSnapshotSchema.safeParse({
      ...base,
      identity: { ...base.identity, level: 7 },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(result.error.issues[0]?.path).toContain("level");
    }
  });
});