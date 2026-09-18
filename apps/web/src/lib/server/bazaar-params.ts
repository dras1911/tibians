import {
  auctionFiltersObject,
  auctionFiltersSchema,
  paginationSchema,
  type AuctionFilters,
  type Pagination,
} from "@tibians/shared/auction";

/**
 * Parsowanie searchParams listy bazaru — filtry i paginacja NIEZALEŻNIE.
 *
 * Dlaczego nie `schema.parse(flat)` w jednym try/catch:
 * oba schematy (`auctionFiltersSchema`, `paginationSchema`) są `.strict()`,
 * a parametry przychodzą w JEDNEJ mapie searchParams. Parsowanie całej mapy
 * każdym schematem rzucało na kluczach drugiego (`page` w filtrach,
 * `levelMin` w paginacji) → catch → fallback do PUSTYCH filtrów.
 * Efekt na produkcji: „filtry nie działają, cały czas ta sama lista".
 *
 * Rozdzielamy więc parametry po kluczach schematów (ten sam wzorzec co
 * `/api/auctions`), a nieznane klucze (np. `utm_source`) są ignorowane —
 * URL z kampanii nie może zerować filtrów.
 */

const FILTER_KEYS = new Set(Object.keys(auctionFiltersObject.shape));
const PAGINATION_KEYS = new Set(Object.keys(paginationSchema.shape));

/** Rozdziela flat searchParams na zbiory filtrów i paginacji. */
export function splitBazaarParams(flat: Record<string, string>): {
  filterParams: Record<string, string>;
  paginationParams: Record<string, string>;
} {
  const filterParams: Record<string, string> = {};
  const paginationParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (PAGINATION_KEYS.has(key)) paginationParams[key] = value;
    else if (FILTER_KEYS.has(key)) filterParams[key] = value;
  }
  return { filterParams, paginationParams };
}

export interface BazaarSearchParams {
  filters: AuctionFilters;
  pagination: Pagination;
}

export function parseBazaarSearchParams(flat: Record<string, string>): BazaarSearchParams {
  const { filterParams, paginationParams } = splitBazaarParams(flat);

  let filters: AuctionFilters;
  try {
    filters = auctionFiltersSchema.parse(filterParams);
  } catch {
    // Fallback na domyślne filtry (arch §6.4 pkt 4 — URL zawsze działa).
    filters = auctionFiltersSchema.parse({});
  }

  let pagination: Pagination;
  try {
    pagination = paginationSchema.parse(paginationParams);
  } catch {
    pagination = paginationSchema.parse({});
  }

  return { filters, pagination };
}
