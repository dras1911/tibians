/**
 * @tibians/character-context — localStorage "Moje postacie" (task 12).
 *
 * Warstwa persystencji snapshotów w `localStorage` pod kluczem
 * `tibians:savedChars`. Schema (arch. §13.4 + task 12):
 *
 *   SavedCharacter = {
 *     id: uuid;
 *     label: string;
 *     snapshot: CharacterSnapshot;
 *     createdAt: string;   // ISO-8601
 *     updatedAt: string;   // ISO-8601
 *   }
 *
 * Reguły (plan task 12 + arch. §13.4):
 *   - **Zod validation na read** — corrupted localStorage → pusty array
 *     + warning log (NIE crash). Chroni przed ręczną edycją / starymi
 *     wersjami schema (R1 future-proof).
 *   - **UUID** dla `id` — `crypto.randomUUID()` (Node 19+ / browser native,
 *     zero dependency).
 *   - **SSR-safe** — wszystkie wywołania `localStorage` za
 *     `typeof window !== 'undefined'` checkiem.
 *   - **Sortowanie** po `updatedAt DESC` (najnowsze na górze).
 *   - **NIE zapisujemy danych osobowych** (Discord ID, IP) — T79 doda
 *     user_id DB per user.
 *
 * Migracja (plan task 12): przy bumpie wersji schema, migruj stare wpisy
 * lub oznacz jako `legacy`. Obecnie schema jest v1 — brak migracji.
 */
import { z } from "zod";
import { CharacterSnapshotSchema, type CharacterSnapshot } from "../schema.js";
import { getLimit } from "./limits.js";

// ──────────────────────────────────────────────────────────────────────────
// Klucz localStorage + wersja schema
// ──────────────────────────────────────────────────────────────────────────

/** Klucz localStorage dla listy zapisanych postaci (arch. §13.4). */
export const SAVED_CHARACTERS_KEY = "tibians:savedChars";

/**
 * Wersja schema. Przy zmianie kształtu `SavedCharacter` bumpujemy ją
 * i dodajemy migrację w `readSavedCharacters` (plan task 12).
 */
export const SAVED_CHARACTERS_VERSION = 1;

// ──────────────────────────────────────────────────────────────────────────
// Schema Zod — SavedCharacter
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pojedynczy zapisany snapshot. `id` to UUID (crypto.randomUUID()).
 * `createdAt`/`updatedAt` to ISO-8601 stringi (bezpieczne w JSON).
 */
export const SavedCharacterSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    snapshot: CharacterSnapshotSchema,
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export type SavedCharacter = z.infer<typeof SavedCharacterSchema>;

/**
 * Schema całej listy — walidowana przy każdym read z localStorage.
 * Chroni przed corrupted / ręcznie edytowanym storage (R1 future-proof).
 */
export const SavedCharactersArraySchema = z.array(SavedCharacterSchema);

// ──────────────────────────────────────────────────────────────────────────
// Input — saveCharacter
// ──────────────────────────────────────────────────────────────────────────

/** Wejście dla `saveCharacter` — bez `createdAt`/`updatedAt`. */
export interface SaveCharacterInput {
  label: string;
  snapshot: CharacterSnapshot;
  /** Opcjonalny `id` — gdy podany i istnieje, aktualizuje zamiast insert. */
  id?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Błąd limitu
// ──────────────────────────────────────────────────────────────────────────

/**
 * Rzucany gdy próba zapisu przekracza limit (3 dla anonymous).
 * Niesie informację o upgradzie (arch. §15.1 — Faza 6 Discord OAuth).
 */
export class CharacterLimitReachedError extends Error {
  readonly limit: number;
  readonly isAuthenticated: boolean;

  constructor(limit: number, isAuthenticated: boolean) {
    super(
      `Limit zapisanych postaci osiągnięty (${limit}). Zaloguj się, aby usunąć ograniczenie.`,
    );
    this.name = "CharacterLimitReachedError";
    this.limit = limit;
    this.isAuthenticated = isAuthenticated;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// SSR-safe localStorage access
// ──────────────────────────────────────────────────────────────────────────

/** Zwraca `localStorage` lub `null` gdy poza przeglądarką (SSR-safe). */
function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // localStorage może być niedostępny (np. tryb prywatny / blokada).
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Read — z Zod validation (graceful fallback)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Czyta listę zapisanych postaci z localStorage.
 *
 * **Zachowanie przy błędzie (plan task 12):**
 *   - brak klucza → `[]`
 *   - invalid JSON → `[]` + `console.warn` (NIE crash)
 *   - JSON poprawny ale nie przechodzi Zod → `[]` + `console.warn`
 *
 * Sortuje po `updatedAt DESC` (najnowsze na górze).
 *
 * @returns posortowana lista `SavedCharacter[]` (nigdy nie rzuca).
 */
export function listSavedCharacters(): SavedCharacter[] {
  const storage = getStorage();
  if (storage === null) return [];

  const raw = storage.getItem(SAVED_CHARACTERS_KEY);
  if (raw === null) return [];

  const parsed = parseSavedCharacters(raw);
  if (parsed === null) return [];

  // Sortowanie po updatedAt DESC (najnowsze na górze).
  return [...parsed].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/**
 * Wewnętrzny parser — waliduje surowy string z localStorage.
 * Zwraca `null` przy jakimkolwiek błędzie (po zalogowaniu warninga).
 */
function parseSavedCharacters(raw: string): SavedCharacter[] | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    console.warn(
      `[character-context] corrupted localStorage '${SAVED_CHARACTERS_KEY}': invalid JSON — resetting to empty list.`,
      err,
    );
    return null;
  }

  const result = SavedCharactersArraySchema.safeParse(json);
  if (!result.success) {
    console.warn(
      `[character-context] corrupted localStorage '${SAVED_CHARACTERS_KEY}': schema validation failed — resetting to empty list.`,
      result.error,
    );
    return null;
  }

  return result.data;
}

// ──────────────────────────────────────────────────────────────────────────
// Get — pojedynczy wpis
// ──────────────────────────────────────────────────────────────────────────

/** Zwraca zapisaną postać po `id` lub `undefined` gdy brak. */
export function getSavedCharacter(id: string): SavedCharacter | undefined {
  return listSavedCharacters().find((c) => c.id === id);
}

// ──────────────────────────────────────────────────────────────────────────
// Save — insert or update
// ──────────────────────────────────────────────────────────────────────────

/**
 * Zapisuje postać. Jeśli `input` zawiera `id` istniejący w storage —
 * aktualizuje (bump `updatedAt`). W przeciwnym razie tworzy nowy wpis
 * z nowym UUID.
 *
 * **Limit (arch. §15.1):** gdy `isAuthenticated === false` i liczba
 * zapisanych ≥ 3, rzuca `CharacterLimitReachedError`. Dla zalogowanych
 * (Faza 6) — bez limitu.
 *
 * @throws {CharacterLimitReachedError} gdy przekroczono limit.
 */
export function saveCharacter(
  input: SaveCharacterInput,
  options: { isAuthenticated?: boolean } = {},
): SavedCharacter {
  const isAuthenticated = options.isAuthenticated ?? false;
  const current = listSavedCharacters();

  // Walidacja snapshotu przy wejściu — odrzucamy corrupted dane.
  const snapshot = CharacterSnapshotSchema.parse(input.snapshot);

  // Insert or update.
  const existing = current.find((c) => c.id === input.id);
  const now = new Date().toISOString();

  let next: SavedCharacter;
  if (existing) {
    // Update — zachowujemy createdAt, bumpujemy updatedAt.
    next = {
      ...existing,
      label: input.label,
      snapshot,
      updatedAt: now,
    };
  } else {
    // Insert — sprawdź limit (tylko dla nowych wpisów).
    const limit = getLimit(isAuthenticated);
    if (current.length >= limit) {
      throw new CharacterLimitReachedError(limit, isAuthenticated);
    }
    next = {
      id: createId(),
      label: input.label,
      snapshot,
      createdAt: now,
      updatedAt: now,
    };
  }

  writeSavedCharacters([...current.filter((c) => c.id !== next.id), next]);
  return next;
}

// ──────────────────────────────────────────────────────────────────────────
// Delete
// ──────────────────────────────────────────────────────────────────────────

/** Usuwa zapisaną postać po `id`. Zwraca `true` gdy usunięto. */
export function deleteSavedCharacter(id: string): boolean {
  const current = listSavedCharacters();
  const next = current.filter((c) => c.id !== id);
  if (next.length === current.length) return false;
  writeSavedCharacters(next);
  return true;
}

// ──────────────────────────────────────────────────────────────────────────
// Count
// ──────────────────────────────────────────────────────────────────────────

/** Liczba zapisanych postaci. */
export function countSavedCharacters(): number {
  return listSavedCharacters().length;
}

// ──────────────────────────────────────────────────────────────────────────
// Write
// ──────────────────────────────────────────────────────────────────────────

/**
 * Zapisuje listę do localStorage (SSR-safe, no-op poza przeglądarką).
 * Emituje custom event `tibians:savedChars` — `useSavedCharacters` hook
 * nasłuchuje go, żeby re-renderować się po zapisie w tej samej karcie
 * (storage event działa tylko między kartami).
 */
function writeSavedCharacters(characters: SavedCharacter[]): void {
  const storage = getStorage();
  if (storage === null) return;
  storage.setItem(SAVED_CHARACTERS_KEY, JSON.stringify(characters));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("tibians:savedChars"));
  }
}

// ──────────────────────────────────────────────────────────────────────────
// UUID
// ──────────────────────────────────────────────────────────────────────────

/**
 * Tworzy UUID v4. Używa `crypto.randomUUID()` (Node 19+ / browser native,
 * zero dependency). Fallback na prosty generator gdy `crypto` niedostępny.
 */
function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback — deterministyczny pseudo-UUID (tylko gdy crypto brak).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}