import { z } from 'zod';
export declare const calculatorConfig: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "calculator_config";
    schema: undefined;
    columns: {
        key: import("drizzle-orm/pg-core").PgColumn<{
            name: "key";
            tableName: "calculator_config";
            dataType: "string";
            columnType: "PgText";
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
        value: import("drizzle-orm/pg-core").PgColumn<{
            name: "value";
            tableName: "calculator_config";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown;
            driverParam: unknown;
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
        description: import("drizzle-orm/pg-core").PgColumn<{
            name: "description";
            tableName: "calculator_config";
            dataType: "string";
            columnType: "PgText";
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
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "calculator_config";
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
/**
 * Walidacja wartości configa (kolumna JSONB) przy odczycie przez `getConfig`.
 *
 * Union: number | string | boolean | object (rekord klucz→wartość).
 * Corrupted DB value → `safeParse` fail → loader loguje warning i zwraca
 * null (NIE crash).
 */
export declare const calculatorConfigValueSchema: z.ZodUnion<[z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodRecord<z.ZodString, z.ZodUnknown>]>;
export type CalculatorConfigValue = z.infer<typeof calculatorConfigValueSchema>;
export type CalculatorConfig = typeof calculatorConfig.$inferSelect;
export type NewCalculatorConfig = typeof calculatorConfig.$inferInsert;
//# sourceMappingURL=calculator-config.d.ts.map