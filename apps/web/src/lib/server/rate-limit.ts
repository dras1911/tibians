/**
 * Basic in-memory rate limiter (task 38 §4 MUST DO — Rate limiting).
 *
 * UWAGA: to **basic protection** per specyfikacja, nie produkcyjny system
 * (Redis/upstash wymagałby osobnego serwisu). Wystarczające dla:
 *   - ochrony /api/revalidate przed przypadkowym flood z monitoringu
 *   - łagodzenia DoS przez naiwne skrypty
 *
 * Granice:
 *   - 60 req/min per IP (zgodnie ze specyfikacją task 38)
 *   - okno ruchome (sliding window) z tablicą timestamps
 *   - czyszczenie wpisów starszych niż okno przy każdym sprawdzeniu
 *
 * Mapowanie IP:
 *   - NextRequest → `request.headers.get('x-forwarded-for')` (priorytet,
 *     bo klient łączy się przez Caddy → Vercel proxy)
 *   - fallback: `request.headers.get('x-real-ip')`
 *   - ostateczność: 'unknown'
 */
import type { NextRequest } from "next/server";

export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuta
export const RATE_LIMIT_MAX_REQUESTS = 60; // 60 req/min per IP

interface RateLimitState {
  /** Timestamps requestów w oknie (posortowane rosnąco). */
  timestamps: number[];
}

/**
 * Wyciąga IP klienta z NextRequest (z uwzględnieniem proxy headers).
 */
export function getClientIp(request: NextRequest): string {
  // x-forwarded-for może mieć listę "client, proxy1, proxy2" — bierzemy pierwszy
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export interface RateLimitResult {
  /** Czy request mieści się w limicie (true = OK do przepuszczenia). */
  allowed: boolean;
  /** Pozostałe zapytania w oknie (po odjęciu bieżącego, jeśli allowed). */
  remaining: number;
  /** Kiedy wygasa najstarszy wpis w oknie (timestamp ms). */
  resetAt: number;
  /** Aktualny limit (dla nagłówka X-RateLimit-Limit). */
  limit: number;
}

/**
 * Sprawdza i atomowo aktualizuje rate limit dla danego IP.
 * Jeśli request jest dozwolony, dodaje timestamp do okna.
 */
export function checkRateLimit(
  ip: string,
  now: number = Date.now(),
  max: number = RATE_LIMIT_MAX_REQUESTS,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): RateLimitResult {
  const cutoff = now - windowMs;
  let state = store.get(ip);
  if (!state) {
    state = { timestamps: [] };
    store.set(ip, state);
  }

  // Wyrzucamy timestamps starsze niż okno (sliding window)
  while (state.timestamps.length > 0 && state.timestamps[0]! < cutoff) {
    state.timestamps.shift();
  }

  const limit = max;
  if (state.timestamps.length >= limit) {
    const oldest = state.timestamps[0]!;
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldest + windowMs,
      limit,
    };
  }

  state.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - state.timestamps.length,
    resetAt: now + windowMs,
    limit,
  };
}

/**
 * Pomocnik do budowania nagłówków `X-RateLimit-*` dla Response.
 */
export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
  };
}

/**
 * Helper czyszczący stan — używany w testach, by zapobiec wyciekowi
 * pomiędzy przypadkami testowymi.
 */
export function _resetRateLimitStoreForTests(): void {
  store.clear();
}

/**
 * Globalna mapa rate limitów — jeden wpis per IP.
 * W dev mode (HMR) jest zachowywana między requestami.
 */
const store: Map<string, RateLimitState> =
  globalThis.__tibiansRateLimit ??
  (globalThis.__tibiansRateLimit = new Map<string, RateLimitState>());
