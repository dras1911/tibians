import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { schema } from '../schema';
import type { NewCalculatorConfig } from '../schema/calculator-config';
export interface CalculatorConfigSeed {
    readonly key: string;
    readonly value: unknown;
    readonly description: string;
}
export declare const CALCULATOR_CONFIG_SEED: readonly CalculatorConfigSeed[];
export declare const toCalculatorConfigRows: () => NewCalculatorConfig[];
/**
 * Wstawia/aktualizuje wszystkie klucze configa.
 * Idempotentny: `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`.
 * Zwraca liczbę dotkniętych wierszy.
 */
export declare function seedCalculatorConfig(db: NodePgDatabase<typeof schema>): Promise<number>;
//# sourceMappingURL=calculator-config.d.ts.map