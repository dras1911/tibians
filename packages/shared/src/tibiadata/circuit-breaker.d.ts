/**
 * Circuit breaker for the TibiaData client.
 *
 * Behaviour (matches task 8 spec):
 *   - 3 consecutive failures → state = "open", record `openedAt`
 *   - While open, calls are rejected immediately with `CircuitBreakerOpenError`
 *   - After `cooldownMs` (default 60_000) the state becomes "half-open"
 *   - In half-open, exactly one trial call is allowed
 *       • success → close, reset failure counter
 *       • failure → reopen, push `openedAt` forward by another cooldown
 *
 * The breaker is intentionally **process-global**: the whole client (and any
 * other consumer we add later) shares the same TibiaData health view.
 *
 * The state is mirrored into `metrics.ts` so `getMetrics()` exposes it.
 */
import { type BreakerState } from "./metrics.js";
export declare const DEFAULT_FAILURE_THRESHOLD = 3;
export declare const DEFAULT_COOLDOWN_MS = 60000;
export declare class CircuitBreakerOpenError extends Error {
    readonly retryAfterMs: number;
    constructor(retryAfterMs: number);
}
export interface CircuitBreakerOptions {
    failureThreshold?: number;
    cooldownMs?: number;
    /** Injectable clock — defaults to `Date.now`. Tests use this. */
    now?: () => number;
}
export declare class CircuitBreaker {
    private state;
    private consecutiveFailures;
    private totalTrips;
    private openedAt;
    private readonly failureThreshold;
    private readonly cooldownMs;
    private readonly now;
    /** When true, the next acquire() permits a single trial call. */
    private halfOpenTrialInFlight;
    constructor(options?: CircuitBreakerOptions);
    /** Snapshot — safe to read concurrently. */
    snapshot(): {
        state: BreakerState;
        consecutiveFailures: number;
        totalTrips: number;
        openedAt: number | null;
    };
    /**
     * Acquire permission to issue one upstream call.
     *
     * - `closed` → always allowed
     * - `open` + cooldown not elapsed → throws `CircuitBreakerOpenError`
     * - `open` + cooldown elapsed → transitions to `half-open`, single trial
     * - `half-open` + trial in flight → throws (no other calls may proceed)
     */
    acquire(): void;
    /** Mark the call as successful — closes the breaker (or resets counter). */
    recordSuccess(): void;
    /** Mark the call as failed — may trip or re-trip the breaker. */
    recordFailure(): void;
    /** Test-only — restore initial closed state. */
    reset(): void;
    private transition;
}
/**
 * Process-global breaker for the TibiaData client.
 *
 * Exported so callers can inspect state, but most users should never touch
 * it directly — go through the client which calls acquire/recordX.
 */
export declare const globalBreaker: CircuitBreaker;
//# sourceMappingURL=circuit-breaker.d.ts.map