import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { schema } from './schema';
export interface ConfigLoaderStats {
    /** Trafienia w cache (drugi call w TTL nie dotyka DB). */
    hits: number;
    /** Chybienia — zapytania do DB. */
    misses: number;
    /** Wartości z DB, które nie przeszły walidacji Zod. */
    invalid: number;
}
export interface ConfigLoaderOptions {
    /** Wstrzykiwany klient DB (testy). Domyślnie singleton `db` z index.ts. */
    db?: NodePgDatabase<typeof schema>;
    /** TTL cache w ms (domyślnie 60 000). */
    ttlMs?: number;
    /** Maksymalna liczba wpisów cache (LRU eviction). */
    maxEntries?: number;
}
export interface ConfigLoader {
    getConfig<T = unknown>(key: string): Promise<T | null>;
    getStats(): ConfigLoaderStats;
    clearCache(): void;
}
export declare function createConfigLoader(options?: ConfigLoaderOptions): ConfigLoader;
/** Singleton loader na domyślnym `db` (index.ts). */
export declare const getConfig: <T = unknown>(key: string) => Promise<T | null>;
export declare const getConfigStats: () => ConfigLoaderStats;
export declare const clearConfigCache: () => void;
//# sourceMappingURL=config-loader.d.ts.map