# Scraper Production Bootstrap — Implementation Blueprint

> Status: **NIEZREALIZOWANE**. Recon wykonany w całości 2026-09-15.
> Powód istnienia: `apps/scraper/src/index.ts:115` sam loguje
> `"INFO: production wiring requires T34 (DB queries)"` — kod jest niedokończony.
> Plan oznaczył T34/T37 jako `[x]`, ale pliki **nie istnieją i nigdy nie były w git**.

## 0. Cel

Kontener `scraper` w `docker-compose.prod.yml` ma realnie:
1. połączyć się z PostgreSQL,
2. wystartować 3 pętle schedulera (Full 15 min / EndingSoon 30 s / Reference 24 h),
3. zapisywać aukcje do bazy → Bazaar przestaje pokazywać 0 aukcji.

Bez tego reszta portalu działa (kalkulatory, blog, SEO, premium), ale
**główna funkcja (Bazaar) jest pusta**.

## 1. Kontrakt: `SchedulerDb` — 13 metod (apps/scraper/src/scheduler.ts:144-219)

Dokładne sygnatury (NIE zmieniać tego interfejsu — zależy od niego `scheduler.ts`):

```ts
export interface SchedulerDb {
  // Aukcje
  fetchAllAuctionSummaries(): Promise<readonly AuctionSummary[]>;
  upsertAuction(input: UpsertAuctionInput): Promise<UpsertAuctionResult>;
  archiveFinishedAuctions(ids: readonly bigint[]): Promise<number>;
  getEndingSoonIds(withinHours: number): Promise<readonly bigint[]>;

  // Reference data
  upsertItems(items: readonly Item[]): Promise<number>;
  upsertOutfits(outfits: readonly Outfit[]): Promise<number>;
  upsertMounts(mounts: readonly Mount[]): Promise<number>;

  // scrape_runs (observability)
  createScrapeRun(input: { runType: ScrapeRunType; startedAt: Date }): Promise<bigint>;
  finishScrapeRun(id: bigint, input: {
    finishedAt: Date;
    status: "success" | "partial" | "failed";
    pagesFetched: number; auctionsFound: number; auctionsNew: number;
    auctionsUpd: number; auctionsArch: number; errorsCount: number;
    errorSummary?: Record<string, unknown>;
  }): Promise<void>;
  recordScrapeError(input: {
    runId: bigint; url?: string; auctionId?: bigint;
    errorType: "timeout"|"rate_limit"|"parse"|"http_4xx"|"http_5xx"|"db"|"other";
    message: string;
  }): Promise<void>;

  // Calibration
  fetchCalibrationSamples(opts: { windowHours: number }):
    Promise<readonly import("./calibration.js").CalibrationSample[]>;
  recordCalibrationRun(input: {
    report: import("./calibration.js").CalibrationReport;
    generatedAt: string;
  }): Promise<void>;

  // MV
  refreshFacetCounts(): Promise<void>;

  // opcjonalne
  end?(): Promise<void>;
}
```

Typy wejściowe (zdefiniowane **w scheduler.ts**, nie brakują!):
- `UpsertAuctionInput` (scheduler.ts:122-129) = `{ auction: Auction; items: readonly AuctionItem[];
  outfits: readonly AuctionOutfit[]; mounts: readonly AuctionMount[];
  usps: readonly AuctionUsp[]; skillLoyalties: readonly AuctionSkillLoyalty[] }`
- `UpsertAuctionResult` (scheduler.ts:132-135) = `{ kind: "new" | "updated" | "unchanged" }`

**UWAGA na typy `Item`/`Outfit`/`Mount`** — w `SchedulerDb` są importowane z
`./scrapers/reference-data.js` (typy SCRAPERA), a NIE z DB.
Patrz sekcja 4 (mapowanie).

## 2. Klient DB — JUŻ ISTNIEJE

`packages/db/src/index.ts` eksportuje:
- `db` — singleton Drizzle (node-postgres), **lazy** (otwiera pulę przy 1. użyciu)
- `pool` — `pg.Pool` (raw queries, migracje)
- `createDb` — fabryka dla wielu baz
- `schema` — pełny obiekt schema
- `runSeeds` — orkiestrator seedów
- re-eksport `./schema`, `./seed`, `./config-loader`

Pattern: `import { db, pool } from '@tibians/db'`
Schema w queries: `import { auctions, auctionItems, ... } from '@tibians/db/schema'`
(NIE deep subpaths typu `@tibians/db/schema/auctions` — barrel!)

## 3. Mapowanie schematów → metody

### 3.1 `auctions` (packages/db/src/schema/auctions.ts:68-218) — ~45 kolumn
- PK: `auctionId` (bigint, z tibia.com `?auctionid=`)
- Tożsamość: `characterName`, `level` (smallint), `vocation`, `vocationBase`, `sex` (enum M/F), `worldId` (smallint FK worlds.id), `outfitId`
- Aukcja: `bid` (int), `bidType` (enum current|minimum), `auctionStart`, `auctionEnd`, `status` (enum active|finished|cancelled|sold, default active), `finalPrice`
- 8 skilli: `skillMagic`, `skillClub`, `skillFist`, `skillSword`, `skillAxe`, `skillDistance`, `skillShielding`, `skillFishing` (smallint, default 0)
- Progresja: `charmPoints`, `charmPointsUnused`, `minorCharmEchoes`, `bossPoints`, `imbuementsUnlocked`, `imbuementsTotal` (def 23), `questsCompleted`, `questsTotal` (def 42), `achievementPoints`, `animusMasteries`
- Gemy: `gemsLesser`, `gemsRegular`, `gemsGreater`
- Store: `storeOutfitsCount`, `storeMountsCount`, `storeItemsCount`, `hirelingsCount`, `goldTotal` (bigint), `tcInvested`
- Flagi bool: `hasSoulWar`, `hasPrimalOrdeal`, `hasWorldTransfer`, `hasPreySlot`, `hasCharmExpansion`, `hasWeeklyTaskExp`, `hasTwistOfFate`, `blessingsActive` (smallint)
- Wyliczane: `estimatedValue`, `valueConfidence` (numeric 3,2), `pricePerLevel` (GENERATED — **NIE wstawiać**), `searchVector` (GENERATED — **NIE wstawiać**)
- Payload: `rawJson` (jsonb, **NOT NULL** — wymagane!), `firstSeenAt`, `lastSeenAt`, `scrapedAt`, `archivedAt`

### 3.2 `auction_*` relacje (auction-relations.ts)
| Tabela | PK | Kolumny | Uwaga |
|---|---|---|---|
| `auctionItems` | (auctionId, itemId, tier) | quantity, tier (nullable) | tier w PK → upsert musi go uwzględniać |
| `auctionOutfits` | (auctionId, outfitId) | addons (smallint def 0) | |
| `auctionMounts` | (auctionId, mountId) | — | |
| `auctionUsps` | id identity | auctionId, category (enum), text, sortOrder | `id` GENERATED — insert bez id |
| `auctionSkillLoyalty` | (auctionId, skill) | baseValue (smallint), loyaltyPct (smallint nullable) | enum skill: magic|club|fist|sword|axe|distance|shielding|fishing |
| `auctionQuests` | (auctionId, questId) | — | niewymagane przez interfejs |
| `auctionBosses` | (auctionId, bossId) | — | niewymagane przez interfejs |

FK `auctionId` → `auctions.auctionId` ON DELETE CASCADE na każdej.
`auctionItems.itemId` → `items.id`; `auctionOutfits.outfitId` → `outfits.id`;
`auctionMounts.mountId` → `mounts.id` — **te FK muszą istnieć PRZED upsertem relacji**.

### 3.3 Reference (reference.ts)
- `items`: PK `id` (int = client_id), `name`, `namePl`, `category` (enum item_category), `marketPrice`, `tcValue`, `isStoreItem`, `isRare`, `imageUrl` (NOT NULL), `updatedAt`
- `outfits`: PK `id`, `name`, `namePl`, `isStore`, `isRare`, `imageUrl` (NOT NULL)
- `mounts`: PK `id`, `name`, `namePl`, `isStore`, `isRare`, `imageUrl` (NOT NULL)
- `worlds`: PK smallserial `id`, `name` (unique), region/pvpType/battleye enums, `isRetro`, `isActive`, `playersOnline`, `updatedAt`
  → **`upsertAuction` wymaga `worldId`; scraper podaje nazwę świata → trzeba rozwiązać nazwę na `worlds.id`** (albo cache mapy).

### 3.4 `ops` (ops.ts)
- `scrapeRuns`: PK `id` (identity), `runType` enum (full|ending_soon|detail|history|reference|calibration),
  `status` enum (running|success|partial|failed), `startedAt`, `finishedAt`,
  `pagesFetched`, `auctionsFound`, `auctionsNew`, `auctionsUpd`, `auctionsArch`, `errorsCount`, `errorSummary` (jsonb)
- `scrapeErrors`: PK `id` (identity), `runId` (FK cascade), `url`, `auctionId`, `errorType` enum, `message`, `createdAt`

### 3.5 `valuation` (valuation.ts)
- `valuationHistory`: PK (auctionId, computedAt), `estimatedTc` (int), `breakdown` (jsonb NOT NULL)
  → `fetchCalibrationSamples` robi JOIN `auctions` × `valuation_history`:
  `status IN ('finished','sold')` AND `final_price > 0` AND `archived_at > NOW() - interval '<windowHours> hours'`

### 3.6 `mv_facet_counts` (views.ts)
- `refreshFacetCounts()` → raw SQL: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts`
  (CONCURRENTLY wymaga UNIQUE index na MV — sprawdzić w views.ts)

## 4. Zadanie mapowania typów (NAJWAŻNIEJSZE — źródło błędów)

`UpsertAuctionInput.auction` to `Auction` z **`@tibians/shared/auction`**
(plik `packages/shared/src/auction/schema.ts` + `types.ts`), a NIE DB `Auction`.
Trzeba napisać **explicit mapper** `sharedAuctionToNewAuction(a): NewAuction`:
- ~45 pól do przepisania, w tym 8 skilli, ~10 flag bool, gemy, store counts
- `rawJson` MUSI być ustawione (NOT NULL) — użyć surowego payloadu scrapera
- NIE ustawiać `pricePerLevel` ani `searchVector` (GENERATED ALWAYS)
- `bidType`/`sex`/`status` — mapować na wartości enumów DB

Analogicznie `scraperItemToNewItem`, `scraperOutfitToNewOutfit`, `scraperMountToNewMount`
(`Item`/`Outfit`/`Mount` z `./scrapers/reference-data.js` → DB inserty).

**Przed pisaniem mapowania PRZECZYTAJ**:
- `packages/shared/src/auction/schema.ts` (pola + ich typy)
- `packages/shared/src/auction/types.ts`, `enums.ts`
- `apps/scraper/src/scrapers/reference-data.ts` (typy `Item`/`Outfit`/`Mount` scrapera)
- `apps/scraper/src/scrapers/auction-list.ts` (`AuctionSummary`)
- `apps/scraper/src/calibration.ts` (`CalibrationSample`, `CalibrationReport`)

## 5. Plan plików

### 5.1 `packages/db/src/queries/` (NOWY katalog — to jest „T34")
Sugerowana struktura:
- `auctions.ts` — `fetchAllAuctionSummaries`, `upsertAuction` (transakcja!), `archiveFinishedAuctions`, `getEndingSoonIds`
- `reference.ts` — `upsertItems`, `upsertOutfits`, `upsertMounts`
- `runs.ts` — `createScrapeRun`, `finishScrapeRun`, `recordScrapeError`, `recordCalibrationRun`
- `calibration.ts` — `fetchCalibrationSamples`
- `views.ts` — `refreshFacetCounts`
- `mappers.ts` — mapowania z sekcji 4
- `index.ts` — re-eksport (barrel)
- `__tests__/queries.test.ts` — testy (T34 miał mieć 27 testów; oryginał zaginiony)

`upsertAuction` MUSI być w transakcji (`db.transaction(async (tx) => {...})`):
1. `INSERT ... ON CONFLICT (auction_id) DO UPDATE` na `auctions`
2. `DELETE` istniejących wierszy relacji dla tego auctionId
3. `INSERT` nowych relacji (items/outfits/mounts/usps/skillLoyalties)
4. ustalić `kind`: `new` gdy wstawiono, `updated` gdy istniał i coś się zmieniło, `unchanged` gdy brak zmian
   (sugestia: `RETURNING (xmax = 0) AS inserted` dla rozróżnienia)

`archiveFinishedAuctions(ids)` → `UPDATE auctions SET status='finished', archived_at=NOW()
WHERE auction_id = ANY($ids) AND status='active'` → zwróć `rowCount`.
Uwaga: `pg` zwraca `rowCount`; w Drizzle z `db.execute(sql\`...\`)` → `result.rowCount`.

### 5.2 `apps/scraper/src/wiring.ts` (NOWY)
Adapter: Drizzle → `SchedulerDb`. Implementuje **wszystkie 13 metod** przez funkcje z `queries/`.
`end()` → `pool.end()`.
Sygnatura sugerowana: `export function createSchedulerDb(): SchedulerDb`

### 5.3 `apps/scraper/scripts/start.ts` (NOWY)
Bootstrap produkcyjny. Pattern z komentarza `apps/scraper/src/index.ts:28`:
```ts
import { createPgAdvisoryLockClient } from '../src/advisory-lock.js'; // sprawdź eksport
import { startScheduler } from '../src/index.js';
import { createSchedulerDb } from '../src/wiring.js';

const db = createSchedulerDb();
const handle = startScheduler(db, { lockClient: createPgAdvisoryLockClient(pool) });
// SIGTERM/SIGINT → handle.stop() → db.end()
```
`startScheduler` sam woła `handle.start()` (index.ts:102).

### 5.4 `apps/scraper/src/cli/*.ts` (NOWE lub repoint)
`apps/scraper/package.json` wskazuje na nieistniejące pliki dla:
`scrap:auctions`, `scrap:items`, `scrap:scheduler`, `ref:scrape`.
Albo je utworzyć (cienkie wrappery wołające scheduler `runOnce`), albo
poprawić `package.json` na istniejące entrypointy. **Ścieżki nie mogą wisieć.**

### 5.5 `Dockerfile.scraper` — CMD
Obecnie: `CMD ["node", "apps/scraper/dist/index.js"]` → tylko **eksportuje** `startScheduler`.
Zmienić na nowy entrypoint (sprawdzić czy build produkuje JS czy używa `tsx`):
opcja A: `CMD ["node", "apps/scraper/dist/scripts/start.js"]`
opcja B: `CMD ["node", "--import", "tsx/esm", "apps/scraper/scripts/start.ts"]`
**Dostosować do tego, co realnie emituje stage build w Dockerfile.scraper.**

## 6. Weryfikacja (wykonać WSZYSTKO)

```bash
pnpm --filter @tibians/scraper typecheck
pnpm --filter @tibians/scraper test       # było 230 testów — nie może spaść
pnpm typecheck                             # 9/9 pakietów
pnpm test                                  # było 1432 testów
pnpm build
```
Plus smoke: `docker compose -f docker-compose.prod.yml up scraper` → log
`Tibians scraper starting...` + pierwszy `scrape_run` w tabeli + rosnąca liczba aukcji.

## 7. Pułapki (z tej sesji)

- **`Test-Path` bez `-LiteralPath` łamie się na `[locale]`** → zawsze `-LiteralPath`.
- **Checkbox w planie NIE jest dowodem.** Dowód = plik na dysku + `git ls-files`.
  T34/T37 były `[x]` a plików nie było. Po każdej delegacji weryfikuj artefakty.
- **Delegacja w tej sesji padła 8×** (timeout 30 min, zero output).
  Jeśli nadal pada — pisać samemu.
- `rawJson` NOT NULL → bez niego insert aukcji się wywali.
- `pricePerLevel`/`searchVector` są GENERATED → próba insertu = błąd PG.
- FK na `items`/`outfits`/`mounts` → reference data musi być wstawiona zanim
  pojawią się relacje aukcji (Reference loop przed Full, albo upsert on-demand).
- `worlds.id` wymagane dla aukcji → need mapowanie nazwa świata → id.
- `mv_facet_counts` + `CONCURRENTLY` → wymaga UNIQUE index (inaczej błąd).

## 8. DODATKOWE LUKI ODKRYTE W REKONESANSIE (2026-09-15)

### 8.1 `createPgAdvisoryLockClient` NIE ISTNIEJE (potwierdzone grepem)
Komentarz `apps/scraper/src/index.ts:28` sugeruje:
```ts
startScheduler(db, { lockClient: createPgAdvisoryLockClient(pool) })
```
ale `grep createPgAdvisoryLockClient` w całym repo → **0 trafień**.
`apps/scraper/src/advisory-lock.ts` eksportuje tylko:
`AdvisoryLockClient`, `AdvisoryLockOptions`, `hashAdvisoryKey`, `tryAdvisoryLock`.

**Trzeba dopisać** pg-backed implementację (do `advisory-lock.ts` lub `wiring.ts`):
```ts
export interface AdvisoryLockClient {
  tryAdvisoryLock(key: bigint): Promise<boolean>;      // SELECT pg_try_advisory_lock($1)
  releaseAdvisoryLock(key: bigint): Promise<void>;     // SELECT pg_advisory_unlock($1)
  end?(): Promise<void>;
}
export function createPgAdvisoryLockClient(pool: Pool): AdvisoryLockClient { ... }
```
Uwaga: `pg_try_advisory_lock`/`pg_advisory_unlock` muszą iść na **tej samej sesji**
połączenia — przy `pg.Pool` trzeba dzierżawić jednego klienta (`pool.connect()`)
i trzymać go przez czas trwania locka, albo użyć dedykowanego połączenia.
To realna pułapka: `pg_try_advisory_lock` przez pool z auto-release
zwolni lock natychmiast.

### 8.2 Scraper `Item` nie ma `category` — DB wymaga NOT NULL
Scraper (`scrapers/reference-data.ts`):
```ts
ItemSchema   = { id, name, namePl: string|null, isStore, isRare, imageUrl }
OutfitSchema = { id, name, namePl: string|null, isStore, isRare, imageUrl }
MountSchema  = { id, name, namePl: string|null, isStore, isRare, imageUrl }
```
DB `items` wymaga: `category` (NOT NULL enum item_category), `marketPrice`,
`tcValue`, `isStoreItem` (scraper daje `isStore`!), `isRare`, `imageUrl`.

**Mapper `scraperItemToNewItem` musi:**
- `isStore` → `isStoreItem` (zmiana nazwy!)
- `category` → brak w źródle → default `'other'` (albo heurystyka)
- `marketPrice`, `tcValue` → `null` (DB dopuszcza null)
- `namePl` → przepisać (nullable OK)
`outfits`/`mounts` mapują się 1:1 (`isStore`/`isRare` zgodne z DB).

### 8.3 `mv_facet_counts` — gotowy SQL do reużycia
`packages/db/src/schema/views.ts` eksportuje już:
```ts
export const MV_FACET_COUNTS_REFRESH = sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts`;
export const MV_FACET_COUNTS_INDEX_DDL = sql`CREATE UNIQUE INDEX idx_mvf ON mv_facet_counts (vocation_base);`;
```
→ `refreshFacetCounts()` ma po prostu `await db.execute(MV_FACET_COUNTS_REFRESH)`.
UNIQUE index `idx_mvf` istnieje → CONCURRENTLY zadziała.

### 8.4 Kształty typów kalibracji (do mapowania wiersza DB → typ)
```ts
CalibrationSample = { auctionId: bigint; estimatedValue: bigint; finalPrice: bigint; vocation: Vocation }
CalibrationReport = { totalSamples: number; avgErrorPct: number; medianErrorPct: number; mape: number;
                      perVocation: Record<Vocation, VocationCalibrationStats>;
                      worstCases: readonly CalibrationResult[]; windowHours: number; generatedAt: string }
```
`fetchCalibrationSamples` musi zwrócić `estimatedValue`/`finalPrice` jako **bigint**
(DB `final_price` to integer → konwersja `BigInt(row.finalPrice)`).
`recordCalibrationRun` → insert do `scrape_runs` z `runType='calibration'`,
cały raport do `error_summary` (jsonb), `status='success'`.

### 8.5 `SchedulerOptions` (co przyjmuje `startScheduler`)
```ts
{ lockClient?: AdvisoryLockClient; logger?: Logger; revalidate?: RevalidateWebhook;
  intervals?: Partial<{fullMs, endingSoonMs, referenceMs}>; signal?: AbortSignal }
```
`startScheduler` zwraca `SchedulerHandle { start(): void; stop(): Promise<void>; ... }`
i sam woła `handle.start()` (index.ts:102). `stop()` zamyka DB → nie wołać `pool.end()` drugi raz.

## 9. Powiązania
- Plan: `.omo/plans/tibians.md` (T34, T37 oznaczone `[~]` jako regresja)
- Issues: `.omo/notepads/tibians/issues.md` (wpis o regresji T34/T37)
- Instrukcja deploy: `DEPLOYMENT.md` §9.2 (szkic fixu)
