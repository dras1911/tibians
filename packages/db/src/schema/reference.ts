/**
 * Reference data — statyczne, rzadko się zmieniające, agresywnie cache'owane.
 *
 * Zasada arch §7.1 pkt 4: reference data osobno — normalizuje FK, umożliwia
 * agresywny cache i twardą walidację przy scraperze.
 *
 * UWAGA:
 * - `items`, `outfits`, `mounts` używają `id` z klienta Tibii (client_id) jako PK —
 *   identyfikatory stabilne między wersjami klienta.
 * - `imbuements`, `quests`, `bosses` używają surrogate PK (SERIAL/SMALLSERIAL)
 *   bo Tibia nie ma stabilnego ID dla tych bytów.
 * - `pg_trgm` jest wymagane dla fuzzy autocomplete na `items.name` — migracja
 *   inicjalizacyjna tworzy `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  smallint,
  smallserial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/* ════════════════════════════════════════════════════════════════
 *  ENUMS (TEXT-backed — zgodne z istniejącymi danymi scrapera)
 * ════════════════════════════════════════════════════════════════ */

export const regionEnum = pgEnum("region", ["EU", "NA", "BR", "OCE"]);

export const pvpTypeEnum = pgEnum("pvp_type", [
  "Open PvP",
  "Optional PvP",
  "Hardcore PvP",
  "Retro Open PvP",
  "Retro Hardcore PvP",
]);

export const battleyeEnum = pgEnum("battleye", [
  "protected",
  "initially protected",
  "not protected",
]);

export const itemCategoryEnum = pgEnum("item_category", [
  "weapon",
  "armor",
  "store",
  "quest",
  "rune",
  "consumable",
  "container",
  "decoration",
  "valuable",
  "other",
]);

export const imbuementTierEnum = pgEnum("imbuement_tier", ["basic", "powerful", "epic"]);

export const imbuementCategoryEnum = pgEnum("imbuement_category", [
  "damage",
  "protection",
  "support",
  "skill",
]);

export const questCategoryEnum = pgEnum("quest_category", [
  "access",
  "achievement",
  "boss",
  "hunt",
  "exploration",
  "other",
]);

export const bossDifficultyEnum = pgEnum("boss_difficulty", [
  "trivial",
  "harmless",
  "easy",
  "medium",
  "hard",
  "challenging",
  "demanding",
  "insane",
]);

/* ════════════════════════════════════════════════════════════════
 *  WORLDS
 *  Cache'owane 24h (arch §8.1); dane z TibiaData self-host.
 * ════════════════════════════════════════════════════════════════ */

export const worlds = pgTable(
  "worlds",
  {
    id: smallserial("id").primaryKey(),
    name: text("name").notNull().unique(),
    // NULL-owalne: harvest aukcji wstawia tylko (id, name); pełne dane
    // (region/pvp/battleye) uzupełnia scraper referencji z TibiaData.
    region: regionEnum("region"),
    pvpType: pvpTypeEnum("pvp_type"),
    battleye: battleyeEnum("battleye"),
    isRetro: boolean("is_retro").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    playersOnline: integer("players_online"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_worlds_region").on(table.region),
    index("idx_worlds_active")
      .on(table.isActive)
      .where(sql`is_active = true`),
  ],
);

/* ════════════════════════════════════════════════════════════════
 *  ITEMS
 *  ID = client_id z Tibii (stabilne). `name_pl` z Intibia lub ręcznie.
 *  fuzzy autocomplete via pg_trgm.
 * ════════════════════════════════════════════════════════════════ */

export const items = pgTable(
  "items",
  {
    id: integer("id").primaryKey(), // client_id z Tibii (np. 3079, 26019)
    name: text("name").notNull(),
    namePl: text("name_pl"),
    category: itemCategoryEnum("category").notNull(),
    marketPrice: integer("market_price"), // średnia cena rynkowa w gold
    tcValue: integer("tc_value"), // szacowana wartość w TC (do waloryzacji)
    isStoreItem: boolean("is_store_item").notNull().default(false),
    isRare: boolean("is_rare").notNull().default(false), // napędza tagi „rzadkie przedmioty"
    imageUrl: text("image_url").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // fuzzy autocomplete — wymaga CREATE EXTENSION pg_trgm (seed migration)
    index("idx_items_name_trgm").using("gin", sql`${table.name} gin_trgm_ops`),
    // partial index na rare — mały, szybki
    index("idx_items_rare")
      .on(table.id)
      .where(sql`is_rare = true`),
    index("idx_items_category").on(table.category),
    index("idx_items_store")
      .on(table.id)
      .where(sql`is_store_item = true`),
  ],
);

/* ════════════════════════════════════════════════════════════════
 *  OUTFITS / MOUNTS
 *  ID = outfit_id / mount_id z Tibii.
 * ════════════════════════════════════════════════════════════════ */

export const outfits = pgTable(
  "outfits",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    namePl: text("name_pl"),
    isStore: boolean("is_store").notNull().default(false),
    isRare: boolean("is_rare").notNull().default(false),
    imageUrl: text("image_url").notNull(),
  },
  (table) => [
    index("idx_outfits_rare")
      .on(table.id)
      .where(sql`is_rare = true`),
    index("idx_outfits_store")
      .on(table.id)
      .where(sql`is_store = true`),
  ],
);

export const mounts = pgTable(
  "mounts",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    namePl: text("name_pl"),
    isStore: boolean("is_store").notNull().default(false),
    isRare: boolean("is_rare").notNull().default(false),
    imageUrl: text("image_url").notNull(),
  },
  (table) => [
    index("idx_mounts_rare")
      .on(table.id)
      .where(sql`is_rare = true`),
    index("idx_mounts_store")
      .on(table.id)
      .where(sql`is_store = true`),
  ],
);

/* ════════════════════════════════════════════════════════════════
 *  IMBUEMENTS
 *  Słownik PL z Intibia (arch §2.3). 23 sloty w grze (max tier=3).
 * ════════════════════════════════════════════════════════════════ */

export const imbuements = pgTable(
  "imbuements",
  {
    id: smallserial("id").primaryKey(),
    name: text("name").notNull().unique(), // 'Vampirism'
    namePl: text("name_pl").notNull(), // 'Wysysanie życia'
    tier: imbuementTierEnum("tier").notNull(), // 1|2|3 (basic/powerful/epic)
    category: imbuementCategoryEnum("category").notNull(),
    description: text("description"),
  },
  (table) => [
    index("idx_imbuements_category").on(table.category),
    index("idx_imbuements_tier").on(table.tier),
  ],
);

/* ════════════════════════════════════════════════════════════════
 *  QUESTS
 *  Liczone do „Quests 28/42" — `is_notable` flaguje te które wliczamy.
 * ════════════════════════════════════════════════════════════════ */

export const quests = pgTable(
  "quests",
  {
    id: smallserial("id").primaryKey(),
    name: text("name").notNull().unique(),
    namePl: text("name_pl"),
    category: questCategoryEnum("category").notNull(),
    isNotable: boolean("is_notable").notNull().default(false),
  },
  (table) => [
    index("idx_quests_category").on(table.category),
    index("idx_quests_notable")
      .on(table.id)
      .where(sql`is_notable = true`),
  ],
);

/* ════════════════════════════════════════════════════════════════
 *  BOSSES
 *  Dane z TibiaData boostable + boss points z gry.
 * ════════════════════════════════════════════════════════════════ */

export const bosses = pgTable(
  "bosses",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    namePl: text("name_pl"),
    bossPoints: smallint("boss_points").notNull().default(0),
    difficulty: bossDifficultyEnum("difficulty"),
    cooldownH: smallint("cooldown_h"),
    imageUrl: text("image_url"),
    isBoostable: boolean("is_boostable").notNull().default(false),
  },
  (table) => [
    index("idx_bosses_boostable")
      .on(table.id)
      .where(sql`is_boostable = true`),
    index("idx_bosses_difficulty").on(table.difficulty),
  ],
);

/* ════════════════════════════════════════════════════════════════
 *  TYPE INFERENCE — referencje dla type-safety w queries
 * ════════════════════════════════════════════════════════════════ */

export type World = typeof worlds.$inferSelect;
export type NewWorld = typeof worlds.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Outfit = typeof outfits.$inferSelect;
export type NewOutfit = typeof outfits.$inferInsert;
export type Mount = typeof mounts.$inferSelect;
export type NewMount = typeof mounts.$inferInsert;
export type Imbuement = typeof imbuements.$inferSelect;
export type NewImbuement = typeof imbuements.$inferInsert;
export type Quest = typeof quests.$inferSelect;
export type NewQuest = typeof quests.$inferInsert;
export type Boss = typeof bosses.$inferSelect;
export type NewBoss = typeof bosses.$inferInsert;
