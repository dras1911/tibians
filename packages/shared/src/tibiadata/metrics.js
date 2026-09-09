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
/** Internal mutable counters — never exported directly. */
const counters = {};
const breaker = {
    state: "closed",
    consecutiveFailures: 0,
    totalTrips: 0,
    openedAt: null,
};
function bucket(endpoint) {
    const existing = counters[endpoint];
    if (existing)
        return existing;
    const fresh = {
        requests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0,
        breakerRejections: 0,
    };
    counters[endpoint] = fresh;
    return fresh;
}
export function recordRequest(endpoint) {
    bucket(endpoint).requests += 1;
}
export function recordCacheHit(endpoint) {
    bucket(endpoint).cacheHits += 1;
}
export function recordCacheMiss(endpoint) {
    bucket(endpoint).cacheMisses += 1;
}
export function recordError(endpoint) {
    bucket(endpoint).errors += 1;
}
export function recordBreakerRejection(endpoint) {
    bucket(endpoint).breakerRejections += 1;
}
export function updateBreaker(snapshot) {
    if (snapshot.state !== undefined)
        breaker.state = snapshot.state;
    if (snapshot.consecutiveFailures !== undefined) {
        breaker.consecutiveFailures = snapshot.consecutiveFailures;
    }
    if (snapshot.totalTrips !== undefined)
        breaker.totalTrips = snapshot.totalTrips;
    if (snapshot.openedAt !== undefined)
        breaker.openedAt = snapshot.openedAt;
}
export function getMetrics() {
    // Shallow-clone the endpoint map so callers can't mutate live counters.
    const endpoints = {};
    for (const [name, m] of Object.entries(counters)) {
        endpoints[name] = { ...m };
    }
    return {
        endpoints,
        breaker: { ...breaker },
    };
}
/** Test-only — clears counters between cases. */
export function resetMetrics() {
    for (const key of Object.keys(counters))
        delete counters[key];
    breaker.state = "closed";
    breaker.consecutiveFailures = 0;
    breaker.totalTrips = 0;
    breaker.openedAt = null;
}
//# sourceMappingURL=metrics.js.map