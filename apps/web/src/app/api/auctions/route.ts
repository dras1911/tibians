/**
 * GET /api/auctions — lista aukcji Bazaar z filtrami, sortowaniem i paginacją.
 *
 * Arch. §8.2 (cache strategy) + §7.2 (query patterns) + plan task 38.
 *
 * Parametry query (Zod walidacja → AuctionFilters + Pagination):
 *   - world       string          — nazwa świata (np. "Antica")
 *   - vocation    Vocation        — bazowa klasa (Knight|Paladin|...)
 *   - levelMin    int 8..2500
 *   - levelMax    int 8..2500
 *   - skillType   SkillKey        — magic|club|fist|sword|axe|distance|shielding|fishing
 *   - skillMin    int 0..250
 *   - skillMax    int 0..250
 *   - bidMin      int ≥0
 *   - bidMax      int ≥0
 *   - status      AuctionStatus   (default 'active')
 *   - search      string 2..50    — full-text search po nazwie postaci
 *   - hasSoulWar  bool            — filtry heurystyczne
 *   - hasPrimalOrdeal bool
 *   - hasWorldTransfer bool
 *   - pvpType     PvPType
 *   - region      EU|NA|BR
 *   - sortBy      OrderColumn     (default 'auctionEnd')
 *   - sortDir     asc|desc        (default 'asc' — pilność)
 *   - page        int ≥1          (default 1)
 *   - pageSize    int 1..100      (default 25)
 *
 * Odpowiedź: { auctions: AuctionRow[], total, page, pageSize, totalPages }
 *
 * Cache (arch §8.2):
 *   - ISR tag: 'auctions' — globalny cache dla listy (inwalidacja przez
 *     revalidateTag('auctions') z webhooka /api/revalidate)
 *   - revalidate: 300 (5 min fallback — webhook zapewnia natychmiastową
 *     inwalidację po scrape, task 36 scheduler)
 *
 * Bezpieczeństwo (task 38 §4 MUST DO):
 *   - Walidacja Zod na każdy query param
 *   - BigInt (auctionId, goldTotal) → string w JSON (arch §8.2)
 *   - Rate limit (basic, 60 req/min per IP)
 *   - Polskie komunikaty błędów (niezależnie od locale)
 */
import type { NextRequest } from "next/server";
import { ZodError } from "zod";

import {
  auctionFiltersSchema,
  paginationSchema,
} from "@tibians/shared/auction";

import { listAuctions } from "@/lib/server/auctions";
import { jsonResponse } from "@/lib/server/json";
import {
  checkRateLimit,
  getClientIp,
  rateLimitHeaders,
} from "@/lib/server/rate-limit";

export const revalidate = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  // 1. Rate limit
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return jsonResponse(
      {
        error: "TooManyRequests",
        message:
          "Przekroczono limit 60 żądań na minutę. Spróbuj ponownie za chwilę.",
        retryAfterSeconds: Math.max(
          0,
          Math.ceil((rl.resetAt - Date.now()) / 1000),
        ),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(0, Math.ceil((rl.resetAt - Date.now()) / 1000)),
          ),
          ...rateLimitHeaders(rl),
        },
      },
    );
  }

  // 2. Parsowanie + walidacja query params
  const { searchParams } = new URL(request.url);
  const rawParams: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    rawParams[key] = value;
  });

  let filters;
  let pagination;
  try {
    filters = auctionFiltersSchema.parse(rawParams);
    pagination = paginationSchema.parse(rawParams);
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonResponse(
        {
          error: "BadRequest",
          message: "Nieprawidłowe parametry zapytania",
          issues: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400, headers: rateLimitHeaders(rl) },
      );
    }
    throw error;
  }

  // 3. Query DB
  let result;
  try {
    result = await listAuctions(filters, pagination);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[api/auctions] DB query failed:", error);
    return jsonResponse(
      {
        error: "InternalServerError",
        message: "Wystąpił błąd serwera podczas pobierania aukcji.",
      },
      { status: 500, headers: rateLimitHeaders(rl) },
    );
  }

  const totalPages = Math.max(
    1,
    Math.ceil(result.total / pagination.pageSize),
  );

  return jsonResponse(
    {
      auctions: result.rows,
      total: result.total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": `public, s-maxage=60, stale-while-revalidate=300`,
        "Cache-Tag": "auctions",
        ...rateLimitHeaders(rl),
      },
    },
  );
}
