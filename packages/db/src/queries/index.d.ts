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
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { schema } from "../schema";
import {
  type ScraperAuctionItemLike,
  type ScraperAuctionLike,
  type ScraperAuctionMountLike,
  type ScraperAuctionOutfitLike,
  type ScraperAuctionSkillLoyaltyLike,
  type ScraperAuctionUspLike,
  type ScraperHarvestItemLike,
  type ScraperHarvestLike,
  type ScraperHarvestReferenceLike,
  type ScraperHarvestWorldLike,
  type ScraperItemLike,
  type ScraperReferenceLike,
} from "./mappers";
/** Typ klienta DB (singleton z `packages/db` albo transakcja). */
export type Db = NodePgDatabase<typeof schema>;
/** Typ transakcji Drizzle — podzbiór `Db` używany wewnątrz `db.transaction`. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
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
  readonly sex: "M" | "F";
  readonly world: string;
  readonly outfitUrl: string | null;
  readonly bid: number;
  readonly bidType: "current" | "minimum";
  readonly auctionEnd: Date;
}
/** Aktywne aukcje w kształcie potrzebnym do `compareAuctionLists`. */
export declare function fetchAllAuctionSummaries(db: Db): Promise<readonly AuctionSummaryRow[]>;
/** Pakiet do `upsertAuction` — odpowiednik `UpsertAuctionInput` ze scrapera. */
export interface UpsertAuctionData {
  readonly auction: ScraperAuctionLike;
  readonly items: readonly ScraperAuctionItemLike[];
  readonly outfits: readonly ScraperAuctionOutfitLike[];
  readonly mounts: readonly ScraperAuctionMountLike[];
  readonly usps: readonly ScraperAuctionUspLike[];
  readonly skillLoyalties: readonly ScraperAuctionSkillLoyaltyLike[];
  /**
   * Harvest słowników z detalu (świat + items/outfits/mounts z nazwami).
   * Opcjonalny — starsi konsumenci (testy) mogą go pominąć; wtedy FK
   * muszą być spełnione z innego źródła.
   */
  readonly reference?: ScraperHarvestLike | undefined;
}
/** Wynik upsertu (odpowiednik `UpsertAuctionResult`). */
export interface UpsertAuctionOutcome {
  readonly kind: "new" | "updated";
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
export declare function upsertAuction(
  db: Db,
  input: UpsertAuctionData,
): Promise<UpsertAuctionOutcome>;
/**
 * Oznacza aukcje jako zakończone. Zwraca liczbę faktycznie zarchiwizowanych
 * (warunek `status = 'active'` — powtórne wywołanie nie liczy drugi raz).
 */
export declare function archiveFinishedAuctions(db: Db, ids: readonly bigint[]): Promise<number>;
/** IDs aktywnych aukcji kończących się w oknie `[NOW, NOW + withinHours]`. */
export declare function getEndingSoonIds(db: Db, withinHours: number): Promise<readonly bigint[]>;
/**
 * Upsert itemów.
 *
 * Mapper jest niemal tożsamościowy (`ItemSchema` scrapera mirroruje kolumny
 * tabeli `items`), więc aktualizujemy wszystkie pola pochodzące ze scrapera.
 * `updated_at` ustawiamy jawnie — `DEFAULT now()` działa tylko przy INSERT.
 */
export declare function upsertItems(db: Db, items: readonly ScraperItemLike[]): Promise<number>;
/** Upsert outfitów. */
export declare function upsertOutfits(
  db: Db,
  outfits: readonly ScraperReferenceLike[],
): Promise<number>;
/** Upsert mountów. */
export declare function upsertMounts(
  db: Db,
  mounts: readonly ScraperReferenceLike[],
): Promise<number>;
/**
 * Ensure wierszy słownikowych z harvestu detalu aukcji — `ON CONFLICT DO NOTHING`.
 *
 * Cel: FK `auction_items.item_id → items.id`, `auction_outfits.outfit_id →
 * outfits.id`, `auction_mounts.mount_id → mounts.id` oraz `auctions.world_id →
 * worlds.id` muszą być spełnione, zanim wstawimy relacje aukcji. Detal aukcji
 * (parser v2) dostarcza nazwy + obrazki, więc tworzymy brakujące wiersze
 * „przy okazji" — pełne dane (kategorie, ceny, regiony światów) uzupełni
 * scraper referencji T32 przez `upsertItems/upsertOutfits/upsertMounts`.
 *
 * `DO NOTHING` (nie `DO UPDATE`) — nie nadpisujemy bogatszych danych z T32.
 */
export declare function ensureReferenceData(
  tx: Tx,
  reference: ScraperHarvestLike | undefined,
): Promise<void>;
/** Zakłada wiersz `scrape_runs` (status `running`) i zwraca jego id. */
export declare function createScrapeRun(
  db: Db,
  input: {
    runType: string;
    startedAt: Date;
  },
): Promise<bigint>;
/** Zamyka run metrykami. */
export declare function finishScrapeRun(
  db: Db,
  id: bigint,
  input: {
    finishedAt: Date;
    status: "success" | "partial" | "failed";
    pagesFetched: number;
    auctionsFound: number;
    auctionsNew: number;
    auctionsUpd: number;
    auctionsArch: number;
    errorsCount: number;
    errorSummary?: Record<string, unknown> | undefined;
  },
): Promise<void>;
/** Dopisuje błąd do `scrape_errors`. */
export declare function recordScrapeError(
  db: Db,
  input: {
    runId: bigint;
    url?: string | undefined;
    auctionId?: bigint | undefined;
    errorType: string;
    message: string;
  },
): Promise<void>;
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
export declare function fetchCalibrationSamples(
  db: Db,
  opts: {
    windowHours: number;
  },
): Promise<readonly CalibrationSampleRow[]>;
/**
 * Persistuje raport kalibracji jako `scrape_runs` z `runType='calibration'`.
 *
 * Raport ląduje w `error_summary` (JSONB). Serializacja przez `JSON.stringify`
 * z replacerem na `bigint` → string: `JSON.stringify` rzuca `TypeError` na
 * bigintach, a `CalibrationResult` może je zawierać (`auctionId`).
 */
export declare function recordCalibrationRun(
  db: Db,
  input: {
    report: unknown;
    generatedAt: string;
  },
): Promise<void>;
/**
 * `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts`.
 *
 * SQL reużyty z `schema/views.ts` (`MV_FACET_COUNTS_REFRESH`) — UNIQUE INDEX
 * `idx_mvf` jest tworzony przez migrator, więc CONCURRENTLY działa.
 */
export declare function refreshFacetCounts(db: Db): Promise<void>;
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
export declare function upsertUser(db: Db, input: UpsertUserData): Promise<void>;
/** Profil użytkownika po `discordId` (albo `null`). */
export declare function getUserById(
  db: Db,
  discordId: string,
): Promise<{
  discordId: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
} | null>;
export type {
  ScraperAuctionLike,
  ScraperHarvestItemLike,
  ScraperHarvestLike,
  ScraperHarvestReferenceLike,
  ScraperHarvestWorldLike,
  ScraperItemLike,
  ScraperReferenceLike,
};
//# sourceMappingURL=index.d.ts.map
