/**
 * Retry helper with exponential backoff + jitter.
 *
 * Spec (task 8):
 *   - 3 attempts total (initial + 2 retries) — we keep the default low to
 *     stay polite against tibia.com's rate-limit (R2 / R11).
 *   - Delays: 100 ms → 200 ms → 400 ms with ±20% jitter.
 *
 * Only **transient** errors are retried:
 *   - network errors (`TypeError` from `fetch`, `AbortError` on timeout)
 *   - HTTP 5xx and 429 (rate-limited)
 *
 * 4xx other than 429 short-circuit because TibiaData uses them as a normal
 * "no such character / world" signal — retrying won't change that and would
 * just amplify the problem.
 */
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_BASE_DELAY_MS = 100;
/** ± this fraction of the computed delay (0.2 = ±20%). */
export const DEFAULT_JITTER_FRACTION = 0.2;
/** Custom error class so we can tell "should-retry" apart in tests. */
export class TibiaDataHttpError extends Error {
    status;
    statusText;
    url;
    constructor(status, statusText, url) {
        super(`TibiaData HTTP ${status} ${statusText} (${url})`);
        this.name = "TibiaDataHttpError";
        this.status = status;
        this.statusText = statusText;
        this.url = url;
    }
}
export function isTransientError(err) {
    if (err instanceof TibiaDataHttpError) {
        return err.status === 429 || (err.status >= 500 && err.status < 600);
    }
    // All non-HTTP errors (network failures, aborts, parse errors) are transient
    // — the server may have been momentarily unreachable.
    return true;
}
/** Compute the n-th backoff delay (0-indexed), with ±jitter applied. */
export function computeBackoff(attempt, options = {}) {
    const base = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    const jitterFraction = options.jitterFraction ?? DEFAULT_JITTER_FRACTION;
    const random = options.random ?? Math.random;
    const nominal = base * 2 ** attempt;
    const jitter = nominal * jitterFraction;
    const delta = (random() * 2 - 1) * jitter;
    return Math.max(0, Math.round(nominal + delta));
}
/**
 * Sleep helper — exposed so tests can stub `setTimeout` or advance vitest
 * fake timers without reaching into the retry body.
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Wrap an async operation in exponential-backoff retries.
 *
 * The first call is `attempt = 0`; retries are attempts 1..maxRetries.
 * Returns the first successful result; throws the last error if all retries
 * fail (or rethrows the error if it's not transient).
 */
export async function withRetry(operation, options = {}) {
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const sleepFn = options.sleepFn ?? sleep;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            return await operation(attempt);
        }
        catch (err) {
            lastError = err;
            if (!isTransientError(err))
                throw err;
            if (attempt >= maxRetries)
                break;
            const delay = computeBackoff(attempt, {
                baseDelayMs: options.baseDelayMs,
                jitterFraction: options.jitterFraction,
                random: options.random,
            });
            options.onRetry?.(attempt, delay, err);
            await sleepFn(delay);
        }
    }
    throw lastError;
}
//# sourceMappingURL=retry.js.map