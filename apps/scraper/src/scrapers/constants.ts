/**
 * Stałe fixture'ów HTML parserów Bazaar (T33 — ubezpieczenie R1).
 *
 * Te listy są jedynym źródłem prawdy dla:
 *   - `scripts/fetch-fixture.ts` (CLI `list N` / `detail ID`),
 *   - `scripts/refresh-fixtures.sh` (cron-like odświeżanie),
 *   - testów regresyjnych w `src/__tests__/regression.test.ts`.
 *
 * Mapa nazw plików jest w pełni deterministyczna:
 *   - lista:   `auction-list-page-{N}.html`   (N ∈ KNOWN_LIST_PAGES)
 *   - detal:   `auction-detail-{ID}.html`     (ID ∈ KNOWN_AUCTION_IDS)
 *
 * Reguły aktualizacji:
 *   - Dodając nowy fixture — dodaj stronę/ID do odpowiedniej listy ORAZ
 *     opisz go w `src/scrapers/__fixtures__/README.md`.
 *   - NIE usuwaj wpisów bez archiwizacji pliku (pruning >2 lata — README §4).
 */

/**
 * Numery stron listy aukcji, dla których mamy fixture HTML.
 *
 * Dobór pokrywa spektrum paginacji Tibii (~107 stron po 25 aukcji):
 *   1   — pierwsza strona (sentinel "First Page")
 *   2   — środek-początek, inny zestaw aukcji niż strona 1
 *   25  — wczesna strona (granica okna paginacji)
 *   50  — środek (mid-page, sentinel liczbowy w .CurrentPageLink)
 *   75  — późna strona (mid-end)
 *   101 — przedostatnie okno paginacji
 *   107 — ostatnia strona (częściowa, 14 aukcji, sentinel "Last Page")
 */
export const KNOWN_LIST_PAGES = [1, 2, 25, 50, 75, 101, 107] as const;

/**
 * ID aukcji (z tibia.com `?auctionid=`), dla których mamy fixture HTML detalu.
 *
 * Uwaga: fixture HTML to MIRROR struktury tibia.com (R1 — sieć jest
 * niedostępna w CI). ID odnosi się do realnej aukcji na tibia.com, więc
 * `refresh-fixtures.sh` może w przyszłości podmienić mirror na żywą kopię.
 */
export const KNOWN_AUCTION_IDS = [2173376] as const;

/** Liczba aukcji oczekiwana na pełnej stronie listy (25/25). */
export const AUCTIONS_PER_PAGE = 25;

/**
 * Oczekiwane liczby aukcji per fixture listy — używane przez testy
 * regresyjne i refresh (ostatnia strona jest częściowa).
 */
export const EXPECTED_LIST_COUNTS: Readonly<Record<number, number>> = {
  1: AUCTIONS_PER_PAGE,
  2: AUCTIONS_PER_PAGE,
  25: AUCTIONS_PER_PAGE,
  50: AUCTIONS_PER_PAGE,
  75: AUCTIONS_PER_PAGE,
  101: AUCTIONS_PER_PAGE,
  107: 14,
};

/** Mapa: numer strony listy → nazwa pliku fixture. */
export function listFixtureFile(page: number): string {
  return `auction-list-page-${page}.html`;
}

/** Mapa: ID aukcji → nazwa pliku fixture. */
export function detailFixtureFile(auctionId: number | bigint): string {
  return `auction-detail-${auctionId}.html`;
}
