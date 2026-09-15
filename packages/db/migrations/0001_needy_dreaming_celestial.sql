CREATE TABLE IF NOT EXISTS "subscriptions" (
	"discord_id" varchar(32) PRIMARY KEY NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_subscription_id" varchar(128),
	"provider" varchar(32),
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"discord_id" varchar(32) PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"global_name" text,
	"avatar_url" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sub_tier" ON "subscriptions" USING btree ("tier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sub_expires" ON "subscriptions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_username" ON "users" USING btree ("username");