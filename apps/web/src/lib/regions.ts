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

/**
 * Kod pliku flagi SVG (`public/flags/<code>.svg`, flag-icons MIT).
 *
 * UWAGA: emoji flag (wyżej) NIE renderują się jako flagi na Windows ani
 * w headless Chromium — pokazują się jako litery („BR", „EU"). Do UI używaj
 * komponentu `<RegionFlag>` (obrazek SVG); emoji zostają tylko jako zapas.
 */
export const REGION_FLAG_CODE: Record<WorldRegion, string> = {
  EU: "eu",
  NA: "us",
  BR: "br",
  OCE: "au",
};

/** Fallback dla nieznanej wartości z DB (np. NULL). */
export const REGION_FLAG_FALLBACK = "🌍";
