/**
 * Testy Valuation Engine (task 35 — arch §8.4).
 *
 * Pokrycie (12+ testów):
 *   - buildWeights: poprawny lookup, brakujące klucze, isActive=false
 *   - nonlinearSkillBoost: prog 100, 113, 120, 150, 250, determinizm
 *   - estimateValue — komponenty: BASE, SKILLS (vocation relevance),
 *     FEATURES (stałe kwoty), PROGRESSION (liniowe), COSMETICS, ASSETS
 *   - edge cases: minimum (level 8), maximum (level 2500), zero progression,
 *     vocation-irrelevant skills
 *   - Migzen benchmark: snapshot z fixture auction 2173376
 *   - determinizm: 100× identyczny input → identyczny output
 *   - monotoniczność: level/charm/feature ON vs OFF
 *   - invariant: suma komponentów = estimatedValue
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AuctionSchema, type Auction } from "@tibians/shared/auction";
import { VALUATION_RULES_SEED } from "@tibians/db/seed";

import {
  buildWeights,
  estimateValue,
  nonlinearSkillBoost,
  REQUIRED_RULE_KEYS,
  type ValuationBreakdown,
  type ValuationResult,
  type ValuationRule,
} from "./valuation.js";
import { parseAuctionDetail } from "./scrapers/auction-detail.js";

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/** Tworzy `ValuationRule[]` z seed (jako tablica DB rows) do testów. */
function rulesFromSeed(): ValuationRule[] {
  return VALUATION_RULES_SEED.map((rule, idx) => ({
    id: idx + 1,
    ruleKey: rule.ruleKey,
    category: rule.category,
    weight: rule.weight,
    formula: rule.formula,
    isActive: true,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  }));
}

/** Tworzy minimalny `Auction` z zerami i overrides. */
function makeAuction(overrides: Partial<Auction> = {}): Auction {
  const base = {
    id: 1n,
    name: "TestChar",
    level: 100,
    vocation: "Knight" as const,
    vocationPromoted: "Elite Knight" as const,
    sex: "M" as const,
    worldId: 1,
    bid: 0,
    bidType: "minimum" as const,
    auctionStart: "2026-09-01T00:00:00.000Z",
    auctionEnd: "2026-09-02T00:00:00.000Z",
    status: "active" as const,
    skillMagic: 0,
    skillClub: 0,
    skillFist: 0,
    skillSword: 0,
    skillAxe: 0,
    skillDistance: 0,
    skillShielding: 0,
    skillFishing: 0,
    charmPoints: 0,
    charmPointsUnused: 0,
    minorCharmEchoes: 0,
    bossPoints: 0,
    imbuementsUnlocked: 0,
    imbuementsTotal: 23,
    questsCompleted: 0,
    questsTotal: 42,
    achievementPoints: 0,
    animusMasteries: 0,
    gemsLesser: 0,
    gemsRegular: 0,
    gemsGreater: 0,
    storeOutfitsCount: 0,
    storeMountsCount: 0,
    storeItemsCount: 0,
    hirelingsCount: 0,
    goldTotal: 0n,
    hasSoulWar: false,
    hasPrimalOrdeal: false,
    hasWorldTransfer: false,
    hasPreySlot: false,
    hasCharmExpansion: false,
    hasWeeklyTaskExpansion: false,
    hasTwistOfFate: false,
    blessingsActive: 0,
    rawJson: {},
    firstSeenAt: "2026-09-01T00:00:00.000Z",
    lastSeenAt: "2026-09-01T00:00:00.000Z",
    scrapedAt: "2026-09-01T00:00:00.000Z",
  };
  const merged = { ...base, ...overrides } as Record<string, unknown>;
  const result = AuctionSchema.safeParse(merged);
  if (!result.success) {
    throw new Error(
      `Auction parse failed: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return result.data as Auction;
}

/** Wczytaj fixture HTML Migzen (auction 2173376) → Auction. */
function loadMigzenAuction(): Auction {
  const FIXTURES_DIR = resolve(
    import.meta.dirname,
    "./scrapers/__fixtures__",
  );
  const html = readFileSync(
    resolve(FIXTURES_DIR, "auction-detail-2173376.html"),
    "utf8",
  );
  const result = parseAuctionDetail(html, 2173376n);
  if (result.auction === null) {
    throw new Error(
      `Migzen fixture parse failed: ${result.parseError} ${result.warnings.join("; ")}`,
    );
  }
  return result.auction;
}

/** Suma wszystkich komponentów = estimatedValue (invariant). */
function sumBreakdown(r: ValuationResult): bigint {
  const b: ValuationBreakdown = r.breakdown;
  return (
    b.base.value +
    b.skills.value +
    b.features.value +
    b.progression.value +
    b.cosmetics.value +
    b.assets.value
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Testy — buildWeights
// ──────────────────────────────────────────────────────────────────────────

describe("buildWeights", () => {
  it("tworzy poprawny lookup z pełnego zestawu reguł", () => {
    const rules = rulesFromSeed();
    const w = buildWeights(rules);
    expect(w["base_level_weight"]).toBe(50.0);
    expect(w["skill_above_100_weight"]).toBe(100.0);
    expect(w["feature_soul_war"]).toBe(12_000);
    expect(w["asset_gold_to_tc"]).toBe(10_000);
  });

  it("rzuca Error gdy brakuje wymaganego klucza", () => {
    const rules = rulesFromSeed();
    const filtered = rules.filter((r) => r.ruleKey !== "base_level_weight");
    expect(() => buildWeights(filtered)).toThrowError(/base_level_weight/);
  });

  it("pomija reguły z isActive=false", () => {
    const rules = rulesFromSeed();
    // Cast do mutable — w runtime ignorujemy readonly (test setup)
    (rules[0] as { isActive: boolean }).isActive = false;
    expect(() => buildWeights(rules)).toThrowError(/base_level_weight/);
  });

  it("wymaga dokładnie 21 kluczy z REQUIRED_RULE_KEYS", () => {
    expect(REQUIRED_RULE_KEYS).toHaveLength(21);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Testy — nonlinearSkillBoost
// ──────────────────────────────────────────────────────────────────────────

describe("nonlinearSkillBoost", () => {
  it("skill = 100 → 0", () => {
    expect(nonlinearSkillBoost(100)).toBe(0n);
  });

  it("skill = 113 → floor(13^1.05) = 14", () => {
    expect(nonlinearSkillBoost(113)).toBe(14n);
  });

  it("skill = 120 → floor(20^1.05) = 23", () => {
    expect(nonlinearSkillBoost(120)).toBe(23n);
  });

  it("skill = 150 → floor(50^1.05) = 60", () => {
    expect(nonlinearSkillBoost(150)).toBe(60n);
  });

  it("skill = 250 (max Tibia) → floor(150^1.05) = 192", () => {
    expect(nonlinearSkillBoost(250)).toBe(192n);
  });

  it("skill < 100 → 0", () => {
    expect(nonlinearSkillBoost(50)).toBe(0n);
    expect(nonlinearSkillBoost(99)).toBe(0n);
  });

  it("determinizm: 100 wywołań → identyczny wynik", () => {
    for (let i = 0; i < 100; i++) {
      expect(nonlinearSkillBoost(150)).toBe(60n);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Testy — komponenty algorytmu (arch §8.4)
// ──────────────────────────────────────────────────────────────────────────

describe("estimateValue — BASE", () => {
  it("Knight level 100 → base = 100 × 50 = 5000 TC", () => {
    const auction = makeAuction({ level: 100 });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.base.value).toBe(5_000n);
  });

  it("Knight level 619 → base = 619 × 50 = 30 950 TC", () => {
    const auction = makeAuction({ level: 619 });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.base.value).toBe(30_950n);
  });

  it("base NIE zależy od vocation", () => {
    const knight = makeAuction({
      level: 200,
      vocation: "Knight",
      vocationPromoted: "Elite Knight",
    });
    const monk = makeAuction({
      level: 200,
      vocation: "Monk",
      vocationPromoted: "Exalted Monk",
    });
    expect(estimateValue(knight, rulesFromSeed()).breakdown.base.value).toBe(
      estimateValue(monk, rulesFromSeed()).breakdown.base.value,
    );
  });
});

describe("estimateValue — SKILLS", () => {
  it("Knight sword 120 + shielding 110 → relewantne, powyżej 100", () => {
    const auction = makeAuction({
      level: 8,
      skillSword: 120,
      skillShielding: 110,
    });
    const result = estimateValue(auction, rulesFromSeed());
    // sword: floor(20^1.05)=23 × 100 = 2300
    // shielding: floor(10^1.05)=11 × 100 = 1100
    // Suma: 3400
    expect(result.breakdown.skills.value).toBe(3_400n);
    expect(result.breakdown.skills.perSkill.sword).toBe(2_300n);
    expect(result.breakdown.skills.perSkill.shielding).toBe(1_100n);
  });

  it("Knight sword 100 + shielding 100 → 0 (próg)", () => {
    const auction = makeAuction({
      level: 8,
      skillSword: 100,
      skillShielding: 100,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.skills.value).toBe(0n);
  });

  it("Monk magic 113 → relewantny, sword 120 → irrelewantny", () => {
    const auction = makeAuction({
      level: 8,
      vocation: "Monk",
      vocationPromoted: "Exalted Monk",
      skillMagic: 113,
      skillSword: 120,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.skills.perSkill.magic).toBe(1_400n);
    expect(result.breakdown.skills.perSkill.sword).toBe(0n);
    expect(result.breakdown.skills.value).toBe(1_400n);
  });

  it("fishing 200 → 0 (nigdy nie ma wartości)", () => {
    const auction = makeAuction({ level: 8, skillFishing: 200 });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.skills.perSkill.fishing).toBe(0n);
  });

  it("Paladin distance 110 → 11 × 100 = 1100", () => {
    const auction = makeAuction({
      level: 8,
      vocation: "Paladin",
      vocationPromoted: "Royal Paladin",
      skillDistance: 110,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.skills.perSkill.distance).toBe(1_100n);
  });

  it("Sorcerer magic 130 → floor(30^1.05) = 35 × 100 = 3500", () => {
    const auction = makeAuction({
      level: 8,
      vocation: "Sorcerer",
      vocationPromoted: "Master Sorcerer",
      skillMagic: 130,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.skills.perSkill.magic).toBe(3_500n);
  });
});

describe("estimateValue — FEATURES", () => {
  it("Soul War ON → +12 000 TC", () => {
    const auction = makeAuction({ level: 8, hasSoulWar: true });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.features.value).toBe(12_000n);
    expect(result.breakdown.features.items[0]?.key).toBe("feature_soul_war");
  });

  it("Primal Ordeal ON → +12 000 TC", () => {
    const auction = makeAuction({ level: 8, hasPrimalOrdeal: true });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.features.value).toBe(12_000n);
    expect(result.breakdown.features.items[0]?.key).toBe(
      "feature_primal_ordeal",
    );
  });

  it("World Transfer ON → +15 000 TC", () => {
    const auction = makeAuction({ level: 8, hasWorldTransfer: true });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.features.value).toBe(15_000n);
  });

  it("Twist of Fate ON → +3 000 TC", () => {
    const auction = makeAuction({ level: 8, hasTwistOfFate: true });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.features.value).toBe(3_000n);
  });

  it("Wszystkie features ON → suma 12+12+15+2+2+2+3 = 48 000 TC", () => {
    const auction = makeAuction({
      level: 8,
      hasSoulWar: true,
      hasPrimalOrdeal: true,
      hasWorldTransfer: true,
      hasPreySlot: true,
      hasCharmExpansion: true,
      hasWeeklyTaskExpansion: true,
      hasTwistOfFate: true,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.features.value).toBe(48_000n);
    expect(result.breakdown.features.items).toHaveLength(7);
  });

  it("features OFF → features = 0n", () => {
    const auction = makeAuction({ level: 8 });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.features.value).toBe(0n);
    expect(result.breakdown.features.items).toHaveLength(0);
  });
});

describe("estimateValue — PROGRESSION", () => {
  it("charm 7611 × 2 + boss 2340 × 1 = 17 562 TC", () => {
    const auction = makeAuction({
      level: 8,
      charmPoints: 7_611,
      bossPoints: 2_340,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.progression.value).toBe(17_562n);
  });

  it("28 questów × 2000 + 11 imbues × 1000 = 67 000 TC", () => {
    const auction = makeAuction({
      level: 8,
      questsCompleted: 28,
      imbuementsUnlocked: 11,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.progression.items[2]?.value).toBe(56_000n);
    expect(result.breakdown.progression.items[3]?.value).toBe(11_000n);
    expect(result.breakdown.progression.value).toBe(67_000n);
  });

  it("achievement 1000 × 100 = 100 000 TC", () => {
    const auction = makeAuction({ level: 8, achievementPoints: 1_000 });
    const result = estimateValue(auction, rulesFromSeed());
    const achItem = result.breakdown.progression.items.find(
      (i) => i.key === "progression_achievement_points",
    );
    expect(achItem?.value).toBe(100_000n);
  });

  it("animus 180 × 500 = 90 000 TC", () => {
    const auction = makeAuction({ level: 8, animusMasteries: 180 });
    const result = estimateValue(auction, rulesFromSeed());
    const animItem = result.breakdown.progression.items.find(
      (i) => i.key === "progression_animus",
    );
    expect(animItem?.value).toBe(90_000n);
  });

  it("zero progression → progression = 0n", () => {
    const auction = makeAuction({ level: 8 });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.progression.value).toBe(0n);
    for (const item of result.breakdown.progression.items) {
      expect(item.value).toBe(0n);
    }
  });
});

describe("estimateValue — COSMETICS", () => {
  it("3 store outfity × 1000 + 2 store mounty × 2000 = 7000 TC", () => {
    const auction = makeAuction({
      level: 8,
      storeOutfitsCount: 3,
      storeMountsCount: 2,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.cosmetics.value).toBe(7_000n);
  });

  it("44 lesser + 10 regular + 2 greater gems = 13 400 TC", () => {
    const auction = makeAuction({
      level: 8,
      gemsLesser: 44,
      gemsRegular: 10,
      gemsGreater: 2,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.cosmetics.value).toBe(13_400n);
  });
});

describe("estimateValue — ASSETS", () => {
  it("gold 500 000 ÷ 10 000 = 50 TC", () => {
    const auction = makeAuction({ level: 8, goldTotal: 500_000n });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.assets.value).toBe(50n);
    expect(result.breakdown.assets.items[0]?.key).toBe("asset_gold_to_tc");
  });

  it("tc_invested 3 900 → 3 900 TC (1:1)", () => {
    const auction = makeAuction({ level: 8, tcInvested: 3_900 });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.assets.value).toBe(3_900n);
    expect(result.breakdown.assets.items[1]?.key).toBe("asset_tc_invested");
  });

  it("gold 0 + tc_invested undefined → assets = 0n", () => {
    const auction = makeAuction({
      level: 8,
      goldTotal: 0n,
      tcInvested: undefined,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.assets.value).toBe(0n);
  });

  it("gold 9 999 → 0 TC (floor)", () => {
    const auction = makeAuction({ level: 8, goldTotal: 9_999n });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.assets.value).toBe(0n);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Testy — edge cases
// ──────────────────────────────────────────────────────────────────────────

describe("estimateValue — edge cases", () => {
  it("minimum (level 8, no items) → tylko base = 400 TC", () => {
    const auction = makeAuction({ level: 8 });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.estimatedValue).toBe(400n);
    expect(result.breakdown.base.value).toBe(400n);
    expect(result.breakdown.skills.value).toBe(0n);
    expect(result.breakdown.features.value).toBe(0n);
    expect(result.breakdown.progression.value).toBe(0n);
    expect(result.breakdown.cosmetics.value).toBe(0n);
    expect(result.breakdown.assets.value).toBe(0n);
  });

  it("maximum (level 2500, all features, max progression) → wszystkie komponenty > 0", () => {
    const auction = makeAuction({
      level: 2_500,
      vocation: "Monk",
      vocationPromoted: "Exalted Monk",
      skillMagic: 250,
      skillFist: 250,
      skillSword: 250, // irrelewantny dla Monk
      skillShielding: 250, // irrelewantny dla Monk
      charmPoints: 100_000,
      bossPoints: 50_000,
      questsCompleted: 42,
      imbuementsUnlocked: 23,
      achievementPoints: 50_000,
      animusMasteries: 1_000,
      gemsLesser: 1_000,
      gemsRegular: 1_000,
      gemsGreater: 1_000,
      storeOutfitsCount: 50,
      storeMountsCount: 50,
      goldTotal: 100_000_000n,
      tcInvested: 10_000,
      hasSoulWar: true,
      hasPrimalOrdeal: true,
      hasWorldTransfer: true,
      hasPreySlot: true,
      hasCharmExpansion: true,
      hasWeeklyTaskExpansion: true,
      hasTwistOfFate: true,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.estimatedValue).toBeGreaterThan(0n);
    expect(result.breakdown.base.value).toBeGreaterThan(0n);
    expect(result.breakdown.skills.value).toBeGreaterThan(0n);
    expect(result.breakdown.features.value).toBeGreaterThan(0n);
    expect(result.breakdown.progression.value).toBeGreaterThan(0n);
    expect(result.breakdown.cosmetics.value).toBeGreaterThan(0n);
    expect(result.breakdown.assets.value).toBeGreaterThan(0n);
  });

  it("defensywne: goldTotal=0, tcInvested=0 → base tylko", () => {
    const auction = makeAuction({
      level: 50,
      goldTotal: 0n,
      tcInvested: 0,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.estimatedValue).toBe(2_500n);
  });

  it("skill > 100 ale vocation-irrelevant → skill = 0", () => {
    const auction = makeAuction({
      level: 8,
      vocation: "Monk",
      vocationPromoted: "Exalted Monk",
      skillAxe: 200,
      skillClub: 200,
    });
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.skills.perSkill.axe).toBe(0n);
    expect(result.breakdown.skills.perSkill.club).toBe(0n);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Testy — Migzen benchmark (arch §9.2)
// ──────────────────────────────────────────────────────────────────────────

describe("estimateValue — Migzen benchmark (auction 2173376)", () => {
  it("snapshot z fixture → estimatedValue > 0, wszystkie komponenty > 0", () => {
    const auction = loadMigzenAuction();
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.estimatedValue).toBeGreaterThan(0n);

    const b = result.breakdown;
    expect(b.base.value).toBe(30_950n); // 619 × 50
    expect(b.features.value).toBe(30_000n); // 12k + 15k + 3k
    expect(b.cosmetics.value).toBe(11_400n); // 3k + 4k + 4.4k
    expect(b.assets.value).toBe(3_950n); // 50 + 3900
    expect(b.progression.value).toBeGreaterThan(0n);
    expect(b.skills.value).toBeGreaterThan(0n);
  });

  it("suma komponentów = estimatedValue (invariant)", () => {
    const auction = loadMigzenAuction();
    const result = estimateValue(auction, rulesFromSeed());
    expect(sumBreakdown(result)).toBe(result.estimatedValue);
  });

  it("Monk vocation relevance: tylko fist + magic mają wartość", () => {
    const auction = loadMigzenAuction();
    const result = estimateValue(auction, rulesFromSeed());
    expect(result.breakdown.skills.perSkill.sword).toBe(0n);
    expect(result.breakdown.skills.perSkill.shielding).toBe(0n);
    expect(result.breakdown.skills.perSkill.magic).toBe(1_400n);
  });

  it("konkretny output Migzen benchmark (T22 referencyjny snapshot)", () => {
    const auction = loadMigzenAuction();
    const result = estimateValue(auction, rulesFromSeed());

    // Migzen (Exalted Monk, level 619, Soul War + World Transfer + Twist of Fate,
    // 7611 charms, 2340 boss, 11/23 imbues, 28/42 quests, 500k gold, 3900 TC,
    // 3 store outfity, 2 store mounty, 44 lesser gems):
    //   BASE:    619 × 50 = 30 950
    //   SKILLS:  magic 113 → 14 × 100 = 1 400 (Monk — tylko magic + fist)
    //   FEAT:    Soul War 12k + World 15k + Twist 3k = 30 000
    //   PROGR:   charm 15222 + boss 2340 + quests 56000 + imbues 11000
    //            + achievement 542000 + animus 90000 = 716 562
    //   COSM:    3000 + 4000 + 4400 = 11 400
    //   ASSETS:  500000/10000=50 + 3900 = 3 950
    //   SUM:     794 262 TC
    const expectedBase = 30_950n;
    const expectedSkills = 1_400n;
    const expectedFeatures = 30_000n;
    const expectedCosmetics = 11_400n;
    const expectedAssets = 3_950n;
    const expectedProgression =
      15_222n + 2_340n + 56_000n + 11_000n + 542_000n + 90_000n;
    const expectedTotal =
      expectedBase + expectedSkills + expectedFeatures +
      expectedProgression + expectedCosmetics + expectedAssets;

    expect(result.estimatedValue).toBe(expectedTotal);
    expect(result.breakdown.base.value).toBe(expectedBase);
    expect(result.breakdown.skills.value).toBe(expectedSkills);
    expect(result.breakdown.features.value).toBe(expectedFeatures);
    expect(result.breakdown.progression.value).toBe(expectedProgression);
    expect(result.breakdown.cosmetics.value).toBe(expectedCosmetics);
    expect(result.breakdown.assets.value).toBe(expectedAssets);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Testy — determinizm
// ──────────────────────────────────────────────────────────────────────────

describe("estimateValue — determinizm", () => {
  it("100 wywołań z identycznym wejściem → identyczny wynik", () => {
    const auction = makeAuction({
      level: 500,
      vocation: "Knight",
      vocationPromoted: "Elite Knight",
      skillSword: 150,
      skillShielding: 140,
      charmPoints: 5_000,
      bossPoints: 1_000,
      questsCompleted: 20,
      hasSoulWar: true,
      hasWorldTransfer: true,
      goldTotal: 50_000n,
      tcInvested: 1_000,
    });
    const first = estimateValue(auction, rulesFromSeed());
    for (let i = 0; i < 100; i++) {
      const r = estimateValue(auction, rulesFromSeed());
      expect(r.estimatedValue).toBe(first.estimatedValue);
      expect(r.breakdown.skills.perSkill.sword).toBe(
        first.breakdown.skills.perSkill.sword,
      );
    }
  });

  it("Migzen: 100 wywołań → identyczny wynik", () => {
    const auction = loadMigzenAuction();
    const first = estimateValue(auction, rulesFromSeed());
    for (let i = 0; i < 100; i++) {
      const r = estimateValue(auction, rulesFromSeed());
      expect(r.estimatedValue).toBe(first.estimatedValue);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Testy — monotoniczność
// ──────────────────────────────────────────────────────────────────────────

describe("estimateValue — monotoniczność", () => {
  it("wyższy level → wyższa wycena", () => {
    const r100 = estimateValue(makeAuction({ level: 100 }), rulesFromSeed());
    const r500 = estimateValue(makeAuction({ level: 500 }), rulesFromSeed());
    const r1000 = estimateValue(
      makeAuction({ level: 1_000 }),
      rulesFromSeed(),
    );
    expect(r500.estimatedValue).toBeGreaterThan(r100.estimatedValue);
    expect(r1000.estimatedValue).toBeGreaterThan(r500.estimatedValue);
  });

  it("więcej charm_points → wyższa wycena", () => {
    const r0 = estimateValue(
      makeAuction({ level: 100, charmPoints: 0 }),
      rulesFromSeed(),
    );
    const r5k = estimateValue(
      makeAuction({ level: 100, charmPoints: 5_000 }),
      rulesFromSeed(),
    );
    const r20k = estimateValue(
      makeAuction({ level: 100, charmPoints: 20_000 }),
      rulesFromSeed(),
    );
    expect(r5k.estimatedValue).toBeGreaterThan(r0.estimatedValue);
    expect(r20k.estimatedValue).toBeGreaterThan(r5k.estimatedValue);
  });

  it("Soul War ON vs OFF → różnica 12 000 TC", () => {
    const off = estimateValue(
      makeAuction({ level: 100, hasSoulWar: false }),
      rulesFromSeed(),
    );
    const on = estimateValue(
      makeAuction({ level: 100, hasSoulWar: true }),
      rulesFromSeed(),
    );
    const diff = on.estimatedValue - off.estimatedValue;
    expect(diff).toBe(12_000n);
  });

  it("World Transfer ON vs OFF → różnica 15 000 TC", () => {
    const off = estimateValue(
      makeAuction({ level: 100, hasWorldTransfer: false }),
      rulesFromSeed(),
    );
    const on = estimateValue(
      makeAuction({ level: 100, hasWorldTransfer: true }),
      rulesFromSeed(),
    );
    const diff = on.estimatedValue - off.estimatedValue;
    expect(diff).toBe(15_000n);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Testy — invariant: suma komponentów = estimatedValue
// ──────────────────────────────────────────────────────────────────────────

describe("estimateValue — invariant: suma komponentów = estimatedValue", () => {
  const fixtures: Array<{ name: string; auction: Auction }> = [
    {
      name: "minimum (level 8)",
      auction: makeAuction({ level: 8 }),
    },
    {
      name: "Knight average",
      auction: makeAuction({
        level: 200,
        skillSword: 110,
        charmPoints: 1_000,
        hasSoulWar: true,
      }),
    },
    {
      name: "Monk high-end",
      auction: makeAuction({
        level: 500,
        vocation: "Monk",
        vocationPromoted: "Exalted Monk",
        skillMagic: 150,
        skillFist: 140,
        charmPoints: 5_000,
        bossPoints: 2_000,
        questsCompleted: 30,
        imbuementsUnlocked: 15,
        hasSoulWar: true,
        hasWorldTransfer: true,
        hasTwistOfFate: true,
        goldTotal: 100_000n,
        tcInvested: 5_000,
      }),
    },
    {
      name: "Paladin with gems",
      auction: makeAuction({
        level: 300,
        vocation: "Paladin",
        vocationPromoted: "Royal Paladin",
        skillDistance: 130,
        skillShielding: 120,
        gemsLesser: 100,
        gemsRegular: 20,
        storeOutfitsCount: 5,
      }),
    },
    {
      name: "Migzen fixture",
      auction: loadMigzenAuction(),
    },
    {
      name: "all features",
      auction: makeAuction({
        level: 400,
        hasSoulWar: true,
        hasPrimalOrdeal: true,
        hasWorldTransfer: true,
        hasPreySlot: true,
        hasCharmExpansion: true,
        hasWeeklyTaskExpansion: true,
        hasTwistOfFate: true,
      }),
    },
  ];

  for (const { name, auction } of fixtures) {
    it(`invariant: ${name}`, () => {
      const result = estimateValue(auction, rulesFromSeed());
      expect(sumBreakdown(result)).toBe(result.estimatedValue);
    });
  }
});