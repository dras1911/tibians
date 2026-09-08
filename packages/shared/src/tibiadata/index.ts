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
import { defaultClient, type TibiaDataClient } from "./client.js";
import {
  BoostableBossesOverviewResponseSchema,
  type BoostableBossesOverviewResponse,
} from "./types.js";
import { CharacterResponseSchema, type CharacterResponse } from "./types.js";
import { CreatureResponseSchema, type CreatureResponse } from "./types.js";
import {
  CreaturesOverviewResponseSchema,
  type CreaturesOverviewResponse,
} from "./types.js";
import { FansitesResponseSchema, type FansitesResponse } from "./types.js";
import { GuildResponseSchema, type GuildResponse } from "./types.js";
import { GuildsOverviewResponseSchema, type GuildsOverviewResponse } from "./types.js";
import { HighscoresResponseSchema, type HighscoresResponse, type HighscoreCategory, type HighscoreVocation } from "./types.js";
import { HouseResponseSchema, type HouseResponse } from "./types.js";
import { HousesOverviewResponseSchema, type HousesOverviewResponse } from "./types.js";
import { KillStatisticsResponseSchema, type KillStatisticsResponse } from "./types.js";
import { NewsListResponseSchema, type NewsListResponse } from "./types.js";
import { SpellInformationResponseSchema, type SpellInformationResponse } from "./types.js";
import { SpellsOverviewResponseSchema, type SpellsOverviewResponse } from "./types.js";
import { WorldResponseSchema, type WorldResponse } from "./types.js";
import { WorldsOverviewResponseSchema, type WorldsOverviewResponse } from "./types.js";

export type {
  BoostableBossesOverviewResponse,
  Character,
  CharacterInfo,
  CharacterResponse,
  Creature,
  CreatureResponse,
  CreaturesOverviewResponse,
  Fansite,
  FansitesResponse,
  Guild,
  GuildResponse,
  GuildsOverviewResponse,
  Highscore,
  HighscoreCategory,
  HighscoreVocation,
  HighscoresResponse,
  House,
  HouseResponse,
  HousesOverviewResponse,
  Information,
  KillStatisticsResponse,
  News,
  NewsItem,
  NewsListResponse,
  NewsListResponse as NewsArchiveResponse,
  OverviewBoostableBoss,
  OverviewCreature,
  OverviewGuild,
  OverviewWorld,
  Spell,
  SpellData,
  SpellInformationResponse,
  SpellsOverviewResponse,
  World,
  WorldResponse,
  WorldsOverviewResponse,
} from "./types.js";
export { HighscoreCategorySchema, HighscoreVocationSchema } from "./types.js";
export type { TibiaDataMetricsSnapshot, EndpointMetrics, BreakerState, CircuitBreakerMetrics } from "./metrics.js";

export { createTibiaDataClient, defaultClient, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from "./client.js";
export type { TibiaDataClient, TibiaDataClientOptions } from "./client.js";

export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_COOLDOWN_MS,
  globalBreaker,
} from "./circuit-breaker.js";

export {
  LruCache,
  TTL_BY_ENDPOINT,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ENTRIES,
  ttlFor,
  globalCache,
} from "./cache.js";

export {
  withRetry,
  TibiaDataHttpError,
  isTransientError,
  computeBackoff,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_JITTER_FRACTION,
} from "./retry.js";

export {
  getMetrics,
  resetMetrics,
  recordCacheHit,
  recordCacheMiss,
  recordRequest,
  recordError,
  recordBreakerRejection,
  updateBreaker,
} from "./metrics.js";

// ──────────────────────────────────────────────────────────────────────────
// Endpoint functions
// ──────────────────────────────────────────────────────────────────────────

function bind(client: TibiaDataClient) {
  return {
    getCharacter(name: string): Promise<CharacterResponse> {
      return client.request("character", `/v4/character/${encodeURIComponent(name)}`, CharacterResponseSchema);
    },
    getWorlds(): Promise<WorldsOverviewResponse> {
      return client.request("worlds", "/v4/worlds", WorldsOverviewResponseSchema);
    },
    getWorld(name: string): Promise<WorldResponse> {
      return client.request("world", `/v4/world/${encodeURIComponent(name)}`, WorldResponseSchema);
    },
    getBoostableBosses(): Promise<BoostableBossesOverviewResponse> {
      return client.request("boostablebosses", "/v4/boostablebosses", BoostableBossesOverviewResponseSchema);
    },
    getCreatures(): Promise<CreaturesOverviewResponse> {
      return client.request("creatures", "/v4/creatures", CreaturesOverviewResponseSchema);
    },
    getCreature(race: string): Promise<CreatureResponse> {
      return client.request(
        "creature",
        `/v4/creature/${encodeURIComponent(race)}`,
        CreatureResponseSchema,
      );
    },
    getSpells(): Promise<SpellsOverviewResponse> {
      return client.request("spells", "/v4/spells", SpellsOverviewResponseSchema);
    },
    getSpell(spellId: string): Promise<SpellInformationResponse> {
      return client.request(
        "spell",
        `/v4/spell/${encodeURIComponent(spellId)}`,
        SpellInformationResponseSchema,
      );
    },
    getHighscores(
      world: string,
      category: HighscoreCategory,
      vocation: HighscoreVocation,
      page = 1,
    ): Promise<HighscoresResponse> {
      return client.request(
        "highscores",
        `/v4/highscores/${encodeURIComponent(world)}/${encodeURIComponent(
          category,
        )}/${encodeURIComponent(vocation)}/${encodeURIComponent(String(page))}`,
        HighscoresResponseSchema,
      );
    },
    getHouses(world: string, town: string): Promise<HousesOverviewResponse> {
      return client.request(
        "houses",
        `/v4/houses/${encodeURIComponent(world)}/${encodeURIComponent(town)}`,
        HousesOverviewResponseSchema,
      );
    },
    getHouse(world: string, houseId: number): Promise<HouseResponse> {
      return client.request(
        "house",
        `/v4/house/${encodeURIComponent(world)}/${encodeURIComponent(String(houseId))}`,
        HouseResponseSchema,
      );
    },
    getKillStatistics(world: string): Promise<KillStatisticsResponse> {
      return client.request(
        "killstatistics",
        `/v4/killstatistics/${encodeURIComponent(world)}`,
        KillStatisticsResponseSchema,
      );
    },
    getNewsLatest(): Promise<NewsListResponse> {
      return client.request("news", "/v4/news/latest", NewsListResponseSchema);
    },
    getNewsArchive(days = 90): Promise<NewsListResponse> {
      const path =
        days === 90 ? "/v4/news/archive" : `/v4/news/archive/${encodeURIComponent(String(days))}`;
      return client.request("news", path, NewsListResponseSchema);
    },
    getGuild(name: string): Promise<GuildResponse> {
      return client.request("guild", `/v4/guild/${encodeURIComponent(name)}`, GuildResponseSchema);
    },
    getGuilds(world: string): Promise<GuildsOverviewResponse> {
      return client.request(
        "guilds",
        `/v4/guilds/${encodeURIComponent(world)}`,
        GuildsOverviewResponseSchema,
      );
    },
    getFansites(): Promise<FansitesResponse> {
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
export const {
  getCharacter,
  getWorlds,
  getWorld,
  getBoostableBosses,
  getCreatures,
  getCreature,
  getSpells,
  getSpell,
  getHighscores,
  getHouses,
  getHouse,
  getKillStatistics,
  getNewsLatest,
  getNewsArchive,
  getGuild,
  getGuilds,
  getFansites,
} = tibiansTibiaData;

/**
 * Build a parallel API surface for an isolated client (handy for tests and
 * for setups that need a separate breaker / cache — e.g. multi-tenant
 * workers that should not share rate-limit budgets).
 */
export function createTibiaDataApi(client: TibiaDataClient = defaultClient) {
  return bind(client);
}