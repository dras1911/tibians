/**
 * Low-level HTTP client for the TibiaData v4 API.
 *
 * Pipeline for every request:
 *
 *   1. resolve base URL (env override → process-global default)
 *   2. consult the LRU cache — return hit if fresh
 *   3. acquire from the circuit breaker — fail fast if open
 *   4. issue `fetch` with a 10 s AbortController timeout
 *   5. parse JSON, validate with the caller's Zod schema
 *   6. on success: cache + record metrics + reset breaker
 *   7. on failure: classify (transient vs permanent) → retry/backoff → record
 *
 * The client is **side-effect free** with respect to its callers — every
 * behaviour lives behind explicit functions (`getMetrics`, `reset`) so tests
 * can fully scrub state between cases.
 */
import type { z } from "zod";

import { LruCache, ttlFor, globalCache } from "./cache.js";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  globalBreaker,
} from "./circuit-breaker.js";
import {
  recordBreakerRejection,
  recordCacheHit,
  recordCacheMiss,
  recordError,
  recordRequest,
  resetMetrics,
} from "./metrics.js";
import { TibiaDataHttpError, withRetry } from "./retry.js";

export const DEFAULT_BASE_URL = "http://localhost:8080";
export const DEFAULT_TIMEOUT_MS = 10_000;

export interface TibiaDataClientOptions {
  /** Override the base URL — defaults to `TIBIADATA_BASE_URL` env, then `http://localhost:8080`. */
  baseUrl?: string | undefined;
  /** Per-request timeout in ms (default 10 000). */
  timeoutMs?: number | undefined;
  /** Injectable `fetch` — handy for tests; defaults to the global. */
  fetchImpl?: typeof fetch | undefined;
  /** Replace the in-memory cache (default: process-global `LruCache`). */
  cache?: LruCache | undefined;
  /** Replace the circuit breaker (default: process-global `CircuitBreaker`). */
  breaker?: CircuitBreaker | undefined;
  /** AbortSignal hook — lets tests cancel in-flight calls cleanly. */
  signal?: AbortSignal | undefined;
  /** Override retry budget — defaults to 3 attempts (initial + 3 retries). */
  maxRetries?: number | undefined;
  /** Override the base backoff delay (ms). */
  baseDelayMs?: number | undefined;
  /** Override the backoff sleep (tests use this to skip the wait). */
  sleepFn?: ((ms: number) => Promise<void>) | undefined;
}

export interface TibiaDataClient {
  /** Returns validated, cached data from the given v4 path. */
  request<T>(
    endpoint: string,
    path: string,
    schema: z.ZodType<T>,
    options?: { query?: Record<string, string | number> },
  ): Promise<T>;
  /** Clear cache + metrics + breaker — for tests / forced refresh. */
  reset(): void;
}

/** Read the env once but allow per-call overrides (tests + fallback). */
function resolveBaseUrl(override?: string): string {
  if (override && override.length > 0) return override.replace(/\/$/, "");
  const fromEnv = process.env.TIBIADATA_BASE_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, "");
  return DEFAULT_BASE_URL;
}

function buildUrl(base: string, path: string, query?: Record<string, string | number>): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${cleanPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Factory — preferred over a singleton so tests can construct isolated
 * clients. The `index.ts` barrel exports a default singleton built from
 * the env, matching the architecture ("fallback na publiczne API").
 */
export function createTibiaDataClient(options: TibiaDataClientOptions = {}): TibiaDataClient {
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = options.cache ?? globalCache;
  const breaker = options.breaker ?? globalBreaker;
  const maxRetries = options.maxRetries;
  const baseDelayMs = options.baseDelayMs;
  const sleepFn = options.sleepFn;

  async function request<T>(
    endpoint: string,
    path: string,
    schema: z.ZodType<T>,
    requestOptions: { query?: Record<string, string | number> } = {},
  ): Promise<T> {
    const url = buildUrl(baseUrl, path, requestOptions.query);
    const cacheKey = `${endpoint}:${url}`;

    // 1. Cache lookup
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      recordCacheHit(endpoint);
      return cached as T;
    }
    recordCacheMiss(endpoint);

    // 2. Breaker acquire — may throw fast.
    try {
      breaker.acquire();
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError) {
        recordBreakerRejection(endpoint);
        throw err;
      }
      throw err;
    }

    // 3. Network call + retries (only transient failures are retried).
    try {
      const data = await withRetry(async () => {
        // Body intentionally ignores `attempt` — retries are transparent.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        // Forward caller-provided signal if present.
        if (options.signal) {
          if (options.signal.aborted) controller.abort();
          else options.signal.addEventListener("abort", () => controller.abort());
        }

        recordRequest(endpoint);
        try {
          const res = await fetchImpl(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (!res.ok) {
            throw new TibiaDataHttpError(res.status, res.statusText, url);
          }
          const text = await res.text();
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch (err) {
            throw new Error(`TibiaData returned non-JSON response for ${url}: ${(err as Error).message}`);
          }
          const validated = schema.parse(parsed);
          return validated;
        } finally {
          clearTimeout(timeoutId);
        }
      }, {
        maxRetries,
        baseDelayMs,
        sleepFn,
      });
      breaker.recordSuccess();
      cache.set(cacheKey, data, ttlFor(endpoint));
      return data;
    } catch (err) {
      breaker.recordFailure();
      recordError(endpoint);
      throw err;
    }
  }

  return {
    request,
    reset() {
      cache.clear();
      breaker.reset();
      resetMetrics();
    },
  };
}

/** Default singleton — used by the `index.ts` barrel functions. */
export const defaultClient = createTibiaDataClient();