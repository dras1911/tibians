export declare const auctionPriceHistory: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "auction_price_history";
    schema: undefined;
    columns: {
        auctionId: import("drizzle-orm/pg-core").PgColumn<{
            name: "auction_id";
            tableName: "auction_price_history";
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
        recordedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "recorded_at";
            tableName: "auction_price_history";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
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
        bid: import("drizzle-orm/pg-core").PgColumn<{
            name: "bid";
            tableName: "auction_price_history";
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
export type AuctionPriceHistoryPoint = typeof auctionPriceHistory.$inferSelect;
export type NewAuctionPriceHistoryPoint = typeof auctionPriceHistory.$inferInsert;
//# sourceMappingURL=time-series.d.ts.map