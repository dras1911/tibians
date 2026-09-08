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

/** Internal mutable counters — never exported directly. */
const counters: Record<string, EndpointMetrics> = {};
const breaker: CircuitBreakerMetrics = {
  state: "closed",
  consecutiveFailures: 0,
  totalTrips: 0,
  openedAt: null,
};

function bucket(endpoint: string): EndpointMetrics {
  const existing = counters[endpoint];
  if (existing) return existing;
  const fresh: EndpointMetrics = {
    requests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0,
    breakerRejections: 0,
  };
  counters[endpoint] = fresh;
  return fresh;
}

export function recordRequest(endpoint: string): void {
  bucket(endpoint).requests += 1;
}

export function recordCacheHit(endpoint: string): void {
  bucket(endpoint).cacheHits += 1;
}

export function recordCacheMiss(endpoint: string): void {
  bucket(endpoint).cacheMisses += 1;
}

export function recordError(endpoint: string): void {
  bucket(endpoint).errors += 1;
}

export function recordBreakerRejection(endpoint: string): void {
  bucket(endpoint).breakerRejections += 1;
}

export function updateBreaker(snapshot: Partial<CircuitBreakerMetrics>): void {
  if (snapshot.state !== undefined) breaker.state = snapshot.state;
  if (snapshot.consecutiveFailures !== undefined) {
    breaker.consecutiveFailures = snapshot.consecutiveFailures;
  }
  if (snapshot.totalTrips !== undefined) breaker.totalTrips = snapshot.totalTrips;
  if (snapshot.openedAt !== undefined) breaker.openedAt = snapshot.openedAt;
}

export function getMetrics(): TibiaDataMetricsSnapshot {
  // Shallow-clone the endpoint map so callers can't mutate live counters.
  const endpoints: Record<string, EndpointMetrics> = {};
  for (const [name, m] of Object.entries(counters)) {
    endpoints[name] = { ...m };
  }
  return {
    endpoints,
    breaker: { ...breaker },
  };
}

/** Test-only — clears counters between cases. */
export function resetMetrics(): void {
  for (const key of Object.keys(counters)) delete counters[key];
  breaker.state = "closed";
  breaker.consecutiveFailures = 0;
  breaker.totalTrips = 0;
  breaker.openedAt = null;
}