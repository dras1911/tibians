/**
 * Seed runner — wywołuje `runSeeds` z `src/seed/`.
 *
 * Użycie:
 *   pnpm --filter @tibians/db db:seed
 *
 * Wymaga DATABASE_URL w env + zastosowanych migracji (`pnpm db:migrate`).
 *
 * Co robi:
 *   1. calculator_config (15 kluczy: economy, exercise, stamina, charm, …)
 *   2. valuation_rules (38 reguł: base / skill / feature / progression / cosmetic / asset)
 *   3. imbuements (23 słownik PL/EN z Intibia §2.3)
 *
 * Idempotentny — ponowne uruchomienie aktualizuje istniejące wiersze.
 */
import 'dotenv/config';

import { closeDb, createDb } from '../src';
import { runSeeds } from '../src/seed';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[seed] DATABASE_URL is not set. Aborting.');
    process.exit(1);
  }

  const { pool, db } = createDb(url);

  try {
    console.log('[seed] Running seeds…');
    const report = await runSeeds(db);
    console.log('[seed] Done in %d ms:', report.elapsedMs);
    console.log('       calculator_config : %d rows', report.calculatorConfig);
    console.log('       valuation_rules   : %d rows', report.valuationRules);
    console.log('       imbuements        : %d rows', report.imbuements);
  } finally {
    await pool.end();
  }
}

main()
  .then(() => closeDb())
  .catch((err: unknown) => {
    console.error('[seed] Failed:', err);
    process.exit(1);
  });
