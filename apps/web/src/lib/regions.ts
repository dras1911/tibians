/**
 * Regiony światów Tibii — wspólne stałe UI.
 *
 * Flagi emoji przy kodach regionów (karty aukcji, tabela, hero, lista światów).
 * Pełne nazwy regionów żyją w i18n (`Bazaar.filters.regions.*`,
 * `Reference.worlds.regions.*`) — tu trzymamy tylko wizualizację.
 */

export type WorldRegion = "EU" | "NA" | "BR" | "OCE";

/**
 * Kod pliku flagi SVG (`public/flags/<code>.svg`, flag-icons MIT).
 *
 * UWAGA: emoji flag (🇧🇷 itd.) NIE renderują się jako flagi na Windows ani
 * w headless Chromium — systemowe fonty pokazują litery („BR", „EU").
 * Dlatego w UI używamy WYŁĄCZNIE obrazków SVG przez komponent `<RegionFlag>`.
 */
export const REGION_FLAG_CODE: Record<WorldRegion, string> = {
  EU: "eu",
  NA: "us",
  BR: "br",
  OCE: "au",
};
