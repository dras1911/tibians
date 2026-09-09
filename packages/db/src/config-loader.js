/**
 * Loader konfiguracji kalkulatorów — `getConfig(key)` z cache in-memory 60s.
 *
 * Dlaczego: współczynniki formuł żyją w DB (arch §7.2 `calculator_config`),
 * żeby zmiana balansu gry = UPDATE w bazie, BEZ redeploya (arch §16 Faza 1B).
 *
 * Cache: LRU per key, TTL 60s. Drugi call w 60s NIE dotyka DB.
 * Walidacja: `calculatorConfigValueSchema.safeParse` — corrupted DB value
 * → log warning + null (NIE crash).
 *
 * Metryka: `getStats()` zwraca hits/misses/invalid (observable cache hit rate).
 */
import { eq } from 'drizzle-orm';
import { calculatorConfig, calculatorConfigValueSchema, } from './schema/calculator-config';
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 100;
export function createConfigLoader(options = {}) {
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const cache = new Map();
    const stats = { hits: 0, misses: 0, invalid: 0 };
    async function resolveDb() {
        if (options.db)
            return options.db;
        // Lazy dynamic import — unika cyklicznego importu (index.ts → config-loader.ts).
        const { db } = await import('./index');
        return db;
    }
    async function getConfig(key) {
        const now = Date.now();
        const cached = cache.get(key);
        if (cached) {
            if (cached.expiresAt > now) {
                // LRU touch: przenieś na koniec (ostatnio używany).
                cache.delete(key);
                cache.set(key, cached);
                stats.hits += 1;
                return cached.value;
            }
            cache.delete(key);
        }
        stats.misses += 1;
        const dbClient = await resolveDb();
        const rows = await dbClient
            .select()
            .from(calculatorConfig)
            .where(eq(calculatorConfig.key, key))
            .limit(1);
        const row = rows[0];
        let value = null;
        if (row) {
            const parsed = calculatorConfigValueSchema.safeParse(row.value);
            if (!parsed.success) {
                stats.invalid += 1;
                console.warn(`[config-loader] Invalid value for key "${key}": ${parsed.error.message}`);
            }
            else {
                value = parsed.data;
            }
        }
        // Cache również "not found" (negative caching) — unika powtórnych query.
        cache.set(key, { value, expiresAt: now + ttlMs });
        if (cache.size > maxEntries) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined)
                cache.delete(oldest);
        }
        return value;
    }
    function getStats() {
        return { ...stats };
    }
    function clearCache() {
        cache.clear();
    }
    return { getConfig, getStats, clearCache };
}
const defaultLoader = createConfigLoader();
/** Singleton loader na domyślnym `db` (index.ts). */
export const getConfig = defaultLoader.getConfig;
export const getConfigStats = defaultLoader.getStats;
export const clearConfigCache = defaultLoader.clearCache;
//# sourceMappingURL=config-loader.js.map