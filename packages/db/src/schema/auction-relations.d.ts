import { imbuements } from './reference';
/**
 * Kategorie USP z tibia.com (arch §2.5):
 * 0=skill, 1=gold, 2=achievements, 3=blessings, 4=store items,
 * 5=mounts/outfits/slots, 6=imbuements, 7=charms, 11=world transfer, 13=boss points
 */
export declare const uspCategoryEnum: import("drizzle-orm/pg-core").PgEnum<["skill", "gold", "achievement", "blessing", "store", "cosmetic", "imbuement", "charm", "other", "world_transfer", "rare_item", "progression", "boss"]>;
export declare const skillLoyaltyEnum: import("drizzle-orm/pg-core").PgEnum<["magic", "club", "fist", "sword", "axe", "distance", "shielding", "fishing"]>;
export declare const auctionItems: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "auction_items";
    schema: undefined;
    columns: {
        auctionId: import("drizzle-orm/pg-core").PgColumn<{
            name: "auction_id";
            tableName: "auction_items";
            dataType: "bigint";
            columnType: "PgBigInt64";
            data: bigint;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        itemId: import("drizzle-orm/pg-core").PgColumn<{
            name: "item_id";
            tableName: "auction_items";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        quantity: import("drizzle-orm/pg-core").PgColumn<{
            name: "quantity";
            tableName: "auction_items";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
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
        tier: import("drizzle-orm/pg-core").PgColumn<{
            name: "tier";
            tableName: "auction_items";
            dataType: "number";
            columnType: "PgSmallInt";
            data: number;
            driverParam: string | number;
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
    };
    dialect: "pg";
}>;
export declare const auctionOutfits: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "auction_outfits";
    schema: undefined;
    columns: {
        auctionId: import("drizzle-orm/pg-core").PgColumn<{
            name: "auction_id";
            tableName: "auction_outfits";
            dataType: "bigint";
            columnType: "PgBigInt64";
            data: bigint;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        outfitId: import("drizzle-orm/pg-core").PgColumn<{
            name: "outfit_id";
            tableName: "auction_outfits";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        addons: import("drizzle-orm/pg-core").PgColumn<{
            name: "addons";
            tableName: "auction_outfits";
            dataType: "number";
            columnType: "PgSmallInt";
            data: number;
            driverParam: string | number;
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
export declare const auctionMounts: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "auction_mounts";
    schema: undefined;
    columns: {
        auctionId: import("drizzle-orm/pg-core").PgColumn<{
            name: "auction_id";
            tableName: "auction_mounts";
            dataType: "bigint";
            columnType: "PgBigInt64";
            data: bigint;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        mountId: import("drizzle-orm/pg-core").PgColumn<{
            name: "mount_id";
            tableName: "auction_mounts";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
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
export declare const auctionQuests: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "auction_quests";
    schema: undefined;
    columns: {
        auctionId: import("drizzle-orm/pg-core").PgColumn<{
            name: "auction_id";
            tableName: "auction_quests";
            dataType: "bigint";
            columnType: "PgBigInt64";
            data: bigint;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        questId: import("drizzle-orm/pg-core").PgColumn<{
            name: "quest_id";
            tableName: "auction_quests";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
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
export declare const auctionBosses: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "auction_bosses";
    schema: undefined;
    columns: {
        auctionId: import("drizzle-orm/pg-core").PgColumn<{
            name: "auction_id";
            tableName: "auction_bosses";
            dataType: "bigint";
            columnType: "PgBigInt64";
            data: bigint;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        bossId: import("drizzle-orm/pg-core").PgColumn<{
            name: "boss_id";
            tableName: "auction_bosses";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
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
export declare const auctionUsps: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "auction_usps";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "auction_usps";
            dataType: "bigint";
            columnType: "PgBigInt64";
            data: bigint;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: "always";
            generated: undefined;
        }, {}, {}>;
        auctionId: import("drizzle-orm/pg-core").PgColumn<{
            name: "auction_id";
            tableName: "auction_usps";
            dataType: "bigint";
            columnType: "PgBigInt64";
            data: bigint;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        category: import("drizzle-orm/pg-core").PgColumn<{
            name: "category";
            tableName: "auction_usps";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "store" | "other" | "skill" | "cosmetic" | "progression" | "gold" | "achievement" | "blessing" | "imbuement" | "charm" | "world_transfer" | "rare_item" | "boss";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["skill", "gold", "achievement", "blessing", "store", "cosmetic", "imbuement", "charm", "other", "world_transfer", "rare_item", "progression", "boss"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        text: import("drizzle-orm/pg-core").PgColumn<{
            name: "text";
            tableName: "auction_usps";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        sortOrder: import("drizzle-orm/pg-core").PgColumn<{
            name: "sort_order";
            tableName: "auction_usps";
            dataType: "number";
            columnType: "PgSmallInt";
            data: number;
            driverParam: string | number;
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
export declare const auctionSkillLoyalty: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "auction_skill_loyalty";
    schema: undefined;
    columns: {
        auctionId: import("drizzle-orm/pg-core").PgColumn<{
            name: "auction_id";
            tableName: "auction_skill_loyalty";
            dataType: "bigint";
            columnType: "PgBigInt64";
            data: bigint;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        skill: import("drizzle-orm/pg-core").PgColumn<{
            name: "skill";
            tableName: "auction_skill_loyalty";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "magic" | "club" | "fist" | "sword" | "axe" | "distance" | "shielding" | "fishing";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["magic", "club", "fist", "sword", "axe", "distance", "shielding", "fishing"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        baseValue: import("drizzle-orm/pg-core").PgColumn<{
            name: "base_value";
            tableName: "auction_skill_loyalty";
            dataType: "number";
            columnType: "PgSmallInt";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        loyaltyPct: import("drizzle-orm/pg-core").PgColumn<{
            name: "loyalty_pct";
            tableName: "auction_skill_loyalty";
            dataType: "number";
            columnType: "PgSmallInt";
            data: number;
            driverParam: string | number;
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
    };
    dialect: "pg";
}>;
export type AuctionItem = typeof auctionItems.$inferSelect;
export type NewAuctionItem = typeof auctionItems.$inferInsert;
export type AuctionOutfit = typeof auctionOutfits.$inferSelect;
export type NewAuctionOutfit = typeof auctionOutfits.$inferInsert;
export type AuctionMount = typeof auctionMounts.$inferSelect;
export type NewAuctionMount = typeof auctionMounts.$inferInsert;
export type AuctionQuest = typeof auctionQuests.$inferSelect;
export type NewAuctionQuest = typeof auctionQuests.$inferInsert;
export type AuctionBoss = typeof auctionBosses.$inferSelect;
export type NewAuctionBoss = typeof auctionBosses.$inferInsert;
export type AuctionUsp = typeof auctionUsps.$inferSelect;
export type NewAuctionUsp = typeof auctionUsps.$inferInsert;
export type AuctionSkillLoyalty = typeof auctionSkillLoyalty.$inferSelect;
export type NewAuctionSkillLoyalty = typeof auctionSkillLoyalty.$inferInsert;
/**
 * Alias dla imbuements relacji — referencja używana przez scraper.
 * Nie ma dedykowanej tabeli `auction_imbuements` (proporcja 11/23 wystarcza),
 * ale eksportujemy import dla czytelności w kodzie scrapera.
 */
export { imbuements as auctionImbuements };
//# sourceMappingURL=auction-relations.d.ts.map