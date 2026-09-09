/**
 * GET /api/auctions/[id] — detale pojedynczej aukcji.
 *
 * Arch. §8.2 (cache) + plan task 38.
 *
 * Path param: `id` (bigint, np. "2173376")
 * Walidacja: z.coerce.bigint().positive() — ID > Number.MAX_SAFE_INTEGER
 * może występować (arch §7.2 `auction_id bigint`).
 *
 * Odpowiedź: { auction: AuctionRow | null }
 *
 * Cache (arch §8.2):
 *   - ISR tag: 'auction-{id}' — granularna inwalidacja dla pojedynczej
 *     aukcji (karta detalu w bazaar).
 *   - revalidate: 300 (5 min fallback)
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { getAuctionById } from "@/lib/server/auctions";
import { jsonResponse } from "@/lib/server/json";
import {
  checkRateLimit,
  getClientIp,
  rateLimitHeaders,
} from "@/lib/server/rate-limit";

export const revalidate = 300;
export const dynamic = "force-dynamic";

/** Schema dla path param `id` — bigint > 0. */
const auctionIdParamSchema = z.object({
  id: z.coerce.bigint().refine((n) => n > 0n, {
    message: "ID aukcji musi być dodatnie",
  }),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  // 1. Rate limit
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return jsonResponse(
      {
        error: "TooManyRequests",
        message:
          "Przekroczono limit 60 żądań na minutę. Spróbuj ponownie za chwilę.",
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

  // 2. Walidacja path param
  const { id: rawId } = await context.params;
  const parseResult = auctionIdParamSchema.safeParse({ id: rawId });
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0];
    return jsonResponse(
      {
        error: "BadRequest",
        message: issue?.message ?? "Nieprawidłowe ID aukcji",
        path: issue?.path.join("."),
      },
      { status: 400, headers: rateLimitHeaders(rl) },
    );
  }
  const auctionId = parseResult.data.id;

  // 3. Query DB
  let auction;
  try {
    auction = await getAuctionById(auctionId);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[api/auctions/[id]] DB query failed:", error);
    return jsonResponse(
      {
        error: "InternalServerError",
        message: "Wystąpił błąd serwera podczas pobierania aukcji.",
      },
      { status: 500, headers: rateLimitHeaders(rl) },
    );
  }

  // 4. Odpowiedź — null zamiast 404 (zgodnie z konwencją API planu)
  return jsonResponse(
    { auction },
    {
      status: 200,
      headers: {
        "Cache-Control": `public, s-maxage=60, stale-while-revalidate=300`,
        "Cache-Tag": `auction-${auctionId.toString()}`,
        ...rateLimitHeaders(rl),
      },
    },
  );
}
