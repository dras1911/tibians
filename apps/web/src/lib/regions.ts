/**
 * Regiony światów Tibii — wspólne stałe UI.
 *
 * Flagi emoji przy kodach regionów (karty aukcji, tabela, hero, lista światów).
 * Pełne nazwy regionów żyją w i18n (`Bazaar.filters.regions.*`,
 * `Reference.worlds.regions.*`) — tu trzymamy tylko wizualizację.
 */

export type WorldRegion = "EU" | "NA" | "BR" | "OCE";

/** Flaga emoji per region (NA → 🇺🇸, bo serwery stoją w USA). */
export const REGION_FLAG: Record<WorldRegion, string> = {
  EU: "🇪🇺",
  NA: "🇺🇸",
  BR: "🇧🇷",
  OCE: "🇦🇺",
};

/** Fallback dla nieznanej wartości z DB (np. NULL). */
export const REGION_FLAG_FALLBACK = "🌍";
