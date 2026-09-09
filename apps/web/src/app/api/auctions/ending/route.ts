/**
 * GET /api/auctions/ending — Ending Soon (aukcje kończące się w <N godzin).
 *
 * Arch. §8.1 (EndingSoonScheduler co 30s) + §8.5 (SSE fallback) + task 38.
 *
 * Ten endpoint dostarcza dane dla klienta SSE (live tracking kończących się
 * aukcji). Bez cache — każde żądanie powinno odpytywać DB, żeby klient
 * dostał najświeższe dane. Scheduler scrapera aktualizuje auction_end w
 * czasie zbliżonym do rzeczywistego (co 30s), więc potrzebujemy świeżego
 * widoku.
 *
 * Query param: withinHours (default 1, max 24)
 *
 * Odpowiedź: { auctions: AuctionRow[], withinHours: number, now: string }
 */
import type { NextRequest } from "next/server";
import { ZodError } from "zod";

import { endingSoonQuerySchema } from "@tibians/shared/auction";

import { listEndingSoon } from "@/lib/server/auctions";
import { jsonResponse } from "@/lib/server/json";
import {
  checkRateLimit,
  getClientIp,
  rateLimitHeaders,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
// Bez revalidate — SSE klienci potrzebują świeżych danych.

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

  // 2. Walidacja query params
  const { searchParams } = new URL(request.url);
  const rawParams: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    rawParams[key] = value;
  });

  let query;
  try {
    query = endingSoonQuerySchema.parse(rawParams);
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
  let rows;
  try {
    rows = await listEndingSoon(query.withinHours);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[api/auctions/ending] DB query failed:", error);
    return jsonResponse(
      {
        error: "InternalServerError",
        message:
          "Wystąpił błąd serwera podczas pobierania kończących się aukcji.",
      },
      { status: 500, headers: rateLimitHeaders(rl) },
    );
  }

  return jsonResponse(
    {
      auctions: rows,
      withinHours: query.withinHours,
      now: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        ...rateLimitHeaders(rl),
      },
    },
  );
}
