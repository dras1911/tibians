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
 * OD 2026-09-17 fixture'y detalu to ŻYWE KOPIE 1:1 (pobrane przez
 * FlareSolverr+WARP; patrz `__fixtures__/README.md`). Konwencja nazw:
 * `auction-detail-live-{id}.html`. Dobór pokrywa spektrum:
 *   2259395 — RP 402 (aktywna, „rich": store items, USP, questy)
 *   2252245 — K 15 (zakończona „Winning Bid", minimalna progresja)
 *   2258972 — EK 865 (Primal Ordeal, Charm/Weekly, hash-world Havera)
 *   2255748 — EK 93 (aktywna, stacki potionów, bogate USP)
 *   2258274 — MS 131 (brak sekcji SpecialCharacterFeatures — edge case)
 */
export const KNOWN_AUCTION_IDS = [2259395, 2252245, 2258972, 2255748, 2258274] as const;

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

/** Mapa: ID aukcji → nazwa pliku fixture (żywa kopia 1:1 od 2026-09-17). */
export function detailFixtureFile(auctionId: number | bigint): string {
  return `auction-detail-live-${auctionId}.html`;
}
