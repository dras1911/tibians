/**
 * CLI: jednorazowe przeliczenie wycen dla aktywnych aukcji (W18).
 *
 * Użycie:
 *   node --import tsx/esm src/cli/scrape-valuation.ts
 *
 * Woła `runValuation()` (`src/valuation-run.ts`): rules z `valuation_rules`,
 * snapshoty z `auctions` (status='active'), `estimateValue` → UPDATE
 * `auctions.estimated_value` + INSERT `valuation_history`.
 *
 * Uruchamiane ręcznie albo z crona hosta:
 *   docker exec tibians-scraper node --import tsx/esm src/cli/scrape-valuation.ts
 */

import { pool } from "@tibians/db";

import { runValuation } from "../valuation-run.js";

async function main(): Promise<void> {
  const includeFinished = process.argv.includes("--finished");
  const startedAt = Date.now();
  console.log(`[valuation] start (includeFinished=${String(includeFinished)})`);

  const stats = await runValuation({ includeFinished });

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[valuation] KONIEC: total=${String(stats.total)}, computed=${String(stats.computed)}, ` +
      `market=${String(stats.marketCount)}, formula=${String(stats.formulaCount)}, ` +
      `skipped=${String(stats.skipped)}, failed=${String(stats.failed)}, ${seconds}s`,
  );
  if (stats.sampleEstimated !== null) {
    console.log(`[valuation] próbka: estimated=${String(stats.sampleEstimated)} TC`);
    console.log(`[valuation] breakdown: ${JSON.stringify(stats.sampleBreakdown)}`);
  }

  await pool.end();
}

void main().catch((error: unknown) => {
  console.error("[valuation] FATAL:", error);
  process.exit(1);
});
