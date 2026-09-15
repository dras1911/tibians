/**
 * CLI: jednorazowe uruchomienie JEDNEJ iteracji wybranej pętli scrapera.
 *
 * Użycie:
 *   node --import tsx/esm src/cli/scrape.ts <full|endingSoon|reference>
 *
 * Do czego służy:
 *   - `full`      → pełny przegląd Bazaar (101 stron → diff → fan-out detali),
 *   - `endingSoon`→ tylko aukcje kończące się w najbliższym oknie,
 *   - `reference` → items / outfits / mounts z TibiaData.
 *
 * Różnica względem `src/start.ts`: tam scheduler działa **ciągle** (3 pętle
 * na timerach) i to jest tryb produkcyjny kontenera. Tutaj wykonujemy jedną
 * iterację i wychodzimy — do ręcznego „dogrania" danych, debugowania albo
 * joba cron.
 *
 * Lock jest pobierany tak samo jak w produkcji, więc równoległe uruchomienie
 * z działającym kontenerem NIE zdubluje pracy (druga iteracja zostanie
 * pominięta jako „lock zajęty").
 */
import { pool } from '@tibians/db';

import { createPgAdvisoryLockClient } from '../pg-advisory-lock.js';
import { createScheduler, type LoopName } from '../scheduler.js';
import { createSchedulerDb } from '../wiring.js';

const LOOP_NAMES = ['full', 'endingSoon', 'reference'] as const;

function isLoopName(value: string): value is LoopName {
  return (LOOP_NAMES as readonly string[]).includes(value);
}

async function main(): Promise<void> {
  const arg = process.argv[2];

  if (arg === undefined || !isLoopName(arg)) {
    console.error(`Użycie: scrape.ts <${LOOP_NAMES.join('|')}>`);
    process.exit(1);
  }

  const schedulerDb = createSchedulerDb();
  const lockClient = createPgAdvisoryLockClient(pool);
  const scheduler = createScheduler(schedulerDb, undefined, { lockClient });

  try {
    console.log(`[cli] runOnce(${arg}) — start`);
    await scheduler.runOnce(arg);
    console.log(`[cli] runOnce(${arg}) — zakończone`);
  } finally {
    // `stop()` zamyka pętle i zasoby DB — nie wołamy `pool.end()` drugi raz.
    await scheduler.stop();
    await lockClient.end?.();
  }
}

void main().catch((error: unknown) => {
  console.error('[cli] FATAL:', error);
  process.exit(1);
});
