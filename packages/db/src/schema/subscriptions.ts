import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * subscriptions (plan T83, arch §15.1) — stan subskrypcji Premium.
 *
 * Klucz: `discordId` (T78 Discord OAuth = jedyna tożsamość użytkownika).
 * Nie trzymamy danych płatniczych — te żyją u dostawcy (Lemon Squeezy /
 * Paddle jako Merchant of Record, T82). Tu tylko mirror stanu uprawnień.
 *
 * `tier`:
 *   - 'free'    → brak premium (jawny wiersz pozwala na override/ban)
 *   - 'premium' → aktywna subskrypcja
 *
 * `expiresAt` NULL = brak wygaśnięcia (np. lifetime grant / staff).
 */
export const subscriptionTierEnum = ["free", "premium"] as const;
export type SubscriptionTier = (typeof subscriptionTierEnum)[number];

export const subscriptions = pgTable(
  "subscriptions",
  {
    /** Discord user ID (snowflake) — klucz tożsamości z OAuth (T78). */
    discordId: varchar("discord_id", { length: 32 }).primaryKey(),
    tier: text("tier").notNull().default("free"),
    /** NULL = nigdy nie wygasa (lifetime / staff grant). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** ID subskrypcji u dostawcy MoR (Lemon Squeezy / Paddle). */
    providerSubscriptionId: varchar("provider_subscription_id", { length: 128 }),
    provider: varchar("provider", { length: 32 }),
    /** Cancel-at-period-end flag (user anulował, ale ma dostęp do końca okresu). */
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Szybkie "kto ma aktywne premium" (monitoring, statystyki).
    index("idx_sub_tier").on(table.tier),
    index("idx_sub_expires").on(table.expiresAt),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

/**
 * Czy wiersz subskrypcji daje dostęp premium w danym momencie?
 * Czysta funkcja — testowalna bez DB.
 */
export function isPremiumActive(
  row: Pick<Subscription, "tier" | "expiresAt"> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row) return false;
  if (row.tier !== "premium") return false;
  if (row.expiresAt === null) return true;
  return row.expiresAt.getTime() > now.getTime();
}
