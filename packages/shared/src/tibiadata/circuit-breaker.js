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
import { updateBreaker } from "./metrics.js";
export const DEFAULT_FAILURE_THRESHOLD = 3;
export const DEFAULT_COOLDOWN_MS = 60_000;
export class CircuitBreakerOpenError extends Error {
    retryAfterMs;
    constructor(retryAfterMs) {
        super(`Circuit breaker open — retry after ${retryAfterMs}ms`);
        this.name = "CircuitBreakerOpenError";
        this.retryAfterMs = retryAfterMs;
    }
}
export class CircuitBreaker {
    state = "closed";
    consecutiveFailures = 0;
    totalTrips = 0;
    openedAt = null;
    failureThreshold;
    cooldownMs;
    now;
    /** When true, the next acquire() permits a single trial call. */
    halfOpenTrialInFlight = false;
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
        this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
        this.now = options.now ?? Date.now;
    }
    /** Snapshot — safe to read concurrently. */
    snapshot() {
        return {
            state: this.state,
            consecutiveFailures: this.consecutiveFailures,
            totalTrips: this.totalTrips,
            openedAt: this.openedAt,
        };
    }
    /**
     * Acquire permission to issue one upstream call.
     *
     * - `closed` → always allowed
     * - `open` + cooldown not elapsed → throws `CircuitBreakerOpenError`
     * - `open` + cooldown elapsed → transitions to `half-open`, single trial
     * - `half-open` + trial in flight → throws (no other calls may proceed)
     */
    acquire() {
        if (this.state === "closed")
            return;
        if (this.state === "open") {
            const elapsed = this.now() - (this.openedAt ?? 0);
            if (elapsed < this.cooldownMs) {
                throw new CircuitBreakerOpenError(this.cooldownMs - elapsed);
            }
            // Cooldown elapsed → attempt half-open trial.
            this.transition("half-open");
            this.halfOpenTrialInFlight = true;
            return;
        }
        // half-open: only the first caller gets through.
        if (this.halfOpenTrialInFlight) {
            throw new CircuitBreakerOpenError(0);
        }
        this.halfOpenTrialInFlight = true;
    }
    /** Mark the call as successful — closes the breaker (or resets counter). */
    recordSuccess() {
        this.consecutiveFailures = 0;
        this.halfOpenTrialInFlight = false;
        if (this.state !== "closed") {
            this.transition("closed");
            this.openedAt = null;
        }
    }
    /** Mark the call as failed — may trip or re-trip the breaker. */
    recordFailure() {
        this.halfOpenTrialInFlight = false;
        this.consecutiveFailures += 1;
        if (this.state === "half-open") {
            // Trial failed — reopen, push cooldown forward.
            this.totalTrips += 1;
            this.openedAt = this.now();
            this.transition("open");
            return;
        }
        if (this.state === "closed" && this.consecutiveFailures >= this.failureThreshold) {
            this.totalTrips += 1;
            this.openedAt = this.now();
            this.transition("open");
        }
    }
    /** Test-only — restore initial closed state. */
    reset() {
        this.state = "closed";
        this.consecutiveFailures = 0;
        this.totalTrips = 0;
        this.openedAt = null;
        this.halfOpenTrialInFlight = false;
        updateBreaker({
            state: "closed",
            consecutiveFailures: 0,
            totalTrips: 0,
            openedAt: null,
        });
    }
    transition(next) {
        this.state = next;
        updateBreaker({
            state: next,
            consecutiveFailures: this.consecutiveFailures,
            totalTrips: this.totalTrips,
            openedAt: this.openedAt,
        });
    }
}
/**
 * Process-global breaker for the TibiaData client.
 *
 * Exported so callers can inspect state, but most users should never touch
 * it directly — go through the client which calls acquire/recordX.
 */
export const globalBreaker = new CircuitBreaker();
//# sourceMappingURL=circuit-breaker.js.map