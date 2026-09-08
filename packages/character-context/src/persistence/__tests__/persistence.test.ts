/**
 * @tibians/character-context — testy warstwy localStorage "Moje postacie"
 * (task 12).
 *
 * Pokrywa (plan task 12):
 *   1. Round-trip `save → list → get → delete`
 *   2. Corrupted localStorage (invalid JSON) → graceful fallback
 *      (pusty array, log error, NIE crash)
 *   3. Limit enforcement (4. save attempt → throw
 *      `CharacterLimitReachedError` z info o upgradzie)
 *   4. Insert vs update (save z istniejącym id bumpuje updatedAt)
 *   5. Sortowanie po updatedAt DESC
 *   6. getLimit / canSaveMore (3 anonymous, Infinity zalogowany)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CharacterSnapshotSchema, type CharacterSnapshot } from "../../schema.js";
import {
  SAVED_CHARACTERS_KEY,
  listSavedCharacters,
  getSavedCharacter,
  saveCharacter,
  deleteSavedCharacter,
  countSavedCharacters,
  CharacterLimitReachedError,
} from "../local-storage-characters.js";
import { getLimit, canSaveMore, FREE_CHARACTER_LIMIT } from "../limits.js";

// ──────────────────────────────────────────────────────────────────────────
// localStorage mock
// ──────────────────────────────────────────────────────────────────────────

/** Prosty mock localStorage (Storage-like). */
function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;
}

let storageMock: Storage;

beforeEach(() => {
  storageMock = createStorageMock();
  // Podmieniamy window.localStorage + window (dla dispatchEvent).
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: storageMock,
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
    writable: true,
  });
  // Wyciszamy console.warn w testach corrupted (spodziewany).
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  // Usuwamy window, żeby nie wyciekał między testami.
  delete (globalThis as { window?: unknown }).window;
});

// ──────────────────────────────────────────────────────────────────────────
// Fixture — poprawny snapshot
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

/** Poprawny snapshot manualny (minimalny). */
function fixtureManual(name = "Migzen"): CharacterSnapshot {
  return CharacterSnapshotSchema.parse({
    source: { kind: "manual" },
    identity: {
      name,
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
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Round-trip save → list → get → delete
// ──────────────────────────────────────────────────────────────────────────

describe("round-trip save → list → get → delete", () => {
  it("zapisuje, listuje, pobiera i usuwa postać", () => {
    const saved = saveCharacter({ label: "Migzen", snapshot: fixtureManual() });

    // save → list
    const list = listSavedCharacters();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(saved.id);
    expect(list[0]!.label).toBe("Migzen");
    expect(list[0]!.snapshot.identity.name).toBe("Migzen");

    // get
    const got = getSavedCharacter(saved.id);
    expect(got).toBeDefined();
    expect(got!.snapshot.identity.level).toBe(619);

    // delete
    const deleted = deleteSavedCharacter(saved.id);
    expect(deleted).toBe(true);
    expect(listSavedCharacters()).toHaveLength(0);
    expect(getSavedCharacter(saved.id)).toBeUndefined();
  });

  it("save generuje UUID i ISO-8601 timestamps", () => {
    const saved = saveCharacter({ label: "A", snapshot: fixtureManual() });
    // UUID v4 format.
    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(new Date(saved.createdAt).toString()).not.toBe("Invalid Date");
    expect(new Date(saved.updatedAt).toString()).not.toBe("Invalid Date");
  });

  it("save z istniejącym id aktualizuje (bump updatedAt), nie duplikuje", () => {
    const first = saveCharacter({ label: "A", snapshot: fixtureManual("A") });
    const createdAt = first.createdAt;

    // Symulujemy upływ czasu.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 5000));

    const updated = saveCharacter({
      id: first.id,
      label: "A (zmieniona)",
      snapshot: fixtureManual("A"),
    });

    vi.useRealTimers();

    expect(updated.id).toBe(first.id);
    expect(updated.createdAt).toBe(createdAt); // zachowane
    expect(updated.updatedAt).not.toBe(createdAt); // bumpnięte
    expect(updated.label).toBe("A (zmieniona)");
    expect(listSavedCharacters()).toHaveLength(1); // nie duplikuje
  });

  it("sortuje po updatedAt DESC (najnowsze na górze)", () => {
    const a = saveCharacter({ label: "A", snapshot: fixtureManual("A") });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 1000));
    const b = saveCharacter({ label: "B", snapshot: fixtureManual("B") });
    vi.useRealTimers();

    const list = listSavedCharacters();
    expect(list[0]!.id).toBe(b.id); // B zapisana później → na górze
    expect(list[1]!.id).toBe(a.id);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Corrupted localStorage → graceful fallback
// ──────────────────────────────────────────────────────────────────────────

describe("corrupted localStorage → graceful fallback", () => {
  it("invalid JSON → pusty array + warning log (NIE crash)", () => {
    storageMock.setItem(SAVED_CHARACTERS_KEY, "{not valid json!!");

    const list = listSavedCharacters();
    expect(list).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it("JSON poprawny ale nie przechodzi Zod → pusty array + warning", () => {
    // Poprawny JSON, ale zła struktura (brak snapshot, złe pola).
    storageMock.setItem(
      SAVED_CHARACTERS_KEY,
      JSON.stringify([{ id: "x", label: "y" }]),
    );

    const list = listSavedCharacters();
    expect(list).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it("brak klucza → pusty array bez warninga", () => {
    const list = listSavedCharacters();
    expect(list).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("countSavedCharacters zwraca 0 przy corrupted storage", () => {
    storageMock.setItem(SAVED_CHARACTERS_KEY, "garbage");
    expect(countSavedCharacters()).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Limit enforcement
// ──────────────────────────────────────────────────────────────────────────

describe("limit enforcement (arch. §15.1)", () => {
  it("4. save attempt (anonymous) → throw CharacterLimitReachedError", () => {
    // Zapisujemy 3 (limit free).
    saveCharacter({ label: "1", snapshot: fixtureManual("1") });
    saveCharacter({ label: "2", snapshot: fixtureManual("2") });
    saveCharacter({ label: "3", snapshot: fixtureManual("3") });

    expect(countSavedCharacters()).toBe(FREE_CHARACTER_LIMIT);

    // 4. próba → throw.
    expect(() =>
      saveCharacter({ label: "4", snapshot: fixtureManual("4") }),
    ).toThrow(CharacterLimitReachedError);

    // Lista nadal ma 3 (nie zapisano 4.).
    expect(countSavedCharacters()).toBe(3);
  });

  it("CharacterLimitReachedError niesie info o upgradzie", () => {
    saveCharacter({ label: "1", snapshot: fixtureManual("1") });
    saveCharacter({ label: "2", snapshot: fixtureManual("2") });
    saveCharacter({ label: "3", snapshot: fixtureManual("3") });

    try {
      saveCharacter({ label: "4", snapshot: fixtureManual("4") });
      expect.unreachable("powinno rzucić");
    } catch (err) {
      expect(err).toBeInstanceOf(CharacterLimitReachedError);
      const e = err as CharacterLimitReachedError;
      expect(e.limit).toBe(3);
      expect(e.isAuthenticated).toBe(false);
      expect(e.message).toContain("Zaloguj się");
    }
  });

  it("zalogowany (isAuthenticated) → bez limitu", () => {
    // Zapisujemy 5 — zalogowany nie ma limitu.
    for (let i = 1; i <= 5; i++) {
      saveCharacter(
        { label: `c${i}`, snapshot: fixtureManual(`c${i}`) },
        { isAuthenticated: true },
      );
    }
    expect(countSavedCharacters()).toBe(5);
  });

  it("update istniejącej postaci nie liczy się do limitu", () => {
    const first = saveCharacter({ label: "1", snapshot: fixtureManual("1") });
    saveCharacter({ label: "2", snapshot: fixtureManual("2") });
    saveCharacter({ label: "3", snapshot: fixtureManual("3") });

    // Update 1. (istniejąca) — nie przekracza limitu.
    const updated = saveCharacter({
      id: first.id,
      label: "1 zmieniona",
      snapshot: fixtureManual("1"),
    });
    expect(updated.id).toBe(first.id);
    expect(countSavedCharacters()).toBe(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. getLimit / canSaveMore
// ──────────────────────────────────────────────────────────────────────────

describe("getLimit / canSaveMore", () => {
  it("getLimit: 3 dla anonymous, Infinity dla zalogowanych", () => {
    expect(getLimit(false)).toBe(3);
    expect(getLimit(true)).toBe(Infinity);
  });

  it("canSaveMore: true poniżej limitu, false na limicie", () => {
    expect(canSaveMore(false, 0)).toBe(true);
    expect(canSaveMore(false, 2)).toBe(true);
    expect(canSaveMore(false, 3)).toBe(false);
    expect(canSaveMore(false, 4)).toBe(false);
    // Zalogowany — zawsze true.
    expect(canSaveMore(true, 100)).toBe(true);
  });
});