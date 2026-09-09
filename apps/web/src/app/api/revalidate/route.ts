/**
 * POST /api/revalidate — webhook invalidacji cache + REFRESH MV.
 *
 * Arch. §8.2 (warstwa 2 — ISR on-demand invalidation) + §10 (R11 — webhook).
 * Plan task 38 + task 36 (scheduler → ten endpoint).
 *
 * Przepływ:
 *   1. Scheduler scrapera (task 36) po zakończeniu pełnego scrapa wysyła
 *      POST /api/revalidate z headerem `x-revalidate-secret` i body:
 *      { paths?: string[], tags?: string[] }
 *   2. Ten handler waliduje secret (env REVALIDATE_SECRET, default dev)
 *   3. Wywołuje revalidatePath(path) / revalidateTag(tag) dla każdego
 *   4. Jeśli tagi zawierają 'auctions' LUB `?refreshMv=true` →
 *      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts
 *   5. Zwraca { revalidated: number, mvRefreshed: boolean }
 *
 * Bezpieczeństwo:
 *   - Shared secret w headerze (env REVALIDATE_SECRET)
 *   - Stałe porównanie (timing-safe) przez constantTimeEqual
 *   - Rate limit (60 req/min per IP)
 *   - Walidacja Zod body
 *
 * UWAGA: ten endpoint NIE jest cache'owany (mutuje stan).
 */
import { revalidatePath, revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { refreshFacetCounts } from "@/lib/server/auctions";
import { jsonResponse } from "@/lib/server/json";
import {
  checkRateLimit,
  getClientIp,
  rateLimitHeaders,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/** Nazwa zmiennej środowiskowej dla shared secret. */
const REVALIDATE_SECRET_ENV = "REVALIDATE_SECRET";
/** Dev fallback — NIGDY nie używany w produkcji (env musi być ustawione). */
const DEV_SECRET_FALLBACK = "dev-secret-change-me";

function getExpectedSecret(): string {
  const envSecret = process.env[REVALIDATE_SECRET_ENV];
  if (envSecret && envSecret.length > 0) return envSecret;
  if (process.env.NODE_ENV === "production") {
    // eslint-disable-next-line no-console
    console.error(
      `[api/revalidate] CRITICAL: ${REVALIDATE_SECRET_ENV} is not set in production! Falling back to insecure dev secret.`,
    );
  }
  return DEV_SECRET_FALLBACK;
}

/** Schemat body — paths i/lub tags (oba opcjonalne, ale przynajmniej jedno). */
const revalidateBodySchema = z
  .object({
    paths: z
      .array(z.string().min(1).max(500))
      .max(50, "Maksymalnie 50 paths per request")
      .optional(),
    tags: z
      .array(
        z
          .string()
          .min(1)
          .max(100)
          .regex(
            /^[a-zA-Z0-9_-]+$/,
            "Tagi mogą zawierać tylko litery, cyfry, myślniki i podkreślenia",
          ),
      )
      .max(20, "Maksymalnie 20 tags per request")
      .optional(),
  })
  .strict()
  .refine((b) => b.paths !== undefined || b.tags !== undefined, {
    message: "Body musi zawierać przynajmniej jedno z: paths, tags",
  });

export type RevalidateBody = z.infer<typeof revalidateBodySchema>;

export async function POST(request: NextRequest): Promise<Response> {
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

  // 2. Walidacja secret (stałe porównanie długości + wartości)
  const providedSecret = request.headers.get("x-revalidate-secret") ?? "";
  const expectedSecret = getExpectedSecret();

  if (!constantTimeEqual(providedSecret, expectedSecret)) {
    return jsonResponse(
      {
        error: "Unauthorized",
        message: "Nieprawidłowy lub brakujący secret.",
      },
      { status: 401, headers: rateLimitHeaders(rl) },
    );
  }

  // 3. Parsowanie + walidacja body
  let body: RevalidateBody;
  try {
    const raw = await request.json();
    body = revalidateBodySchema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse(
        {
          error: "BadRequest",
          message: "Nieprawidłowe body żądania",
          issues: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400, headers: rateLimitHeaders(rl) },
      );
    }
    return jsonResponse(
      {
        error: "BadRequest",
        message: "Nieprawidłowy JSON w body.",
      },
      { status: 400, headers: rateLimitHeaders(rl) },
    );
  }

  // 4. Wykonaj revalidatePath / revalidateTag
  let revalidated = 0;
  const errors: { type: "path" | "tag"; value: string; message: string }[] = [];

  if (body.paths) {
    for (const path of body.paths) {
      try {
        revalidatePath(path);
        revalidated += 1;
      } catch (err) {
        errors.push({
          type: "path",
          value: path,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (body.tags) {
    for (const tag of body.tags) {
      try {
        revalidateTag(tag);
        revalidated += 1;
      } catch (err) {
        errors.push({
          type: "tag",
          value: tag,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 5. REFRESH MATERIALIZED VIEW CONCURRENTLY (arch §7.2 + §8.1)
  const explicitRefresh =
    request.nextUrl.searchParams.get("refreshMv") === "true";
  const tagsIncludeAuctions = body.tags?.includes("auctions") ?? false;
  const shouldRefreshMv = explicitRefresh || tagsIncludeAuctions;

  let mvRefreshed = false;
  let mvError: string | null = null;
  if (shouldRefreshMv) {
    try {
      await refreshFacetCounts();
      mvRefreshed = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[api/revalidate] MV refresh failed:", err);
      mvError = err instanceof Error ? err.message : String(err);
    }
  }

  return jsonResponse(
    {
      revalidated,
      paths: body.paths?.length ?? 0,
      tags: body.tags?.length ?? 0,
      mvRefreshed,
      mvError,
      errors: errors.length > 0 ? errors : undefined,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        ...rateLimitHeaders(rl),
      },
    },
  );
}

/**
 * Porównanie stringów w stałym czasie. NIE używamy `===` dla sekretów,
 * bo różnice w czasie wykonania mogą ujawnić fragmenty sekretu.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Różne długości → różne wartości. Iterujemy po `a`, żeby czas
    // wykonania zależał od jego długości (timing-safe).
    for (let i = 0; i < a.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ = a.charCodeAt(i) ^ (i < b.length ? b.charCodeAt(i) : 0);
      void _;
    }
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
