/**
 * @tibians/character-context — Zustand store (vanilla).
 *
 * Core reactive store nad `CharacterSnapshot`. Cel (arch. §13.3 + §13.4):
 *   - Zmiana **dowolnego** pola snapshotu → reaktywne przeliczenie
 *     **wszystkich** paneli (kalkulatory, valuation, what-if).
 *   - Brak persistencji w samym store (warstwa localStorage jest w T12).
 *   - Brak zależności od React — vanilla Zustand; React hook jako wrapper.
 *
 * SSR-safety:
 *   - Initial state jest czysto synchroniczny i nie dotyka `window`,
 *     `document` ani `localStorage`. Hydratacja z localStorage jest
 *     obsługiwana przez Zustand persist middleware (T12), nie tu.
 *   - Żaden import z `react`/`react-dom` w tym pliku.
 *
 * Actions (architektura + zadanie T11):
 *   - `setSnapshot(s)`             — replace (po walidacji Zod)
 *   - `updateField(key, value)`    — top-level immutable update
 *   - `updateNestedField(p, val)`  — deep immutable update (template paths)
 *   - `setSource(source)`          — zmiana source (manual/auction/imported)
 *   - `loadFromAuction(data, id)`  — z payloadu scrapera + auctionId
 *   - `loadFromManual(s)`          — wczytanie ręczne (bezpośrednio snapshot)
 *   - `loadFromUrl(url)`           — używa `urlToSnapshot` (T10)
 *   - `reset()`                    — przywrócenie pustego defaultu
 */
import { createStore } from "zustand/vanilla";
import {
  CharacterSnapshotSchema,
  type CharacterSnapshot,
  type Source,
  type SkillKey,
  type VocationBase,
  type VocationPromoted,
  type Sex,
} from "../schema.js";
import { urlToSnapshot } from "../transforms/url-to-snapshot.js";
import { CorruptedSnapshotUrlError } from "../transforms/encoding.js";

// ──────────────────────────────────────────────────────────────────────────
// Type helpers — type-safe deep paths
// ──────────────────────────────────────────────────────────────────────────

/** Wartości uznawane za liście (nie rozwijamy ścieżki głębiej). */
type Leaf =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | symbol
  | Date;

/** Czy T jest obiektem zagnieżdżalnym (rekordem, nie tablicą/leaf/datą)? */
type IsRecord<T> = T extends Leaf
  ? false
  : T extends Array<unknown>
    ? false
    : T extends Date
      ? false
      : T extends object
        ? true
        : false;

/**
 * Rekurencyjnie generuje wszystkie poprawne ścieżki „dot notation"
 * w obrębie typu T, np.:
 *   Path<CharacterSnapshot> = 'source' | 'source.kind' | 'identity.name'
 *     | 'skills' | 'skills.magic' | 'skills.magic.base'
 *     | 'progression.charmPoints' | ... | 'auction.bid' | ...
 */
type PathImpl<T, P extends string> = {
  [K in keyof T & string]: IsRecord<T[K]> extends true
    ? `${P}${K}` | PathImpl<T[K], `${P}${K}.`>
    : `${P}${K}`;
}[keyof T & string];

/** Publiczny alias — wszystkie możliwe ścieżki w `CharacterSnapshot`. */
export type NestedPath<T> = PathImpl<T, "">;

/**
 * Rozwiązuje ścieżkę `P` w `T` do konkretnego typu liścia.
 * Np. ResolvePath<CharacterSnapshot, 'progression.charmPoints'> = number.
 */
type ResolvePathImpl<T, P extends string> = P extends `${infer K}.${infer R}`
  ? K extends keyof T
    ? ResolvePathImpl<T[K], R>
    : never
  : P extends keyof T
    ? T[P]
    : never;

/** Publiczny alias — typ wartości pod ścieżką `P` w `T`. */
export type ResolvePath<T, P extends string> = ResolvePathImpl<T, P>;

// ──────────────────────────────────────────────────────────────────────────
// Empty default snapshot
// ──────────────────────────────────────────────────────────────────────────

/**
 * Tworzy pusty snapshot z minimalnymi poprawnymi wartościami.
 *
 * Uwaga: `name = ""` jest placeholderem dla nowej postaci (gracz wpisze
 * imię przy pierwszym input). Schema ma `name.min(1)`, więc używamy
 * `as CharacterSnapshot` zamiast `parse` — pusty snapshot nie powinien
 * przechodzić walidacji (to nie jest snapshot użytkownika, tylko
 * wyjściowy stan UI). Walidacja Zod uruchamia się dopiero przy
 * `loadFromAuction/Manual/Url` (czyli na realnych danych).
 */
function emptySnapshot(): CharacterSnapshot {
  // Type assertion: schema wymaga `name.min(1)`, ale placeholder "pustej"
  // postaci (UI start state) nie powinien przechodzić walidacji. Realne
  // dane walidują się w `loadFromAuction/Manual/Url`.
  const snap = {
    source: { kind: "manual" },
    identity: {
      name: "",
      level: 8,
      vocation: "Knight",
      vocationPromoted: "Elite Knight",
      sex: "M",
    },
    skills: {
      magic: { base: 0 },
      club: { base: 0 },
      fist: { base: 0 },
      sword: { base: 0 },
      axe: { base: 0 },
      distance: { base: 0 },
      shielding: { base: 0 },
      fishing: { base: 0 },
    },
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
  };
  return snap as CharacterSnapshot;
}

// ──────────────────────────────────────────────────────────────────────────
// Public interface — CharacterStore
// ──────────────────────────────────────────────────────────────────────────

export interface CharacterStoreState {
  /** Aktualny snapshot. */
  snapshot: CharacterSnapshot;
}

export interface CharacterStoreActions {
  /** Replace całego snapshota (po walidacji Zod). */
  setSnapshot: (snapshot: CharacterSnapshot) => void;
  /** Top-level immutable update, np. `updateField('identity', newIdentity)`. */
  updateField: <K extends keyof CharacterSnapshot>(
    key: K,
    value: CharacterSnapshot[K],
  ) => void;
  /** Deep immutable update, np. `updateNestedField('progression.charmPoints', 7611)`. */
  updateNestedField: <P extends NestedPath<CharacterSnapshot>>(
    path: P,
    value: ResolvePath<CharacterSnapshot, P>,
  ) => void;
  /** Zmiana source (manual/auction/imported). */
  setSource: (source: Source) => void;
  /** Wczytanie z aukcji (scraper/hand-crafted input + auctionId). */
  loadFromAuction: (
    auctionData: CharacterSnapshot,
    auctionId: bigint,
  ) => void;
  /** Wczytanie ręczne (np. z formularza / localStorage). */
  loadFromManual: (manualSnapshot: CharacterSnapshot) => void;
  /** Wczytanie z URL (używa `urlToSnapshot`). Rzuca ZodError przy corruption. */
  loadFromUrl: (url: string) => void;
  /** Reset do pustego defaultu. */
  reset: () => void;
}

/** Pełny stan store'a — dane + akcje. */
export type CharacterStore = CharacterStoreState & CharacterStoreActions;

// ──────────────────────────────────────────────────────────────────────────
// Utility — deep immutable set
// ──────────────────────────────────────────────────────────────────────────

/**
 * Tworzy nowy obiekt z wartością `value` ustawioną pod ścieżką `path`
 * (notacja „dot"). Wszystkie obiekty pośrednie są klonowane (immutable).
 *
 * Przykład:
 *   setIn({a: {b: {c: 1}}}, 'a.b.c', 42) → {a: {b: {c: 42}}}
 *
 * @throws Error gdy ścieżka wskazuje na nieistniejący segment.
 */
function setIn<T>(obj: T, path: string, value: unknown): T {
  const segments = path.split(".");
  if (segments.length === 0) {
    throw new Error(`updateNestedField: pusta ścieżka`);
  }
  // Klonujemy segment po segmencie (nie modyfikujemy oryginału).
  const firstSegment = segments[0] as keyof T;
  if (typeof obj !== "object" || obj === null || !(firstSegment in obj)) {
    throw new Error(
      `updateNestedField: '${firstSegment as string}' nie istnieje w obiekcie`,
    );
  }
  if (segments.length === 1) {
    // Liść — ustawiamy wartość, zwracamy klon z jednym nowym polem.
    return { ...obj, [firstSegment]: value } as T;
  }
  // Rekurencja — kopiujemy obiekt i schodzimy głębiej.
  const rest = segments.slice(1).join(".");
  const nested = (obj as Record<string, unknown>)[firstSegment as string];
  const newNested = setIn(nested, rest, value);
  return {
    ...obj,
    [firstSegment]: newNested,
  } as T;
}

// ──────────────────────────────────────────────────────────────────────────
// Store factory
// ──────────────────────────────────────────────────────────────────────────

/**
 * Tworzy nową instancję vanilla store. Domyślnie eksportujemy singleton
 * `characterStore`, ale fabryka umożliwia testy w izolacji (każdy test
 * może mieć własną instancję z czystym stanem).
 */
export function createCharacterStore(initial?: Partial<CharacterSnapshot>) {
  const base = emptySnapshot();
  const initialState: CharacterSnapshot = initial
    ? CharacterSnapshotSchema.parse({ ...base, ...initial })
    : base;

  return createStore<CharacterStore>()((set) => ({
    snapshot: initialState,

    setSnapshot: (snapshot) => {
      // Walidacja przy wejściu — odrzucamy corrupted dane (ZodError).
      const validated = CharacterSnapshotSchema.parse(snapshot);
      set({ snapshot: validated });
    },

    updateField: (key, value) => {
      set((state) => ({
        snapshot: { ...state.snapshot, [key]: value } as CharacterSnapshot,
      }));
    },

    updateNestedField: (path, value) => {
      set((state) => ({
        snapshot: setIn(state.snapshot, path, value),
      }));
    },

    setSource: (source) => {
      set((state) => {
        // Jeśli zmieniamy source na coś innego niż 'auction', a mamy
        // pole `auction` — usuwamy je (bo schema tego wymaga).
        const next: CharacterSnapshot = {
          ...state.snapshot,
          source,
        };
        if (source.kind !== "auction") {
          delete (next as { auction?: unknown }).auction;
        }
        return { snapshot: next };
      });
    },

    loadFromAuction: (auctionData, auctionId) => {
      // auctionData może być zescrapowanym payloadem — walidujemy i
      // wymuszamy source.kind = 'auction' + auctionId.
      const validated = CharacterSnapshotSchema.parse(auctionData);
      set({
        snapshot: { ...validated, source: { kind: "auction", auctionId } },
      });
    },

    loadFromManual: (manualSnapshot) => {
      const validated = CharacterSnapshotSchema.parse(manualSnapshot);
      // Wymuszamy source.kind = 'manual' (nawet jeśli wejście było inne).
      const { auction: _dropped, ...rest } = validated;
      void _dropped;
      set({
        snapshot: { ...rest, source: { kind: "manual" } } as CharacterSnapshot,
      });
    },

    loadFromUrl: (url) => {
      // T10 `urlToSnapshot` zwraca `null` gdy brak `?s=` (czyli pusty
      // URL — traktujemy jak reset). Rzuca `CorruptedSnapshotUrlError`
      // gdy payload jest corrupted — propagujemy bezpośrednio do UI
      // (komponent pokazuje "Link jest uszkodzony").
      //
      // Dodatkowo: jeśli URL ma `?auction=<id>`, wymuszamy
      // `source.kind = 'auction'` + `auctionId` (loader intencjonalnie
      // wybiera aukcję).
      const parsed = parseAuctionId(url);
      const decoded = urlToSnapshot(url);
      if (decoded === null) {
        // Brak `?s=` — traktujemy jako „czysty URL", nie resetujemy.
        // Jeśli jest `?auction=...`, wymuszamy źródło aukcyjne.
        if (parsed !== undefined) {
          set((state) => ({
            snapshot: { ...state.snapshot, source: { kind: "auction", auctionId: parsed } },
          }));
        }
        return;
      }
      const snapshot: CharacterSnapshot =
        parsed !== undefined
          ? { ...decoded, source: { kind: "auction", auctionId: parsed } }
          : decoded;
      set({ snapshot });
    },

    reset: () => {
      set({ snapshot: emptySnapshot() });
    },
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// Singleton instance — domyślny store dla całej aplikacji
// ──────────────────────────────────────────────────────────────────────────

/**
 * Domyślny store (singleton). Konsumenci używają go bezpośrednio
 * przez `useCharacterStore` lub przez `characterStore.getState()`.
 *
 * Testy powinny tworzyć własną instancję przez `createCharacterStore()`.
 */
export const characterStore = createCharacterStore();

// Re-eksportujemy typ SkillKey dla wygody konsumentów (bez konieczności
// wchodzenia w schema).
export type { SkillKey, VocationBase, VocationPromoted, Sex };

// ──────────────────────────────────────────────────────────────────────────
// Helpers — parsowanie `?auction=<id>` z URL
// ──────────────────────────────────────────────────────────────────────────

/**
 * Wyciąga `auction=<id>` z URL. Zwraca `bigint` lub `undefined` gdy brak.
 * Rzuca `Error` gdy obecny ale niepoprawny.
 */
function parseAuctionId(url: string): bigint | undefined {
  // Szybka ścieżka — nie twórz URL gdy brak `?`.
  if (!url.includes("auction=")) return undefined;
  try {
    // Względne ścieżki (np. '/pl/auction?...') nie są akceptowane przez
    // `new URL()` bez bazy — dodajemy sztuczną.
    const parsed = new URL(url, "http://localhost");
    const raw = parsed.searchParams.get("auction");
    if (raw === null || raw.length === 0) return undefined;
    if (!/^\d+$/u.test(raw)) {
      throw new Error(
        "loadFromUrl: 'auction' musi być liczbą całkowitą nieujemną",
      );
    }
    return BigInt(raw);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("loadFromUrl:")) {
      throw err;
    }
    throw new Error("loadFromUrl: nieprawidłowy URL", { cause: err });
  }
}

// Re-eksportujemy `CorruptedSnapshotUrlError` dla wygody konsumentów
// (UI może go importować razem ze store).
export { CorruptedSnapshotUrlError };
