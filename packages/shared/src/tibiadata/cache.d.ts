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
export declare const DEFAULT_MAX_ENTRIES = 256;
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
export declare const TTL_BY_ENDPOINT: Record<string, number>;
/** Default TTL for endpoints we haven't enumerated explicitly. */
export declare const DEFAULT_TTL_MS: number;
export interface LruCacheOptions {
    maxEntries?: number;
    /** Override the current time — useful in tests. */
    now?: () => number;
}
export declare class LruCache {
    private readonly maxEntries;
    private readonly now;
    /** Insertion order — used for eviction + inspection. */
    private readonly order;
    constructor(options?: LruCacheOptions);
    /** Returns the cached value if still fresh, else `undefined`. */
    get(key: string): unknown;
    /** Insert/refresh a value under the given TTL (ms). */
    set(key: string, value: unknown, ttlMs: number): void;
    /** Invalidate a single entry (e.g. on 4xx "not found" that may recover). */
    delete(key: string): boolean;
    /** Drop everything — test helper / forced refresh. */
    clear(): void;
    size(): number;
}
/** Resolve the TTL for an endpoint, falling back to the default. */
export declare function ttlFor(endpoint: string): number;
/** Process-global cache shared by the entire TibiaData client. */
export declare const globalCache: LruCache;
//# sourceMappingURL=cache.d.ts.map