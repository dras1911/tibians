/**
 * Testy Zustand store + selektory + React hooks — task 13 (100% coverage).
 *
 * Pokrycie:
 *   1. Store actions: setSnapshot / updateField / updateNestedField /
 *      setSource / loadFromAuction / loadFromManual / loadFromUrl / reset
 *   2. Corrupted input → ZodError propagates
 *   3. parseAuctionId error paths (niepoprawny auction, nieprawidłowy URL)
 *   4. Wszystkie selektory (selectors.ts 100%)
 *   5. React hooks (use-character-store.ts 100%)
 *   6. Benchmark: 100 update'ów < 50 ms
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ZodError } from "zod";
import {
  CharacterSnapshotSchema,
  type CharacterSnapshot,
  type SkillKey,
} from "../index.js";
import {
  characterStore,
  createCharacterStore,
  CorruptedSnapshotUrlError,
  selectAllSkillBases,
  selectAuctionHighlights,
  selectBlessingsActive,
  selectGoldTotal,
  selectHasAuctionContext,
  selectHasFlag,
  selectHoursUntilAuctionEnd,
  selectImbuementsProgressPercent,
  selectItemCount,
  selectLevel,
  selectMountCount,
  selectName,
  selectOutfitCount,
  selectProgressPercentages,
  selectQuestsProgressPercent,
  selectSkill,
  selectSkillBase,
  selectSkillLoyalty,
  selectSkillPercentToNext,
  selectTotalGems,
  selectTotalSkillBase,
  selectValueConfidence,
  selectVocation,
  useCharacterStore,
  useCharacterStoreFromInstance,
  useCharacterStoreShallow,
  useShallow,
} from "../store/index.js";
import { snapshotToUrl } from "../transforms/index.js";

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
    skills: {
      ...emptySkills(),
      magic: { base: 47, loyaltyPct: 5, percentToNext: 75 },
      fist: { base: 113 },
      sword: { base: 15 },
    },
    progression: {
      charmPoints: 7611,
      charmPointsUnused: 245,
      minorCharmEchoes: 0,
      bossPoints: 2340,
      questsCompleted: 28,
      questsTotal: 42,
      imbuementsUnlocked: 11,
      imbuementsTotal: 23,
      achievementPoints: 1450,
      animusMasteries: 180,
    },
    assets: {
      items: [{ itemId: 3079, quantity: 1 }],
      outfits: [{ outfitId: 1874, addons: 3 }],
      mounts: [1234, 5678],
      gems: { lesser: 44, regular: 0, greater: 0 },
      goldTotal: 250000,
      tcInvested: 3900,
      storeCounts: { outfits: 12, mounts: 7, items: 23 },
      hirelings: 4,
    },
    flags: {
      soulWar: true,
      primalOrdeal: false,
      worldTransfer: true,
      preySlot: true,
      charmExpansion: true,
      weeklyTaskExpansion: true,
      twistOfFate: false,
      blessingsActive: 5,
    },
    auction: {
      bid: 25501,
      bidType: "current",
      auctionStart: "2026-09-01T10:00:00.000Z",
      auctionEnd: "2026-09-15T22:00:00.000Z",
      status: "active",
    },
  });
}

function fixtureManual(): CharacterSnapshot {
  return CharacterSnapshotSchema.parse({
    source: { kind: "manual" },
    identity: {
      name: "TestChar",
      level: 250,
      vocation: "Knight",
      vocationPromoted: "Elite Knight",
      sex: "M",
    },
    skills: emptySkills(),
    progression: {
      charmPoints: 0,
      charmPointsUnused: 0,
      minorCharmEchoes: 0,
      bossPoints: 0,
      questsCompleted: 0,
      questsTotal: 42,
      imbuementsUnlocked: 0,
      imbuementsTotal: 23,
      achievementPoints: 0,
      animusMasteries: 0,
    },
    assets: emptyAssets(),
    flags: emptyFlags(),
  });
}

// ──────────────────────────────────────────────────────────────────────────
// React hook render helper
// ──────────────────────────────────────────────────────────────────────────

function Probe<T>({
  hook,
  result,
}: {
  hook: () => T;
  result: { current: T };
}) {
  result.current = hook();
  return null;
}

function renderHook<T>(useHook: () => T): { current: T } {
  const result: { current: T } = { current: undefined as T };
  const container = document.createElement("div");
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(createElement(Probe, { hook: useHook, result }));
  });
  return result;
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Store actions
// ──────────────────────────────────────────────────────────────────────────

describe("store — setSnapshot", () => {
  it("zastępuje snapshot po walidacji Zod", () => {
    const store = createCharacterStore();
    store.getState().setSnapshot(fixtureManual());
    expect(store.getState().snapshot.identity.name).toBe("TestChar");
  });

  it("rzuca ZodError przy corrupted input", () => {
    const store = createCharacterStore();
    const corrupted = {
      ...fixtureManual(),
      identity: { ...fixtureManual().identity, level: 7 },
    };
    expect(() => store.getState().setSnapshot(corrupted)).toThrow(ZodError);
  });

  it("notyfikuje listenerów", () => {
    const store = createCharacterStore();
    let count = 0;
    const unsub = store.subscribe(() => {
      count++;
    });
    store.getState().setSnapshot(fixtureManual());
    unsub();
    expect(count).toBe(1);
  });
});

describe("store — updateField", () => {
  it("zastępuje top-level pole (immutable)", () => {
    const store = createCharacterStore();
    const before = store.getState().snapshot.identity;
    store.getState().updateField("identity", {
      ...before,
      name: "Nowa",
      level: 300,
    });
    expect(store.getState().snapshot.identity.name).toBe("Nowa");
    expect(store.getState().snapshot.identity.level).toBe(300);
    expect(before.name).toBe("");
  });

  it("updateField('source', …) zmienia source", () => {
    const store = createCharacterStore();
    store.getState().updateField("source", {
      kind: "imported",
      from: "tibia-com",
    });
    expect(store.getState().snapshot.source.kind).toBe("imported");
  });
});

describe("store — updateNestedField", () => {
  it("głęboka ścieżka 3-segmentowa", () => {
    const store = createCharacterStore();
    store.getState().updateNestedField("skills.magic.base", 99);
    expect(store.getState().snapshot.skills.magic.base).toBe(99);
  });

  it("ścieżka do assets.gems", () => {
    const store = createCharacterStore();
    store.getState().updateNestedField("assets.gems.greater", 5);
    expect(store.getState().snapshot.assets.gems.greater).toBe(5);
  });

  it("ścieżka do auction.bid (po załadowaniu aukcji)", () => {
    const store = createCharacterStore();
    store.getState().loadFromAuction(fixtureAuction(), 2173376n);
    store.getState().updateNestedField(
      "auction.bid" as unknown as import("../store/character-store.js").NestedPath<CharacterSnapshot>,
      30000,
    );
    expect(store.getState().snapshot.auction?.bid).toBe(30000);
  });

  it("nieprawidłowa ścieżka → throw", () => {
    const store = createCharacterStore();
    expect(() =>
      store
        .getState()
        .updateNestedField(
          "foo.bar" as unknown as import("../store/character-store.js").NestedPath<CharacterSnapshot>,
          1,
        ),
    ).toThrow(/nie istnieje w obiekcie/);
  });

  it("pusta ścieżka → throw (setIn: '' nie istnieje w obiekcie)", () => {
    const store = createCharacterStore();
    // "".split(".") → [""], więc pierwszy segment to "" — nie istnieje.
    expect(() =>
      store
        .getState()
        .updateNestedField(
          "" as unknown as import("../store/character-store.js").NestedPath<CharacterSnapshot>,
          1,
        ),
    ).toThrow(/nie istnieje w obiekcie/);
  });
});

describe("store — setSource", () => {
  it("zmienia na auction z auctionId", () => {
    const store = createCharacterStore();
    store.getState().setSource({ kind: "auction", auctionId: 42n });
    const src = store.getState().snapshot.source;
    expect(src.kind).toBe("auction");
    if (src.kind === "auction") {
      expect(src.auctionId).toBe(42n);
    }
  });

  it("zmiana z auction na manual usuwa pole auction", () => {
    const store = createCharacterStore();
    store.getState().loadFromAuction(fixtureAuction(), 2173376n);
    expect(store.getState().snapshot.auction).toBeDefined();
    store.getState().setSource({ kind: "manual" });
    expect(store.getState().snapshot.auction).toBeUndefined();
  });

  it("zmiana na imported zachowuje pole auction? NIE — usuwa", () => {
    const store = createCharacterStore();
    store.getState().loadFromAuction(fixtureAuction(), 2173376n);
    store.getState().setSource({ kind: "imported", from: "tibia-com" });
    expect(store.getState().snapshot.source.kind).toBe("imported");
    expect(store.getState().snapshot.auction).toBeUndefined();
  });
});

describe("store — loadFromAuction", () => {
  it("wczytuje i wymusza source.kind='auction' + auctionId", () => {
    const store = createCharacterStore();
    store.getState().loadFromAuction(fixtureAuction(), 999n);
    const snap = store.getState().snapshot;
    expect(snap.source.kind).toBe("auction");
    if (snap.source.kind === "auction") {
      expect(snap.source.auctionId).toBe(999n);
    }
    expect(snap.identity.name).toBe("Migzen");
  });

  it("rzuca ZodError przy corrupted input", () => {
    const store = createCharacterStore();
    const corrupted = {
      ...fixtureAuction(),
      identity: { ...fixtureAuction().identity, level: 7 },
    };
    expect(() => store.getState().loadFromAuction(corrupted, 1n)).toThrow(
      ZodError,
    );
  });
});

describe("store — loadFromManual", () => {
  it("wczytuje i wymusza source.kind='manual'", () => {
    const store = createCharacterStore();
    store.getState().loadFromAuction(fixtureAuction(), 2173376n);
    store.getState().loadFromManual(fixtureManual());
    const snap = store.getState().snapshot;
    expect(snap.source.kind).toBe("manual");
    expect(snap.auction).toBeUndefined();
    expect(snap.identity.name).toBe("TestChar");
  });

  it("rzuca ZodError przy invalid input", () => {
    const store = createCharacterStore();
    const corrupted = {
      ...fixtureManual(),
      identity: { ...fixtureManual().identity, level: 3000 },
    };
    expect(() => store.getState().loadFromManual(corrupted)).toThrow(ZodError);
  });
});

describe("store — loadFromUrl", () => {
  it("wczytuje snapshot z URL", () => {
    const store = createCharacterStore();
    const { url } = snapshotToUrl(fixtureManual());
    store.getState().loadFromUrl(url);
    expect(store.getState().snapshot.identity.name).toBe("TestChar");
  });

  it("honoruje ?auction=N → source.kind='auction'", () => {
    const store = createCharacterStore();
    const { url } = snapshotToUrl(fixtureManual());
    store.getState().loadFromUrl(`${url}&auction=2173376`);
    const snap = store.getState().snapshot;
    expect(snap.source.kind).toBe("auction");
    if (snap.source.kind === "auction") {
      expect(snap.source.auctionId).toBe(2173376n);
    }
  });

  it("URL bez ?s= z ?auction=N → wymusza source na obecnym snapie", () => {
    const store = createCharacterStore();
    store.getState().loadFromManual(fixtureManual());
    store.getState().loadFromUrl("https://x.com/auction?auction=42");
    const snap = store.getState().snapshot;
    expect(snap.source.kind).toBe("auction");
    if (snap.source.kind === "auction") {
      expect(snap.source.auctionId).toBe(42n);
    }
    expect(snap.identity.name).toBe("TestChar");
  });

  it("URL bez ?s= i bez ?auction → brak zmian", () => {
    const store = createCharacterStore();
    store.getState().loadFromManual(fixtureManual());
    store.getState().loadFromUrl("https://x.com/workspace");
    expect(store.getState().snapshot.identity.name).toBe("TestChar");
    expect(store.getState().snapshot.source.kind).toBe("manual");
  });

  it("rzuca CorruptedSnapshotUrlError przy corrupted token", () => {
    const store = createCharacterStore();
    expect(() =>
      store.getState().loadFromUrl("https://x.com/workspace?s=!!!bad!!!"),
    ).toThrow(CorruptedSnapshotUrlError);
  });

  it("rzuca Error gdy ?auction nie jest liczbą", () => {
    const store = createCharacterStore();
    expect(() =>
      store.getState().loadFromUrl("https://x.com/auction?auction=abc"),
    ).toThrow(/auction.*musi być liczbą/);
  });

  it("?auction= (pusta wartość) → brak zmian (raw.length === 0)", () => {
    const store = createCharacterStore();
    store.getState().loadFromManual(fixtureManual());
    store.getState().loadFromUrl("https://x.com/auction?auction=");
    expect(store.getState().snapshot.source.kind).toBe("manual");
    expect(store.getState().snapshot.identity.name).toBe("TestChar");
  });

  it("rzuca Error gdy URL jest nieprawidłowy", () => {
    const store = createCharacterStore();
    // Niezamknięty '[' w URL → new URL rzuca → parseAuctionId catch.
    expect(() =>
      store.getState().loadFromUrl("http://[::1?auction=123"),
    ).toThrow(/nieprawidłowy URL/);
  });
});

describe("store — reset", () => {
  it("przywraca pusty default", () => {
    const store = createCharacterStore();
    store.getState().loadFromAuction(fixtureAuction(), 2173376n);
    store.getState().reset();
    const snap = store.getState().snapshot;
    expect(snap.identity.name).toBe("");
    expect(snap.identity.level).toBe(8);
    expect(snap.source.kind).toBe("manual");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Selektory — pełne pokrycie selectors.ts
// ──────────────────────────────────────────────────────────────────────────

describe("selektory — pełne pokrycie", () => {
  const snap = fixtureAuction();

  it("selectSkill — pełny SkillEntry", () => {
    expect(selectSkill("magic")(snap)).toEqual({
      base: 47,
      loyaltyPct: 5,
      percentToNext: 75,
    });
  });

  it("selectSkillBase", () => {
    expect(selectSkillBase("sword")(snap)).toBe(15);
  });

  it("selectSkillLoyalty — wartość i undefined", () => {
    expect(selectSkillLoyalty("magic")(snap)).toBe(5);
    expect(selectSkillLoyalty("fist")(snap)).toBeUndefined();
  });

  it("selectSkillPercentToNext — wartość i undefined", () => {
    expect(selectSkillPercentToNext("magic")(snap)).toBe(75);
    expect(selectSkillPercentToNext("fist")(snap)).toBeUndefined();
  });

  it("selectAllSkillBases — Record<SkillKey, number>", () => {
    const bases = selectAllSkillBases(snap);
    expect(bases.magic).toBe(47);
    expect(bases.fist).toBe(113);
    expect(bases.sword).toBe(15);
    expect(Object.keys(bases)).toHaveLength(8);
  });

  it("selectTotalSkillBase — suma", () => {
    expect(selectTotalSkillBase(snap)).toBe(47 + 113 + 15);
  });

  it("selectHasFlag — każda z 7 flag", () => {
    expect(selectHasFlag("soulWar")(snap)).toBe(true);
    expect(selectHasFlag("primalOrdeal")(snap)).toBe(false);
    expect(selectHasFlag("worldTransfer")(snap)).toBe(true);
    expect(selectHasFlag("preySlot")(snap)).toBe(true);
    expect(selectHasFlag("charmExpansion")(snap)).toBe(true);
    expect(selectHasFlag("weeklyTaskExpansion")(snap)).toBe(true);
    expect(selectHasFlag("twistOfFate")(snap)).toBe(false);
  });

  it("selectBlessingsActive", () => {
    expect(selectBlessingsActive(snap)).toBe(5);
  });

  it("selectQuestsProgressPercent — normalny i total=0", () => {
    expect(selectQuestsProgressPercent(snap)).toBeCloseTo((28 / 42) * 100, 1);
    const zeroTotal = { ...snap, progression: { ...snap.progression, questsTotal: 0 } };
    expect(selectQuestsProgressPercent(zeroTotal)).toBe(0);
  });

  it("selectImbuementsProgressPercent — normalny i total=0", () => {
    expect(selectImbuementsProgressPercent(snap)).toBeCloseTo(
      (11 / 23) * 100,
      1,
    );
    const zeroTotal = {
      ...snap,
      progression: { ...snap.progression, imbuementsTotal: 0 },
    };
    expect(selectImbuementsProgressPercent(zeroTotal)).toBe(0);
  });

  it("selectProgressPercentages — batch", () => {
    const p = selectProgressPercentages(snap);
    expect(p.quests).toBeCloseTo((28 / 42) * 100, 1);
    expect(p.imbuements).toBeCloseTo((11 / 23) * 100, 1);
  });

  it("selectLevel / selectName / selectVocation", () => {
    expect(selectLevel(snap)).toBe(619);
    expect(selectName(snap)).toBe("Migzen");
    expect(selectVocation(snap)).toBe("Monk");
  });

  it("selectItemCount / selectOutfitCount / selectMountCount", () => {
    expect(selectItemCount(snap)).toBe(1);
    expect(selectOutfitCount(snap)).toBe(1);
    expect(selectMountCount(snap)).toBe(2);
  });

  it("selectTotalGems — suma lesser+regular+greater", () => {
    expect(selectTotalGems(snap)).toBe(44);
  });

  it("selectGoldTotal", () => {
    expect(selectGoldTotal(snap)).toBe(250000);
  });

  it("selectValueConfidence — 1.0 dla pełnej aukcji", () => {
    expect(selectValueConfidence(snap)).toBe(1.0);
  });

  it("selectHasAuctionContext — true/false", () => {
    expect(selectHasAuctionContext(snap)).toBe(true);
    expect(selectHasAuctionContext(fixtureManual())).toBe(false);
  });

  it("selectHoursUntilAuctionEnd — brak auction → null", () => {
    expect(selectHoursUntilAuctionEnd(fixtureManual())).toBeNull();
  });

  it("selectHoursUntilAuctionEnd — nieprawidłowa data → null", () => {
    const bad = { ...snap, auction: { ...snap.auction!, auctionEnd: "garbage" } };
    expect(selectHoursUntilAuctionEnd(bad)).toBeNull();
  });

  it("selectHoursUntilAuctionEnd — poprawna data → liczba godzin", () => {
    const future = {
      ...snap,
      auction: {
        ...snap.auction!,
        auctionEnd: new Date(Date.now() + 3_600_000 * 5).toISOString(),
      },
    };
    const hours = selectHoursUntilAuctionEnd(future);
    expect(hours).not.toBeNull();
    expect(hours!).toBeGreaterThan(4);
    expect(hours!).toBeLessThan(6);
  });

  it("selectAuctionHighlights — batch pól", () => {
    const h = selectAuctionHighlights(snap);
    expect(h.level).toBe(619);
    expect(h.vocation).toBe("Monk");
    expect(h.soulWar).toBe(true);
    expect(h.primalOrdeal).toBe(false);
    expect(h.totalGems).toBe(44);
    expect(h.imbuementsPercent).toBeCloseTo((11 / 23) * 100, 1);
    expect(h.charmPoints).toBe(7611);
    expect(h.bossPoints).toBe(2340);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. React hooks — use-character-store.ts
// ──────────────────────────────────────────────────────────────────────────

describe("React hooks", () => {
  beforeEach(() => {
    characterStore.getState().reset();
    // React 19 wymaga IS_REACT_ACT_ENVIRONMENT dla act().
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
  });

  afterEach(() => {
    characterStore.getState().reset();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it("useCharacterStore — zwraca wycinek stanu", () => {
    const result = renderHook(() =>
      useCharacterStore((s) => s.snapshot.identity.level),
    );
    expect(result.current).toBe(8);
  });

  it("useCharacterStore — re-render po update", () => {
    const result = renderHook(() =>
      useCharacterStore((s) => s.snapshot.identity.level),
    );
    expect(result.current).toBe(8);
    act(() => {
      characterStore.getState().updateNestedField("identity.level", 100);
    });
    expect(result.current).toBe(100);
  });

  it("useCharacterStore — akcje dostępne przez selektor", () => {
    const result = renderHook(() =>
      useCharacterStore((s) => s.updateNestedField),
    );
    act(() => {
      result.current("identity.level", 200);
    });
    expect(characterStore.getState().snapshot.identity.level).toBe(200);
  });

  it("useCharacterStoreShallow — obiekt z shallow equality", () => {
    const result = renderHook(() =>
      useCharacterStoreShallow((s) => ({
        level: s.snapshot.identity.level,
        name: s.snapshot.identity.name,
      })),
    );
    expect(result.current).toEqual({ level: 8, name: "" });
    act(() => {
      characterStore.getState().updateNestedField("identity.level", 50);
    });
    expect(result.current).toEqual({ level: 50, name: "" });
  });

  it("useCharacterStoreFromInstance — niestandardowa instancja", () => {
    const store = createCharacterStore();
    const result = renderHook(() =>
      useCharacterStoreFromInstance(store, (s) => s.snapshot.identity.level),
    );
    expect(result.current).toBe(8);
    act(() => {
      store.getState().updateNestedField("identity.level", 77);
    });
    expect(result.current).toBe(77);
  });

  it("useShallow — re-export działa", () => {
    expect(typeof useShallow).toBe("function");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Benchmark — 100 update'ów < 50 ms
// ──────────────────────────────────────────────────────────────────────────

describe("benchmark — 100 update'ów < 50 ms", () => {
  it("100 updateNestedField w < 50 ms", () => {
    const store = createCharacterStore();
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      store.getState().updateNestedField("progression.charmPoints", 1000 + i);
    }
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
    expect(store.getState().snapshot.progression.charmPoints).toBe(1099);
  });

  it("100 updateField w < 50 ms", () => {
    const store = createCharacterStore();
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      store.getState().updateField("identity", {
        ...store.getState().snapshot.identity,
        level: 100 + i,
      });
    }
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
    expect(store.getState().snapshot.identity.level).toBe(199);
  });

  it("100 setSnapshot w < 50 ms", () => {
    const store = createCharacterStore();
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      store.getState().setSnapshot(fixtureManual());
    }
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. Immutability
// ──────────────────────────────────────────────────────────────────────────

describe("immutability", () => {
  it("updateNestedField nie mutuje niezmienionych segmentów", () => {
    const store = createCharacterStore();
    const beforeFist = store.getState().snapshot.skills.fist;
    store.getState().updateNestedField("skills.magic.base", 99);
    expect(store.getState().snapshot.skills.fist).toBe(beforeFist);
  });

  it("setSnapshot nie mutuje wejścia", () => {
    const store = createCharacterStore();
    const input = fixtureManual();
    store.getState().setSnapshot(input);
    expect(input.identity.name).toBe("TestChar");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. Typy pomocnicze — SkillKey
// ──────────────────────────────────────────────────────────────────────────

describe("SkillKey typy", () => {
  it("Record<SkillKey, number>", () => {
    const bases: Record<SkillKey, number> = {
      magic: 1,
      club: 2,
      fist: 3,
      sword: 4,
      axe: 5,
      distance: 6,
      shielding: 7,
      fishing: 8,
    };
    expect(bases.fishing).toBe(8);
  });
});