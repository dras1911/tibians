/**
 * Zod schemas + inferred TS types for the TibiaData API v4.
 *
 * Source of truth: https://docs.tibiadata.com (Swagger 2.0 / v4.10.0)
 * Self-host or fallback to public — shape is identical either way.
 *
 * Schemas are kept permissive on optional fields (nullable/optional unions)
 * because TibiaData occasionally returns empty arrays/objects for unknown
 * races or unavailable data. We trust the shape, not the value.
 */
import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────
// Common building blocks
// ──────────────────────────────────────────────────────────────────────────

const NullableString = z.union([z.string(), z.null()]).optional();
const NullableNumber = z.union([z.number(), z.null()]).optional();
const NullableBoolean = z.union([z.boolean(), z.null()]).optional();

const ApiDetailsSchema = z.object({
  commit: NullableString,
  release: NullableString,
  version: NullableNumber,
});

const StatusSchema = z.object({
  error: z.number(),
  http_code: z.number(),
  message: NullableString,
});

const InformationSchema = z.object({
  api: ApiDetailsSchema.nullable().optional(),
  status: StatusSchema.nullable().optional(),
  tibia_urls: z.array(z.string()).optional(),
  timestamp: NullableString,
});

export type Information = z.infer<typeof InformationSchema>;

// ──────────────────────────────────────────────────────────────────────────
// 1. /v4/character/:name
// ──────────────────────────────────────────────────────────────────────────

const CharacterGuildSchema = z.object({
  name: NullableString,
  rank: NullableString,
});

const AccountBadgesSchema = z.object({
  description: NullableString,
  icon_url: NullableString,
  name: NullableString,
});

const AccountInformationSchema = z.object({
  created: NullableString,
  loyalty_title: NullableString,
  position: NullableString,
});

const AchievementsSchema = z.object({
  grade: NullableNumber,
  name: NullableString,
  secret: NullableBoolean,
});

const HousesOfCharacterSchema = z.object({
  houseid: NullableNumber,
  name: NullableString,
  paid: NullableString,
  town: NullableString,
});

const KillersSchema = z.object({
  name: NullableString,
  player: NullableBoolean,
  summon: NullableString,
  traded: NullableBoolean,
});

const DeathsSchema = z.object({
  assists: z.array(KillersSchema).optional(),
  killers: z.array(KillersSchema).optional(),
  level: NullableNumber,
  reason: NullableString,
  time: NullableString,
});

const OtherCharactersSchema = z.object({
  deleted: NullableBoolean,
  main: NullableBoolean,
  name: NullableString,
  position: NullableString,
  status: NullableString,
  traded: NullableBoolean,
  world: NullableString,
});

const CharacterInfoSchema = z.object({
  account_status: NullableString,
  achievement_points: NullableNumber,
  comment: NullableString,
  deletion_date: NullableString,
  former_names: z.array(z.string()).optional(),
  former_worlds: z.array(z.string()).optional(),
  guild: CharacterGuildSchema.nullable().optional(),
  houses: z.array(HousesOfCharacterSchema).optional(),
  last_login: NullableString,
  level: NullableNumber,
  married_to: NullableString,
  name: NullableString,
  position: NullableString,
  residence: NullableString,
  sex: NullableString,
  title: NullableString,
  traded: NullableBoolean,
  unlocked_titles: NullableNumber,
  vocation: NullableString,
  world: NullableString,
});

const CharacterSchema = z.object({
  account_badges: z.array(AccountBadgesSchema).optional(),
  account_information: AccountInformationSchema.nullable().optional(),
  achievements: z.array(AchievementsSchema).optional(),
  character: CharacterInfoSchema.nullable().optional(),
  deaths: z.array(DeathsSchema).optional(),
  deaths_truncated: NullableBoolean,
  other_characters: z.array(OtherCharactersSchema).optional(),
});

export const CharacterResponseSchema = z.object({
  character: CharacterSchema.nullable(),
  information: InformationSchema.nullable().optional(),
});

export type CharacterResponse = z.infer<typeof CharacterResponseSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type CharacterInfo = z.infer<typeof CharacterInfoSchema>;

// ──────────────────────────────────────────────────────────────────────────
// 2. /v4/worlds  +  /v4/world/:name
// ──────────────────────────────────────────────────────────────────────────

const OnlinePlayersSchema = z.object({
  level: NullableNumber,
  name: NullableString,
  vocation: NullableString,
});

const OverviewWorldSchema = z.object({
  battleye_date: NullableString,
  battleye_protected: NullableBoolean,
  game_world_type: NullableString,
  location: NullableString,
  name: NullableString,
  players_online: NullableNumber,
  premium_only: NullableBoolean,
  pvp_type: NullableString,
  status: NullableString,
  tournament_world_type: NullableString,
  transfer_type: NullableString,
});

const OverviewWorldsSchema = z.object({
  players_online: NullableNumber,
  record_date: NullableString,
  record_players: NullableNumber,
  regular_worlds: z.array(OverviewWorldSchema).optional(),
  tournament_worlds: z.array(OverviewWorldSchema).optional(),
});

export const WorldsOverviewResponseSchema = z.object({
  information: InformationSchema.nullable().optional(),
  worlds: OverviewWorldsSchema.nullable(),
});

export type WorldsOverviewResponse = z.infer<typeof WorldsOverviewResponseSchema>;
export type OverviewWorld = z.infer<typeof OverviewWorldSchema>;

const WorldSchema = z.object({
  battleye_date: NullableString,
  battleye_protected: NullableBoolean,
  creation_date: NullableString,
  game_world_type: NullableString,
  location: NullableString,
  name: NullableString,
  online_players: z.array(OnlinePlayersSchema).optional(),
  players_online: NullableNumber,
  premium_only: NullableBoolean,
  pvp_type: NullableString,
  record_date: NullableString,
  record_players: NullableNumber,
  status: NullableString,
  tournament_world_type: NullableString,
  transfer_type: NullableString,
  world_quest_titles: z.array(z.string()).optional(),
});

export const WorldResponseSchema = z.object({
  information: InformationSchema.nullable().optional(),
  world: WorldSchema.nullable(),
});

export type WorldResponse = z.infer<typeof WorldResponseSchema>;
export type World = z.infer<typeof WorldSchema>;

// ──────────────────────────────────────────────────────────────────────────
// 3. /v4/boostablebosses
// ──────────────────────────────────────────────────────────────────────────

const OverviewBoostableBossSchema = z.object({
  featured: NullableBoolean,
  image_url: NullableString,
  name: NullableString,
});

const BoostableBossesContainerSchema = z.object({
  boostable_boss_list: z.array(OverviewBoostableBossSchema).optional(),
  boosted: OverviewBoostableBossSchema.nullable().optional(),
});

export const BoostableBossesOverviewResponseSchema = z.object({
  boostable_bosses: BoostableBossesContainerSchema.nullable(),
  information: InformationSchema.nullable().optional(),
});

export type BoostableBossesOverviewResponse = z.infer<
  typeof BoostableBossesOverviewResponseSchema
>;
export type OverviewBoostableBoss = z.infer<typeof OverviewBoostableBossSchema>;

// ──────────────────────────────────────────────────────────────────────────
// 4. /v4/creatures  +  /v4/creature/:race
// ──────────────────────────────────────────────────────────────────────────

const OverviewCreatureSchema = z.object({
  featured: NullableBoolean,
  image_url: NullableString,
  name: NullableString,
  race: NullableString,
});

const CreaturesContainerSchema = z.object({
  boosted: OverviewCreatureSchema.nullable().optional(),
  creature_list: z.array(OverviewCreatureSchema).optional(),
});

export const CreaturesOverviewResponseSchema = z.object({
  creatures: CreaturesContainerSchema.nullable(),
  information: InformationSchema.nullable().optional(),
});

export type CreaturesOverviewResponse = z.infer<
  typeof CreaturesOverviewResponseSchema
>;
export type OverviewCreature = z.infer<typeof OverviewCreatureSchema>;

const CreatureSchema = z.object({
  be_convinced: NullableBoolean,
  be_paralysed: NullableBoolean,
  be_summoned: NullableBoolean,
  behaviour: NullableString,
  convinced_mana: NullableNumber,
  description: NullableString,
  experience_points: NullableNumber,
  featured: NullableBoolean,
  healed: z.array(z.string()).optional(),
  hitpoints: NullableNumber,
  image_url: NullableString,
  immune: z.array(z.string()).optional(),
  is_lootable: NullableBoolean,
  loot_list: z.array(z.string()).optional(),
  name: NullableString,
  race: NullableString,
  see_invisible: NullableBoolean,
  strong: z.array(z.string()).optional(),
  summoned_mana: NullableNumber,
  weakness: z.array(z.string()).optional(),
});

export const CreatureResponseSchema = z.object({
  creature: CreatureSchema.nullable(),
  information: InformationSchema.nullable().optional(),
});

export type CreatureResponse = z.infer<typeof CreatureResponseSchema>;
export type Creature = z.infer<typeof CreatureSchema>;

// ──────────────────────────────────────────────────────────────────────────
// 5. /v4/spells  +  /v4/spell/:id
// ──────────────────────────────────────────────────────────────────────────

const SpellOverviewItemSchema = z.object({
  formula: NullableString,
  group_attack: NullableBoolean,
  group_healing: NullableBoolean,
  group_support: NullableBoolean,
  level: NullableNumber,
  mana: NullableNumber,
  name: NullableString,
  premium_only: NullableBoolean,
  price: NullableNumber,
  spell_id: NullableString,
  type_instant: NullableBoolean,
  type_rune: NullableBoolean,
});

const SpellsContainerSchema = z.object({
  spell_list: z.array(SpellOverviewItemSchema).optional(),
  spells_filter: NullableString,
});

export const SpellsOverviewResponseSchema = z.object({
  information: InformationSchema.nullable().optional(),
  spells: SpellsContainerSchema.nullable(),
});

export type SpellsOverviewResponse = z.infer<typeof SpellsOverviewResponseSchema>;
export type Spell = z.infer<typeof SpellOverviewItemSchema>;

const SpellInformationSchema = z.object({
  amount: NullableNumber,
  city: z.array(z.string()).optional(),
  cooldown_alone: NullableNumber,
  cooldown_group: NullableNumber,
  damage_type: NullableString,
  formula: NullableString,
  group_attack: NullableBoolean,
  group_healing: NullableBoolean,
  group_support: NullableBoolean,
  level: NullableNumber,
  mana: NullableNumber,
  premium_only: NullableBoolean,
  price: NullableNumber,
  soul_points: NullableNumber,
  type_instant: NullableBoolean,
  type_rune: NullableBoolean,
  vocation: z.array(z.string()).optional(),
});

const RuneInformationSchema = z.object({
  damage_type: NullableString,
  group_attack: NullableBoolean,
  group_healing: NullableBoolean,
  group_support: NullableBoolean,
  level: NullableNumber,
  magic_level: NullableNumber,
  vocation: z.array(z.string()).optional(),
});

const SpellDataSchema = z.object({
  description: NullableString,
  has_rune_information: NullableBoolean,
  has_spell_information: NullableBoolean,
  image_url: NullableString,
  name: NullableString,
  rune_information: RuneInformationSchema.nullable().optional(),
  spell_id: NullableString,
  spell_information: SpellInformationSchema.nullable().optional(),
});

export const SpellInformationResponseSchema = z.object({
  information: InformationSchema.nullable().optional(),
  spell: SpellDataSchema.nullable(),
});

export type SpellInformationResponse = z.infer<typeof SpellInformationResponseSchema>;
export type SpellData = z.infer<typeof SpellDataSchema>;

// ──────────────────────────────────────────────────────────────────────────
// 6. /v4/highscores/:world/:category/:vocation/:page
// ──────────────────────────────────────────────────────────────────────────

export const HighscoreCategorySchema = z.enum([
  "achievements",
  "axefighting",
  "charmpoints",
  "clubfighting",
  "distancefighting",
  "experience",
  "fishing",
  "fistfighting",
  "goshnarstaint",
  "loyaltypoints",
  "magiclevel",
  "shielding",
  "swordfighting",
  "dromescore",
  "bosspoints",
  "bountypoints",
  "weeklytasks",
  "phosphorusrecord",
]);
export type HighscoreCategory = z.infer<typeof HighscoreCategorySchema>;

export const HighscoreVocationSchema = z.enum([
  "all",
  "knights",
  "paladins",
  "sorcerers",
  "druids",
  "monks",
]);
export type HighscoreVocation = z.infer<typeof HighscoreVocationSchema>;

const HighscoreEntrySchema = z.object({
  level: NullableNumber,
  name: NullableString,
  rank: NullableNumber,
  title: NullableString,
  value: NullableNumber,
  vocation: NullableString,
  world: NullableString,
});

const HighscorePageSchema = z.object({
  current_page: NullableNumber,
  total_pages: NullableNumber,
  total_records: NullableNumber,
});

const HighscoresContainerSchema = z.object({
  category: NullableString,
  highscore_age: NullableNumber,
  highscore_list: z.array(HighscoreEntrySchema).optional(),
  highscore_page: HighscorePageSchema.nullable().optional(),
  vocation: NullableString,
  world: NullableString,
});

export const HighscoresResponseSchema = z.object({
  highscores: HighscoresContainerSchema.nullable(),
  information: InformationSchema.nullable().optional(),
});

export type HighscoresResponse = z.infer<typeof HighscoresResponseSchema>;
export type Highscore = z.infer<typeof HighscoreEntrySchema>;

// ──────────────────────────────────────────────────────────────────────────
// 7. /v4/houses/:world/:town  +  /v4/house/:world/:house_id
// ──────────────────────────────────────────────────────────────────────────

const HousesAuctionSchema = z.object({
  current_bid: NullableNumber,
  finished: NullableBoolean,
  time_left: NullableString,
});

const HousesHouseItemSchema = z.object({
  auction: HousesAuctionSchema.nullable().optional(),
  auctioned: NullableBoolean,
  house_id: NullableNumber,
  name: NullableString,
  rent: NullableNumber,
  rented: NullableBoolean,
  size: NullableNumber,
});

const HousesHousesSchema = z.object({
  guildhall_list: z.array(HousesHouseItemSchema).optional(),
  house_list: z.array(HousesHouseItemSchema).optional(),
  town: NullableString,
  world: NullableString,
});

export const HousesOverviewResponseSchema = z.object({
  houses: HousesHousesSchema.nullable(),
  information: InformationSchema.nullable().optional(),
});

export type HousesOverviewResponse = z.infer<typeof HousesOverviewResponseSchema>;

const HouseAuctionDetailSchema = z.object({
  auction_end: NullableString,
  auction_ongoing: NullableBoolean,
  current_bid: NullableNumber,
  current_bidder: NullableString,
});

const HouseRentalDetailSchema = z.object({
  moving_date: NullableString,
  owner: NullableString,
  owner_sex: NullableString,
  paid_until: NullableString,
  transfer_accept: NullableBoolean,
  transfer_price: NullableNumber,
  transfer_receiver: NullableString,
});

const HouseStatusSchema = z.object({
  auction: HouseAuctionDetailSchema.nullable().optional(),
  is_auctioned: NullableBoolean,
  is_moving: NullableBoolean,
  is_rented: NullableBoolean,
  is_transfering: NullableBoolean,
  original: NullableString,
  rental: HouseRentalDetailSchema.nullable().optional(),
});

const HouseSchema = z.object({
  beds: NullableNumber,
  houseid: NullableNumber,
  img: NullableString,
  name: NullableString,
  rent: NullableNumber,
  size: NullableNumber,
  status: HouseStatusSchema.nullable().optional(),
  town: NullableString,
  type: NullableString,
  world: NullableString,
});

export const HouseResponseSchema = z.object({
  house: HouseSchema.nullable(),
  information: InformationSchema.nullable().optional(),
});

export type HouseResponse = z.infer<typeof HouseResponseSchema>;
export type House = z.infer<typeof HouseSchema>;

// ──────────────────────────────────────────────────────────────────────────
// 8. /v4/killstatistics/:world
// ──────────────────────────────────────────────────────────────────────────

const EntrySchema = z.object({
  last_day_killed: NullableNumber,
  last_day_players_killed: NullableNumber,
  last_week_killed: NullableNumber,
  last_week_players_killed: NullableNumber,
  race: NullableString,
});

const TotalSchema = z.object({
  last_day_killed: NullableNumber,
  last_day_players_killed: NullableNumber,
  last_week_killed: NullableNumber,
  last_week_players_killed: NullableNumber,
});

const KillStatisticsContainerSchema = z.object({
  entries: z.array(EntrySchema).optional(),
  total: TotalSchema.nullable().optional(),
  world: NullableString,
});

export const KillStatisticsResponseSchema = z.object({
  information: InformationSchema.nullable().optional(),
  killstatistics: KillStatisticsContainerSchema.nullable(),
});

export type KillStatisticsResponse = z.infer<typeof KillStatisticsResponseSchema>;

// ──────────────────────────────────────────────────────────────────────────
// 9. /v4/news/latest  +  /v4/news/archive  +  /v4/news/archive/:days
// ──────────────────────────────────────────────────────────────────────────

const NewsItemSchema = z.object({
  category: NullableString,
  date: NullableString,
  id: NullableNumber,
  news: NullableString,
  type: NullableString,
  url: NullableString,
  url_api: NullableString,
});

export const NewsListResponseSchema = z.object({
  information: InformationSchema.nullable().optional(),
  news: z.array(NewsItemSchema),
});

export type NewsListResponse = z.infer<typeof NewsListResponseSchema>;
export type NewsItem = z.infer<typeof NewsItemSchema>;

const NewsDetailSchema = z.object({
  category: NullableString,
  content: NullableString,
  content_html: NullableString,
  date: NullableString,
  id: NullableNumber,
  title: NullableString,
  type: NullableString,
  url: NullableString,
});

export const NewsResponseSchema = z.object({
  information: InformationSchema.nullable().optional(),
  news: NewsDetailSchema.nullable(),
});

export type NewsResponse = z.infer<typeof NewsResponseSchema>;
export type News = z.infer<typeof NewsDetailSchema>;

// ──────────────────────────────────────────────────────────────────────────
// 10. /v4/guild/:name  +  /v4/guilds/:world
// ──────────────────────────────────────────────────────────────────────────

const GuildhallSchema = z.object({
  name: NullableString,
  paid_until: NullableString,
  world: NullableString,
});

const GuildMemberSchema = z.object({
  joined: NullableString,
  level: NullableNumber,
  name: NullableString,
  rank: NullableString,
  status: NullableString,
  title: NullableString,
  vocation: NullableString,
});

const InvitedGuildMemberSchema = z.object({
  date: NullableString,
  name: NullableString,
});

const GuildSchema = z.object({
  active: NullableBoolean,
  description: NullableString,
  disband_condition: NullableString,
  disband_date: NullableString,
  founded: NullableString,
  guildhalls: z.array(GuildhallSchema).optional(),
  homepage: NullableString,
  in_war: NullableBoolean,
  invites: z.array(InvitedGuildMemberSchema).optional(),
  logo_url: NullableString,
  members: z.array(GuildMemberSchema).optional(),
  members_invited: NullableNumber,
  members_total: NullableNumber,
  name: NullableString,
  open_applications: NullableBoolean,
  players_offline: NullableNumber,
  players_online: NullableNumber,
  world: NullableString,
});

export const GuildResponseSchema = z.object({
  guild: GuildSchema.nullable(),
  information: InformationSchema.nullable().optional(),
});

export type GuildResponse = z.infer<typeof GuildResponseSchema>;
export type Guild = z.infer<typeof GuildSchema>;

const OverviewGuildSchema = z.object({
  description: NullableString,
  logo_url: NullableString,
  name: NullableString,
});
export type OverviewGuild = z.infer<typeof OverviewGuildSchema>;

const OverviewGuildsSchema = z.object({
  active: z.array(OverviewGuildSchema).optional(),
  formation: z.array(OverviewGuildSchema).optional(),
  world: NullableString,
});

export const GuildsOverviewResponseSchema = z.object({
  guilds: OverviewGuildsSchema.nullable(),
  information: InformationSchema.nullable().optional(),
});

export type GuildsOverviewResponse = z.infer<typeof GuildsOverviewResponseSchema>;

// ──────────────────────────────────────────────────────────────────────────
// 11. /v4/fansites
// ──────────────────────────────────────────────────────────────────────────

const ContentTypeSchema = z.object({
  statistics: NullableBoolean,
  texts: NullableBoolean,
  tools: NullableBoolean,
  wiki: NullableBoolean,
});

const SocialMediaSchema = z.object({
  discord: NullableBoolean,
  facebook: NullableBoolean,
  instagram: NullableBoolean,
  reddit: NullableBoolean,
  twitch: NullableBoolean,
  twitter: NullableBoolean,
  youtube: NullableBoolean,
});

const FansiteSchema = z.object({
  contact: NullableString,
  content_type: ContentTypeSchema.nullable().optional(),
  fansite_item: NullableBoolean,
  fansite_item_url: NullableString,
  homepage: NullableString,
  languages: z.array(z.string()).optional(),
  logo_url: NullableString,
  name: NullableString,
  social_media: SocialMediaSchema.nullable().optional(),
  specials: z.array(z.string()).optional(),
});

const FansitesContainerSchema = z.object({
  promoted: z.array(FansiteSchema).optional(),
  supported: z.array(FansiteSchema).optional(),
});

export const FansitesResponseSchema = z.object({
  fansites: FansitesContainerSchema.nullable(),
  information: InformationSchema.nullable().optional(),
});

export type FansitesResponse = z.infer<typeof FansitesResponseSchema>;
export type Fansite = z.infer<typeof FansiteSchema>;