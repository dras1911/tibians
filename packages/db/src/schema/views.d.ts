export declare const mvFacetCounts: import("drizzle-orm/pg-core").PgMaterializedViewWithSelection<"mv_facet_counts", true, {
    vocationBase: import("drizzle-orm/pg-core").PgColumn<{
        name: "vocation_base";
        tableName: "mv_facet_counts";
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
    total: import("drizzle-orm/pg-core").PgColumn<{
        name: "total";
        tableName: "mv_facet_counts";
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
    withSoulWar: import("drizzle-orm/pg-core").PgColumn<{
        name: "with_soul_war";
        tableName: "mv_facet_counts";
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
    withPrimal: import("drizzle-orm/pg-core").PgColumn<{
        name: "with_primal";
        tableName: "mv_facet_counts";
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
    withTransfer: import("drizzle-orm/pg-core").PgColumn<{
        name: "with_transfer";
        tableName: "mv_facet_counts";
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
    minLevel: import("drizzle-orm/pg-core").PgColumn<{
        name: "min_level";
        tableName: "mv_facet_counts";
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
    maxLevel: import("drizzle-orm/pg-core").PgColumn<{
        name: "max_level";
        tableName: "mv_facet_counts";
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
    minBid: import("drizzle-orm/pg-core").PgColumn<{
        name: "min_bid";
        tableName: "mv_facet_counts";
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
    maxBid: import("drizzle-orm/pg-core").PgColumn<{
        name: "max_bid";
        tableName: "mv_facet_counts";
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
    medianBid: import("drizzle-orm/pg-core").PgColumn<{
        name: "median_bid";
        tableName: "mv_facet_counts";
        dataType: "string";
        columnType: "PgNumeric";
        data: string;
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
}>;
/**
 * SQL do zbudowania widoku + UNIQUE INDEX.
 * Wywoływane z migracji początkowej (`0001_init.sql`) przez drizzle-kit.
 *
 * UWAGA: Drizzle Kit NIE wygeneruje tego automatycznie dla `pgMaterializedView` —
 * musimy dodać ręcznie w custom migration SQL.
 */
export declare const MV_FACET_COUNTS_DDL: import("drizzle-orm").SQL<unknown>;
/**
 * UNIQUE INDEX — wymóg `REFRESH MATERIALIZED VIEW CONCURRENTLY`.
 * Bez tego REFRESH CONCURRENTLY rzuci:
 *   "cannot refresh materialized view concurrently without unique index"
 */
export declare const MV_FACET_COUNTS_INDEX_DDL: import("drizzle-orm").SQL<unknown>;
/**
 * Polecenie do odświeżenia po każdym full scrape.
 * Wywoływane przez scraper na koniec runu:
 *   await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts;`);
 */
export declare const MV_FACET_COUNTS_REFRESH: import("drizzle-orm").SQL<unknown>;
export type MvFacetCount = {
    vocationBase: string;
    total: number;
    withSoulWar: number;
    withPrimal: number;
    withTransfer: number;
    minLevel: number;
    maxLevel: number;
    minBid: number;
    maxBid: number;
    medianBid: string;
};
//# sourceMappingURL=views.d.ts.map