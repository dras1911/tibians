import { ttlFor, globalCache } from "./cache.js";
import { CircuitBreakerOpenError, globalBreaker, } from "./circuit-breaker.js";
import { recordBreakerRejection, recordCacheHit, recordCacheMiss, recordError, recordRequest, resetMetrics, } from "./metrics.js";
import { TibiaDataHttpError, withRetry } from "./retry.js";
export const DEFAULT_BASE_URL = "http://localhost:8080";
export const DEFAULT_TIMEOUT_MS = 10_000;
/** Read the env once but allow per-call overrides (tests + fallback). */
function resolveBaseUrl(override) {
    if (override && override.length > 0)
        return override.replace(/\/$/, "");
    const fromEnv = process.env.TIBIADATA_BASE_URL;
    if (fromEnv && fromEnv.length > 0)
        return fromEnv.replace(/\/$/, "");
    return DEFAULT_BASE_URL;
}
function buildUrl(base, path, query) {
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
export function createTibiaDataClient(options = {}) {
    const baseUrl = resolveBaseUrl(options.baseUrl);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchImpl = options.fetchImpl ?? fetch;
    const cache = options.cache ?? globalCache;
    const breaker = options.breaker ?? globalBreaker;
    const maxRetries = options.maxRetries;
    const baseDelayMs = options.baseDelayMs;
    const sleepFn = options.sleepFn;
    async function request(endpoint, path, schema, requestOptions = {}) {
        const url = buildUrl(baseUrl, path, requestOptions.query);
        const cacheKey = `${endpoint}:${url}`;
        // 1. Cache lookup
        const cached = cache.get(cacheKey);
        if (cached !== undefined) {
            recordCacheHit(endpoint);
            return cached;
        }
        recordCacheMiss(endpoint);
        // 2. Breaker acquire — may throw fast.
        try {
            breaker.acquire();
        }
        catch (err) {
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
                    if (options.signal.aborted)
                        controller.abort();
                    else
                        options.signal.addEventListener("abort", () => controller.abort());
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
                    let parsed;
                    try {
                        parsed = JSON.parse(text);
                    }
                    catch (err) {
                        throw new Error(`TibiaData returned non-JSON response for ${url}: ${err.message}`);
                    }
                    const validated = schema.parse(parsed);
                    return validated;
                }
                finally {
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
        }
        catch (err) {
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
//# sourceMappingURL=client.js.map