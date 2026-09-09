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
export declare const DEFAULT_MAX_RETRIES = 3;
export declare const DEFAULT_BASE_DELAY_MS = 100;
/** ± this fraction of the computed delay (0.2 = ±20%). */
export declare const DEFAULT_JITTER_FRACTION = 0.2;
/** Custom error class so we can tell "should-retry" apart in tests. */
export declare class TibiaDataHttpError extends Error {
    readonly status: number;
    readonly statusText: string;
    readonly url: string;
    constructor(status: number, statusText: string, url: string);
}
export declare function isTransientError(err: unknown): boolean;
/** Compute the n-th backoff delay (0-indexed), with ±jitter applied. */
export declare function computeBackoff(attempt: number, options?: {
    baseDelayMs?: number | undefined;
    jitterFraction?: number | undefined;
    random?: (() => number) | undefined;
}): number;
/**
 * Sleep helper — exposed so tests can stub `setTimeout` or advance vitest
 * fake timers without reaching into the retry body.
 */
export declare function sleep(ms: number): Promise<void>;
export interface RetryOptions {
    maxRetries?: number | undefined;
    baseDelayMs?: number | undefined;
    jitterFraction?: number | undefined;
    random?: (() => number) | undefined;
    sleepFn?: ((ms: number) => Promise<void>) | undefined;
    /** Hook called before each retry — useful for test assertions. */
    onRetry?: ((attempt: number, delayMs: number, error: unknown) => void) | undefined;
}
/**
 * Wrap an async operation in exponential-backoff retries.
 *
 * The first call is `attempt = 0`; retries are attempts 1..maxRetries.
 * Returns the first successful result; throws the last error if all retries
 * fail (or rethrows the error if it's not transient).
 */
export declare function withRetry<T>(operation: (attempt: number) => Promise<T>, options?: RetryOptions): Promise<T>;
//# sourceMappingURL=retry.d.ts.map