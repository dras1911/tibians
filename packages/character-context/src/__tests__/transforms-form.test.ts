/**
 * Testy form ↔ snapshot — task 13 (100% coverage).
 *
 * Pokrycie:
 *   1. formDataToSnapshot / snapshotToFormData round-trip
 *   2. Auto-wyliczanie vocationPromoted (5 par)
 *   3. Validation errors propagate (ZodError)
 *   4. form-to-snapshot.ts: skillsBase ?? 0 fallback, tcInvested undefined
 *   5. snapshotToFormData: pomijanie opcjonalnych pól
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  CharacterSnapshotSchema,
  type CharacterSnapshot,
  type SkillKey,
  SKILL_KEYS,
} from "../index.js";
import {
  formDataToSnapshot,
  snapshotToFormData,
  VOCATION_BASE_TO_PROMOTED,
  type ManualFormData,
} from "../transforms/index.js";

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

/** Buduje kompletny ManualFormData z podanymi override'ami. */
function buildForm(overrides: Partial<ManualFormData> = {}): ManualFormData {
  return {
    name: "Almyth",
    level: 287,
    vocation: "Knight",
    sex: "F",
    world: "Antica",
    skillsBase: Object.fromEntries(
      SKILL_KEYS.map((k) => [k, 0]),
    ) as Record<SkillKey, number>,
    charmPoints: 100,
    charmPointsUnused: 20,
    minorCharmEchoes: 5,
    bossPoints: 50,
    questsCompleted: 10,
    questsTotal: 42,
    imbuementsUnlocked: 5,
    imbuementsTotal: 23,
    achievementPoints: 200,
    animusMasteries: 12,
    items: [],
    outfits: [],
    mounts: [],
    gemsLesser: 0,
    gemsRegular: 0,
    gemsGreater: 0,
    goldTotal: 0,
    storeOutfits: 0,
    storeMounts: 0,
    storeItems: 0,
    hirelings: 0,
    soulWar: false,
    primalOrdeal: false,
    worldTransfer: false,
    preySlot: false,
    charmExpansion: false,
    weeklyTaskExpansion: false,
    twistOfFate: false,
    blessingsActive: 0,
    ...overrides,
  };
}

/** Minimalny poprawny snapshot manualny. */
function fixtureManual(): CharacterSnapshot {
  return CharacterSnapshotSchema.parse({
    source: { kind: "manual" },
    identity: {
      name: "Almyth",
      level: 287,
      vocation: "Knight",
      vocationPromoted: "Elite Knight",
      sex: "F",
      world: "Antica",
    },
    skills: emptySkills(),
    progression: zeroProgression(),
    assets: emptyAssets(),
    flags: emptyFlags(),
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 1. formDataToSnapshot — budowanie
// ──────────────────────────────────────────────────────────────────────────

describe("formDataToSnapshot", () => {
  it("buduje pełny snapshot z formularza", () => {
    const form = buildForm({
      skillsBase: {
        magic: 47,
        club: 0,
        fist: 113,
        sword: 15,
        axe: 0,
        distance: 0,
        shielding: 0,
        fishing: 0,
      },
      skillsLoyaltyPct: { magic: 5, fist: 10 },
      skillsPercentToNext: { magic: 75, fist: 42 },
      items: [{ itemId: 3079, quantity: 1, tier: 2 }],
      outfits: [{ outfitId: 962, addons: 3 }],
      mounts: [232],
      gemsLesser: 44,
      gemsRegular: 0,
      gemsGreater: 0,
      goldTotal: 100000,
      tcInvested: 3900,
      storeOutfits: 5,
      storeMounts: 3,
      storeItems: 12,
      hirelings: 2,
      soulWar: true,
      primalOrdeal: true,
      worldTransfer: true,
      preySlot: true,
      charmExpansion: true,
      weeklyTaskExpansion: true,
      twistOfFate: true,
      blessingsActive: 7,
    });

    const snap = formDataToSnapshot(form);
    expect(snap.source.kind).toBe("manual");
    expect(snap.identity.name).toBe("Almyth");
    expect(snap.identity.vocationPromoted).toBe("Elite Knight");
    expect(snap.identity.world).toBe("Antica");
    expect(snap.skills.magic.base).toBe(47);
    expect(snap.skills.magic.loyaltyPct).toBe(5);
    expect(snap.skills.magic.percentToNext).toBe(75);
    expect(snap.skills.fist.base).toBe(113);
    expect(snap.assets.items[0]?.tier).toBe(2);
    expect(snap.assets.gems.lesser).toBe(44);
    expect(snap.assets.tcInvested).toBe(3900);
    expect(snap.flags.soulWar).toBe(true);
    expect(snap.flags.blessingsActive).toBe(7);
    expect(snap.auction).toBeUndefined();
  });

  it("skillsBase ?? 0 — brakujący klucz → base 0", () => {
    // skillsBase z brakującym kluczem (np. 'fishing') — fallback ?? 0.
    const form = buildForm({
      skillsBase: {
        magic: 10,
        club: 0,
        fist: 0,
        sword: 0,
        axe: 0,
        distance: 0,
        shielding: 0,
      } as unknown as Record<SkillKey, number>,
    });
    const snap = formDataToSnapshot(form);
    expect(snap.skills.fishing.base).toBe(0);
    expect(snap.skills.magic.base).toBe(10);
  });

  it("tcInvested undefined → pole pominięte", () => {
    const form = buildForm();
    const snap = formDataToSnapshot(form);
    expect(snap.assets.tcInvested).toBeUndefined();
    expect("tcInvested" in snap.assets).toBe(false);
  });

  it("world pusty string → pole pominięte", () => {
    const form = buildForm({ world: "" });
    const snap = formDataToSnapshot(form);
    expect(snap.identity.world).toBeUndefined();
  });

  it("world undefined → pole pominięte", () => {
    const form = buildForm();
    // exactOptionalPropertyTypes: nie możemy ustawić world: undefined —
    // pomijamy pole przez destructuring.
    const { world: _drop, ...rest } = form;
    void _drop;
    const snap = formDataToSnapshot(rest);
    expect(snap.identity.world).toBeUndefined();
  });

  it("skillsLoyaltyPct undefined → brak loyaltyPct w skillach", () => {
    const form = buildForm();
    const snap = formDataToSnapshot(form);
    expect(snap.skills.magic.loyaltyPct).toBeUndefined();
  });

  it("skillsPercentToNext undefined → brak percentToNext", () => {
    const form = buildForm();
    const snap = formDataToSnapshot(form);
    expect(snap.skills.magic.percentToNext).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Auto-wyliczanie vocationPromoted
// ──────────────────────────────────────────────────────────────────────────

describe("vocationPromoted auto-wyliczane", () => {
  it("VOCATION_BASE_TO_PROMOTED — 5 par", () => {
    expect(VOCATION_BASE_TO_PROMOTED).toEqual({
      Knight: "Elite Knight",
      Paladin: "Royal Paladin",
      Druid: "Elder Druid",
      Sorcerer: "Master Sorcerer",
      Monk: "Exalted Monk",
    });
  });

  it("formDataToSnapshot wylicza vocationPromoted dla każdej z 5 vocations", () => {
    const pairs = [
      ["Knight", "Elite Knight"],
      ["Paladin", "Royal Paladin"],
      ["Druid", "Elder Druid"],
      ["Sorcerer", "Master Sorcerer"],
      ["Monk", "Exalted Monk"],
    ] as const;
    for (const [vocation, expected] of pairs) {
      const form = buildForm({ vocation });
      const snap = formDataToSnapshot(form);
      expect(snap.identity.vocationPromoted, vocation).toBe(expected);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Validation errors propagate
// ──────────────────────────────────────────────────────────────────────────

describe("validation errors propagate", () => {
  it("level 7 → ZodError", () => {
    expect(() => formDataToSnapshot(buildForm({ level: 7 }))).toThrow(ZodError);
  });

  it("level 2501 → ZodError", () => {
    expect(() => formDataToSnapshot(buildForm({ level: 2501 }))).toThrow(
      ZodError,
    );
  });

  it("gemsLesser -1 → ZodError", () => {
    expect(() => formDataToSnapshot(buildForm({ gemsLesser: -1 }))).toThrow(
      ZodError,
    );
  });

  it("questsCompleted > questsTotal → ZodError", () => {
    expect(() =>
      formDataToSnapshot(buildForm({ questsCompleted: 50, questsTotal: 42 })),
    ).toThrow(ZodError);
  });

  it("imbuementsUnlocked > imbuementsTotal → ZodError", () => {
    expect(() =>
      formDataToSnapshot(
        buildForm({ imbuementsUnlocked: 30, imbuementsTotal: 23 }),
      ),
    ).toThrow(ZodError);
  });

  it("blessingsActive 8 → ZodError", () => {
    expect(() => formDataToSnapshot(buildForm({ blessingsActive: 8 }))).toThrow(
      ZodError,
    );
  });

  it("skill base -5 → ZodError", () => {
    expect(() =>
      formDataToSnapshot(
        buildForm({
          skillsBase: {
            magic: -5,
            club: 0,
            fist: 0,
            sword: 0,
            axe: 0,
            distance: 0,
            shielding: 0,
            fishing: 0,
          },
        }),
      ),
    ).toThrow(ZodError);
  });

  it("pusty name → ZodError", () => {
    expect(() => formDataToSnapshot(buildForm({ name: "" }))).toThrow(ZodError);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. snapshotToFormData — odwrotność
// ──────────────────────────────────────────────────────────────────────────

describe("snapshotToFormData", () => {
  it("spłaszcza snapshot do formularza", () => {
    const snap = fixtureManual();
    const form = snapshotToFormData(snap);
    expect(form.name).toBe("Almyth");
    expect(form.level).toBe(287);
    expect(form.vocation).toBe("Knight");
    expect(form.sex).toBe("F");
    expect(form.world).toBe("Antica");
    expect(form.skillsBase.magic).toBe(0);
    expect(form.questsTotal).toBe(0);
  });

  it("zachowuje loyaltyPct i percentToNext", () => {
    const snap = fixtureManual();
    const withSkills: CharacterSnapshot = {
      ...snap,
      skills: {
        ...emptySkills(),
        magic: { base: 47, loyaltyPct: 5, percentToNext: 75 },
      },
    };
    const form = snapshotToFormData(withSkills);
    expect(form.skillsLoyaltyPct?.magic).toBe(5);
    expect(form.skillsPercentToNext?.magic).toBe(75);
  });

  it("pomija skillsLoyaltyPct gdy puste", () => {
    const snap = fixtureManual();
    const form = snapshotToFormData(snap);
    expect(form.skillsLoyaltyPct).toBeUndefined();
    expect(form.skillsPercentToNext).toBeUndefined();
  });

  it("zachowuje items z tier", () => {
    const snap = fixtureManual();
    const withItems: CharacterSnapshot = {
      ...snap,
      assets: {
        ...snap.assets,
        items: [
          { itemId: 3079, quantity: 1, tier: 2 },
          { itemId: 3081, quantity: 5 },
        ],
      },
    };
    const form = snapshotToFormData(withItems);
    expect(form.items[0]?.tier).toBe(2);
    expect(form.items[1]?.tier).toBeUndefined();
  });

  it("zachowuje outfits i mounts", () => {
    const snap = fixtureManual();
    const withAssets: CharacterSnapshot = {
      ...snap,
      assets: {
        ...snap.assets,
        outfits: [{ outfitId: 962, addons: 3 }],
        mounts: [232, 235],
      },
    };
    const form = snapshotToFormData(withAssets);
    expect(form.outfits).toEqual([{ outfitId: 962, addons: 3 }]);
    expect(form.mounts).toEqual([232, 235]);
  });

  it("pomija world gdy pusty", () => {
    const snap = fixtureManual();
    const noWorld: CharacterSnapshot = {
      ...snap,
      identity: { ...snap.identity, world: "" },
    };
    const form = snapshotToFormData(noWorld);
    expect(form.world).toBeUndefined();
  });

  it("pomija tcInvested gdy brak", () => {
    const snap = fixtureManual();
    const form = snapshotToFormData(snap);
    expect(form.tcInvested).toBeUndefined();
  });

  it("zachowuje tcInvested gdy obecne", () => {
    const snap = fixtureManual();
    const withTc: CharacterSnapshot = {
      ...snap,
      assets: { ...snap.assets, tcInvested: 3900 },
    };
    const form = snapshotToFormData(withTc);
    expect(form.tcInvested).toBe(3900);
  });

  it("ignoruje pole auction (formularz ręczny nie ma kontekstu aukcji)", () => {
    const snap = fixtureManual();
    const auctionSnap: CharacterSnapshot = {
      ...snap,
      source: { kind: "auction", auctionId: 2173376n },
      auction: {
        bid: 25501,
        bidType: "current",
        auctionStart: "2026-09-08T10:00:00Z",
        auctionEnd: "2026-09-08T22:00:00Z",
        status: "active",
      },
    };
    const form = snapshotToFormData(auctionSnap);
    // Formularz nie ma pola auction — dane postaci przetrwały.
    expect(form.name).toBe("Almyth");
    expect(form.level).toBe(287);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. Pełny round-trip form → snapshot → form
// ──────────────────────────────────────────────────────────────────────────

describe("pełny round-trip form ↔ snapshot", () => {
  it("form → snapshot → form zachowuje wszystkie pola", () => {
    const form = buildForm({
      skillsBase: {
        magic: 47,
        club: 0,
        fist: 113,
        sword: 15,
        axe: 0,
        distance: 0,
        shielding: 0,
        fishing: 0,
      },
      skillsLoyaltyPct: { magic: 5 },
      skillsPercentToNext: { magic: 75 },
      items: [{ itemId: 3079, quantity: 1, tier: 2 }],
      outfits: [{ outfitId: 962, addons: 3 }],
      mounts: [232],
      gemsLesser: 44,
      gemsRegular: 0,
      gemsGreater: 0,
      goldTotal: 100000,
      tcInvested: 3900,
      storeOutfits: 5,
      storeMounts: 3,
      storeItems: 12,
      hirelings: 2,
      soulWar: true,
      primalOrdeal: true,
      worldTransfer: true,
      preySlot: true,
      charmExpansion: true,
      weeklyTaskExpansion: true,
      twistOfFate: true,
      blessingsActive: 7,
    });

    const snap = formDataToSnapshot(form);
    const back = snapshotToFormData(snap);

    expect(back.name).toBe(form.name);
    expect(back.level).toBe(form.level);
    expect(back.vocation).toBe(form.vocation);
    expect(back.sex).toBe(form.sex);
    expect(back.world).toBe(form.world);
    expect(back.skillsBase.magic).toBe(47);
    expect(back.skillsLoyaltyPct?.magic).toBe(5);
    expect(back.skillsPercentToNext?.magic).toBe(75);
    expect(back.items).toEqual(form.items);
    expect(back.outfits).toEqual(form.outfits);
    expect(back.mounts).toEqual(form.mounts);
    expect(back.gemsLesser).toBe(44);
    expect(back.goldTotal).toBe(100000);
    expect(back.tcInvested).toBe(3900);
    expect(back.storeOutfits).toBe(5);
    expect(back.storeMounts).toBe(3);
    expect(back.storeItems).toBe(12);
    expect(back.hirelings).toBe(2);
    expect(back.soulWar).toBe(true);
    expect(back.blessingsActive).toBe(7);
  });

  it("snapshot → form → snapshot zachowuje dane (dla manual)", () => {
    const snap = fixtureManual();
    const form = snapshotToFormData(snap);
    const snap2 = formDataToSnapshot(form);
    expect(snap2.identity.name).toBe(snap.identity.name);
    expect(snap2.identity.level).toBe(snap.identity.level);
    expect(snap2.identity.vocation).toBe(snap.identity.vocation);
    expect(snap2.identity.vocationPromoted).toBe("Elite Knight");
  });
});