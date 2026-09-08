/**
 * Schema barrel — single import point dla całego schematu DB.
 *
 * Użycie w aplikacji:
 *   import { auctions, worlds, imbuements } from '@tibians/db/schema';
 *   import * as schema from '@tibians/db/schema';
 *
 * Eksportujemy też `* as schema` (defaultSchema) dla convenience w Drizzle.
 */
export * from './reference';
export * from './auctions';
export * from './auction-relations';
export * from './time-series';
export * from './calculator';
export * from './calculator-config';
export * from './valuation';
export * from './ops';
export * from './content';
export * from './views';

/**
 * Default schema object — gotowy do `drizzle(url, { schema })`.
 * Używany przez główny `db` klient w `src/index.ts`.
 */
import * as auctionRelations from './auction-relations';
import * as auctions from './auctions';
import * as calculator from './calculator';
import * as calculatorConfig from './calculator-config';
import * as content from './content';
import * as ops from './ops';
import * as reference from './reference';
import * as timeSeries from './time-series';
import * as valuation from './valuation';
import * as views from './views';

export const schema = {
  ...reference,
  ...auctions,
  ...auctionRelations,
  ...timeSeries,
  ...calculator,
  ...calculatorConfig,
  ...valuation,
  ...ops,
  ...content,
  ...views,
} as const;
