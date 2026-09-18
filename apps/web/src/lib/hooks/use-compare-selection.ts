"use client";

import * as React from "react";

/**
 * Porównanie aukcji — wspólny stan w `localStorage['tibians:compare']`.
 *
 * Dlaczego localStorage, a nie propsy: przyciski porównania są na kartach
 * w RÓŻNYCH miejscach (strona główna, bazaar — karty i tabela), a wynik
 * (strona `/bazaar/compare?a=&b=`) żyje pod zwykłym linkiem. Wspólny storage
 * sprawia, że zaznaczenie działa identycznie wszędzie i przeżywa nawigację.
 *
 * Kontrakt:
 *   - maksymalnie `COMPARE_MAX` (2) aukcje — strona porównania przyjmuje a/b;
 *   - wybór 3. aukcji wypycha najstarszą (FIFO);
 *   - zmiany rozgłaszane eventem `tibians:compare-changed` (między
 *     komponentami) + natywnym `storage` (między kartami przeglądarki).
 */

const STORAGE_KEY = "tibians:compare";
const CHANGE_EVENT = "tibians:compare-changed";

export const COMPARE_MAX = 2;

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export interface CompareSelection {
  /** Aktualnie wybrane ID aukcji (max 2). */
  ids: readonly string[];
  /** Dodaj/usuń aukcję (3. wybór wypycha najstarszy). */
  toggle: (id: string) => void;
  /** Wyczyść cały wybór. */
  clear: () => void;
  /** Czy aukcja jest zaznaczona. */
  isSelected: (id: string) => boolean;
}

export function useCompareSelection(): CompareSelection {
  const [ids, setIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    // Wczytanie po hydracji (SSR renderuje pusty stan — zero mismatchy).
    setIds(readIds());
    const sync = () => setIds(readIds());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = React.useCallback((id: string) => {
    const current = readIds();
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id].slice(-COMPARE_MAX);
    writeIds(next);
  }, []);

  const clear = React.useCallback(() => writeIds([]), []);

  const isSelected = React.useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, toggle, clear, isSelected };
}
