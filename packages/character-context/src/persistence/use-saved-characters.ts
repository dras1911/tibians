/**
 * @tibians/character-context — `useSavedCharacters()` hook (task 12).
 *
 * Type-safe React hook nad warstwą localStorage "Moje postacie".
 *
 * **Multi-tab sync:** subskrybuje `window` 'storage' event — gdy inna
 * karta zapisze/usunie postać, hook re-renderuje się z aktualną listą.
 *
 * **SSR-safe:** hook NIE dotyka `window`/`localStorage` w inicjalizacji.
 * `getSnapshot` zwraca `[]` poza przeglądarką; po hydracji klient
 * przejmuje prawdziwą listę.
 *
 * Użycie:
 *   const { characters, count, limit, canSaveMore, refresh } =
 *     useSavedCharacters({ isAuthenticated: false });
 */
import { useSyncExternalStore } from "use-sync-external-store/shim";
import {
  listSavedCharacters,
  type SavedCharacter,
} from "./local-storage-characters.js";
import { getLimit, canSaveMore as canSaveMoreFn } from "./limits.js";
import { SAVED_CHARACTERS_KEY } from "./local-storage-characters.js";

// ──────────────────────────────────────────────────────────────────────────
// External store — snapshot + subscribe
// ──────────────────────────────────────────────────────────────────────────

/**
 * Snapshot listy. Poza przeglądarką (SSR) zwraca `[]` — nigdy nie rzuca.
 * Zwraca nową referencję tylko gdy lista faktycznie się zmieniła
 * (porównanie przez JSON — tanie dla ≤ kilkunastu wpisów).
 */
function getSnapshot(): SavedCharacter[] {
  return listSavedCharacters();
}

/**
 * Subskrypcja zmian. Nasłuchuje:
 *   - `storage` event (inna karta zapisała/usunęła)
 *   - `tibians:savedChars` custom event (ta sama karta — emitowany przez
 *     `writeSavedCharacters` w local-storage-characters.ts)
 *
 * Zwraca funkcję odsubskrybowania.
 */
function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (e: StorageEvent) => {
    if (e.key === SAVED_CHARACTERS_KEY) onStoreChange();
  };
  const onCustom = () => onStoreChange();

  window.addEventListener("storage", onStorage);
  window.addEventListener("tibians:savedChars", onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("tibians:savedChars", onCustom);
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────

export interface UseSavedCharactersOptions {
  /** Czy użytkownik jest zalogowany (Faza 6+). Domyślnie `false`. */
  isAuthenticated?: boolean;
}

export interface UseSavedCharactersResult {
  /** Posortowana lista (updatedAt DESC). */
  characters: SavedCharacter[];
  /** Liczba zapisanych postaci. */
  count: number;
  /** Limit (3 dla anonymous, Infinity dla zalogowanych). */
  limit: number;
  /** Czy można zapisać kolejną postać. */
  canSaveMore: boolean;
  /** Wymusza ponowne odczytanie listy (np. po zapisie w tej samej karcie). */
  refresh: () => void;
}

/**
 * Type-safe hook nad localStorage "Moje postacie".
 *
 * @example
 *   const { characters, count, limit, canSaveMore } =
 *     useSavedCharacters({ isAuthenticated: false });
 */
export function useSavedCharacters(
  options: UseSavedCharactersOptions = {},
): UseSavedCharactersResult {
  const isAuthenticated = options.isAuthenticated ?? false;
  const characters = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const count = characters.length;
  const limit = getLimit(isAuthenticated);
  const canSaveMore = canSaveMoreFn(isAuthenticated, count);

  return {
    characters,
    count,
    limit,
    canSaveMore,
    refresh: () => {
      // Wymusza re-render przez custom event (ta sama karta).
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("tibians:savedChars"));
      }
    },
  };
}