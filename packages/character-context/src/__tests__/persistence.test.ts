/**
 * Testy persistence localStorage — task 13 (100% coverage).
 *
 * Pokrycie:
 *   1. CRUD: listSavedCharacters / getSavedCharacter / saveCharacter /
 *      deleteSavedCharacter / countSavedCharacters
 *   2. Corrupted localStorage → empty array + warning
 *   3. Limit 3 enforcement (4. próba → CharacterLimitReachedError)
 *   4. getStorage catch (localStorage access throws)
 *   5. createId fallback (crypto.randomUUID niedostępny)
 *   6. use-saved-characters hook (React)
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CharacterSnapshotSchema,
  type CharacterSnapshot,
} from "../index.js";
import {
  SAVED_CHARACTERS_KEY,
  listSavedCharacters,
  getSavedCharacter,
  saveCharacter,
  deleteSavedCharacter,
  countSavedCharacters,
  CharacterLimitReachedError,
} from "../persistence/local-storage-characters.js";
import {
  getLimit,
  canSaveMore,
  FREE_CHARACTER_LIMIT,
} from "../persistence/limits.js";
import { useSavedCharacters } from "../persistence/use-saved-characters.js";

// ──────────────────────────────────────────────────────────────────────────
// localStorage mock
// ──────────────────────────────────────────────────────────────────────────

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
const listeners = new Set<(event?: unknown) => void>();

beforeEach(() => {
  storageMock = createStorageMock();
  listeners.clear();
  // React 19 wymaga IS_REACT_ACT_ENVIRONMENT dla act().
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: storageMock,
      dispatchEvent: (event?: unknown) => {
        // Symulujemy event loop: wywołujemy wszystkich listenerów z eventem.
        for (const fn of listeners) fn(event);
        return true;
      },
      addEventListener: (_type: string, fn: (event?: unknown) => void) => {
        listeners.add(fn);
      },
      removeEventListener: (_type: string, fn: (event?: unknown) => void) => {
        listeners.delete(fn);
      },
    },
    configurable: true,
    writable: true,
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;
});

// ──────────────────────────────────────────────────────────────────────────
// Fixture
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
// 1. CRUD round-trip
// ──────────────────────────────────────────────────────────────────────────

describe("CRUD round-trip", () => {
  it("save → list → get → delete", () => {
    const saved = saveCharacter({ label: "Migzen", snapshot: fixtureManual() });

    const list = listSavedCharacters();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(saved.id);
    expect(list[0]?.label).toBe("Migzen");

    const got = getSavedCharacter(saved.id);
    expect(got?.snapshot.identity.level).toBe(619);

    const deleted = deleteSavedCharacter(saved.id);
    expect(deleted).toBe(true);
    expect(listSavedCharacters()).toHaveLength(0);
    expect(getSavedCharacter(saved.id)).toBeUndefined();
  });

  it("save generuje UUID v4 i ISO timestamps", () => {
    const saved = saveCharacter({ label: "A", snapshot: fixtureManual() });
    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(new Date(saved.createdAt).toString()).not.toBe("Invalid Date");
    expect(new Date(saved.updatedAt).toString()).not.toBe("Invalid Date");
  });

  it("save z istniejącym id aktualizuje (bump updatedAt)", () => {
    const first = saveCharacter({ label: "A", snapshot: fixtureManual("A") });
    const createdAt = first.createdAt;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 5000));
    const updated = saveCharacter({
      id: first.id,
      label: "A zmieniona",
      snapshot: fixtureManual("A"),
    });
    vi.useRealTimers();

    expect(updated.id).toBe(first.id);
    expect(updated.createdAt).toBe(createdAt);
    expect(updated.updatedAt).not.toBe(createdAt);
    expect(listSavedCharacters()).toHaveLength(1);
  });

  it("sortuje po updatedAt DESC", () => {
    const a = saveCharacter({ label: "A", snapshot: fixtureManual("A") });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 1000));
    const b = saveCharacter({ label: "B", snapshot: fixtureManual("B") });
    vi.useRealTimers();

    const list = listSavedCharacters();
    expect(list[0]?.id).toBe(b.id);
    expect(list[1]?.id).toBe(a.id);
  });

  it("delete nieistniejącego id → false", () => {
    expect(deleteSavedCharacter("nonexistent")).toBe(false);
  });

  it("countSavedCharacters", () => {
    saveCharacter({ label: "1", snapshot: fixtureManual("1") });
    saveCharacter({ label: "2", snapshot: fixtureManual("2") });
    expect(countSavedCharacters()).toBe(2);
  });

  it("saveCharacter waliduje snapshot (ZodError przy invalid)", () => {
    const corrupted = {
      ...fixtureManual(),
      identity: { ...fixtureManual().identity, level: 7 },
    };
    expect(() =>
      saveCharacter({ label: "X", snapshot: corrupted }),
    ).toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Corrupted localStorage → graceful fallback
// ──────────────────────────────────────────────────────────────────────────

describe("corrupted localStorage", () => {
  it("invalid JSON → [] + warning", () => {
    storageMock.setItem(SAVED_CHARACTERS_KEY, "{not valid json!!");
    expect(listSavedCharacters()).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it("JSON poprawny ale Zod fail → [] + warning", () => {
    storageMock.setItem(
      SAVED_CHARACTERS_KEY,
      JSON.stringify([{ id: "x", label: "y" }]),
    );
    expect(listSavedCharacters()).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it("brak klucza → [] bez warninga", () => {
    expect(listSavedCharacters()).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("countSavedCharacters → 0 przy corrupted", () => {
    storageMock.setItem(SAVED_CHARACTERS_KEY, "garbage");
    expect(countSavedCharacters()).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Limit enforcement
// ──────────────────────────────────────────────────────────────────────────

describe("limit enforcement", () => {
  it("4. save attempt (anonymous) → CharacterLimitReachedError", () => {
    saveCharacter({ label: "1", snapshot: fixtureManual("1") });
    saveCharacter({ label: "2", snapshot: fixtureManual("2") });
    saveCharacter({ label: "3", snapshot: fixtureManual("3") });
    expect(countSavedCharacters()).toBe(FREE_CHARACTER_LIMIT);

    expect(() =>
      saveCharacter({ label: "4", snapshot: fixtureManual("4") }),
    ).toThrow(CharacterLimitReachedError);
    expect(countSavedCharacters()).toBe(3);
  });

  it("CharacterLimitReachedError niesie limit i isAuthenticated", () => {
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

  it("zalogowany → bez limitu", () => {
    for (let i = 1; i <= 5; i++) {
      saveCharacter(
        { label: `c${i}`, snapshot: fixtureManual(`c${i}`) },
        { isAuthenticated: true },
      );
    }
    expect(countSavedCharacters()).toBe(5);
  });

  it("update istniejącej nie liczy się do limitu", () => {
    const first = saveCharacter({ label: "1", snapshot: fixtureManual("1") });
    saveCharacter({ label: "2", snapshot: fixtureManual("2") });
    saveCharacter({ label: "3", snapshot: fixtureManual("3") });
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
  it("getLimit: 3 anonymous, Infinity zalogowany", () => {
    expect(getLimit(false)).toBe(3);
    expect(getLimit(true)).toBe(Infinity);
  });

  it("canSaveMore: progi", () => {
    expect(canSaveMore(false, 0)).toBe(true);
    expect(canSaveMore(false, 2)).toBe(true);
    expect(canSaveMore(false, 3)).toBe(false);
    expect(canSaveMore(false, 4)).toBe(false);
    expect(canSaveMore(true, 100)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. getStorage catch — localStorage access throws
// ──────────────────────────────────────────────────────────────────────────

describe("getStorage catch", () => {
  it("window.localStorage access rzuca → [] (SSR-safe fallback)", () => {
    // Definiujemy window z getterem localStorage który rzuca.
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis.window, "localStorage", {
      get() {
        throw new Error("localStorage blocked");
      },
      configurable: true,
    });
    expect(listSavedCharacters()).toEqual([]);
    // saveCharacter też nie rzuca — no-op.
    const saved = saveCharacter({ label: "X", snapshot: fixtureManual() });
    expect(saved.id).toBeDefined();
  });

  it("brak window (SSR) → []", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(listSavedCharacters()).toEqual([]);
    expect(countSavedCharacters()).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. createId fallback — crypto.randomUUID niedostępny
// ──────────────────────────────────────────────────────────────────────────

describe("createId fallback", () => {
  it("bez crypto.randomUUID → pseudo-UUID z Math.random", () => {
    const originalCrypto = globalThis.crypto;
    // Stub crypto bez randomUUID.
    vi.stubGlobal("crypto", {});
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const saved = saveCharacter({ label: "X", snapshot: fixtureManual() });
    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );

    vi.restoreAllMocks();
    if (originalCrypto) {
      vi.stubGlobal("crypto", originalCrypto);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 7. use-saved-characters hook
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

function renderHook<T>(useHook: () => T): { current: T; unmount: () => void } {
  const result: { current: T } = { current: undefined as T };
  const container = document.createElement("div");
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(createElement(Probe, { hook: useHook, result }));
  });
  return {
    // Getter — zawsze czyta aktualną wartość (Probe aktualizuje `result`).
    get current() {
      return result.current;
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe("useSavedCharacters hook", () => {
  it("zwraca pustą listę, count 0, limit 3, canSaveMore true", () => {
    const result = renderHook(() => useSavedCharacters());
    expect(result.current.characters).toEqual([]);
    expect(result.current.count).toBe(0);
    expect(result.current.limit).toBe(3);
    expect(result.current.canSaveMore).toBe(true);
    result.unmount();
  });

  it("zwraca zapisane postacie po save", () => {
    const result = renderHook(() => useSavedCharacters());
    act(() => {
      saveCharacter({ label: "Migzen", snapshot: fixtureManual() });
    });
    expect(result.current.count).toBe(1);
    expect(result.current.characters[0]?.label).toBe("Migzen");
    expect(result.current.canSaveMore).toBe(true);
    result.unmount();
  });

  it("isAuthenticated=true → limit Infinity, canSaveMore zawsze true", () => {
    const result = renderHook(() =>
      useSavedCharacters({ isAuthenticated: true }),
    );
    expect(result.current.limit).toBe(Infinity);
    expect(result.current.canSaveMore).toBe(true);
    result.unmount();
  });

  it("canSaveMore=false przy 3 zapisanych (anonymous)", () => {
    const result = renderHook(() => useSavedCharacters());
    act(() => {
      saveCharacter({ label: "1", snapshot: fixtureManual("1") });
      saveCharacter({ label: "2", snapshot: fixtureManual("2") });
      saveCharacter({ label: "3", snapshot: fixtureManual("3") });
    });
    expect(result.current.count).toBe(3);
    expect(result.current.canSaveMore).toBe(false);
    result.unmount();
  });

  it("refresh wymusza ponowne odczytanie", () => {
    const result = renderHook(() => useSavedCharacters());
    expect(result.current.count).toBe(0);
    act(() => {
      saveCharacter({ label: "X", snapshot: fixtureManual() });
    });
    expect(result.current.count).toBe(1);
    act(() => {
      result.current.refresh();
    });
    expect(result.current.count).toBe(1);
    result.unmount();
  });

  it("subscribe dodaje listenery storage", () => {
    const addSpy = vi.spyOn(globalThis.window, "addEventListener");
    const removeSpy = vi.spyOn(globalThis.window, "removeEventListener");
    const result = renderHook(() => useSavedCharacters());
    expect(addSpy).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith(
      "tibians:savedChars",
      expect.any(Function),
    );
    expect(result.current.count).toBe(0);
    // Odmontowanie → cleanup usuwa listenery (linie 71-73).
    result.unmount();
    expect(removeSpy).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith(
      "tibians:savedChars",
      expect.any(Function),
    );
    removeSpy.mockRestore();
    addSpy.mockRestore();
  });

  it("storage event z kluczem SAVED_CHARACTERS_KEY → re-render", () => {
    const result = renderHook(() => useSavedCharacters());
    expect(result.current.count).toBe(0);
    // Symulujemy storage event z innej karty (klucz pasuje).
    act(() => {
      storageMock.setItem(
        SAVED_CHARACTERS_KEY,
        JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111",
            label: "Z innej karty",
            snapshot: fixtureManual(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]),
      );
      for (const fn of listeners) fn({ key: SAVED_CHARACTERS_KEY });
    });
    expect(result.current.count).toBe(1);
    expect(result.current.characters[0]?.label).toBe("Z innej karty");
    result.unmount();
  });

  it("storage event z innym kluczem → brak re-renderu", () => {
    const result = renderHook(() => useSavedCharacters());
    expect(result.current.count).toBe(0);
    act(() => {
      for (const fn of listeners) fn({ key: "other-key" });
    });
    expect(result.current.count).toBe(0);
    result.unmount();
  });
});