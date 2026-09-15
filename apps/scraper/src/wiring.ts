/**
 * Wiring produkcyjny — adapter Drizzle → `SchedulerDb`.
 *
 * To jest brakujące ogniwo, o którym mówi log w `apps/scraper/src/index.ts:115`
 * ("production wiring requires T34"). Implementuje wszystkie 13 metod
 * kontraktu `SchedulerDb` (`./scheduler.js`) delegując do warstwy zapytań
 * w `packages/db/src/queries`.
 *
 * DLACZEGO MAPOWANIE JEST TU, A NIE W `packages/db`:
 *   `packages/db` nie może importować z `apps/scraper` (odwrócenie
 *   zależności) ani z `@tibians/shared` (brak w zależnościach pakietu).
 *   Dopiero TUTAJ dostępne są równocześnie typy DB, kontrakty shared
 *   i kontrakty scrapera — więc tu następuje sklejenie warstw.
 *
 * Kontrakty domenowe (`AuctionSummary`, `CalibrationSample`) są walidowane
 * Zod-em, a nie rzutowane (`as`) — dzięki temu niezgodność danych
 * zgłasza się jawnie zamiast cicho zatruwać pipeline.
 */
import {
  archiveFinishedAuctions,
  createScrapeRun,
  db,
  fetchAllAuctionSummaries,
  fetchCalibrationSamples,
  finishScrapeRun,
  getEndingSoonIds,
  pool,
  recordCalibrationRun,
  recordScrapeError,
  refreshFacetCounts,
  upsertAuction,
  upsertItems,
  upsertMounts,
  upsertOutfits,
  type Db,
} from '@tibians/db';
import { VocationSchema } from '@tibians/shared/auction';

import { AuctionSummarySchema, type AuctionSummary } from './scrapers/auction-list.js';
import type {
  SchedulerDb,
  UpsertAuctionInput,
  UpsertAuctionResult,
} from './scheduler.js';

/**
 * Fallback dla `outfitUrl`, gdy aukcja nie ma outfitu w słowniku
 * (`auctions.outfit_id` jest nullable, a `outfits` może jeszcze nie być
 * zaseedowane przy pierwszym uruchomieniu). `AuctionSummarySchema` wymaga
 * pełnego URLa ze `static.tibia.com`, inaczej walidacja odrzuci wiersz.
 */
const FALLBACK_OUTFIT_URL =
  'https://static.tibia.com/images/charactertrade/outfits/128_0.gif';

/**
 * Tworzy `SchedulerDb` związany z realną bazą.
 *
 * @param database — klient Drizzle (domyślnie singleton z `@tibians/db`).
 */
export function createSchedulerDb(database: Db = db): SchedulerDb {
  let poolClosed = false;

  return {
    /* ── Aukcje ─────────────────────────────────────────────────── */

    async fetchAllAuctionSummaries(): Promise<readonly AuctionSummary[]> {
      const rows = await fetchAllAuctionSummaries(database);

      const summaries: AuctionSummary[] = [];
      let rejected = 0;

      for (const row of rows) {
        const candidate = {
          auctionId: row.auctionId,
          characterName: row.characterName,
          level: row.level,
          vocation: row.vocation,
          sex: row.sex,
          world: row.world,
          outfitUrl: row.outfitUrl ?? FALLBACK_OUTFIT_URL,
          bid: row.bid,
          bidType: row.bidType,
          auctionEnd: row.auctionEnd.toISOString(),
        };

        const parsed = AuctionSummarySchema.safeParse(candidate);
        if (parsed.success) {
          summaries.push(parsed.data);
        } else {
          // Nie wywalamy całego diffu przez jeden niespójny wiersz —
          // logujemy i pomijamy (raport w logach schedulera).
          rejected += 1;
        }
      }

      if (rejected > 0) {
        console.warn(
          `[wiring] fetchAllAuctionSummaries: pominięto ${rejected} wierszy nieprzechodzących walidacji AuctionSummarySchema`,
        );
      }

      return summaries;
    },

    async upsertAuction(input: UpsertAuctionInput): Promise<UpsertAuctionResult> {
      const outcome = await upsertAuction(database, {
        auction: input.auction,
        items: input.items.map((i) => ({
          itemId: i.itemId,
          quantity: i.quantity,
          tier: i.tier,
        })),
        outfits: input.outfits.map((o) => ({
          outfitId: o.outfitId,
          addons: o.addons,
        })),
        mounts: input.mounts.map((m) => ({ mountId: m.mountId })),
        usps: input.usps.map((u) => ({
          category: u.category,
          text: u.text,
          sortOrder: u.sortOrder,
        })),
        skillLoyalties: input.skillLoyalties.map((s) => ({
          skill: s.skill,
          baseValue: s.baseValue,
          loyaltyPct: s.loyaltyPct,
        })),
      });

      return { kind: outcome.kind };
    },

    archiveFinishedAuctions(ids: readonly bigint[]): Promise<number> {
      return archiveFinishedAuctions(database, ids);
    },

    getEndingSoonIds(withinHours: number): Promise<readonly bigint[]> {
      return getEndingSoonIds(database, withinHours);
    },

    /* ── Reference data ─────────────────────────────────────────── */

    upsertItems(items) {
      return upsertItems(database, items);
    },

    upsertOutfits(outfits) {
      return upsertOutfits(database, outfits);
    },

    upsertMounts(mounts) {
      return upsertMounts(database, mounts);
    },

    /* ── scrape_runs ────────────────────────────────────────────── */

    createScrapeRun(input) {
      return createScrapeRun(database, {
        runType: input.runType,
        startedAt: input.startedAt,
      });
    },

    finishScrapeRun(id, input) {
      return finishScrapeRun(database, id, input);
    },

    recordScrapeError(input) {
      return recordScrapeError(database, input);
    },

    /* ── Kalibracja ─────────────────────────────────────────────── */

    async fetchCalibrationSamples({ windowHours }) {
      const rows = await fetchCalibrationSamples(database, { windowHours });

      const samples = [];
      for (const row of rows) {
        // `vocation_base` w DB to `text` — walidujemy zamiast rzutować.
        const vocation = VocationSchema.safeParse(row.vocation);
        if (!vocation.success) continue;

        samples.push({
          auctionId: row.auctionId,
          estimatedValue: row.estimatedValue,
          finalPrice: row.finalPrice,
          vocation: vocation.data,
        });
      }
      return samples;
    },

    recordCalibrationRun(input) {
      return recordCalibrationRun(database, {
        report: input.report,
        generatedAt: input.generatedAt,
      });
    },

    /* ── MV + shutdown ──────────────────────────────────────────── */

    refreshFacetCounts() {
      return refreshFacetCounts(database);
    },

    /**
     * Zamknięcie poola. Idempotentne — `SchedulerHandle.stop()` również
     * zamyka zasoby, a `pool.end()` wywołane dwa razy rzuca.
     */
    async end(): Promise<void> {
      if (poolClosed) return;
      poolClosed = true;
      await pool.end();
    },
  };
}
