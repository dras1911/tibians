/**
 * In-memory LRU cache keyed by endpoint name + URL path.
 *
 * Per the architecture (arch §18.1), each TibiaData endpoint has a different
 * volatility — worlds barely change while character stats flip daily. We
 * mirror that with per-endpoint TTLs so a single config change moves the
 * trade-off between freshness and R11 (shared rate-limit budget).
 *
 * The cache is bounded (LRU eviction) to keep memory bounded across the
 * long-lived Next.js server process. Default cap: 256 entries — enough for
 * thousands of distinct character/world combos.
 */
export const DEFAULT_MAX_ENTRIES = 256;
/**
 * TTL table — values are in milliseconds.
 *
 *   worlds            24h  — moves about once a quarter
 *   creatures / spells 24h  — reference data, almost static
 *   character         10m  — flips whenever the player trains / dies
 *   highscores        15m  — refreshed by tibia.com daily
 *   boostablebosses   1h   — daily rotation, no need to poll
 *   news              1h   — news ticker / archive
 *   killstatistics    24h  — daily cumulative
 *   guilds            24h  — reference list per world
 *   guild             10m  — roster / invite changes more often
 *   fansites          24h  — curated by CipSoft, very slow drift
 *   houses            15m  — auction timers matter
 *   house             15m  — same
 */
export const TTL_BY_ENDPOINT = {
    worlds: 24 * 60 * 60_000,
    world: 24 * 60 * 60_000,
    creatures: 24 * 60 * 60_000,
    creature: 24 * 60 * 60_000,
    spells: 24 * 60 * 60_000,
    spell: 24 * 60 * 60_000,
    character: 10 * 60_000,
    highscores: 15 * 60_000,
    boostablebosses: 60 * 60_000,
    news: 60 * 60_000,
    killstatistics: 24 * 60 * 60_000,
    guild: 10 * 60_000,
    guilds: 24 * 60 * 60_000,
    fansites: 24 * 60 * 60_000,
    houses: 15 * 60_000,
    house: 15 * 60_000,
};
/** Default TTL for endpoints we haven't enumerated explicitly. */
export const DEFAULT_TTL_MS = 10 * 60_000;
export class LruCache {
    maxEntries;
    now;
    /** Insertion order — used for eviction + inspection. */
    order = new Map();
    constructor(options = {}) {
        this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
        this.now = options.now ?? Date.now;
    }
    /** Returns the cached value if still fresh, else `undefined`. */
    get(key) {
        const entry = this.order.get(key);
        if (!entry)
            return undefined;
        if (entry.expiresAt <= this.now()) {
            this.order.delete(key);
            return undefined;
        }
        // Refresh LRU position by re-inserting.
        this.order.delete(key);
        this.order.set(key, entry);
        return entry.value;
    }
    /** Insert/refresh a value under the given TTL (ms). */
    set(key, value, ttlMs) {
        if (ttlMs <= 0)
            return; // negative / zero TTL → cache disabled
        const entry = { value, expiresAt: this.now() + ttlMs };
        if (this.order.has(key))
            this.order.delete(key);
        this.order.set(key, entry);
        while (this.order.size > this.maxEntries) {
            const oldestKey = this.order.keys().next().value;
            if (oldestKey === undefined)
                break;
            this.order.delete(oldestKey);
        }
    }
    /** Invalidate a single entry (e.g. on 4xx "not found" that may recover). */
    delete(key) {
        return this.order.delete(key);
    }
    /** Drop everything — test helper / forced refresh. */
    clear() {
        this.order.clear();
    }
    size() {
        return this.order.size;
    }
}
/** Resolve the TTL for an endpoint, falling back to the default. */
export function ttlFor(endpoint) {
    return TTL_BY_ENDPOINT[endpoint] ?? DEFAULT_TTL_MS;
}
/** Process-global cache shared by the entire TibiaData client. */
export const globalCache = new LruCache();
//# sourceMappingURL=cache.js.map