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
import { defaultClient } from "./client.js";
import { BoostableBossesOverviewResponseSchema, } from "./types.js";
import { CharacterResponseSchema } from "./types.js";
import { CreatureResponseSchema } from "./types.js";
import { CreaturesOverviewResponseSchema, } from "./types.js";
import { FansitesResponseSchema } from "./types.js";
import { GuildResponseSchema } from "./types.js";
import { GuildsOverviewResponseSchema } from "./types.js";
import { HighscoresResponseSchema } from "./types.js";
import { HouseResponseSchema } from "./types.js";
import { HousesOverviewResponseSchema } from "./types.js";
import { KillStatisticsResponseSchema } from "./types.js";
import { NewsListResponseSchema } from "./types.js";
import { SpellInformationResponseSchema } from "./types.js";
import { SpellsOverviewResponseSchema } from "./types.js";
import { WorldResponseSchema } from "./types.js";
import { WorldsOverviewResponseSchema } from "./types.js";
export { HighscoreCategorySchema, HighscoreVocationSchema } from "./types.js";
export { createTibiaDataClient, defaultClient, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from "./client.js";
export { CircuitBreaker, CircuitBreakerOpenError, DEFAULT_FAILURE_THRESHOLD, DEFAULT_COOLDOWN_MS, globalBreaker, } from "./circuit-breaker.js";
export { LruCache, TTL_BY_ENDPOINT, DEFAULT_TTL_MS, DEFAULT_MAX_ENTRIES, ttlFor, globalCache, } from "./cache.js";
export { withRetry, TibiaDataHttpError, isTransientError, computeBackoff, DEFAULT_MAX_RETRIES, DEFAULT_BASE_DELAY_MS, DEFAULT_JITTER_FRACTION, } from "./retry.js";
export { getMetrics, resetMetrics, recordCacheHit, recordCacheMiss, recordRequest, recordError, recordBreakerRejection, updateBreaker, } from "./metrics.js";
// ──────────────────────────────────────────────────────────────────────────
// Endpoint functions
// ──────────────────────────────────────────────────────────────────────────
function bind(client) {
    return {
        getCharacter(name) {
            return client.request("character", `/v4/character/${encodeURIComponent(name)}`, CharacterResponseSchema);
        },
        getWorlds() {
            return client.request("worlds", "/v4/worlds", WorldsOverviewResponseSchema);
        },
        getWorld(name) {
            return client.request("world", `/v4/world/${encodeURIComponent(name)}`, WorldResponseSchema);
        },
        getBoostableBosses() {
            return client.request("boostablebosses", "/v4/boostablebosses", BoostableBossesOverviewResponseSchema);
        },
        getCreatures() {
            return client.request("creatures", "/v4/creatures", CreaturesOverviewResponseSchema);
        },
        getCreature(race) {
            return client.request("creature", `/v4/creature/${encodeURIComponent(race)}`, CreatureResponseSchema);
        },
        getSpells() {
            return client.request("spells", "/v4/spells", SpellsOverviewResponseSchema);
        },
        getSpell(spellId) {
            return client.request("spell", `/v4/spell/${encodeURIComponent(spellId)}`, SpellInformationResponseSchema);
        },
        getHighscores(world, category, vocation, page = 1) {
            return client.request("highscores", `/v4/highscores/${encodeURIComponent(world)}/${encodeURIComponent(category)}/${encodeURIComponent(vocation)}/${encodeURIComponent(String(page))}`, HighscoresResponseSchema);
        },
        getHouses(world, town) {
            return client.request("houses", `/v4/houses/${encodeURIComponent(world)}/${encodeURIComponent(town)}`, HousesOverviewResponseSchema);
        },
        getHouse(world, houseId) {
            return client.request("house", `/v4/house/${encodeURIComponent(world)}/${encodeURIComponent(String(houseId))}`, HouseResponseSchema);
        },
        getKillStatistics(world) {
            return client.request("killstatistics", `/v4/killstatistics/${encodeURIComponent(world)}`, KillStatisticsResponseSchema);
        },
        getNewsLatest() {
            return client.request("news", "/v4/news/latest", NewsListResponseSchema);
        },
        getNewsArchive(days = 90) {
            const path = days === 90 ? "/v4/news/archive" : `/v4/news/archive/${encodeURIComponent(String(days))}`;
            return client.request("news", path, NewsListResponseSchema);
        },
        getGuild(name) {
            return client.request("guild", `/v4/guild/${encodeURIComponent(name)}`, GuildResponseSchema);
        },
        getGuilds(world) {
            return client.request("guilds", `/v4/guilds/${encodeURIComponent(world)}`, GuildsOverviewResponseSchema);
        },
        getFansites() {
            return client.request("fansites", "/v4/fansites", FansitesResponseSchema);
        },
    };
}
/**
 * Default API surface — uses `defaultClient` which reads
 * `TIBIADATA_BASE_URL` from the environment.
 */
export const tibiansTibiaData = bind(defaultClient);
/** Named exports — matching the spec list. */
export const { getCharacter, getWorlds, getWorld, getBoostableBosses, getCreatures, getCreature, getSpells, getSpell, getHighscores, getHouses, getHouse, getKillStatistics, getNewsLatest, getNewsArchive, getGuild, getGuilds, getFansites, } = tibiansTibiaData;
/**
 * Build a parallel API surface for an isolated client (handy for tests and
 * for setups that need a separate breaker / cache — e.g. multi-tenant
 * workers that should not share rate-limit budgets).
 */
export function createTibiaDataApi(client = defaultClient) {
    return bind(client);
}
//# sourceMappingURL=index.js.map