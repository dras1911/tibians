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
  public readonly status: number;
  public readonly statusText: string;
  public readonly url: string;
  constructor(status: number, statusText: string, url: string) {
    super(`TibiaData HTTP ${status} ${statusText} (${url})`);
    this.name = "TibiaDataHttpError";
    this.status = status;
    this.statusText = statusText;
    this.url = url;
  }
}

export function isTransientError(err: unknown): boolean {
  if (err instanceof TibiaDataHttpError) {
    return err.status === 429 || (err.status >= 500 && err.status < 600);
  }
  // All non-HTTP errors (network failures, aborts, parse errors) are transient
  // — the server may have been momentarily unreachable.
  return true;
}

/** Compute the n-th backoff delay (0-indexed), with ±jitter applied. */
export function computeBackoff(
  attempt: number,
  options: {
    baseDelayMs?: number | undefined;
    jitterFraction?: number | undefined;
    random?: (() => number) | undefined;
  } = {},
): number {
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
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const sleepFn = options.sleepFn ?? sleep;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      if (!isTransientError(err)) throw err;
      if (attempt >= maxRetries) break;

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