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
export declare const subscriptionTierEnum: readonly ["free", "premium"];
export type SubscriptionTier = (typeof subscriptionTierEnum)[number];
export declare const subscriptions: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "subscriptions";
    schema: undefined;
    columns: {
        discordId: import("drizzle-orm/pg-core").PgColumn<{
            name: "discord_id";
            tableName: "subscriptions";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        tier: import("drizzle-orm/pg-core").PgColumn<{
            name: "tier";
            tableName: "subscriptions";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        expiresAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "expires_at";
            tableName: "subscriptions";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        providerSubscriptionId: import("drizzle-orm/pg-core").PgColumn<{
            name: "provider_subscription_id";
            tableName: "subscriptions";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        provider: import("drizzle-orm/pg-core").PgColumn<{
            name: "provider";
            tableName: "subscriptions";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        cancelAtPeriodEnd: import("drizzle-orm/pg-core").PgColumn<{
            name: "cancel_at_period_end";
            tableName: "subscriptions";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "subscriptions";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "subscriptions";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
/**
 * Czy wiersz subskrypcji daje dostęp premium w danym momencie?
 * Czysta funkcja — testowalna bez DB.
 */
export declare function isPremiumActive(row: Pick<Subscription, "tier" | "expiresAt"> | null | undefined, now?: Date): boolean;
//# sourceMappingURL=subscriptions.d.ts.map