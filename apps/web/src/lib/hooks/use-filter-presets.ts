"use client";

/**
 * useFilterPresets — localStorage management dla presetów Bazaar (plan T44).
 *
 * Arch §6.4 pkt 5: presety filtrów = "Knight 300-600 EU <15k", "Monk z
 * Soul War", itd. Największy skrót czasu dla powracających użytkowników.
 *
 * Dwa źródła:
 *   1. **Wbudowane** (`BAZAAR_PRESETS`) — hardcoded, readonly.
 *   2. **Własne** — w localStorage, max 3 dla darmowych użytkowników
 *      (limit zniesiony w Fazie 13 dla auth).
 *
 * API:
 *   - `presets` — pełna lista (wbudowane + własne, deduplikacja po id).
 *   - `customPresets` — tylko własne (do wyświetlenia w "Moje presety").
 *   - `addPreset({ name, filters })` — dodaje do localStorage (limit 3).
 *   - `deletePreset(id)` — usuwa z localStorage (nie dotyka wbudowanych).
 *   - `applyPreset(id)` — zwraca filtry presetu (do użycia z `useBazaarFilters`).
 *
 * Walidacja:
 *   - Nazwa 1..50 znaków.
 *   - Filtry zgodne z `auctionFiltersSchema` (luźno — tylko kluczowe pola).
 *
 * SSR-safe: hook zwraca pustą listę własnych presetów na serwerze
 * (hydratacja po mount).
 */

import * as React from "react";

import {
  BAZAAR_PRESETS,
  type BazaarPreset,
  type BazaarPresetFilters,
} from "@tibians/shared/bazaar";

// ───────────────────────────────────────────────────────────────────────
// Konfiguracja
// ───────────────────────────────────────────────────────────────────────

/** localStorage key (arch §6.4 — nazewnictwo `tibians:*`). */
const STORAGE_KEY = "tibians:bazaar:presets";

/** Domyślny limit presetów (free tier). Faza 13 → unlimited dla auth. */
export const PRESETS_LIMIT = 3;

/** Wersja schematu — pozwala na future migration przy breaking changes. */
const SCHEMA_VERSION = 1;

interface StoredPreset {
  id: string;
  name: string;
  description?: string;
  filters: BazaarPresetFilters;
  createdAt: string; // ISO timestamp
}

interface StoredState {
  version: number;
  presets: StoredPreset[];
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function safeReadStorage(): StoredState {
  if (!isBrowser()) return { version: SCHEMA_VERSION, presets: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: SCHEMA_VERSION, presets: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      "presets" in parsed &&
      Array.isArray((parsed as StoredState).presets)
    ) {
      return parsed as StoredState;
    }
    // Stare / nieznane dane — czyść i startuj od nowa.
    return { version: SCHEMA_VERSION, presets: [] };
  } catch {
    return { version: SCHEMA_VERSION, presets: [] };
  }
}

function safeWriteStorage(state: StoredState): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage może być zablokowany (prywatny tryb, quota) —
    // nie crashuj UI.
  }
}

// ───────────────────────────────────────────────────────────────────────
// Walidacja
// ───────────────────────────────────────────────────────────────────────

/** Walidacja nazwy presetu (1..50 znaków, trim). */
export function validatePresetName(name: string): {
  ok: boolean;
  error?: string;
} {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Nazwa nie może być pusta" };
  }
  if (trimmed.length > 50) {
    return { ok: false, error: "Nazwa może mieć maks. 50 znaków" };
  }
  return { ok: true };
}

/** Walidacja filtrów — luźna (sprawdzamy tylko typy i zakresy). */
export function validatePresetFilters(filters: BazaarPresetFilters): boolean {
  // Proste sanity check — wartości liczbowe w zakresach.
  if (
    filters.levelMin !== undefined &&
    (filters.levelMin < 0 || filters.levelMin > 2500)
  )
    return false;
  if (
    filters.levelMax !== undefined &&
    (filters.levelMax < 0 || filters.levelMax > 2500)
  )
    return false;
  if (filters.bidMin !== undefined && filters.bidMin < 0) return false;
  if (filters.bidMax !== undefined && filters.bidMax < 0) return false;
  if (filters.skillMin !== undefined && filters.skillMin < 0) return false;
  if (filters.gemsMinLesser !== undefined && filters.gemsMinLesser < 0)
    return false;
  if (filters.gemsMinRegular !== undefined && filters.gemsMinRegular < 0)
    return false;
  if (filters.gemsMinGreater !== undefined && filters.gemsMinGreater < 0)
    return false;
  if (filters.storeMinOutfits !== undefined && filters.storeMinOutfits < 0)
    return false;
  if (filters.storeMinMounts !== undefined && filters.storeMinMounts < 0)
    return false;
  if (filters.storeMinItems !== undefined && filters.storeMinItems < 0)
    return false;
  return true;
}

// ───────────────────────────────────────────────────────────────────────
// Hook
// ───────────────────────────────────────────────────────────────────────

export interface UseFilterPresetsReturn {
  /** Wszystkie presety (wbudowane + własne). */
  presets: ReadonlyArray<BazaarPreset>;
  /** Tylko własne (z localStorage). */
  customPresets: ReadonlyArray<BazaarPreset>;
  /** Aktualna liczba własnych presetów. */
  customCount: number;
  /** Limit (free: 3). */
  limit: number;
  /** Czy osiągnięto limit (dla wyłączenia "Zapisz"). */
  isAtLimit: boolean;

  /** Dodaje nowy preset (zwraca id lub null gdy limit). */
  addPreset: (input: {
    name: string;
    description?: string;
    filters: BazaarPresetFilters;
  }) => string | null;
  /** Usuwa własny preset (wbudowane nie można usunąć). */
  deletePreset: (id: string) => boolean;
  /** Zwraca filtry presetu (lub null jeśli nie istnieje). */
  applyPreset: (id: string) => BazaarPresetFilters | null;
}

/**
 * useFilterPresets — centralny manager presetów Bazaar.
 *
 * Działa synchronicznie z localStorage + ma wewnętrzny "version" tick,
 * aby React.re-renderował konsumentów po add/delete.
 */
export function useFilterPresets(
  options: { limit?: number } = {},
): UseFilterPresetsReturn {
  const limit = options.limit ?? PRESETS_LIMIT;
  const [stored, setStored] = React.useState<StoredState>(() => safeReadStorage());

  // Mount-time hydration z localStorage.
  React.useEffect(() => {
    setStored(safeReadStorage());
  }, []);

  // ── Mutacje ────────────────────────────────────────────────────────
  const addPreset = React.useCallback<UseFilterPresetsReturn["addPreset"]>(
    ({ name, description, filters }) => {
      // Walidacja nazwy.
      const nameCheck = validatePresetName(name);
      if (!nameCheck.ok) return null;
      if (!validatePresetFilters(filters)) return null;

      const current = safeReadStorage();
      // Limit check.
      if (current.presets.length >= limit) return null;

      const newPreset: StoredPreset = {
        id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        description,
        filters,
        createdAt: new Date().toISOString(),
      };

      const next: StoredState = {
        version: SCHEMA_VERSION,
        presets: [newPreset, ...current.presets], // najnowsze na górze
      };
      safeWriteStorage(next);
      setStored(next);
      return newPreset.id;
    },
    [limit],
  );

  const deletePreset = React.useCallback<UseFilterPresetsReturn["deletePreset"]>(
    (id: string) => {
      // NIE pozwól usuwać wbudowanych (id zaczyna się od 'b-').
      if (id.startsWith("b-")) return false;

      const current = safeReadStorage();
      const next: StoredState = {
        version: SCHEMA_VERSION,
        presets: current.presets.filter((p) => p.id !== id),
      };
      if (next.presets.length === current.presets.length) return false;
      safeWriteStorage(next);
      setStored(next);
      return true;
    },
    [],
  );

  const applyPreset = React.useCallback<UseFilterPresetsReturn["applyPreset"]>(
    (id: string) => {
      // Wbudowane.
      const builtIn = BAZAAR_PRESETS.find((p) => p.id === id);
      if (builtIn) return builtIn.filters;
      // Własne.
      const custom = stored.presets.find((p) => p.id === id);
      if (custom) return custom.filters;
      return null;
    },
    [stored.presets],
  );

  // ── Publiczny widok ────────────────────────────────────────────────
  const customPresets: BazaarPreset[] = React.useMemo(
    () =>
      stored.presets.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        filters: p.filters,
        builtIn: false,
      })),
    [stored.presets],
  );

  const presets: BazaarPreset[] = React.useMemo(
    () => [
      ...customPresets,
      // Hardcoded na dole (zachowujemy kolejność z BAZAAR_PRESETS).
      ...BAZAAR_PRESETS,
    ],
    [customPresets],
  );

  return {
    presets,
    customPresets,
    customCount: stored.presets.length,
    limit,
    isAtLimit: stored.presets.length >= limit,
    addPreset,
    deletePreset,
    applyPreset,
  };
}
