/**
 * @tibians/character-context — React hook wrapper dla vanilla store.
 *
 * Cienki wrapper nad `characterStore` (vanilla Zustand) dla komponentów
 * React. Wzorzec z oficjalnego przewodnika Zustand 5:
 *   - Vanilla store nie ma zależności od Reacta (testowalny w czystym TS).
 *   - Hook `useCharacterStore` woła `useStore(vanillaStore, selector)`,
 *     który wewnętrznie używa `useSyncExternalStore` (React 18+).
 *   - SSR-safe: hook NIE odpala żadnego kodu dotykającego `window` w
 *     inicjalizacji. Persistencja z localStorage jest deferowana do
 *     momentu, w którym komponent zamontuje się po stronie klienta.
 *
 * Użycie:
 *   const level = useCharacterStore((s) => s.snapshot.identity.level);
 *   const setLevel = useCharacterStore((s) => s.updateNestedField);
 *   const { quests, imbuements } = useCharacterStore(
 *     useShallow((s) => selectProgressPercentages(s.snapshot))
 *   );
 */
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { CharacterStore } from "./character-store.js";
import { characterStore } from "./character-store.js";

// ──────────────────────────────────────────────────────────────────────────
// Hook — domyślny store (singleton)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Główny hook. Zwraca wycinek stanu wybrany selektorem.
 * Re-renderuje komponent tylko gdy zwrócona wartość zmieni się
 * (shallow equality dla obiektów przez `useShallow`).
 *
 * @example
 *   const level = useCharacterStore((s) => s.snapshot.identity.level);
 *
 * @example
 *   const update = useCharacterStore((s) => s.updateField);
 */
export function useCharacterStore<T>(selector: (state: CharacterStore) => T): T {
  return useStore(characterStore, selector);
}

/**
 * Wersja z `useShallow` dla selektorów zwracających obiekty/tablice.
 * Zapobiega niepotrzebnym re-renders gdy wartość się nie zmieniła
 * strukturalnie.
 *
 * @example
 *   const { quests, imbuements } = useCharacterStore(
 *     useShallow((s) => selectProgressPercentages(s.snapshot))
 *   );
 */
export function useCharacterStoreShallow<T>(
  selector: (state: CharacterStore) => T,
): T {
  return useStore(characterStore, useShallow(selector));
}

// ──────────────────────────────────────────────────────────────────────────
// Hook — store jako instancja (testy / wiele instancji)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Hook dla **niestandardowej instancji** store'a (np. testy, wiele
 * niezależnych workspace'ów). Przydatne w:
 *   - Testach izolowanych (każdy test ma własną instancję).
 *   - Aplikacjach multi-tenant (każdy użytkownik ma własny store).
 *
 * Przykład:
 *   const store = useMemo(() => createCharacterStore(), []);
 *   const level = useCharacterStoreFromInstance(store, s => s.snapshot.identity.level);
 */
export function useCharacterStoreFromInstance<T>(
  store: ReturnType<typeof import("./character-store.js").createCharacterStore>,
  selector: (state: CharacterStore) => T,
): T {
  return useStore(store, selector);
}

// ──────────────────────────────────────────────────────────────────────────
// Re-export — żeby konsumenci mogli używać `useShallow` z tego samego miejsca
// ──────────────────────────────────────────────────────────────────────────

export { useShallow };
