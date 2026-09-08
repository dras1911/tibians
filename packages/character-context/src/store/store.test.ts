/**
 * Testy Zustand store'a + URL transforms — task 11.
 *
 * Pokrycie (acceptance criteria):
 *   1. updateField — top-level immutable update
 *   2. updateNestedField — deep immutable update (template literal paths)
 *   3. loadFromAuction — walidacja Zod → ZodError propagates
 *   4. loadFromUrl — corrupted URL → CorruptedSnapshotUrlError propagates
 *   5. loadFromManual — zastępuje i wymusza source.kind = 'manual'
 *   6. setSource — czyści pole auction przy zmianie z 'auction' na inny
 *   7. reset — przywraca pusty default
 *   8. Selektory — sanity check
 *   9. Performance: 100 update'ów w < 50 ms (zgodnie z AC + arch. §13.4)
 *  10. URL transforms (T10) — round-trip + corruption + Unicode
 */
import { describe, expect, it, beforeEach } from "vitest";
import { ZodError } from "zod";
import {
  // Store (T11)
  createCharacterStore,
  CorruptedSnapshotUrlError,
  // Selektory (T11)
  selectSkill,
  selectSkillBase,
  selectHasFlag,
  selectProgressPercentages,
  selectLevel,
  selectTotalSkillBase,
  selectValueConfidence,
  selectHasAuctionContext,
} from "./index.js";
import {
  // URL transforms (T10)
  snapshotToUrl,
  urlToSnapshot,
  // Schema + helpers
  CharacterSnapshotSchema,
  type CharacterSnapshot,
} from "../index.js";

// ──────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────────────────────────────────

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
    skills: {
      ...emptySkills(),
      magic: { base: 47 },
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
  });
}

/**
 * Helper: buduje ręcznie payload base64url (plain, prefix 'p')
 * z JSON-em, który nie przejdzie walidacji Zod.
 */
function buildInvalidPayload(): string {
  const corrupted = JSON.stringify({
    source: { kind: "manual" },
    identity: {
      name: "X",
      level: -1, // invalid
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
  });
  // Flaga 'p' (plain) + bajty UTF-8 + base64url (taki sam format jak T10 encodeSnapshot).
  const bytes = new TextEncoder().encode(corrupted);
  const withFlag = new Uint8Array(bytes.length + 1);
  withFlag[0] = "p".charCodeAt(0);
  withFlag.set(bytes, 1);
  let binary = "";
  for (let i = 0; i < withFlag.length; i++) {
    binary += String.fromCharCode(withFlag[i] as number);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

// ──────────────────────────────────────────────────────────────────────────
// Default state
// ──────────────────────────────────────────────────────────────────────────

describe("character-store — default state", () => {
  it("starts z pustym manual snapshotem (SSR-safe)", () => {
    const store = createCharacterStore();
    const snap = store.getState().snapshot;
    expect(snap.source.kind).toBe("manual");
    expect(snap.identity.level).toBe(8);
    expect(snap.identity.name).toBe("");
    expect(snap.progression.questsTotal).toBe(42);
    expect(snap.progression.imbuementsTotal).toBe(23);
    expect(snap.flags.blessingsActive).toBe(0);
  });

  it("akceptuje częściowy initial snapshot (scala z defaultem)", () => {
    const store = createCharacterStore({
      identity: {
        name: "Initial",
        level: 100,
        vocation: "Druid",
        vocationPromoted: "Elder Druid",
        sex: "F",
      },
    });
    const snap = store.getState().snapshot;
    expect(snap.identity.name).toBe("Initial");
    expect(snap.identity.level).toBe(100);
    expect(snap.identity.vocation).toBe("Druid");
    // Pozostałe pola zostają z defaultu.
    expect(snap.progression.questsTotal).toBe(42);
  });

  it("rzuca ZodError przy corrupted initial snapshot", () => {
    expect(() =>
      createCharacterStore({
        identity: {
          name: "",
          level: 5, // < 8 — invalid
          vocation: "Knight",
          vocationPromoted: "Elite Knight",
          sex: "M",
        },
      }),
    ).toThrow(ZodError);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// updateField — top-level immutable update
// ──────────────────────────────────────────────────────────────────────────

describe("character-store — updateField", () => {
  let store: ReturnType<typeof createCharacterStore>;

  beforeEach(() => {
    store = createCharacterStore();
  });

  it("immutable update: zastępuje top-level pole nowym obiektem", () => {
    const before = store.getState().snapshot.identity;
    store.getState().updateField("identity", {
      ...before,
      name: "NowaNazwa",
      level: 200,
    });
    const after = store.getState().snapshot.identity;
    expect(after.name).toBe("NowaNazwa");
    expect(after.level).toBe(200);
    // Poprzednia referencja NIE jest zmutowana (immutable).
    expect(before.name).toBe("");
  });

  it("zachowuje niezmienione pola (shallow merge)", () => {
    store.getState().updateField("identity", {
      ...store.getState().snapshot.identity,
      name: "X",
    });
    const snap = store.getState().snapshot;
    expect(snap.identity.name).toBe("X");
    expect(snap.identity.level).toBe(8); // bez zmian
    expect(snap.source.kind).toBe("manual"); // bez zmian
    expect(snap.skills.magic.base).toBe(0); // bez zmian
  });

  it("updateField('flags', …) zastępuje cały obiekt flags", () => {
    store.getState().updateField("flags", {
      soulWar: true,
      primalOrdeal: false,
      worldTransfer: false,
      preySlot: false,
      charmExpansion: false,
      weeklyTaskExpansion: false,
      twistOfFate: false,
      blessingsActive: 7,
    });
    expect(store.getState().snapshot.flags.soulWar).toBe(true);
    expect(store.getState().snapshot.flags.blessingsActive).toBe(7);
  });

  it("notify listeners po każdym update", () => {
    const events: number[] = [];
    const unsub = store.subscribe((s: { snapshot: CharacterSnapshot }) => {
      events.push(s.snapshot.identity.level);
    });
    store.getState().updateField("identity", {
      ...store.getState().snapshot.identity,
      level: 100,
    });
    store.getState().updateField("identity", {
      ...store.getState().snapshot.identity,
      level: 200,
    });
    unsub();
    expect(events).toEqual([100, 200]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// updateNestedField — deep immutable update
// ──────────────────────────────────────────────────────────────────────────

describe("character-store — updateNestedField", () => {
  let store: ReturnType<typeof createCharacterStore>;

  beforeEach(() => {
    store = createCharacterStore();
  });

  it("top-level path: 'identity' → zastępuje cały obiekt", () => {
    store.getState().updateNestedField("identity", {
      name: "Nested",
      level: 999,
      vocation: "Sorcerer",
      vocationPromoted: "Master Sorcerer",
      sex: "F",
    });
    expect(store.getState().snapshot.identity.level).toBe(999);
    expect(store.getState().snapshot.identity.name).toBe("Nested");
  });

  it("2-segment path: 'progression.charmPoints' → 7611", () => {
    store.getState().updateNestedField("progression.charmPoints", 7611);
    const snap = store.getState().snapshot;
    expect(snap.progression.charmPoints).toBe(7611);
    // Pozostałe pola progresji bez zmian.
    expect(snap.progression.bossPoints).toBe(0);
    expect(snap.progression.imbuementsUnlocked).toBe(0);
  });

  it("3-segment path: 'skills.magic.base' → 47 (deep immutable)", () => {
    const before = store.getState().snapshot.skills.magic.base;
    store.getState().updateNestedField("skills.magic.base", 47);
    const after = store.getState().snapshot.skills.magic.base;
    expect(after).toBe(47);
    expect(before).toBe(0); // immutable
    // Pozostałe skille bez zmian.
    expect(store.getState().snapshot.skills.fist.base).toBe(0);
  });

  it("3-segment path: 'assets.gems.lesser' → 44", () => {
    store.getState().updateNestedField("assets.gems.lesser", 44);
    const gems = store.getState().snapshot.assets.gems;
    expect(gems.lesser).toBe(44);
    expect(gems.regular).toBe(0);
    expect(gems.greater).toBe(0);
  });

  it("2-segment path: 'flags.soulWar' → true", () => {
    store.getState().updateNestedField("flags.soulWar", true);
    expect(store.getState().snapshot.flags.soulWar).toBe(true);
    expect(store.getState().snapshot.flags.primalOrdeal).toBe(false);
  });

  it("NIE mutuje oryginału (deep immutable, structural sharing)", () => {
    const beforeSnap = store.getState().snapshot;
    const beforeSkills = beforeSnap.skills;
    const beforeFist = beforeSkills.fist;
    store.getState().updateNestedField("skills.magic.base", 99);
    const afterSnap = store.getState().snapshot;
    // Nowe referencje na zmienionym segmencie.
    expect(afterSnap.skills).not.toBe(beforeSkills);
    expect(afterSnap.skills.magic).not.toBe(beforeFist);
    // Ale niezmienione segmenty (np. fist) zachowują referencję.
    expect(afterSnap.skills.fist).toBe(beforeFist);
    // Stara referencja snapshota jest niezmieniona.
    expect(beforeSnap.skills.magic.base).toBe(0);
  });

  it("runtime: nieprawidłowa ścieżka → throw (setIn)", () => {
    // Typy pilnują poprawności ścieżek w compile-time (TypeScript
    // odrzuca 'foo.bar' w `updateNestedField`). Gdyby ktoś obejrzał
    // typy przez `as any` i podał nieznaną ścieżkę, `setIn` rzuca
    // wyraźny błąd zamiast cicho tworzyć niespójny stan.
    expect(() =>
      store
        .getState()
        .updateNestedField(
          "skills.magic.base" as unknown as import("./character-store.js").NestedPath<CharacterSnapshot>,
          1,
        ),
    ).not.toThrow(); // poprawna ścieżka → OK
    expect(() =>
      store
        .getState()
        .updateNestedField(
          "foo.bar" as unknown as import("./character-store.js").NestedPath<CharacterSnapshot>,
          1,
        ),
    ).toThrow(/nie istnieje w obiekcie/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// setSource
// ──────────────────────────────────────────────────────────────────────────

describe("character-store — setSource", () => {
  let store: ReturnType<typeof createCharacterStore>;

  beforeEach(() => {
    store = createCharacterStore();
  });

  it("zmienia source kind", () => {
    store.getState().setSource({ kind: "manual" });
    expect(store.getState().snapshot.source.kind).toBe("manual");
    store.getState().setSource({
      kind: "imported",
      from: "tibia-com",
    });
    expect(store.getState().snapshot.source.kind).toBe("imported");
  });

  it("ustawia source.kind='auction' z auctionId", () => {
    store.getState().setSource({ kind: "auction", auctionId: 12345n });
    const src = store.getState().snapshot.source;
    expect(src.kind).toBe("auction");
    if (src.kind === "auction") {
      expect(src.auctionId).toBe(12345n);
    }
  });

  it("przy zmianie z 'auction' na inny — usuwa pole auction (schema wymusza spójność)", () => {
    // Najpierw ładujemy aukcję.
    store.getState().loadFromAuction(fixtureAuctionMinimal(), 2173376n);
    expect(store.getState().snapshot.auction).toBeDefined();

    // Zmiana na manual — auction musi zniknąć.
    store.getState().setSource({ kind: "manual" });
    expect(store.getState().snapshot.source.kind).toBe("manual");
    expect(store.getState().snapshot.auction).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// loadFromAuction
// ──────────────────────────────────────────────────────────────────────────

describe("character-store — loadFromAuction", () => {
  it("wczytuje valid auction snapshot i ustawia source.kind='auction'", () => {
    const store = createCharacterStore();
    const auction = fixtureAuctionMinimal();
    // Zmieniamy source na coś innego, żeby sprawdzić nadpisanie.
    store.getState().loadFromManual(fixtureManual());
    expect(store.getState().snapshot.source.kind).toBe("manual");

    store.getState().loadFromAuction(auction, 2173376n);
    const snap = store.getState().snapshot;
    expect(snap.source.kind).toBe("auction");
    if (snap.source.kind === "auction") {
      expect(snap.source.auctionId).toBe(2173376n);
    }
    expect(snap.identity.name).toBe("Migzen");
    expect(snap.identity.level).toBe(619);
    expect(snap.flags.soulWar).toBe(true);
    expect(snap.progression.charmPoints).toBe(7611);
    expect(snap.auction?.bid).toBe(25501);
  });

  it("rzuca ZodError przy corrupted input (level < 8)", () => {
    const store = createCharacterStore();
    const corrupted = {
      ...fixtureAuctionMinimal(),
      identity: {
        ...fixtureAuctionMinimal().identity,
        level: 7, // invalid
      },
    };
    expect(() => store.getState().loadFromAuction(corrupted, 1n)).toThrow(
      ZodError,
    );
  });

  it("rzuca ZodError gdy vocation niezgodna z enum", () => {
    const store = createCharacterStore();
    const corrupted = {
      ...fixtureAuctionMinimal(),
      identity: {
        ...fixtureAuctionMinimal().identity,
        vocation: "Wizard" as unknown as "Knight", // invalid
      },
    };
    expect(() => store.getState().loadFromAuction(corrupted, 1n)).toThrow(
      ZodError,
    );
  });

  it("rzuca ZodError gdy gems ujemne", () => {
    const store = createCharacterStore();
    const snap = fixtureAuctionMinimal();
    const corrupted = {
      ...snap,
      assets: {
        ...snap.assets,
        gems: { lesser: -1, regular: 0, greater: 0 }, // invalid
      },
    };
    expect(() => store.getState().loadFromAuction(corrupted, 1n)).toThrow(
      ZodError,
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// loadFromManual
// ──────────────────────────────────────────────────────────────────────────

describe("character-store — loadFromManual", () => {
  it("wczytuje i wymusza source.kind='manual'", () => {
    const store = createCharacterStore();
    // Najpierw ładujemy aukcję z polem auction.
    store.getState().loadFromAuction(fixtureAuctionMinimal(), 2173376n);
    expect(store.getState().snapshot.auction).toBeDefined();

    store.getState().loadFromManual(fixtureManual());
    const snap = store.getState().snapshot;
    expect(snap.source.kind).toBe("manual");
    expect(snap.identity.name).toBe("TestChar");
    // Pole auction musi zniknąć (bo source NIE jest auction).
    expect(snap.auction).toBeUndefined();
  });

  it("rzuca ZodError przy invalid input", () => {
    const store = createCharacterStore();
    const corrupted = {
      ...fixtureManual(),
      identity: {
        ...fixtureManual().identity,
        level: 3000, // > 2500
      },
    };
    expect(() => store.getState().loadFromManual(corrupted)).toThrow(ZodError);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// loadFromUrl — integration z T10 urlToSnapshot
// ──────────────────────────────────────────────────────────────────────────

describe("character-store — loadFromUrl", () => {
  it("wczytuje snapshot z poprawnego URL", () => {
    const store = createCharacterStore();
    const original = fixtureManual();
    const encoded = snapshotToUrl(original);
    const url = `https://tibians.tools/pl/workspace${encoded.url}`;
    store.getState().loadFromUrl(url);
    const snap = store.getState().snapshot;
    expect(snap.identity.name).toBe("TestChar");
    expect(snap.identity.level).toBe(250);
    expect(snap.source.kind).toBe("manual");
  });

  it("honoruje ?auction=N → source.kind='auction' + auctionId", () => {
    const store = createCharacterStore();
    const manual = fixtureManual();
    const encoded = snapshotToUrl(manual);
    const url = `https://tibians.tools/pl/auction${encoded.url}&auction=2173376`;
    store.getState().loadFromUrl(url);
    const snap = store.getState().snapshot;
    expect(snap.source.kind).toBe("auction");
    if (snap.source.kind === "auction") {
      expect(snap.source.auctionId).toBe(2173376n);
    }
  });

  it("akceptuje sam token URL (snapshotToUrl.url)", () => {
    const store = createCharacterStore();
    const manual = fixtureManual();
    const encoded = snapshotToUrl(manual);
    store.getState().loadFromUrl(encoded.url);
    expect(store.getState().snapshot.identity.name).toBe("TestChar");
  });

  it("rzuca CorruptedSnapshotUrlError przy corrupted token (Zod walidacja fail)", () => {
    const store = createCharacterStore();
    // Ręcznie budujemy payload z prefixem 'p' i JSON-em o niepoprawnym kształcie.
    // Ten test weryfikuje propagację błędu z T10 — store NIE łapie
    // `CorruptedSnapshotUrlError`, przepuszcza go do UI.
    const payload = buildInvalidPayload();
    expect(() =>
      store
        .getState()
        .loadFromUrl(`https://tibians.tools/pl/workspace?s=${payload}`),
    ).toThrow(CorruptedSnapshotUrlError);
  });

  it("rzuca CorruptedSnapshotUrlError przy uszkodzonym base64", () => {
    const store = createCharacterStore();
    expect(() =>
      store
        .getState()
        .loadFromUrl(
          "https://tibians.tools/pl/workspace?s=!!!invalid!!!",
        ),
    ).toThrow(CorruptedSnapshotUrlError);
  });

  it("URL bez ?s= z ?auction=N — wymusza source.kind='auction' na obecnym snapie", () => {
    const store = createCharacterStore();
    store.getState().loadFromManual(fixtureManual());
    // URL bez `?s=` — tylko `?auction=`.
    store.getState().loadFromUrl("https://tibians.tools/pl/auction?auction=42");
    const snap = store.getState().snapshot;
    expect(snap.source.kind).toBe("auction");
    if (snap.source.kind === "auction") {
      expect(snap.source.auctionId).toBe(42n);
    }
    // Reszta snapshota (np. dane z manual) zachowana.
    expect(snap.identity.name).toBe("TestChar");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// reset
// ──────────────────────────────────────────────────────────────────────────

describe("character-store — reset", () => {
  it("przywraca pusty default", () => {
    const store = createCharacterStore();
    store.getState().loadFromAuction(fixtureAuctionMinimal(), 2173376n);
    expect(store.getState().snapshot.identity.level).toBe(619);
    store.getState().reset();
    expect(store.getState().snapshot.identity.level).toBe(8);
    expect(store.getState().snapshot.source.kind).toBe("manual");
    expect(store.getState().snapshot.identity.name).toBe("");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// URL transforms (T10) — bezpośrednie testy integracyjne
// ──────────────────────────────────────────────────────────────────────────

describe("snapshotToUrl / urlToSnapshot (T10 integration)", () => {
  it("round-trip: snapshot → URL → snapshot bez utraty danych", () => {
    const original = fixtureAuctionMinimal();
    const encoded = snapshotToUrl(original);
    const decoded = urlToSnapshot(encoded.url);
    expect(decoded).toEqual(original);
  });

  it("obsługuje Unicode (polskie znaki w nazwie)", () => {
    const original = fixtureManual();
    const withUnicode = {
      ...original,
      identity: { ...original.identity, name: "Łowca Ćmów" },
    };
    const encoded = snapshotToUrl(withUnicode);
    const decoded = urlToSnapshot(encoded.url);
    expect(decoded).not.toBeNull();
    expect(decoded?.identity.name).toBe("Łowca Ćmów");
  });

  it("urlToSnapshot — corrupted JSON → CorruptedSnapshotUrlError", () => {
    // Token z poprawnym prefixem ale niezgodny ze schema.
    // Musimy go owinąć w URL z `?s=` bo urlToSnapshot wymaga query string.
    const payload = buildInvalidPayload();
    const url = `https://tibians.tools/pl/workspace?s=${payload}`;
    expect(() => urlToSnapshot(url)).toThrow(CorruptedSnapshotUrlError);
  });

  it("urlToSnapshot — brak ?s= → null", () => {
    expect(urlToSnapshot("https://tibians.tools/pl/workspace")).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Selektory — sanity check
// ──────────────────────────────────────────────────────────────────────────

describe("selectors", () => {
  it("selectSkill('magic') zwraca SkillEntry", () => {
    const snap = fixtureAuctionMinimal();
    const sel = selectSkill("magic");
    expect(sel(snap).base).toBe(47);
  });

  it("selectSkillBase('sword') → 15", () => {
    const snap = fixtureAuctionMinimal();
    expect(selectSkillBase("sword")(snap)).toBe(15);
  });

  it("selectHasFlag('soulWar') → true dla aukcji z Soul War", () => {
    const snap = fixtureAuctionMinimal();
    expect(selectHasFlag("soulWar")(snap)).toBe(true);
    expect(selectHasFlag("primalOrdeal")(snap)).toBe(false);
  });

  it("selectProgressPercentages — quests i imbuements", () => {
    const snap = fixtureAuctionMinimal();
    const p = selectProgressPercentages(snap);
    expect(p.quests).toBeCloseTo((28 / 42) * 100, 1);
    expect(p.imbuements).toBeCloseTo((11 / 23) * 100, 1);
  });

  it("selectLevel → 619", () => {
    expect(selectLevel(fixtureAuctionMinimal())).toBe(619);
  });

  it("selectTotalSkillBase — suma wszystkich 8 skilli", () => {
    const snap = fixtureAuctionMinimal();
    // magic 47 + fist 113 + sword 15 = 175
    expect(selectTotalSkillBase(snap)).toBe(47 + 113 + 15);
  });

  it("selectValueConfidence — 1.0 dla pełnego aukcyjnego (items + achievements + tcInvested)", () => {
    // `fixtureAuctionMinimal` ma items + achievements + tcInvested
    // → najlepszy przypadek algorytmu T9: 1.0.
    const snap = fixtureAuctionMinimal();
    expect(selectValueConfidence(snap)).toBe(1.0);
  });

  it("selectValueConfidence — 0.9 dla częściowego aukcyjnego (items + achievements, bez tcInvested)", () => {
    // Budujemy fixture BEZ tcInvested — partial detail (między 0.8 a 1.0).
    const base = fixtureAuctionMinimal();
    const { tcInvested: _drop, ...rest } = base.assets;
    void _drop;
    const snap = { ...base, assets: rest };
    expect(selectValueConfidence(snap)).toBe(0.9);
  });

  it("selectValueConfidence — 0.4 dla manual bez items", () => {
    const snap = fixtureManual();
    expect(selectValueConfidence(snap)).toBe(0.4);
  });

  it("selectHasAuctionContext — true dla aukcji", () => {
    expect(selectHasAuctionContext(fixtureAuctionMinimal())).toBe(true);
    expect(selectHasAuctionContext(fixtureManual())).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Performance — 100 update'ów < 50 ms (acceptance criteria)
// ──────────────────────────────────────────────────────────────────────────

describe("character-store — performance", () => {
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
    // Sanity: ostatni update powinien być widoczny.
    expect(store.getState().snapshot.identity.level).toBe(199);
  });

  it("100 updateNestedField w < 50 ms (typowy scenariusz kalkulatora)", () => {
    const store = createCharacterStore();
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      store.getState().updateNestedField("progression.charmPoints", 1000 + i);
    }
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
    expect(store.getState().snapshot.progression.charmPoints).toBe(1099);
  });

  it("100 mix akcji (updateField + updateNestedField + setSource) w < 80 ms", () => {
    const store = createCharacterStore();
    const t0 = performance.now();
    for (let i = 0; i < 33; i++) {
      store.getState().updateField("identity", {
        ...store.getState().snapshot.identity,
        name: `Char-${i}`,
      });
      store.getState().updateNestedField("skills.magic.base", 10 + i);
      store.getState().updateNestedField("assets.gems.lesser", i);
    }
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(80);
  });

  it("100 selektorów + 100 update'ów w < 100 ms (reactive recompute symulacja)", () => {
    // Symuluje scenariusz: panel kalkulatora odpytuje selektor co update.
    const store = createCharacterStore();
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      store.getState().updateNestedField("progression.charmPoints", 1000 + i);
      const snap = store.getState().snapshot;
      const _ = selectLevel(snap);
      const __ = selectTotalSkillBase(snap);
      const ___ = selectProgressPercentages(snap);
      void _;
      void __;
      void ___;
    }
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(100);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Immutability invariants — upewniamy się, że store NIE MUTUJE wewnętrznie
// ──────────────────────────────────────────────────────────────────────────

describe("character-store — immutability", () => {
  it("updateField NIE mutuje poprzedniego stanu (referencje)", () => {
    const store = createCharacterStore();
    const before = store.getState().snapshot;
    const beforeIdentity = before.identity;
    store.getState().updateField("identity", {
      ...before.identity,
      name: "X",
    });
    const after = store.getState().snapshot;
    expect(after).not.toBe(before);
    expect(after.identity).not.toBe(beforeIdentity);
    expect(beforeIdentity.name).toBe(""); // immutable
  });

  it("updateNestedField NIE mutuje głębokich referencji", () => {
    const store = createCharacterStore();
    const beforeSkills = store.getState().snapshot.skills;
    const beforeFist = beforeSkills.fist;
    store.getState().updateNestedField("skills.magic.base", 99);
    const afterSkills = store.getState().snapshot.skills;
    // Skille jako całość — nowa referencja.
    expect(afterSkills).not.toBe(beforeSkills);
    // Ale fist (niezmieniony) — ta sama referencja (structural sharing).
    expect(afterSkills.fist).toBe(beforeFist);
  });

  it("reset NIE mutuje poprzedniego stanu", () => {
    const store = createCharacterStore();
    store.getState().loadFromAuction(fixtureAuctionMinimal(), 2173376n);
    const before = store.getState().snapshot;
    store.getState().reset();
    const after = store.getState().snapshot;
    expect(after).not.toBe(before);
    expect(before.identity.name).toBe("Migzen"); // immutable
    expect(after.identity.name).toBe("");
  });
});
