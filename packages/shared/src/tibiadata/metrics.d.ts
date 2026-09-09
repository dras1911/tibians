/**
 * In-memory request counters for the TibiaData client.
 *
 * Goal: observability for risk R11 (shared IP rate-limit budget between the
 * self-hosted TibiaData proxy and our own scraper). Numbers live in-memory
 * (no persistence); the scraper run-loop (task 29) flushes a snapshot into
 * `scrape_runs` for cross-service correlation.
 *
 * Exposed via `getMetrics()` — a single function returning a frozen
 * snapshot to keep the contract simple and snapshot-safe in tests.
 */
export type BreakerState = "closed" | "open" | "half-open";
export interface EndpointMetrics {
    /** Total HTTP requests issued for this endpoint (excludes cache hits). */
    requests: number;
    /** Times the LRU cache returned a value without hitting the network. */
    cacheHits: number;
    /** Times a cache lookup missed and fell through to the network. */
    cacheMisses: number;
    /** Network/HTTP failures (timeout, 5xx, abort, parse error). */
    errors: number;
    /** Times the breaker rejected the call before any network work. */
    breakerRejections: number;
}
export interface CircuitBreakerMetrics {
    state: BreakerState;
    consecutiveFailures: number;
    totalTrips: number;
    openedAt: number | null;
}
export interface TibiaDataMetricsSnapshot {
    endpoints: Record<string, EndpointMetrics>;
    breaker: CircuitBreakerMetrics;
}
export declare function recordRequest(endpoint: string): void;
export declare function recordCacheHit(endpoint: string): void;
export declare function recordCacheMiss(endpoint: string): void;
export declare function recordError(endpoint: string): void;
export declare function recordBreakerRejection(endpoint: string): void;
export declare function updateBreaker(snapshot: Partial<CircuitBreakerMetrics>): void;
export declare function getMetrics(): TibiaDataMetricsSnapshot;
/** Test-only — clears counters between cases. */
export declare function resetMetrics(): void;
//# sourceMappingURL=metrics.d.ts.map