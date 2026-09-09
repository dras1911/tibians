/**
 * GET /api/reference/items?q=...&limit=...&rare=1
 *
 * Plan T42 + arch §7.1 pkt 4 — referencje (items) jako oddzielne źródło
 * prawdy dla autocomplete w sidebarze (Rare item Combobox). Lekki endpoint
 * z krótkim cache (60 s) i rate limit (60 req/min per IP).
 *
 * Query:
 *   - q       string 2..50      — wyszukiwana fraza (LIKE %q%)
 *   - limit   int 1..50         — domyślnie 20
 *   - rare    "1"               — tylko `is_rare = true`
 *
 * Odpowiedź: `{ items: ReferenceItem[] }`
 *
 * Cache: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
 * (krótki TTL — przedmioty rzadko się zmieniają, ale UI potrzebuje świeżych
 * po reseedach T32 scrapera).
 */
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";

import { jsonResponse } from "@/lib/server/json";
import { searchReferenceItems } from "@/lib/server/reference";
import {
  checkRateLimit,
  getClientIp,
  rateLimitHeaders,
} from "@/lib/server/rate-limit";

/** ISR-like — route handler nie trzyma własnego stanu. */
export const revalidate = 60;
export const dynamic = "force-dynamic";

/**
 * Schemat query params (strict — R1: odrzucamy nieznane).
 */
const querySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(2, "Wyszukiwana fraza musi mieć co najmniej 2 znaki")
      .max(50, "Wyszukiwana fraza jest za długa"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20),
    rare: z
      .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false")])
      .transform((v) => v === "1" || v === "true")
      .optional(),
  })
  .strict();

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

  // 2. Walidacja query params
  const { searchParams } = new URL(request.url);
  const raw: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    raw[key] = value;
  });

  let parsed;
  try {
    parsed = querySchema.parse(raw);
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
  let items;
  try {
    items = await searchReferenceItems(parsed.q, {
      limit: parsed.limit,
      rareOnly: parsed.rare === true,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[api/reference/items] DB query failed:", error);
    return jsonResponse(
      {
        error: "InternalServerError",
        message:
          "Wystąpił błąd serwera podczas wyszukiwania przedmiotów.",
      },
      { status: 500, headers: rateLimitHeaders(rl) },
    );
  }

  return jsonResponse(
    { items },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        ...rateLimitHeaders(rl),
      },
    },
  );
}
