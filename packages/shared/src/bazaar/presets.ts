/**
 * @tibians/shared — hardcoded presety filtrów Bazaar (plan T44, arch §6.4 pkt 5).
 *
 * "Największy skrót czasu dla powracających użytkowników" — zapisane
 * kwerendy jak "Knight 300-600 EU <15k" czy "Monk z Soul War". Klik
 * w pełny stan filtrów, bez ręcznego ustawiania każdego pola.
 *
 * Dwa źródła presetów (T44):
 *   1. **Wbudowane** (`BAZAAR_PRESETS`) — hardcoded w kodzie, widoczne
 *      dla wszystkich użytkowników, nieedytowalne. Aktualizowane przy
 *      każdym deployu.
 *   2. **Własne** — w localStorage przeglądarki (max 3 dla darmowych,
 *      unlimited dla auth — Faza 13). Hook `useFilterPresets()` w `apps/web`.
 *
 * Pola `filters` są strict-supersetem `AuctionFilters` z `auction/filters.ts`
 * (Zod schema) — dopuszczamy też pola nieobecne w schemie (np. computed
 * flagi jak `overpriced`), które zostaną rozpoznane przez UI.
 *
 * Decyzja: typ `BazaarPresetFilters` jest celowo **luźniejszy** niż
 * `AuctionFilters` (Partial + extra). Pozwala to dodawać presety oparte
 * na filtrach client-side (gemy, store counts, must-have item) bez
 * oczekiwania na wsparcie API.
 */

import type { AuctionFilters } from "../auction/filters.js";

// ───────────────────────────────────────────────────────────────────────
// Rozszerzony typ filtrów presetu
// ───────────────────────────────────────────────────────────────────────

/**
 * Preset może używać:
 *   - pól z `AuctionFilters` (wysyłane do API jako URL params)
 *   - pól client-side z `BazaarFilters` UI (gemsMin*, storeMin*, itp.)
 *   - specjalnych flag jak `overpriced: true` (computed server-side w W9+)
 *
 * Wszystkie pola opcjonalne — preset może zawierać tylko wycinek stanu.
 */
export interface BazaarPresetFilters extends Partial<
  Omit<AuctionFilters, "sortBy" | "sortDir" | "status">
> {
  /** BattlEye (z `worlds` — nie ma go w `AuctionFilters`). */
  battleye?: "protected" | "initially protected" | "not protected" | undefined;

  /** Skill minimum (rozszerzenie AuctionFilters: skillType + skillMin). */
  skillType?: AuctionFilters["skillType"];
  skillMin?: number | undefined;

  /** Must-have toggles (T42 advanced). */
  hasWorldTransfer?: boolean | undefined;
  hasPreySlot?: boolean | undefined;
  hasCharmExpansion?: boolean | undefined;
  hasWeeklyTaskExp?: boolean | undefined;
  hasTwistOfFate?: boolean | undefined;
  /** Wymaga 23/23 imbuementy. */
  imbuesFull?: boolean | undefined;

  /** Rare item id (T42 autocomplete). */
  mustHaveItemId?: number | undefined;
  mustHaveItemName?: string | undefined;

  /** Gemy — minimum. */
  gemsMinLesser?: number | undefined;
  gemsMinRegular?: number | undefined;
  gemsMinGreater?: number | undefined;

  /** Store counts — minimum. */
  storeMinOutfits?: number | undefined;
  storeMinMounts?: number | undefined;
  storeMinItems?: number | undefined;

  /** Computed flag (server-side, przyszłe W9+). */
  overpriced?: boolean | undefined;
}

// ───────────────────────────────────────────────────────────────────────
// Preset — kanoniczny kształt
// ───────────────────────────────────────────────────────────────────────

export interface BazaarPreset {
  /** Stabilny identyfikator — dla wbudowanych: `b-...`; dla custom: `c-...`. */
  id: string;
  /** Nazwa wyświetlana w dropdownie (i18n done in UI). */
  name: string;
  /** Krótki opis (tooltip / preview). */
  description?: string | undefined;
  /** Filtry do zaaplikowania. */
  filters: BazaarPresetFilters;
  /** `true` = hardcoded (nie można usunąć); `false` = localStorage. */
  builtIn?: boolean | undefined;
}

// ───────────────────────────────────────────────────────────────────────
// Wbudowane presety (hardcoded, widoczne dla wszystkich)
// ───────────────────────────────────────────────────────────────────────

/**
 * Hardcoded presety — odpowiadają typowym wzorcom wyszukiwania.
 * Każdy preset to "złoty strzał" dla jednego segmentu rynku Bazaara.
 *
 * Dodawanie nowego: dopisz tu, nie zapomnij uzupełnić i18n klucza
 * `Bazaar.filters.presets.hardcoded.<id>` w `apps/web/messages/*.json`.
 */
export const BAZAAR_PRESETS: ReadonlyArray<BazaarPreset> = [
  {
    id: "knight-300-600-eu",
    name: "Knight 300-600 EU <15k",
    description: "Knight z poziomem 300–600 na europejskich serwerach do 15k TC",
    filters: {
      vocation: "Knight",
      levelMin: 300,
      levelMax: 600,
      region: "EU",
      bidMax: 15000,
    },
    builtIn: true,
  },
  {
    id: "monk-soul-war",
    name: "Monk z Soul War",
    description: "Monk z ukończonym questem Soul War (💀)",
    filters: {
      vocation: "Monk",
      hasSoulWar: true,
    },
    builtIn: true,
  },
  {
    id: "paladin-distance",
    name: "Paladin Distance ≥ 110",
    description: "Paladin z Distance 110+ (skill minimum)",
    filters: {
      vocation: "Paladin",
      skillType: "distance",
      skillMin: 110,
    },
    builtIn: true,
  },
  {
    id: "cheap-knight",
    name: "Tanie Knight <5k",
    description: "Budżetowe Knight do 5000 TC",
    filters: {
      vocation: "Knight",
      bidMax: 5000,
    },
    builtIn: true,
  },
  {
    id: "overpriced-rare",
    name: "Przepłacone (cena/wartość > 1.2)",
    description:
      "Postacie, gdzie stosunek oferty do estymowanej wartości > 1.2 (computed server-side)",
    filters: {
      overpriced: true,
    },
    builtIn: true,
  },
  {
    id: "high-level-eu",
    name: "Endgame EU (600+)",
    description: "Postacie 600+ na europejskich serwerach",
    filters: {
      levelMin: 600,
      region: "EU",
    },
    builtIn: true,
  },
] as const;
