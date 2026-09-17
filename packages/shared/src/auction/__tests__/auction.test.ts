/**
 * Testy modułu aukcji Bazaar — task 28.
 *
 * Pokrycie (arch. §7.2 + plan task 28):
 *   1. Pozytywne fixture'y (10+ snapshots — różne vocations, bidTypes, statuses)
 *   2. Edge cases (level 7, level 2501, vocation='Wizard', skill=-5, ...)
 *   3. Cross-validation refinements (auctionEnd ≤ auctionStart,
 *      vocationPromoted mismatch, questsCompleted>questsTotal, status=sold
 *      bez finalPrice, bidType='minimum' z bid=0, ...)
 *   4. Relacje 1:N (AuctionSkill, AuctionItem, AuctionOutfit, AuctionMount,
 *      AuctionUsp, AuctionSkillLoyalty) — poprawność PK i FK
 *   5. Strict mode — odrzuca nieznane pola (R1 future-proof)
 *   6. Transform — auto-uzupełnienie searchVector i pricePerLevel
 *   7. z.infer ≡ interface manual (kompilacja TS potwierdza zgodność)
 *   8. Round-trip (schema → parse → schema jest idempotentny)
 */
import { describe, expect, it } from "vitest";

import {
  AuctionSchema,
  AuctionSkillSchema,
  AuctionItemSchema,
  AuctionOutfitSchema,
  AuctionMountSchema,
  AuctionUspSchema,
  AuctionSkillLoyaltySchema,
  AUCTION_SKILL_KEYS,
  VOCATION_BASE_TO_PROMOTED,
  type Auction,
  type AuctionSkill,
  type AuctionItem,
  type AuctionOutfit,
  type AuctionMount,
  type AuctionUsp,
  type AuctionSkillLoyalty,
} from "../index.js";

// ──────────────────────────────────────────────────────────────────────────
// Helpers — budowanie fixture'ów (różne vocations / bidTypes / statuses)
// ──────────────────────────────────────────────────────────────────────────

/** Minimalna poprawna aukcja (wszystkie domyślne wartości, status='active'). */
function minimalAuction(overrides: Partial<Auction> = {}): Auction {
  return AuctionSchema.parse({
    id: 2173376n,
    name: "Migzen",
    level: 619,
    vocation: "Monk",
    vocationPromoted: "Exalted Monk",
    sex: "M",
    worldId: 42,
    bid: 25501,
    bidType: "current",
    auctionStart: "2026-09-08T10:00:00Z",
    auctionEnd: "2026-09-08T22:00:00Z",
    status: "active",
    rawJson: { source: "tibia.com", auction_id: 2173376 },
    firstSeenAt: "2026-09-08T09:00:00Z",
    lastSeenAt: "2026-09-08T22:00:00Z",
    scrapedAt: "2026-09-08T22:01:00Z",
    ...overrides,
  });
}

/**
 * Pełna aukcja ze wszystkimi denormalizowanymi gorącymi filtrami,
 * flagami boolean i progresją — typowy "high-end" character z Bazaara.
 */
function fullAuctionEliteKnight(): Auction {
  return AuctionSchema.parse({
    id: 3000001n,
    name: "Darkstorm Knight",
    level: 850,
    vocation: "Knight",
    vocationPromoted: "Elite Knight",
    sex: "F",
    worldId: 17, // Antica
    outfitId: 962,
    bid: 45000,
    bidType: "current",
    auctionStart: "2026-09-09T08:00:00Z",
    auctionEnd: "2026-09-11T20:00:00Z",
    status: "active",
    // 8 denormalizowanych skilli (arch. §7.1 pkt 1)
    skillMagic: 35,
    skillClub: 130,
    skillFist: 25,
    skillSword: 145,
    skillAxe: 110,
    skillDistance: 90,
    skillShielding: 138,
    skillFishing: 12,
    // Progresja
    charmPoints: 15000,
    charmPointsUnused: 200,
    minorCharmEchoes: 50,
    bossPoints: 5800,
    imbuementsUnlocked: 22,
    imbuementsTotal: 23,
    questsCompleted: 41,
    questsTotal: 42,
    achievementPoints: 3200,
    animusMasteries: 250,
    // Gemy + zasoby
    gemsLesser: 88,
    gemsRegular: 12,
    gemsGreater: 3,
    storeOutfitsCount: 15,
    storeMountsCount: 12,
    storeItemsCount: 85,
    hirelingsCount: 4,
    goldTotal: 25_000_000n,
    tcInvested: 7200,
    // Flagi
    hasSoulWar: true,
    hasPrimalOrdeal: true,
    hasWorldTransfer: true,
    hasPreySlot: true,
    hasCharmExpansion: true,
    hasWeeklyTaskExpansion: true,
    hasTwistOfFate: true,
    blessingsActive: 7,
    // Waloryzacja
    estimatedValue: 85000,
    valueConfidence: 0.95,
    pricePerLevel: 45000 / 850, // 52.94...
    rawJson: {/* pełny payload — future-proof */},
    firstSeenAt: "2026-09-09T08:00:00Z",
    lastSeenAt: "2026-09-09T08:01:00Z",
    scrapedAt: "2026-09-09T08:01:00Z",
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Pozytywne fixture'y (10+ snapshots)
// ──────────────────────────────────────────────────────────────────────────

describe("pozytywne fixture'y", () => {
  it("akceptuje minimalną aukcję (Knight, current, active)", () => {
    const a = minimalAuction({
      name: "Test Knight",
      vocation: "Knight",
      vocationPromoted: "Elite Knight",
    });
    expect(a.id).toBe(2173376n);
    expect(a.vocation).toBe("Knight");
    expect(a.bidType).toBe("current");
    expect(a.status).toBe("active");
  });

  it("akceptuje pełną aukcję Elite Knight (wszystkie 60+ kolumn)", () => {
    const a = fullAuctionEliteKnight();
    expect(a.skillSword).toBe(145);
    expect(a.hasSoulWar).toBe(true);
    expect(a.blessingsActive).toBe(7);
    expect(a.goldTotal).toBe(25_000_000n);
    expect(a.pricePerLevel).toBeCloseTo(52.94, 1);
  });

  it("akceptuje Royal Paladin (vocation + vocationPromoted spójne)", () => {
    const a = minimalAuction({
      name: "Paladin Test",
      vocation: "Paladin",
      vocationPromoted: "Royal Paladin",
    });
    expect(a.vocationPromoted).toBe("Royal Paladin");
  });

  it("akceptuje postać NIEPROMOWANĄ (vocation == vocationPromoted)", () => {
    const a = minimalAuction({
      name: "Fresh Paladin",
      level: 8,
      vocation: "Paladin",
      vocationPromoted: "Paladin",
    });
    expect(a.vocationPromoted).toBe("Paladin");
  });

  it("odrzuca niespójną promocję (vocation Paladin + Elite Knight)", () => {
    const result = AuctionSchema.safeParse({
      ...minimalAuction(),
      vocation: "Paladin",
      vocationPromoted: "Elite Knight",
    });
    expect(result.success).toBe(false);
  });

  it("akceptuje Elder Druid (Female)", () => {
    const a = minimalAuction({
      name: "Druidka",
      vocation: "Druid",
      vocationPromoted: "Elder Druid",
      sex: "F",
    });
    expect(a.vocation).toBe("Druid");
    expect(a.sex).toBe("F");
  });

  it("akceptuje Master Sorcerer (bidType='minimum', bid=0)", () => {
    const a = minimalAuction({
      name: "Sorcerer",
      vocation: "Sorcerer",
      vocationPromoted: "Master Sorcerer",
      bid: 0,
      bidType: "minimum",
    });
    expect(a.bidType).toBe("minimum");
    expect(a.bid).toBe(0);
  });

  it("akceptuje Exalted Monk (status='sold', finalPrice required)", () => {
    const a = minimalAuction({
      name: "Monk Sold",
      vocation: "Monk",
      vocationPromoted: "Exalted Monk",
      status: "sold",
      finalPrice: 32000,
    });
    expect(a.status).toBe("sold");
    expect(a.finalPrice).toBe(32000);
  });

  it("akceptuje status='finished' z finalPrice=null (bez kupca)", () => {
    const a = minimalAuction({
      name: "Finished",
      status: "finished",
      finalPrice: null,
    });
    expect(a.status).toBe("finished");
    expect(a.finalPrice).toBeNull();
  });

  it("akceptuje status='cancelled'", () => {
    const a = minimalAuction({
      name: "Cancelled",
      status: "cancelled",
      finalPrice: null,
    });
    expect(a.status).toBe("cancelled");
  });

  it("akceptuje aukcję z dużym bigint ID (Number.MAX_SAFE_INTEGER)", () => {
    const hugeId = BigInt(Number.MAX_SAFE_INTEGER) + 100n;
    const a = minimalAuction({ id: hugeId });
    expect(a.id).toBe(hugeId);
  });

  it("akceptuje aukcję z outfit=null (postać bez outfitu)", () => {
    const a = minimalAuction({ outfitId: null });
    expect(a.outfitId).toBeNull();
  });

  it("akceptuje aukcję z tcInvested=null (nie wykryto)", () => {
    const a = minimalAuction({ tcInvested: null });
    expect(a.tcInvested).toBeNull();
  });

  it("akceptuje aukcję z archivedAt=null (nie archiwizowana)", () => {
    const a = minimalAuction({ archivedAt: null });
    expect(a.archivedAt).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Edge cases — odrzucenie niepoprawnych wartości
// ──────────────────────────────────────────────────────────────────────────

describe("edge cases (odrzucenie niepoprawnych wartości)", () => {
  it("odrzuca level < 8", () => {
    expect(() => minimalAuction({ level: 7 })).toThrow();
  });

  it("odrzuca level > 2500", () => {
    expect(() => minimalAuction({ level: 2501 })).toThrow();
  });

  it("odrzuca level = 7.5 (musi być int)", () => {
    expect(() => minimalAuction({ level: 7.5 })).toThrow();
  });

  it("odrzuca pustą nazwę", () => {
    expect(() => minimalAuction({ name: "" })).toThrow();
  });

  it("odrzuca nazwę dłuższą niż 50 znaków", () => {
    expect(() => minimalAuction({ name: "x".repeat(51) })).toThrow();
  });

  it("odrzuca vocation='Wizard' (nie ma w enum)", () => {
    expect(() =>
      minimalAuction({
        vocation: "Wizard" as never,
        vocationPromoted: "Master Sorcerer",
      }),
    ).toThrow();
  });

  it("odrzuca vocationPromoted='Champion' (nie ma w enum)", () => {
    expect(() =>
      minimalAuction({
        vocation: "Knight",
        vocationPromoted: "Champion" as never,
      }),
    ).toThrow();
  });

  it("odrzuca sex='X'", () => {
    expect(() => minimalAuction({ sex: "X" as never })).toThrow();
  });

  it("odrzuca bid ujemny", () => {
    expect(() => minimalAuction({ bid: -1 })).toThrow();
  });

  it("odrzuca skill < 0", () => {
    expect(() => minimalAuction({ skillMagic: -5 })).toThrow();
  });

  it("odrzuca blessingsActive > 7", () => {
    expect(() => minimalAuction({ blessingsActive: 8 })).toThrow();
  });

  it("odrzuca id = 0 (musi być positive)", () => {
    expect(() => minimalAuction({ id: 0n })).toThrow();
  });

  it("odrzuca id ujemne", () => {
    expect(() => minimalAuction({ id: -1n })).toThrow();
  });

  it("odrzuca valueConfidence > 1", () => {
    expect(() => minimalAuction({ valueConfidence: 1.5 })).toThrow();
  });

  it("odrzuca valueConfidence < 0", () => {
    expect(() => minimalAuction({ valueConfidence: -0.1 })).toThrow();
  });

  it("odrzuca worldId = 0 (FK)", () => {
    expect(() => minimalAuction({ worldId: 0 })).toThrow();
  });

  it("odrzuca goldTotal ujemne", () => {
    expect(() => minimalAuction({ goldTotal: -100n })).toThrow();
  });

  it("odrzuca zły format ISO datetime", () => {
    expect(() => minimalAuction({ auctionStart: "wczoraj" })).toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Cross-validation refinements (arch. §7.2 + task 28)
// ──────────────────────────────────────────────────────────────────────────

describe("cross-validation refinements", () => {
  it("odrzuca auctionEnd ≤ auctionStart", () => {
    expect(() =>
      minimalAuction({
        auctionStart: "2026-09-09T10:00:00Z",
        auctionEnd: "2026-09-09T10:00:00Z",
      }),
    ).toThrow(/auctionEnd musi być po auctionStart/);
  });

  it("odrzuca auctionEnd < auctionStart", () => {
    expect(() =>
      minimalAuction({
        auctionStart: "2026-09-09T20:00:00Z",
        auctionEnd: "2026-09-09T10:00:00Z",
      }),
    ).toThrow(/auctionEnd musi być po auctionStart/);
  });

  it("odrzuca questsCompleted > questsTotal", () => {
    expect(() =>
      minimalAuction({
        questsCompleted: 50,
        questsTotal: 42,
      }),
    ).toThrow(/questsCompleted nie może przekraczać questsTotal/);
  });

  it("akceptuje questsCompleted == questsTotal (edge)", () => {
    const a = minimalAuction({ questsCompleted: 42, questsTotal: 42 });
    expect(a.questsCompleted).toBe(42);
  });

  it("odrzuca imbuementsUnlocked > imbuementsTotal", () => {
    expect(() =>
      minimalAuction({
        imbuementsUnlocked: 30,
        imbuementsTotal: 23,
      }),
    ).toThrow(/imbuementsUnlocked nie może przekraczać imbuementsTotal/);
  });

  it("odrzuca status='sold' bez finalPrice", () => {
    expect(() =>
      minimalAuction({
        status: "sold",
        finalPrice: null,
      }),
    ).toThrow(/finalPrice jest wymagany gdy status='sold'/);
  });

  it("akceptuje status='sold' z finalPrice=0 (granica)", () => {
    const a = minimalAuction({ status: "sold", finalPrice: 0 });
    expect(a.status).toBe("sold");
    expect(a.finalPrice).toBe(0);
  });

  it("akceptuje status='finished' z finalPrice=null (zakończona bez kupca)", () => {
    const a = minimalAuction({ status: "finished", finalPrice: null });
    expect(a.status).toBe("finished");
    expect(a.finalPrice).toBeNull();
  });

  it("odrzuca vocationPromoted niezgodny z vocation (Knight → Royal Paladin)", () => {
    expect(() =>
      minimalAuction({
        vocation: "Knight",
        vocationPromoted: "Royal Paladin",
      }),
    ).toThrow(/vocationPromoted musi być promowaną formą/);
  });

  it("odrzuca vocationPromoted niezgodny (Druid → Master Sorcerer)", () => {
    expect(() =>
      minimalAuction({
        vocation: "Druid",
        vocationPromoted: "Master Sorcerer",
      }),
    ).toThrow();
  });

  it("odrzuca vocationPromoted niezgodny (Monk → Elite Knight)", () => {
    expect(() =>
      minimalAuction({
        vocation: "Monk",
        vocationPromoted: "Elite Knight",
      }),
    ).toThrow();
  });

  it("odrzuca pricePerLevel niezgodne z bid/level", () => {
    expect(() =>
      minimalAuction({
        bid: 1000,
        level: 100,
        pricePerLevel: 99, // powinno być 10
      }),
    ).toThrow(/pricePerLevel musi odpowiadać bid\/level/);
  });

  it("akceptuje pricePerLevel z tolerancją 0.01", () => {
    const a = minimalAuction({
      bid: 1000,
      level: 100,
      pricePerLevel: 10.005, // odchylenie < 0.01
    });
    expect(a.pricePerLevel).toBeCloseTo(10, 1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Strict mode — odrzuca nieznane pola (R1 future-proof)
// ──────────────────────────────────────────────────────────────────────────

describe("strict mode (odrzuca nieznane pola)", () => {
  it("odrzuca nieznane pole w AuctionSchema", () => {
    expect(() =>
      AuctionSchema.parse({
        id: 1n,
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
        worldId: 1,
        bid: 100,
        bidType: "current",
        auctionStart: "2026-09-09T10:00:00Z",
        auctionEnd: "2026-09-09T20:00:00Z",
        status: "active",
        rawJson: {},
        firstSeenAt: "2026-09-09T09:00:00Z",
        lastSeenAt: "2026-09-09T09:00:00Z",
        scrapedAt: "2026-09-09T09:00:00Z",
        unknownField: "should-fail",
      }),
    ).toThrow();
  });

  it("odrzuca nieznane pole w AuctionItemSchema", () => {
    expect(() =>
      AuctionItemSchema.parse({
        auctionId: 1n,
        itemId: 1,
        quantity: 1,
        tier: 0,
        extraField: "bad",
      }),
    ).toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. Transform — auto-uzupełnienie searchVector i pricePerLevel
// ──────────────────────────────────────────────────────────────────────────

describe("transform (auto-uzupełnienie GENERATED fields)", () => {
  it("auto-generuje searchVector z name gdy brak", () => {
    const a = minimalAuction({ name: "Darkstorm Knight" });
    expect(a.searchVector).toBe("darkstorm knight");
  });

  it("zachowuje ręcznie podany searchVector", () => {
    const a = minimalAuction({
      name: "Test",
      searchVector: "custom:1",
    });
    expect(a.searchVector).toBe("custom:1");
  });

  it("auto-liczy pricePerLevel gdy brak (bid=1000, level=100 → 10)", () => {
    const a = minimalAuction({ bid: 1000, level: 100 });
    expect(a.pricePerLevel).toBe(10);
  });

  it("zachowuje ręcznie podany pricePerLevel", () => {
    const a = minimalAuction({
      bid: 1000,
      level: 100,
      pricePerLevel: 10.005,
    });
    expect(a.pricePerLevel).toBe(10.005);
  });

  it("pricePerLevel = 0 gdy bid = 0 (darmowa oferta)", () => {
    // Edge case: bid=0 i level=8 → pricePerLevel=0.
    const a = minimalAuction({ bid: 0, level: 8, pricePerLevel: 0 });
    expect(a.pricePerLevel).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. Relacje 1:N (AuctionSkill, AuctionItem, ...)
// ──────────────────────────────────────────────────────────────────────────

describe("relacje 1:N (arch. §7.2)", () => {
  it("AuctionSkillSchema akceptuje poprawny wpis", () => {
    const s: AuctionSkill = AuctionSkillSchema.parse({
      auctionId: 1n,
      skill: "sword",
      baseValue: 113,
      loyaltyValue: 119,
    });
    expect(s.skill).toBe("sword");
    expect(s.loyaltyValue).toBe(119);
  });

  it("AuctionSkillSchema odrzuca skill spoza enuma", () => {
    expect(() =>
      AuctionSkillSchema.parse({
        auctionId: 1n,
        skill: "flying",
        baseValue: 100,
      }),
    ).toThrow();
  });

  it("AuctionSkillSchema odrzuca baseValue > 250", () => {
    expect(() =>
      AuctionSkillSchema.parse({
        auctionId: 1n,
        skill: "sword",
        baseValue: 500,
      }),
    ).toThrow();
  });

  it("AuctionSkillSchema akceptuje loyaltyValue=null", () => {
    const s = AuctionSkillSchema.parse({
      auctionId: 1n,
      skill: "magic",
      baseValue: 50,
      loyaltyValue: null,
    });
    expect(s.loyaltyValue).toBeNull();
  });

  it("AuctionItemSchema wymaga quantity ≥ 1", () => {
    expect(() =>
      AuctionItemSchema.parse({
        auctionId: 1n,
        itemId: 3079,
        quantity: 0,
        tier: null,
      }),
    ).toThrow();
  });

  it("AuctionItemSchema akceptuje tier=0 (base)", () => {
    const i: AuctionItem = AuctionItemSchema.parse({
      auctionId: 1n,
      itemId: 3079,
      quantity: 1,
      tier: 0,
    });
    expect(i.tier).toBe(0);
  });

  it("AuctionItemSchema odrzuca tier > 3", () => {
    expect(() =>
      AuctionItemSchema.parse({
        auctionId: 1n,
        itemId: 3079,
        quantity: 1,
        tier: 4 as never,
      }),
    ).toThrow();
  });

  it("AuctionItemSchema akceptuje tier=null (item bez tieru)", () => {
    const i = AuctionItemSchema.parse({
      auctionId: 1n,
      itemId: 3079,
      quantity: 5,
      tier: null,
    });
    expect(i.tier).toBeNull();
  });

  it("AuctionOutfitSchema waliduje addons 0-3", () => {
    expect(() =>
      AuctionOutfitSchema.parse({
        auctionId: 1n,
        outfitId: 962,
        addons: 4,
      }),
    ).toThrow();
    const o: AuctionOutfit = AuctionOutfitSchema.parse({
      auctionId: 1n,
      outfitId: 962,
      addons: 3,
    });
    expect(o.addons).toBe(3);
  });

  it("AuctionMountSchema wymaga mountId > 0", () => {
    expect(() => AuctionMountSchema.parse({ auctionId: 1n, mountId: 0 })).toThrow();
    const m: AuctionMount = AuctionMountSchema.parse({
      auctionId: 1n,
      mountId: 232,
    });
    expect(m.mountId).toBe(232);
  });

  it("AuctionUspSchema waliduje category 0-13", () => {
    expect(() =>
      AuctionUspSchema.parse({
        auctionId: 1n,
        category: 14,
        text: "test",
        sortOrder: 0,
      }),
    ).toThrow();
    const u: AuctionUsp = AuctionUspSchema.parse({
      auctionId: 1n,
      category: 0,
      text: "114 Axe Fighting (Loyalty bonus not included)",
      sortOrder: 1,
    });
    expect(u.category).toBe(0);
  });

  it("AuctionUspSchema odrzuca pusty tekst", () => {
    expect(() =>
      AuctionUspSchema.parse({
        auctionId: 1n,
        category: 0,
        text: "",
        sortOrder: 0,
      }),
    ).toThrow();
  });

  it("AuctionSkillLoyaltySchema wymaga loyaltyPct wielokrotności 5", () => {
    expect(() =>
      AuctionSkillLoyaltySchema.parse({
        auctionId: 1n,
        skill: "sword",
        baseValue: 100,
        loyaltyPct: 7, // nie wielokrotność 5
      }),
    ).toThrow();
  });

  it("AuctionSkillLoyaltySchema akceptuje loyaltyPct=0 (brak bonusu)", () => {
    const sl: AuctionSkillLoyalty = AuctionSkillLoyaltySchema.parse({
      auctionId: 1n,
      skill: "sword",
      baseValue: 100,
      loyaltyPct: 0,
    });
    expect(sl.loyaltyPct).toBe(0);
  });

  it("AuctionSkillLoyaltySchema akceptuje loyaltyPct=50 (max)", () => {
    const sl = AuctionSkillLoyaltySchema.parse({
      auctionId: 1n,
      skill: "magic",
      baseValue: 50,
      loyaltyPct: 50,
    });
    expect(sl.loyaltyPct).toBe(50);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 7. Round-trip i z.infer ≡ interface manual
// ──────────────────────────────────────────────────────────────────────────

describe("round-trip i struktura", () => {
  it("z.infer Auction ma dokładnie te same pola co ręczny interface (kompilacja TS)", () => {
    // Ten test przechodzi tylko jeśli typy są spójne — TypeScript
    // blokuje kompilację przy rozbieżności. Nie potrzeba asercji runtime.
    const a: Auction = minimalAuction();
    const manual: Auction = {
      id: a.id,
      name: a.name,
      level: a.level,
      vocation: a.vocation,
      vocationPromoted: a.vocationPromoted,
      sex: a.sex,
      worldId: a.worldId,
      outfitId: a.outfitId,
      bid: a.bid,
      bidType: a.bidType,
      auctionStart: a.auctionStart,
      auctionEnd: a.auctionEnd,
      status: a.status,
      finalPrice: a.finalPrice,
      skillMagic: a.skillMagic,
      skillClub: a.skillClub,
      skillFist: a.skillFist,
      skillSword: a.skillSword,
      skillAxe: a.skillAxe,
      skillDistance: a.skillDistance,
      skillShielding: a.skillShielding,
      skillFishing: a.skillFishing,
      charmPoints: a.charmPoints,
      charmPointsUnused: a.charmPointsUnused,
      minorCharmEchoes: a.minorCharmEchoes,
      bossPoints: a.bossPoints,
      imbuementsUnlocked: a.imbuementsUnlocked,
      imbuementsTotal: a.imbuementsTotal,
      questsCompleted: a.questsCompleted,
      questsTotal: a.questsTotal,
      achievementPoints: a.achievementPoints,
      animusMasteries: a.animusMasteries,
      gemsLesser: a.gemsLesser,
      gemsRegular: a.gemsRegular,
      gemsGreater: a.gemsGreater,
      storeOutfitsCount: a.storeOutfitsCount,
      storeMountsCount: a.storeMountsCount,
      storeItemsCount: a.storeItemsCount,
      hirelingsCount: a.hirelingsCount,
      goldTotal: a.goldTotal,
      tcInvested: a.tcInvested,
      hasSoulWar: a.hasSoulWar,
      hasPrimalOrdeal: a.hasPrimalOrdeal,
      hasWorldTransfer: a.hasWorldTransfer,
      hasPreySlot: a.hasPreySlot,
      hasCharmExpansion: a.hasCharmExpansion,
      hasWeeklyTaskExpansion: a.hasWeeklyTaskExpansion,
      hasTwistOfFate: a.hasTwistOfFate,
      blessingsActive: a.blessingsActive,
      estimatedValue: a.estimatedValue,
      valueConfidence: a.valueConfidence,
      pricePerLevel: a.pricePerLevel,
      rawJson: a.rawJson,
      searchVector: a.searchVector,
      firstSeenAt: a.firstSeenAt,
      lastSeenAt: a.lastSeenAt,
      scrapedAt: a.scrapedAt,
      archivedAt: a.archivedAt,
    };
    expect(manual).toEqual(a);
  });

  it("round-trip: parse → parse z wynikiem (deterministyczny)", () => {
    const first = minimalAuction();
    const second = AuctionSchema.parse(first);
    expect(second).toEqual(first);
  });

  it("AUCTION_SKILL_KEYS ma 8 elementów w stabilnej kolejności", () => {
    expect(AUCTION_SKILL_KEYS).toEqual([
      "magic",
      "club",
      "fist",
      "sword",
      "axe",
      "distance",
      "shielding",
      "fishing",
    ]);
    expect(AUCTION_SKILL_KEYS).toHaveLength(8);
  });

  it("VOCATION_BASE_TO_PROMOTED ma 6 par: 5 klas + None (postacie bez profesji)", () => {
    expect(VOCATION_BASE_TO_PROMOTED).toEqual({
      Knight: "Elite Knight",
      Paladin: "Royal Paladin",
      Druid: "Elder Druid",
      Sorcerer: "Master Sorcerer",
      Monk: "Exalted Monk",
      None: "None",
    });
  });

  it("AuctionSchema ma 50+ pól (60+ wymóg arch §7.2)", () => {
    // Policz klucze z inferowanego typu (runtime check).
    const sample = minimalAuction();
    const keys = Object.keys(sample);
    expect(keys.length).toBeGreaterThanOrEqual(50);
    // Sprawdźmy też kilka kluczowych nazw
    expect(keys).toContain("id");
    expect(keys).toContain("vocation");
    expect(keys).toContain("vocationPromoted");
    expect(keys).toContain("skillMagic");
    expect(keys).toContain("rawJson");
    expect(keys).toContain("searchVector");
    expect(keys).toContain("firstSeenAt");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 8. safeParse (bezpieczna walidacja w UI/API)
// ──────────────────────────────────────────────────────────────────────────

describe("safeParse — wygodna walidacja bez rzucania wyjątków", () => {
  it("zwraca success=true dla poprawnej aukcji", () => {
    const result = AuctionSchema.safeParse({
      id: 1n,
      name: "X",
      level: 100,
      vocation: "Knight",
      vocationPromoted: "Elite Knight",
      sex: "M",
      worldId: 1,
      bid: 100,
      bidType: "current",
      auctionStart: "2026-01-01T00:00:00Z",
      auctionEnd: "2026-01-02T00:00:00Z",
      status: "active",
      rawJson: {},
      firstSeenAt: "2026-01-01T00:00:00Z",
      lastSeenAt: "2026-01-01T00:00:00Z",
      scrapedAt: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("zwraca success=false z issues dla niepoprawnej aukcji", () => {
    const result = AuctionSchema.safeParse({
      id: 1n,
      name: "X",
      level: 5, // za niski
      vocation: "Knight",
      vocationPromoted: "Elite Knight",
      sex: "M",
      worldId: 1,
      bid: 100,
      bidType: "current",
      auctionStart: "2026-01-02T00:00:00Z",
      auctionEnd: "2026-01-01T00:00:00Z", // end < start
      status: "active",
      rawJson: {},
      firstSeenAt: "2026-01-01T00:00:00Z",
      lastSeenAt: "2026-01-01T00:00:00Z",
      scrapedAt: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      // Powinny być conajmniej 2 błędy (level + auctionEnd)
      const paths = result.error.issues.map((i: { path: (string | number)[] }) => i.path.join("."));
      expect(paths.some((p: string) => p.includes("level"))).toBe(true);
      expect(paths.some((p: string) => p.includes("auctionEnd"))).toBe(true);
    }
  });
});
