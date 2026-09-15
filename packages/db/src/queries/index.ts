/**
 * Warstwa zapytań DB dla scrapera — implementacja kontraktu `SchedulerDb`
 * (`apps/scraper/src/scheduler.ts:144-219`, 13 metod).
 *
 * DLACZEGO ISTNIEJE:
 *   `apps/scraper/src/index.ts:115` loguje
 *   `"INFO: production wiring requires T34 (DB queries)"` — ten katalog
 *   był brakującym ogniwem. Bez niego kontener scrapera startuje i nie
 *   zapisuje niczego → Bazaar pokazuje 0 aukcji.
 *
 * WARSTWY:
 *   `packages/db` zwraca tu **kształt DB** (wiersze + nazwy z JOIN-ów).
 *   Mapowanie na kontrakty domenowe (`AuctionSummary`, `CalibrationSample`)
 *   robi `apps/scraper/src/wiring.ts`, bo tylko tam dostępne są OBA typy
 *   (patrz `SCRAPER-BOOTSTRAP.md` §9.2).
 *
 * WSZYSTKIE funkcje przyjmują `Db` jako parametr (nie używają singletona)
 * — dzięki temu wiring może wstrzyknąć realny pool, a testy mocka.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { schema } from '../schema';
import {
  auctionItems,
  auctionMounts,
  auctionOutfits,
  auctionSkillLoyalty,
  auctionUsps,
  auctions,
  items as itemsTable,
  mounts as mountsTable,
  outfits as outfitsTable,
  scrapeErrors,
  scrapeRuns,
  users as usersTable,
  worlds,
} from '../schema';
import { MV_FACET_COUNTS_REFRESH } from '../schema/views';
import {
  auctionItemToNewAuctionItem,
  auctionMountToNewAuctionMount,
  auctionOutfitToNewAuctionOutfit,
  auctionSkillLoyaltyToNewAuctionSkillLoyalty,
  auctionToNewAuction,
  auctionUspToNewAuctionUsp,
  referenceItemToNewItem,
  referenceMountToNewMount,
  referenceOutfitToNewOutfit,
  type ScraperAuctionItemLike,
  type ScraperAuctionLike,
  type ScraperAuctionMountLike,
  type ScraperAuctionOutfitLike,
  type ScraperAuctionSkillLoyaltyLike,
  type ScraperAuctionUspLike,
  type ScraperItemLike,
  type ScraperReferenceLike,
} from './mappers';

/** Typ klienta DB (singleton z `packages/db` albo transakcja). */
export type Db = NodePgDatabase<typeof schema>;

/** Typ transakcji Drizzle — podzbiór `Db` używany wewnątrz `db.transaction`. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/* ════════════════════════════════════════════════════════════════
 *  AUKCJE
 * ════════════════════════════════════════════════════════════════ */

/**
 * Wiersz do diffu w Full loop. Kształt pokrywa `AuctionSummary` ze
 * scrapera (`apps/scraper/src/scrapers/auction-list.ts`) — włącznie
 * z **nazwą** świata (JOIN) i URL-em outfitu (LEFT JOIN).
 *
 * `outfitUrl` może być `null` (aukcja bez outfitu / outfit spoza słownika)
 * — wiring podstawia wtedy fallback, bo `AuctionSummarySchema` wymaga
 * pełnego URLa ze `static.tibia.com`.
 */
export interface AuctionSummaryRow {
  readonly auctionId: bigint;
  readonly characterName: string;
  readonly level: number;
  readonly vocation: string;
  readonly sex: 'M' | 'F';
  readonly world: string;
  readonly outfitUrl: string | null;
  readonly bid: number;
  readonly bidType: 'current' | 'minimum';
  readonly auctionEnd: Date;
}

/** Aktywne aukcje w kształcie potrzebnym do `compareAuctionLists`. */
export async function fetchAllAuctionSummaries(
  db: Db,
): Promise<readonly AuctionSummaryRow[]> {
  return db
    .select({
      auctionId: auctions.auctionId,
      characterName: auctions.characterName,
      level: auctions.level,
      vocation: auctions.vocation,
      sex: auctions.sex,
      world: worlds.name,
      outfitUrl: outfitsTable.imageUrl,
      bid: auctions.bid,
      bidType: auctions.bidType,
      auctionEnd: auctions.auctionEnd,
    })
    .from(auctions)
    .innerJoin(worlds, eq(worlds.id, auctions.worldId))
    .leftJoin(outfitsTable, eq(outfitsTable.id, auctions.outfitId))
    .where(eq(auctions.status, 'active'));
}

/** Pakiet do `upsertAuction` — odpowiednik `UpsertAuctionInput` ze scrapera. */
export interface UpsertAuctionData {
  readonly auction: ScraperAuctionLike;
  readonly items: readonly ScraperAuctionItemLike[];
  readonly outfits: readonly ScraperAuctionOutfitLike[];
  readonly mounts: readonly ScraperAuctionMountLike[];
  readonly usps: readonly ScraperAuctionUspLike[];
  readonly skillLoyalties: readonly ScraperAuctionSkillLoyaltyLike[];
}

/** Wynik upsertu (odpowiednik `UpsertAuctionResult`). */
export interface UpsertAuctionOutcome {
  readonly kind: 'new' | 'updated';
}

/**
 * Transakcyjny upsert aukcji + relacji.
 *
 * Kroki (jedna transakcja — inaczej przy błędzie zostają osierocone relacje):
 *   1. `INSERT ... ON CONFLICT (auction_id) DO UPDATE` na `auctions`,
 *   2. `DELETE` wszystkich relacji tego auctionId,
 *   3. `INSERT` świeżych relacji.
 *
 * `kind` rozróżniamy przez systemową kolumnę `xmax`: przy `ON CONFLICT`
 * świeżo wstawiony wiersz ma `xmax = 0`, zaktualizowany ma niezerowe.
 *
 * UWAGA: `unchanged` nie jest wykrywane (kontrakt dopuszcza tę wartość,
 * ale rozróżnienie wymagałoby porównania wszystkich ~45 kolumn).
 * Zaktualizowany-wartościowo-identycznie wiersz zwróci `updated` — wpływa
 * to tylko na metrykę `auctions_upd` w `scrape_runs`, nie na dane.
 */
export async function upsertAuction(
  db: Db,
  input: UpsertAuctionData,
): Promise<UpsertAuctionOutcome> {
  const auctionRow = auctionToNewAuction(input.auction);
  const { auctionId } = auctionRow;

  return db.transaction(async (tx: Tx) => {
    const returned = await tx
      .insert(auctions)
      .values(auctionRow)
      .onConflictDoUpdate({
        target: auctions.auctionId,
        set: { ...auctionRow, lastSeenAt: new Date(), scrapedAt: new Date() },
      })
      .returning({ inserted: sql<boolean>`(xmax::text::bigint = 0)` });

    const isNew = returned[0]?.inserted === true;

    // Relacje: najprostszy poprawny wariant to delete + insert. Unika
    // zgadywania targetów `ON CONFLICT` dla PK z nullable `tier`.
    await tx.delete(auctionItems).where(eq(auctionItems.auctionId, auctionId));
    await tx.delete(auctionOutfits).where(eq(auctionOutfits.auctionId, auctionId));
    await tx.delete(auctionMounts).where(eq(auctionMounts.auctionId, auctionId));
    await tx.delete(auctionUsps).where(eq(auctionUsps.auctionId, auctionId));
    await tx
      .delete(auctionSkillLoyalty)
      .where(eq(auctionSkillLoyalty.auctionId, auctionId));

    if (input.items.length > 0) {
      await tx
        .insert(auctionItems)
        .values(input.items.map((i) => auctionItemToNewAuctionItem(auctionId, i)));
    }
    if (input.outfits.length > 0) {
      await tx
        .insert(auctionOutfits)
        .values(
          input.outfits.map((o) => auctionOutfitToNewAuctionOutfit(auctionId, o)),
        );
    }
    if (input.mounts.length > 0) {
      await tx
        .insert(auctionMounts)
        .values(input.mounts.map((m) => auctionMountToNewAuctionMount(auctionId, m)));
    }
    if (input.usps.length > 0) {
      await tx
        .insert(auctionUsps)
        .values(input.usps.map((u) => auctionUspToNewAuctionUsp(auctionId, u)));
    }
    if (input.skillLoyalties.length > 0) {
      await tx
        .insert(auctionSkillLoyalty)
        .values(
          input.skillLoyalties.map((s) =>
            auctionSkillLoyaltyToNewAuctionSkillLoyalty(auctionId, s),
          ),
        );
    }

    return { kind: isNew ? 'new' : 'updated' } as const;
  });
}

/**
 * Oznacza aukcje jako zakończone. Zwraca liczbę faktycznie zarchiwizowanych
 * (warunek `status = 'active'` — powtórne wywołanie nie liczy drugi raz).
 */
export async function archiveFinishedAuctions(
  db: Db,
  ids: readonly bigint[],
): Promise<number> {
  if (ids.length === 0) return 0;

  const archived = await db
    .update(auctions)
    .set({ status: 'finished', archivedAt: new Date() })
    .where(
      and(
        inArray(auctions.auctionId, Array.from(ids)),
        eq(auctions.status, 'active'),
      ),
    )
    .returning({ auctionId: auctions.auctionId });

  return archived.length;
}

/** IDs aktywnych aukcji kończących się w oknie `[NOW, NOW + withinHours]`. */
export async function getEndingSoonIds(
  db: Db,
  withinHours: number,
): Promise<readonly bigint[]> {
  const rows = await db
    .select({ auctionId: auctions.auctionId })
    .from(auctions)
    .where(
      and(
        eq(auctions.status, 'active'),
        sql`${auctions.auctionEnd} BETWEEN NOW() AND NOW() + (${withinHours} * INTERVAL '1 hour')`,
      ),
    );

  return rows.map((r) => r.auctionId);
}

/* ════════════════════════════════════════════════════════════════
 *  REFERENCE DATA
 * ════════════════════════════════════════════════════════════════ */

/**
 * Upsert itemów.
 *
 * Mapper jest niemal tożsamościowy (`ItemSchema` scrapera mirroruje kolumny
 * tabeli `items`), więc aktualizujemy wszystkie pola pochodzące ze scrapera.
 * `updated_at` ustawiamy jawnie — `DEFAULT now()` działa tylko przy INSERT.
 */
export async function upsertItems(
  db: Db,
  items: readonly ScraperItemLike[],
): Promise<number> {
  if (items.length === 0) return 0;

  await db
    .insert(itemsTable)
    .values(items.map(referenceItemToNewItem))
    .onConflictDoUpdate({
      target: itemsTable.id,
      set: {
        name: sql`excluded.name`,
        namePl: sql`excluded.name_pl`,
        isStoreItem: sql`excluded.is_store_item`,
        isRare: sql`excluded.is_rare`,
        imageUrl: sql`excluded.image_url`,
        updatedAt: new Date(),
      },
    });

  return items.length;
}

/** Upsert outfitów. */
export async function upsertOutfits(
  db: Db,
  outfits: readonly ScraperReferenceLike[],
): Promise<number> {
  if (outfits.length === 0) return 0;

  await db
    .insert(outfitsTable)
    .values(outfits.map(referenceOutfitToNewOutfit))
    .onConflictDoUpdate({
      target: outfitsTable.id,
      set: {
        name: sql`excluded.name`,
        namePl: sql`excluded.name_pl`,
        isStore: sql`excluded.is_store`,
        isRare: sql`excluded.is_rare`,
        imageUrl: sql`excluded.image_url`,
      },
    });

  return outfits.length;
}

/** Upsert mountów. */
export async function upsertMounts(
  db: Db,
  mounts: readonly ScraperReferenceLike[],
): Promise<number> {
  if (mounts.length === 0) return 0;

  await db
    .insert(mountsTable)
    .values(mounts.map(referenceMountToNewMount))
    .onConflictDoUpdate({
      target: mountsTable.id,
      set: {
        name: sql`excluded.name`,
        namePl: sql`excluded.name_pl`,
        isStore: sql`excluded.is_store`,
        isRare: sql`excluded.is_rare`,
        imageUrl: sql`excluded.image_url`,
      },
    });

  return mounts.length;
}

/* ════════════════════════════════════════════════════════════════
 *  SCRAPE_RUNS (observability — arch §7.2)
 * ════════════════════════════════════════════════════════════════ */

/** Zakłada wiersz `scrape_runs` (status `running`) i zwraca jego id. */
export async function createScrapeRun(
  db: Db,
  input: { runType: string; startedAt: Date },
): Promise<bigint> {
  const rows = await db
    .insert(scrapeRuns)
    .values({
      // `runType` przychodzi z kontraktu scrapera (5 wartości) — mieści się
      // w enumie DB (6 wartości, szósta to 'calibration' używana niżej).
      runType: input.runType as typeof scrapeRuns.$inferInsert.runType,
      startedAt: input.startedAt,
      status: 'running',
    })
    .returning({ id: scrapeRuns.id });

  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error('[queries] createScrapeRun: INSERT nie zwrócił id');
  }
  return id;
}

/** Zamyka run metrykami. */
export async function finishScrapeRun(
  db: Db,
  id: bigint,
  input: {
    finishedAt: Date;
    status: 'success' | 'partial' | 'failed';
    pagesFetched: number;
    auctionsFound: number;
    auctionsNew: number;
    auctionsUpd: number;
    auctionsArch: number;
    errorsCount: number;
    errorSummary?: Record<string, unknown> | undefined;
  },
): Promise<void> {
  await db
    .update(scrapeRuns)
    .set({
      finishedAt: input.finishedAt,
      status: input.status,
      pagesFetched: input.pagesFetched,
      auctionsFound: input.auctionsFound,
      auctionsNew: input.auctionsNew,
      auctionsUpd: input.auctionsUpd,
      auctionsArch: input.auctionsArch,
      errorsCount: input.errorsCount,
      errorSummary: input.errorSummary ?? null,
    })
    .where(eq(scrapeRuns.id, id));
}

/** Dopisuje błąd do `scrape_errors`. */
export async function recordScrapeError(
  db: Db,
  input: {
    runId: bigint;
    url?: string | undefined;
    auctionId?: bigint | undefined;
    errorType: string;
    message: string;
  },
): Promise<void> {
  await db.insert(scrapeErrors).values({
    runId: input.runId,
    url: input.url ?? null,
    auctionId: input.auctionId ?? null,
    errorType: input.errorType as typeof scrapeErrors.$inferInsert.errorType,
    message: input.message,
  });
}

/* ════════════════════════════════════════════════════════════════
 *  KALIBRACJA (arch §8.4 + §10 R3)
 * ════════════════════════════════════════════════════════════════ */

/** Wiersz kalibracji w kształcie DB (wiring konwertuje na `CalibrationSample`). */
export interface CalibrationSampleRow {
  readonly auctionId: bigint;
  readonly estimatedValue: bigint;
  readonly finalPrice: bigint;
  readonly vocation: string;
}

/**
 * Próbki kalibracji: zakończone aukcje z `final_price > 0` w oknie czasowym.
 *
 * `DISTINCT ON (auction_id)` + `ORDER BY computed_at DESC` — bierzemy
 * **najświeższą** wycenę per aukcja. Bez tego JOIN z `valuation_history`
 * (PK: auctionId + computedAt) zwracałby wiele wierszy na aukcję i zawyżał
 * `totalSamples` w raporcie.
 *
 * Raw SQL, bo `DISTINCT ON` nie ma odpowiednika w query builderze Drizzle.
 */
export async function fetchCalibrationSamples(
  db: Db,
  opts: { windowHours: number },
): Promise<readonly CalibrationSampleRow[]> {
  const result = await db.execute<{
    auctionId: bigint;
    estimatedValue: number;
    finalPrice: number;
    vocation: string;
  }>(sql`
    SELECT DISTINCT ON (a.auction_id)
      a.auction_id      AS "auctionId",
      vh.estimated_tc   AS "estimatedValue",
      a.final_price     AS "finalPrice",
      a.vocation_base   AS "vocation"
    FROM auctions a
    JOIN valuation_history vh ON vh.auction_id = a.auction_id
    WHERE a.status IN ('finished', 'sold')
      AND a.final_price > 0
      AND a.archived_at > NOW() - (${opts.windowHours} * INTERVAL '1 hour')
    ORDER BY a.auction_id, vh.computed_at DESC
  `);

  return result.rows.map((r) => ({
    auctionId: r.auctionId,
    estimatedValue: BigInt(r.estimatedValue),
    finalPrice: BigInt(r.finalPrice),
    vocation: r.vocation,
  }));
}

/**
 * Persistuje raport kalibracji jako `scrape_runs` z `runType='calibration'`.
 *
 * Raport ląduje w `error_summary` (JSONB). Serializacja przez `JSON.stringify`
 * z replacerem na `bigint` → string: `JSON.stringify` rzuca `TypeError` na
 * bigintach, a `CalibrationResult` może je zawierać (`auctionId`).
 */
export async function recordCalibrationRun(
  db: Db,
  input: { report: unknown; generatedAt: string },
): Promise<void> {
  const serialized = JSON.parse(
    JSON.stringify(input.report, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  ) as Record<string, unknown>;

  const finishedAt = new Date(input.generatedAt);

  await db.insert(scrapeRuns).values({
    runType: 'calibration',
    status: 'success',
    startedAt: finishedAt,
    finishedAt,
    errorSummary: serialized,
  });
}

/* ════════════════════════════════════════════════════════════════
 *  MATERIALIZED VIEW
 * ════════════════════════════════════════════════════════════════ */

/**
 * `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts`.
 *
 * SQL reużyty z `schema/views.ts` (`MV_FACET_COUNTS_REFRESH`) — UNIQUE INDEX
 * `idx_mvf` jest tworzony przez migrator, więc CONCURRENTLY działa.
 */
export async function refreshFacetCounts(db: Db): Promise<void> {
  await db.execute(MV_FACET_COUNTS_REFRESH);
}

/* ════════════════════════════════════════════════════════════════
 *  UŻYTKOWNICY (T78 — Discord OAuth)
 * ════════════════════════════════════════════════════════════════ */

/** Dane profilu z Discorda do zapisania w `users`. */
export interface UpsertUserData {
  readonly discordId: string;
  readonly username: string;
  readonly globalName: string | null;
  readonly avatarUrl: string | null;
  readonly email: string | null;
}

/**
 * Zakłada lub aktualizuje profil użytkownika po logowaniu.
 *
 * Idempotentne — każde logowanie odświeża profil (nazwa/awatar mogą się
 * zmienić po stronie Discorda).
 *
 * `email` zachowujemy przez `COALESCE`: gdy użytkownik nie udostępnił e-maila
 * (brak scope `email`), NIE nadpisujemy zapisanego wcześniej adresu wartością
 * NULL. Ta sama zasada dla `global_name` i `avatar_url` — brak danych w
 * payloadzie nie może kasować tego, co już mamy.
 */
export async function upsertUser(db: Db, input: UpsertUserData): Promise<void> {
  const now = new Date();

  await db
    .insert(usersTable)
    .values({
      discordId: input.discordId,
      username: input.username,
      globalName: input.globalName,
      avatarUrl: input.avatarUrl,
      email: input.email,
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: usersTable.discordId,
      set: {
        username: sql`excluded.username`,
        globalName: sql`coalesce(excluded.global_name, ${usersTable.globalName})`,
        avatarUrl: sql`coalesce(excluded.avatar_url, ${usersTable.avatarUrl})`,
        email: sql`coalesce(excluded.email, ${usersTable.email})`,
        lastLoginAt: now,
        updatedAt: now,
      },
    });
}

/** Profil użytkownika po `discordId` (albo `null`). */
export async function getUserById(db: Db, discordId: string) {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.discordId, discordId))
    .limit(1);

  return rows[0] ?? null;
}

export type { ScraperAuctionLike, ScraperItemLike, ScraperReferenceLike };
