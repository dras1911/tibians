/**
 * GET /api/stats — statystyki rynkowe Bazaar.
 *
 * Arch. §8.2 (cache) + plan task 38.
 *
 * Dane:
 *   - totalActive   — liczba aktywnych aukcji
 *   - totalFinished — liczba zakończonych
 *   - avgLevel      — średni level aktywnych (null jeśli brak danych)
 *   - topVocations  — top 5 vocation_base z mv_facet_counts
 *   - topWorlds     — top 5 światów (active auctions)
 *
 * Cache: 60s (arch §8.2 warstwa 2) — wystarczająco świeże dla dashboardu,
 * wystarczająco agresywne żeby nie bić DB co sekundę.
 *
 * Wykorzystuje mv_facet_counts (REFRESH MATERIALIZED VIEW po scrape).
 */
import type { NextRequest } from "next/server";

import { getMarketStats } from "@/lib/server/auctions";
import { jsonResponse } from "@/lib/server/json";
import {
  checkRateLimit,
  getClientIp,
  rateLimitHeaders,
} from "@/lib/server/rate-limit";

export const revalidate = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  // 1. Rate limit
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return jsonResponse(
      {
        error: "TooManyRequests",
        message: "Przekroczono limit 60 żądań na minutę.",
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

  // 2. Query DB (3 parallel queries: status aggregates + vocations + worlds)
  let stats;
  try {
    stats = await getMarketStats();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[api/stats] DB query failed:", error);
    return jsonResponse(
      {
        error: "InternalServerError",
        message: "Wystąpił błąd serwera podczas pobierania statystyk.",
      },
      { status: 500, headers: rateLimitHeaders(rl) },
    );
  }

  return jsonResponse(stats, {
    status: 200,
    headers: {
      "Cache-Control": `public, s-maxage=60, stale-while-revalidate=300`,
      "Cache-Tag": "stats",
      ...rateLimitHeaders(rl),
    },
  });
}
