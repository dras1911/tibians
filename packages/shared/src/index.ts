/**
 * @tibians/shared — public surface.
 *
 * Re-exports the typed TibiaData v4 client (task 8) plus its cache /
 * circuit breaker / retry helpers so the rest of the monorepo can consume
 * them without reaching into the `tibiadata/` subfolder.
 *
 * Dodatkowo: moduł aukcji Bazaar (task 28) — Zod schemas + TS typy dla
 * `Auction` i 6 relacji 1:N z arch. §7.2. Współdzielone przez scraper,
 * API i UI (Faza 5-7).
 */

export * as Auction from "./auction/index.js";

export * as TibiaData from "./tibiadata/index.js";
export {
  // Client factory + default singleton
  createTibiaDataClient,
  defaultClient,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  // 13 endpoint functions
  getBoostableBosses,
  getCharacter,
  getCreature,
  getCreatures,
  getFansites,
  getGuild,
  getGuilds,
  getHighscores,
  getHouse,
  getHouses,
  getKillStatistics,
  getNewsArchive,
  getNewsLatest,
  getSpell,
  getSpells,
  getWorld,
  getWorlds,
  // Builders
  createTibiaDataApi,
  tibiansTibiaData,
  // Cache
  LruCache,
  TTL_BY_ENDPOINT,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ENTRIES,
  ttlFor,
  globalCache,
  // Circuit breaker
  CircuitBreaker,
  CircuitBreakerOpenError,
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_COOLDOWN_MS,
  globalBreaker,
  // Retry
  withRetry,
  TibiaDataHttpError,
  isTransientError,
  computeBackoff,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_JITTER_FRACTION,
  // Metrics
  getMetrics,
  resetMetrics,
  recordCacheHit,
  recordCacheMiss,
  recordRequest,
  recordError,
  recordBreakerRejection,
  updateBreaker,
  // Zod schemas
  HighscoreCategorySchema,
  HighscoreVocationSchema,
} from "./tibiadata/index.js";

export type {
  TibiaDataClient,
  TibiaDataClientOptions,
  TibiaDataMetricsSnapshot,
  EndpointMetrics,
  BreakerState,
  CircuitBreakerMetrics,
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
  NewsArchiveResponse,
  NewsItem,
  NewsListResponse,
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
} from "./tibiadata/index.js";