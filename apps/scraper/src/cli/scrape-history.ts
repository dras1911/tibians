/**
 * CLI: backfill archiwum Char Bazaar (`pastcharactertrades` — W18).
 *
 * Użycie:
 *   node --import tsx/esm src/cli/scrape-history.ts                 # pełne archiwum
 *   node --import tsx/esm src/cli/scrape-history.ts --from 1 --to 20
 *   node --import tsx/esm src/cli/scrape-history.ts --pages 5       # pierwsze 5 stron
 *
 * Co robi (per strona, od `--from` do `--to` albo do wykrytego Last Page):
 *   1. `fetchHtml(auctionHistory&currentpage=N)` (rate-limit w http-client),
 *   2. `parseHistoryList(html)` → wiersze (finished/cancelled + Winning Bid),
 *   3. `upsertArchivedAuctions(db, rows)` — bulk (chunk 250),
 *   4. log postępu + na końcu podsumowanie.
 *
 * Semantyka: upsert uzupełnia `final_price` (COALESCE — nie kasuje naszych
 * cen z detalu), nadpisuje status/bid/auction_end. Aukcje z ostatnich dni
 * (u nas `active`/`finished` bez ceny) dostają pełne dane archiwalne.
 *
 * Scrape run: `history` (enum `scrape_run_type`) — widoczny w `scrape_runs`.
 */

import {
  createScrapeRun,
  db,
  finishScrapeRun,
  pool,
  upsertArchivedAuctions,
  type ArchivedAuctionRow,
} from "@tibians/db";
import { VOCATION_BASE_TO_PROMOTED } from "@tibians/shared/auction";

import { TIBIA_URLS } from "../config.js";
import { defaultHttpClient } from "../http-client.js";
import { parseHistoryList, type HistoryAuction } from "../scrapers/auction-history.js";

/** Odwrotne mapowanie promowana → bazowa (archiwum podaje promowaną). */
function vocationBaseOf(promoted: string): string {
  for (const [base, prom] of Object.entries(VOCATION_BASE_TO_PROMOTED)) {
    if (prom === promoted) return base;
  }
  // Nieznane/niepromowane (np. "Monk" bez awansu) — zostaw jak jest;
  // kolumna jest `text` (bez enuma), więc nie wywali INSERT-u.
  return promoted;
}

/** Wiersz archiwum → wiersz DB (mapowanie robi scraper — ma shared). */
function toArchivedRow(row: HistoryAuction): ArchivedAuctionRow {
  return {
    auctionId: row.auctionId,
    characterName: row.characterName,
    level: row.level,
    vocation: vocationBaseOf(row.vocation),
    vocationPromoted: row.vocation,
    sex: row.sex,
    worldName: row.world,
    bid: row.bid,
    bidType: row.status === "finished" ? "current" : "minimum",
    auctionStart: new Date(row.auctionStart),
    auctionEnd: new Date(row.auctionEnd),
    status: row.status,
    finalPrice: row.finalPrice,
    skills: row.skills,
    blessingsActive: row.blessingsActive,
    rawJson: {
      source: "pastcharactertrades",
      characterName: row.characterName,
      level: row.level,
      vocation: row.vocation,
      sex: row.sex,
      world: row.world,
      auctionStart: row.auctionStart,
      auctionEnd: row.auctionEnd,
      bid: row.bid,
      finalPrice: row.finalPrice,
      status: row.status,
      skills: row.skills,
      blessingsActive: row.blessingsActive,
      outfitUrl: row.outfitUrl,
    },
  };
}

interface CliOptions {
  readonly from: number;
  readonly to: number | null;
  readonly maxPages: number | null;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let from = 1;
  let to: number | null = null;
  let maxPages: number | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--from") {
      from = Number.parseInt(argv[i + 1] ?? "", 10);
      i += 1;
    } else if (arg === "--to") {
      to = Number.parseInt(argv[i + 1] ?? "", 10);
      i += 1;
    } else if (arg === "--pages") {
      maxPages = Number.parseInt(argv[i + 1] ?? "", 10);
      i += 1;
    }
  }

  if (!Number.isInteger(from) || from < 1) {
    throw new Error(`--from musi być >= 1 (dostałem "${argv.join(" ")}")`);
  }
  if (to !== null && (!Number.isInteger(to) || to < from)) {
    throw new Error(`--to musi być >= --from (${String(from)})`);
  }
  if (maxPages !== null && (!Number.isInteger(maxPages) || maxPages < 1)) {
    throw new Error(`--pages musi być >= 1`);
  }

  return { from, to, maxPages };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const scrapeRunId = await createScrapeRun(db, {
    runType: "history",
    startedAt: new Date(),
  });
  console.log(
    `[history] scrape_run #${String(scrapeRunId)} — start (from=${String(options.from)})`,
  );

  let page = options.from;
  let lastPage = options.to ?? Number.POSITIVE_INFINITY;
  let pagesFetched = 0;
  let totalRows = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let failedPages = 0;
  const startedAt = Date.now();

  try {
    while (page <= lastPage) {
      if (options.maxPages !== null && page >= options.from + options.maxPages) {
        console.log(`[history] osiągnięto --pages=${String(options.maxPages)} — stop`);
        break;
      }

      const url = `${TIBIA_URLS.auctionHistory}&currentpage=${String(page)}`;
      let html: string;
      try {
        html = await defaultHttpClient.fetchHtml(url);
      } catch (error) {
        failedPages += 1;
        console.warn(
          `[history] strona ${String(page)} — fetch failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        page += 1;
        continue;
      }
      pagesFetched += 1;

      const { rows, resultsTotal, lastPage: detectedLastPage } = parseHistoryList(html);

      // Ustal Last Page raz (gdy nie podano --to).
      if (
        options.to === null &&
        detectedLastPage !== null &&
        lastPage === Number.POSITIVE_INFINITY
      ) {
        lastPage = detectedLastPage;
        console.log(
          `[history] wykryto Last Page=${String(lastPage)} (Results: ${String(resultsTotal ?? "?")})`,
        );
      }

      const mapped = rows.map(toArchivedRow);
      const outcome = await upsertArchivedAuctions(db, mapped);

      totalRows += rows.length;
      totalInserted += outcome.inserted;
      totalUpdated += outcome.updated;
      totalSkipped += outcome.skipped;

      console.log(
        `[history] strona ${String(page)}${Number.isFinite(lastPage) ? `/${String(lastPage)}` : ""}: ` +
          `${String(rows.length)} wierszy (new=${String(outcome.inserted)}, upd=${String(outcome.updated)}, skip=${String(outcome.skipped)})`,
      );

      page += 1;
    }

    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `[history] KONIEC: ${String(totalRows)} wierszy, new=${String(totalInserted)}, ` +
        `upd=${String(totalUpdated)}, skip=${String(totalSkipped)}, failed_pages=${String(failedPages)}, ${String(seconds)}s`,
    );

    await finishScrapeRun(db, scrapeRunId, {
      finishedAt: new Date(),
      status: failedPages === 0 ? "success" : "partial",
      pagesFetched,
      auctionsFound: totalRows,
      auctionsNew: totalInserted,
      auctionsUpd: totalUpdated,
      auctionsArch: 0,
      errorsCount: failedPages,
    });
  } catch (error) {
    await finishScrapeRun(db, scrapeRunId, {
      finishedAt: new Date(),
      status: "failed",
      pagesFetched,
      auctionsFound: totalRows,
      auctionsNew: totalInserted,
      auctionsUpd: totalUpdated,
      auctionsArch: 0,
      errorsCount: failedPages + 1,
      errorSummary: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error("[history] FATAL:", error);
  process.exit(1);
});
