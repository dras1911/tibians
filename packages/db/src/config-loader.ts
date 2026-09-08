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
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import {
  calculatorConfig,
  calculatorConfigValueSchema,
} from './schema/calculator-config';
import type { schema } from './schema';

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 100;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

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

export function createConfigLoader(options: ConfigLoaderOptions = {}): ConfigLoader {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const cache = new Map<string, CacheEntry>();
  const stats: ConfigLoaderStats = { hits: 0, misses: 0, invalid: 0 };

  async function resolveDb(): Promise<NodePgDatabase<typeof schema>> {
    if (options.db) return options.db;
    // Lazy dynamic import — unika cyklicznego importu (index.ts → config-loader.ts).
    const { db } = await import('./index');
    return db;
  }

  async function getConfig<T = unknown>(key: string): Promise<T | null> {
    const now = Date.now();
    const cached = cache.get(key);
    if (cached) {
      if (cached.expiresAt > now) {
        // LRU touch: przenieś na koniec (ostatnio używany).
        cache.delete(key);
        cache.set(key, cached);
        stats.hits += 1;
        return cached.value as T;
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

    let value: unknown = null;
    if (row) {
      const parsed = calculatorConfigValueSchema.safeParse(row.value);
      if (!parsed.success) {
        stats.invalid += 1;
        console.warn(
          `[config-loader] Invalid value for key "${key}": ${parsed.error.message}`,
        );
      } else {
        value = parsed.data;
      }
    }

    // Cache również "not found" (negative caching) — unika powtórnych query.
    cache.set(key, { value, expiresAt: now + ttlMs });
    if (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return value as T;
  }

  function getStats(): ConfigLoaderStats {
    return { ...stats };
  }

  function clearCache(): void {
    cache.clear();
  }

  return { getConfig, getStats, clearCache };
}

const defaultLoader = createConfigLoader();

/** Singleton loader na domyślnym `db` (index.ts). */
export const getConfig = defaultLoader.getConfig;
export const getConfigStats = defaultLoader.getStats;
export const clearConfigCache = defaultLoader.clearCache;