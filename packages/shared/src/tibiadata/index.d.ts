/**
 * Public surface of the TibiaData client.
 *
 * 13 typed functions, one per v4 endpoint from arch §18.1. Each one is a
 * thin wrapper over `defaultClient.request()` that pins the endpoint name
 * (for caching + metrics) and the Zod schema (for response validation).
 *
 * Consumers that need an isolated client (tests, alternate base URLs) can
 * call `createTibiaDataClient()` directly.
 */
import { type TibiaDataClient } from "./client.js";
import { type BoostableBossesOverviewResponse } from "./types.js";
import { type CharacterResponse } from "./types.js";
import { type CreatureResponse } from "./types.js";
import { type CreaturesOverviewResponse } from "./types.js";
import { type FansitesResponse } from "./types.js";
import { type GuildResponse } from "./types.js";
import { type GuildsOverviewResponse } from "./types.js";
import { type HighscoresResponse, type HighscoreCategory, type HighscoreVocation } from "./types.js";
import { type HouseResponse } from "./types.js";
import { type HousesOverviewResponse } from "./types.js";
import { type KillStatisticsResponse } from "./types.js";
import { type NewsListResponse } from "./types.js";
import { type SpellInformationResponse } from "./types.js";
import { type SpellsOverviewResponse } from "./types.js";
import { type WorldResponse } from "./types.js";
import { type WorldsOverviewResponse } from "./types.js";
export type { BoostableBossesOverviewResponse, Character, CharacterInfo, CharacterResponse, Creature, CreatureResponse, CreaturesOverviewResponse, Fansite, FansitesResponse, Guild, GuildResponse, GuildsOverviewResponse, Highscore, HighscoreCategory, HighscoreVocation, HighscoresResponse, House, HouseResponse, HousesOverviewResponse, Information, KillStatisticsResponse, News, NewsItem, NewsListResponse, NewsListResponse as NewsArchiveResponse, OverviewBoostableBoss, OverviewCreature, OverviewGuild, OverviewWorld, Spell, SpellData, SpellInformationResponse, SpellsOverviewResponse, World, WorldResponse, WorldsOverviewResponse, } from "./types.js";
export { HighscoreCategorySchema, HighscoreVocationSchema } from "./types.js";
export type { TibiaDataMetricsSnapshot, EndpointMetrics, BreakerState, CircuitBreakerMetrics } from "./metrics.js";
export { createTibiaDataClient, defaultClient, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from "./client.js";
export type { TibiaDataClient, TibiaDataClientOptions } from "./client.js";
export { CircuitBreaker, CircuitBreakerOpenError, DEFAULT_FAILURE_THRESHOLD, DEFAULT_COOLDOWN_MS, globalBreaker, } from "./circuit-breaker.js";
export { LruCache, TTL_BY_ENDPOINT, DEFAULT_TTL_MS, DEFAULT_MAX_ENTRIES, ttlFor, globalCache, } from "./cache.js";
export { withRetry, TibiaDataHttpError, isTransientError, computeBackoff, DEFAULT_MAX_RETRIES, DEFAULT_BASE_DELAY_MS, DEFAULT_JITTER_FRACTION, } from "./retry.js";
export { getMetrics, resetMetrics, recordCacheHit, recordCacheMiss, recordRequest, recordError, recordBreakerRejection, updateBreaker, } from "./metrics.js";
/**
 * Default API surface — uses `defaultClient` which reads
 * `TIBIADATA_BASE_URL` from the environment.
 */
export declare const tibiansTibiaData: {
    getCharacter(name: string): Promise<CharacterResponse>;
    getWorlds(): Promise<WorldsOverviewResponse>;
    getWorld(name: string): Promise<WorldResponse>;
    getBoostableBosses(): Promise<BoostableBossesOverviewResponse>;
    getCreatures(): Promise<CreaturesOverviewResponse>;
    getCreature(race: string): Promise<CreatureResponse>;
    getSpells(): Promise<SpellsOverviewResponse>;
    getSpell(spellId: string): Promise<SpellInformationResponse>;
    getHighscores(world: string, category: HighscoreCategory, vocation: HighscoreVocation, page?: number): Promise<HighscoresResponse>;
    getHouses(world: string, town: string): Promise<HousesOverviewResponse>;
    getHouse(world: string, houseId: number): Promise<HouseResponse>;
    getKillStatistics(world: string): Promise<KillStatisticsResponse>;
    getNewsLatest(): Promise<NewsListResponse>;
    getNewsArchive(days?: number): Promise<NewsListResponse>;
    getGuild(name: string): Promise<GuildResponse>;
    getGuilds(world: string): Promise<GuildsOverviewResponse>;
    getFansites(): Promise<FansitesResponse>;
};
/** Named exports — matching the spec list. */
export declare const getCharacter: (name: string) => Promise<CharacterResponse>, getWorlds: () => Promise<WorldsOverviewResponse>, getWorld: (name: string) => Promise<WorldResponse>, getBoostableBosses: () => Promise<BoostableBossesOverviewResponse>, getCreatures: () => Promise<CreaturesOverviewResponse>, getCreature: (race: string) => Promise<CreatureResponse>, getSpells: () => Promise<SpellsOverviewResponse>, getSpell: (spellId: string) => Promise<SpellInformationResponse>, getHighscores: (world: string, category: HighscoreCategory, vocation: HighscoreVocation, page?: number) => Promise<HighscoresResponse>, getHouses: (world: string, town: string) => Promise<HousesOverviewResponse>, getHouse: (world: string, houseId: number) => Promise<HouseResponse>, getKillStatistics: (world: string) => Promise<KillStatisticsResponse>, getNewsLatest: () => Promise<NewsListResponse>, getNewsArchive: (days?: number) => Promise<NewsListResponse>, getGuild: (name: string) => Promise<GuildResponse>, getGuilds: (world: string) => Promise<GuildsOverviewResponse>, getFansites: () => Promise<FansitesResponse>;
/**
 * Build a parallel API surface for an isolated client (handy for tests and
 * for setups that need a separate breaker / cache — e.g. multi-tenant
 * workers that should not share rate-limit budgets).
 */
export declare function createTibiaDataApi(client?: TibiaDataClient): {
    getCharacter(name: string): Promise<CharacterResponse>;
    getWorlds(): Promise<WorldsOverviewResponse>;
    getWorld(name: string): Promise<WorldResponse>;
    getBoostableBosses(): Promise<BoostableBossesOverviewResponse>;
    getCreatures(): Promise<CreaturesOverviewResponse>;
    getCreature(race: string): Promise<CreatureResponse>;
    getSpells(): Promise<SpellsOverviewResponse>;
    getSpell(spellId: string): Promise<SpellInformationResponse>;
    getHighscores(world: string, category: HighscoreCategory, vocation: HighscoreVocation, page?: number): Promise<HighscoresResponse>;
    getHouses(world: string, town: string): Promise<HousesOverviewResponse>;
    getHouse(world: string, houseId: number): Promise<HouseResponse>;
    getKillStatistics(world: string): Promise<KillStatisticsResponse>;
    getNewsLatest(): Promise<NewsListResponse>;
    getNewsArchive(days?: number): Promise<NewsListResponse>;
    getGuild(name: string): Promise<GuildResponse>;
    getGuilds(world: string): Promise<GuildsOverviewResponse>;
    getFansites(): Promise<FansitesResponse>;
};
//# sourceMappingURL=index.d.ts.map