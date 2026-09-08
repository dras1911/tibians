CREATE TYPE "public"."battleye" AS ENUM('protected', 'initially protected', 'not protected');--> statement-breakpoint
CREATE TYPE "public"."boss_difficulty" AS ENUM('trivial', 'harmless', 'easy', 'medium', 'hard', 'challenging', 'demanding', 'insane');--> statement-breakpoint
CREATE TYPE "public"."imbuement_category" AS ENUM('damage', 'protection', 'support', 'skill');--> statement-breakpoint
CREATE TYPE "public"."imbuement_tier" AS ENUM('basic', 'powerful', 'epic');--> statement-breakpoint
CREATE TYPE "public"."item_category" AS ENUM('weapon', 'armor', 'store', 'quest', 'rune', 'consumable', 'container', 'decoration', 'valuable', 'other');--> statement-breakpoint
CREATE TYPE "public"."pvp_type" AS ENUM('Open PvP', 'Optional PvP', 'Hardcore PvP', 'Retro Open PvP', 'Retro Hardcore PvP');--> statement-breakpoint
CREATE TYPE "public"."quest_category" AS ENUM('access', 'achievement', 'boss', 'hunt', 'exploration', 'other');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('EU', 'NA', 'BR');--> statement-breakpoint
CREATE TYPE "public"."auction_bid_type" AS ENUM('current', 'minimum');--> statement-breakpoint
CREATE TYPE "public"."auction_sex" AS ENUM('M', 'F');--> statement-breakpoint
CREATE TYPE "public"."auction_status" AS ENUM('active', 'finished', 'cancelled', 'sold');--> statement-breakpoint
CREATE TYPE "public"."skill_loyalty_skill" AS ENUM('magic', 'club', 'fist', 'sword', 'axe', 'distance', 'shielding', 'fishing');--> statement-breakpoint
CREATE TYPE "public"."usp_category" AS ENUM('skill', 'gold', 'achievement', 'blessing', 'store', 'cosmetic', 'imbuement', 'charm', 'other', 'world_transfer', 'rare_item', 'progression', 'boss');--> statement-breakpoint
CREATE TYPE "public"."valuation_category" AS ENUM('base', 'feature', 'skill', 'item', 'cosmetic', 'progression', 'asset');--> statement-breakpoint
CREATE TYPE "public"."scrape_error_type" AS ENUM('timeout', 'rate_limit', 'parse', 'http_4xx', 'http_5xx', 'db', 'other');--> statement-breakpoint
CREATE TYPE "public"."scrape_run_status" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."scrape_run_type" AS ENUM('full', 'ending_soon', 'detail', 'history', 'reference');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bosses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_pl" text,
	"boss_points" smallint DEFAULT 0 NOT NULL,
	"difficulty" "boss_difficulty",
	"cooldown_h" smallint,
	"image_url" text,
	"is_boostable" boolean DEFAULT false NOT NULL,
	CONSTRAINT "bosses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "imbuements" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_pl" text NOT NULL,
	"tier" "imbuement_tier" NOT NULL,
	"category" "imbuement_category" NOT NULL,
	"description" text,
	CONSTRAINT "imbuements_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_pl" text,
	"category" "item_category" NOT NULL,
	"market_price" integer,
	"tc_value" integer,
	"is_store_item" boolean DEFAULT false NOT NULL,
	"is_rare" boolean DEFAULT false NOT NULL,
	"image_url" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mounts" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_pl" text,
	"is_store" boolean DEFAULT false NOT NULL,
	"is_rare" boolean DEFAULT false NOT NULL,
	"image_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outfits" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_pl" text,
	"is_store" boolean DEFAULT false NOT NULL,
	"is_rare" boolean DEFAULT false NOT NULL,
	"image_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quests" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_pl" text,
	"category" "quest_category" NOT NULL,
	"is_notable" boolean DEFAULT false NOT NULL,
	CONSTRAINT "quests_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worlds" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" "region" NOT NULL,
	"pvp_type" "pvp_type" NOT NULL,
	"battleye" "battleye" NOT NULL,
	"is_retro" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"players_online" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worlds_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auctions" (
	"auction_id" bigint PRIMARY KEY NOT NULL,
	"character_name" text NOT NULL,
	"level" smallint NOT NULL,
	"vocation" text NOT NULL,
	"vocation_base" text NOT NULL,
	"sex" "auction_sex" NOT NULL,
	"world_id" smallint NOT NULL,
	"outfit_id" integer,
	"bid" integer NOT NULL,
	"bid_type" "auction_bid_type" NOT NULL,
	"auction_start" timestamp with time zone NOT NULL,
	"auction_end" timestamp with time zone NOT NULL,
	"status" "auction_status" DEFAULT 'active' NOT NULL,
	"final_price" integer,
	"skill_magic" smallint DEFAULT 0 NOT NULL,
	"skill_club" smallint DEFAULT 0 NOT NULL,
	"skill_fist" smallint DEFAULT 0 NOT NULL,
	"skill_sword" smallint DEFAULT 0 NOT NULL,
	"skill_axe" smallint DEFAULT 0 NOT NULL,
	"skill_distance" smallint DEFAULT 0 NOT NULL,
	"skill_shielding" smallint DEFAULT 0 NOT NULL,
	"skill_fishing" smallint DEFAULT 0 NOT NULL,
	"charm_points" integer DEFAULT 0 NOT NULL,
	"charm_points_unused" integer DEFAULT 0 NOT NULL,
	"minor_charm_echoes" integer DEFAULT 0 NOT NULL,
	"boss_points" integer DEFAULT 0 NOT NULL,
	"imbuements_unlocked" smallint DEFAULT 0 NOT NULL,
	"imbuements_total" smallint DEFAULT 23 NOT NULL,
	"quests_completed" smallint DEFAULT 0 NOT NULL,
	"quests_total" smallint DEFAULT 42 NOT NULL,
	"achievement_points" integer DEFAULT 0 NOT NULL,
	"animus_masteries" smallint DEFAULT 0 NOT NULL,
	"gems_lesser" smallint DEFAULT 0 NOT NULL,
	"gems_regular" smallint DEFAULT 0 NOT NULL,
	"gems_greater" smallint DEFAULT 0 NOT NULL,
	"store_outfits_count" smallint DEFAULT 0 NOT NULL,
	"store_mounts_count" smallint DEFAULT 0 NOT NULL,
	"store_items_count" smallint DEFAULT 0 NOT NULL,
	"hirelings_count" smallint DEFAULT 0 NOT NULL,
	"gold_total" bigint DEFAULT 0 NOT NULL,
	"tc_invested" integer,
	"has_soul_war" boolean DEFAULT false NOT NULL,
	"has_primal_ordeal" boolean DEFAULT false NOT NULL,
	"has_world_transfer" boolean DEFAULT false NOT NULL,
	"has_prey_slot" boolean DEFAULT false NOT NULL,
	"has_charm_expansion" boolean DEFAULT false NOT NULL,
	"has_weekly_task_exp" boolean DEFAULT false NOT NULL,
	"has_twist_of_fate" boolean DEFAULT false NOT NULL,
	"blessings_active" smallint DEFAULT 0 NOT NULL,
	"estimated_value" integer,
	"value_confidence" numeric(3, 2),
	"price_per_level" numeric(10, 2) GENERATED ALWAYS AS (("auctions"."bid")::numeric / NULLIF("auctions"."level", 0)) STORED,
	"raw_json" jsonb NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', "auctions"."character_name")) STORED,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auction_bosses" (
	"auction_id" bigint NOT NULL,
	"boss_id" integer NOT NULL,
	CONSTRAINT "auction_bosses_auction_id_boss_id_pk" PRIMARY KEY("auction_id","boss_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auction_items" (
	"auction_id" bigint NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"tier" smallint,
	CONSTRAINT "auction_items_auction_id_item_id_tier_pk" PRIMARY KEY("auction_id","item_id","tier")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auction_mounts" (
	"auction_id" bigint NOT NULL,
	"mount_id" integer NOT NULL,
	CONSTRAINT "auction_mounts_auction_id_mount_id_pk" PRIMARY KEY("auction_id","mount_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auction_outfits" (
	"auction_id" bigint NOT NULL,
	"outfit_id" integer NOT NULL,
	"addons" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "auction_outfits_auction_id_outfit_id_pk" PRIMARY KEY("auction_id","outfit_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auction_quests" (
	"auction_id" bigint NOT NULL,
	"quest_id" integer NOT NULL,
	CONSTRAINT "auction_quests_auction_id_quest_id_pk" PRIMARY KEY("auction_id","quest_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auction_skill_loyalty" (
	"auction_id" bigint NOT NULL,
	"skill" "skill_loyalty_skill" NOT NULL,
	"base_value" smallint NOT NULL,
	"loyalty_pct" smallint,
	CONSTRAINT "auction_skill_loyalty_auction_id_skill_pk" PRIMARY KEY("auction_id","skill")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auction_usps" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auction_usps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"auction_id" bigint NOT NULL,
	"category" "usp_category" NOT NULL,
	"text" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auction_price_history" (
	"auction_id" bigint NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"bid" integer NOT NULL,
	CONSTRAINT "auction_price_history_auction_id_recorded_at_pk" PRIMARY KEY("auction_id","recorded_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calculator_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calculator_saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calc_slug" text NOT NULL,
	"share_token" text NOT NULL,
	"name" text,
	"inputs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculator_saves_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "valuation_history" (
	"auction_id" bigint NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"estimated_tc" integer NOT NULL,
	"breakdown" jsonb NOT NULL,
	CONSTRAINT "valuation_history_auction_id_computed_at_pk" PRIMARY KEY("auction_id","computed_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "valuation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_key" text NOT NULL,
	"category" "valuation_category" NOT NULL,
	"weight" numeric(10, 4) NOT NULL,
	"formula" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valuation_rules_rule_key_unique" UNIQUE("rule_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scrape_errors" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scrape_errors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" bigint,
	"url" text,
	"auction_id" bigint,
	"error_type" "scrape_error_type" NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scrape_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scrape_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_type" "scrape_run_type" NOT NULL,
	"status" "scrape_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"pages_fetched" integer DEFAULT 0 NOT NULL,
	"auctions_found" integer DEFAULT 0 NOT NULL,
	"auctions_new" integer DEFAULT 0 NOT NULL,
	"auctions_upd" integer DEFAULT 0 NOT NULL,
	"auctions_arch" integer DEFAULT 0 NOT NULL,
	"errors_count" integer DEFAULT 0 NOT NULL,
	"error_summary" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blog_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body_mdx" text NOT NULL,
	"thumbnail" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"published_at" timestamp with time zone,
	"is_published" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auctions" ADD CONSTRAINT "auctions_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auction_bosses" ADD CONSTRAINT "auction_bosses_auction_id_auctions_auction_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("auction_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auction_bosses" ADD CONSTRAINT "auction_bosses_boss_id_bosses_id_fk" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auction_items" ADD CONSTRAINT "auction_items_auction_id_auctions_auction_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("auction_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auction_items" ADD CONSTRAINT "auction_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auction_mounts" ADD CONSTRAINT "auction_mounts_auction_id_auctions_auction_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("auction_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auction_mounts" ADD CONSTRAINT "auction_mounts_mount_id_mounts_id_fk" FOREIGN KEY ("mount_id") REFERENCES "public"."mounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auction_outfits" ADD CONSTRAINT "auction_outfits_auction_id_auctions_auction_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("auction_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auction_outfits" ADD CONSTRAINT "auction_outfits_outfit_id_outfits_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."outfits"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auction_quests" ADD CONSTRAINT "auction_quests_auction_id_auctions_auction_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("auction_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auction_quests" ADD CONSTRAINT "auction_quests_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auction_skill_loyalty" ADD CONSTRAINT "auction_skill_loyalty_auction_id_auctions_auction_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("auction_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auction_usps" ADD CONSTRAINT "auction_usps_auction_id_auctions_auction_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("auction_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "valuation_history" ADD CONSTRAINT "valuation_history_auction_id_auctions_auction_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("auction_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scrape_errors" ADD CONSTRAINT "scrape_errors_run_id_scrape_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bosses_boostable" ON "bosses" USING btree ("id") WHERE is_boostable = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bosses_difficulty" ON "bosses" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_imbuements_category" ON "imbuements" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_imbuements_tier" ON "imbuements" USING btree ("tier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_items_name_trgm" ON "items" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_items_rare" ON "items" USING btree ("id") WHERE is_rare = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_items_category" ON "items" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_items_store" ON "items" USING btree ("id") WHERE is_store_item = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mounts_rare" ON "mounts" USING btree ("id") WHERE is_rare = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mounts_store" ON "mounts" USING btree ("id") WHERE is_store = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outfits_rare" ON "outfits" USING btree ("id") WHERE is_rare = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outfits_store" ON "outfits" USING btree ("id") WHERE is_store = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quests_category" ON "quests" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quests_notable" ON "quests" USING btree ("id") WHERE is_notable = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_worlds_region" ON "worlds" USING btree ("region");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_worlds_active" ON "worlds" USING btree ("is_active") WHERE is_active = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_active_end" ON "auctions" USING btree ("auction_end") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_active_voc_lvl" ON "auctions" USING btree ("vocation_base","level") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_active_world" ON "auctions" USING btree ("world_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_active_bid" ON "auctions" USING btree ("bid") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_active_magic" ON "auctions" USING btree ("skill_magic") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_active_lvl" ON "auctions" USING btree ("level") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_filter_main" ON "auctions" USING btree ("vocation_base","level","bid") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_soulwar" ON "auctions" USING btree ("auction_id") WHERE status = 'active' AND has_soul_war = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_primal" ON "auctions" USING btree ("auction_id") WHERE status = 'active' AND has_primal_ordeal = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_wtransfer" ON "auctions" USING btree ("auction_id") WHERE status = 'active' AND has_world_transfer = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_search" ON "auctions" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_raw" ON "auctions" USING gin ("raw_json" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_finished_end" ON "auctions" USING btree ("auction_end") WHERE status = 'finished';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_au_name" ON "auctions" USING btree ("character_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ab_boss" ON "auction_bosses" USING btree ("boss_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_item" ON "auction_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_am_mount" ON "auction_mounts" USING btree ("mount_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aq_quest" ON "auction_quests" USING btree ("quest_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_asl_skill" ON "auction_skill_loyalty" USING btree ("skill");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usp_auction" ON "auction_usps" USING btree ("auction_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usp_category" ON "auction_usps" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cs_slug" ON "calculator_saves" USING btree ("calc_slug","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vh_estimated" ON "valuation_history" USING btree ("estimated_tc");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vr_category" ON "valuation_rules" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vr_active" ON "valuation_rules" USING btree ("rule_key") WHERE is_active = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_se_run" ON "scrape_errors" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_se_auction" ON "scrape_errors" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_se_type" ON "scrape_errors" USING btree ("error_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_se_recent" ON "scrape_errors" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sr_recent" ON "scrape_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_blog_slug_locale" ON "blog_posts" USING btree ("slug","locale");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_blog_published" ON "blog_posts" USING btree ("published_at") WHERE is_published = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_blog_locale" ON "blog_posts" USING btree ("locale");