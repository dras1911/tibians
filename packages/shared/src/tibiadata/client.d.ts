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
import { LruCache } from "./cache.js";
import { CircuitBreaker } from "./circuit-breaker.js";
export declare const DEFAULT_BASE_URL = "http://localhost:8080";
export declare const DEFAULT_TIMEOUT_MS = 10000;
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
    request<T>(endpoint: string, path: string, schema: z.ZodType<T>, options?: {
        query?: Record<string, string | number>;
    }): Promise<T>;
    /** Clear cache + metrics + breaker — for tests / forced refresh. */
    reset(): void;
}
/**
 * Factory — preferred over a singleton so tests can construct isolated
 * clients. The `index.ts` barrel exports a default singleton built from
 * the env, matching the architecture ("fallback na publiczne API").
 */
export declare function createTibiaDataClient(options?: TibiaDataClientOptions): TibiaDataClient;
/** Default singleton — used by the `index.ts` barrel functions. */
export declare const defaultClient: TibiaDataClient;
//# sourceMappingURL=client.d.ts.map