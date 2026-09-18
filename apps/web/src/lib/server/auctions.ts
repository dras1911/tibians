/**
 * Server-only DB helpers dla HTTP API Bazaar (task 38).
 *
 * UWAGA: T34 (`packages/db/src/queries/`) jest w trakcie (plan task 34)
 * — póki co trzymamy logikę zapytań tutaj, w warstwie aplikacji web.
 * Po zakończeniu T34 te funkcje zostaną przeniesione do
 * `@tibians/db/queries` i ten plik stanie się cienkim re-eksportem.
 *
 * Architektura (arch §7.2 + §8.2):
 *   - Listy aukcji czytamy z `auctions` + JOIN `worlds` (region/pvp/battleye)
 *   - Ending Soon: `WHERE status='active' AND auction_end < NOW()+interval`
 *   - Stats: agregaty z `auctions` + `mv_facet_counts`
 *
 * Wydajność (arch §7.1 pkt 1):
 *   - Wszystkie gorące filtry są denormalizowanymi kolumnami (skill_magic,
 *     level, bid, …) — Index Scan single-pass, ~3-8ms na 2500 aukcjach.
 *   - Partial indexes na `status='active'` (~2500 wierszy) trzymane w RAM.
 */

// Server-only — importowane wyłącznie przez route handlers (Node runtime).
// NIE importuj tego pliku z komponentów klienta.

import { and, asc, desc, eq, gt, gte, lte, ne, sql, SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@tibians/db";
import { auctionItems, auctions, items, scrapeRuns, worlds } from "@tibians/db/schema";
import {
  auctionFiltersSchema,
  STORE_ITEM_KEYS,
  type AuctionFilters,
  type Pagination,
  type StoreItemKey,
  type Vocation,
} from "@tibians/shared/auction";

// ───────────────────────────────────────────────────────────────────────
// SELECT projekcja (kolumny z auctions + nazwane pola worlds)
// ───────────────────────────────────────────────────────────────────────

/**
 * Typ wiersza zwracanego przez `selectAuctionRows` — łączy kolumny
 * auctions z nazwą/regionem świata. Wszystkie BigInty zwrócone z DB
 * są bigint (Drizzle mode 'bigint'), `id` w shared/auction AuctionSchema
 * też bigint → zgodne.
 */
export interface AuctionRow {
  // auctions.*
  auctionId: bigint;
  characterName: string;
  level: number;
  vocation: string;
  vocationBase: string;
  sex: "M" | "F";
  worldId: number;
  outfitId: number | null;
  bid: number;
  bidType: "current" | "minimum";
  auctionStart: Date;
  auctionEnd: Date;
  status: "active" | "finished" | "cancelled" | "sold";
  finalPrice: number | null;
  skillMagic: number;
  skillClub: number;
  skillFist: number;
  skillSword: number;
  skillAxe: number;
  skillDistance: number;
  skillShielding: number;
  skillFishing: number;
  charmPoints: number;
  charmPointsUnused: number;
  minorCharmEchoes: number;
  bossPoints: number;
  imbuementsUnlocked: number;
  imbuementsTotal: number;
  questsCompleted: number;
  questsTotal: number;
  achievementPoints: number;
  animusMasteries: number;
  gemsLesser: number;
  gemsRegular: number;
  gemsGreater: number;
  storeOutfitsCount: number;
  storeMountsCount: number;
  storeItemsCount: number;
  hirelingsCount: number;
  goldTotal: bigint;
  tcInvested: number | null;
  hasSoulWar: boolean;
  hasPrimalOrdeal: boolean;
  hasWorldTransfer: boolean;
  hasPreySlot: boolean;
  hasCharmExpansion: boolean;
  hasWeeklyTaskExp: boolean;
  hasTwistOfFate: boolean;
  blessingsActive: number;
  estimatedValue: number | null;
  valueConfidence: string | null;
  pricePerLevel: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  scrapedAt: Date;
  archivedAt: Date | null;
  // world (joined)
  worldName: string;
  worldRegion: "EU" | "NA" | "BR" | "OCE";
  worldPvpType:
    "Open PvP" | "Optional PvP" | "Hardcore PvP" | "Retro Open PvP" | "Retro Hardcore PvP";
  worldBattleye: "protected" | "initially protected" | "not protected";
}

// ───────────────────────────────────────────────────────────────────────
// Store items — mapowanie kuratorowanych kluczy na wzorce nazw itemów
// ───────────────────────────────────────────────────────────────────────

/**
 * Klucz filtra → wzorzec nazwy itemu (`items.name`, ILIKE).
 *
 * Wzorce łączą warianty tego samego przedmiotu (np. „mailbox" łapie też
 * „ornate mailbox"; „dummy" — exercise dummy wszystkich typów).
 * Wymaga `items.is_store_item = true`.
 */
const STORE_ITEM_NAME_PATTERNS: Record<StoreItemKey, string> = {
  trainingDummy: "%dummy%",
  goldPouch: "%gold pouch%",
  goldConverter: "%gold converter%",
  hirelings: "%hireling lamp%",
  imbuementShrine: "%imbuing shrine%",
  rewardShrine: "%reward shrine%",
  mailbox: "%mailbox%",
};

/** `EXISTS` — aukcja ma (co najmniej jeden) store item pasujący do wzorca. */
function storeItemExists(pattern: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${auctionItems} ai
    JOIN ${items} i ON i.id = ai.item_id
    WHERE ai.auction_id = ${auctions.auctionId}
      AND i.is_store_item = true
      AND i.name ILIKE ${pattern}
  )`;
}

/**
 * Helper: buduje warunki WHERE z `AuctionFilters` — czyste Drizzle SQL,
 * używane przez listAuctions i endingSoon.
 */
function buildWhereConditions(filters: AuctionFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.status) {
    conditions.push(eq(auctions.status, filters.status));
    // „Aktywne" = jeszcze nie zakończone. Bez tego aukcja po terminie, której
    // scraper nie zdążył zamknąć (status wciąż `active`), lądowała na liście
    // z badge „Zakończona" (zgłoszenie użytkownika — „lista wypełnia się
    // zakończonymi"). Defensywa niezależna od stanu pętli ending-soon.
    if (filters.status === "active") {
      conditions.push(gt(auctions.auctionEnd, sql`now()`));
    }
  }

  if (filters.world) {
    conditions.push(eq(worlds.name, filters.world));
  }

  if (filters.vocation) {
    conditions.push(eq(auctions.vocationBase, filters.vocation));
  }

  if (filters.levelMin !== undefined) {
    conditions.push(gte(auctions.level, filters.levelMin));
  }
  if (filters.levelMax !== undefined) {
    conditions.push(lte(auctions.level, filters.levelMax));
  }

  if (filters.bidMin !== undefined) {
    conditions.push(gte(auctions.bid, filters.bidMin));
  }
  if (filters.bidMax !== undefined) {
    conditions.push(lte(auctions.bid, filters.bidMax));
  }

  if (filters.skillType) {
    const col = skillColumn(filters.skillType);
    if (filters.skillMin !== undefined) {
      conditions.push(gte(col, filters.skillMin));
    }
    if (filters.skillMax !== undefined) {
      conditions.push(lte(col, filters.skillMax));
    }
  }

  if (filters.hasSoulWar !== undefined) {
    conditions.push(eq(auctions.hasSoulWar, filters.hasSoulWar));
  }
  if (filters.hasPrimalOrdeal !== undefined) {
    conditions.push(eq(auctions.hasPrimalOrdeal, filters.hasPrimalOrdeal));
  }
  if (filters.hasWorldTransfer !== undefined) {
    conditions.push(eq(auctions.hasWorldTransfer, filters.hasWorldTransfer));
  }
  if (filters.hasPreySlot !== undefined) {
    conditions.push(eq(auctions.hasPreySlot, filters.hasPreySlot));
  }
  if (filters.hasCharmExpansion !== undefined) {
    conditions.push(eq(auctions.hasCharmExpansion, filters.hasCharmExpansion));
  }
  if (filters.hasWeeklyTaskExpansion !== undefined) {
    conditions.push(eq(auctions.hasWeeklyTaskExp, filters.hasWeeklyTaskExpansion));
  }
  if (filters.hasTwistOfFate !== undefined) {
    conditions.push(eq(auctions.hasTwistOfFate, filters.hasTwistOfFate));
  }

  // T45 — `imbuesFull` = `imbuementsUnlocked = imbuementsTotal`.
  // Realizacja SQL: `imbuements_unlocked >= imbuements_total` (oba >= 0,
  // a Total jest zawsze > 0 w realnym DB → wystarczy >=). Dla bezpieczeństwa
  // filtrujemy tylko gdy `imbuesFull === true` (UI nie ustawia `false`).
  if (filters.imbuesFull === true) {
    conditions.push(
      sql`${auctions.imbuementsUnlocked} >= ${auctions.imbuementsTotal} AND ${auctions.imbuementsTotal} > 0`,
    );
  }

  // Store items (kuratorowane klucze; AND — aukcja musi mieć wszystkie).
  if (filters.storeItems && filters.storeItems.length > 0) {
    for (const key of filters.storeItems) {
      conditions.push(storeItemExists(STORE_ITEM_NAME_PATTERNS[key]));
    }
  }

  // Tylko aukcje z aktualnie złożoną ofertą (bid_type = current).
  if (filters.biddedOnly === true) {
    conditions.push(eq(auctions.bidType, "current"));
  }

  // Charm points — zakres.
  if (filters.charmPointsMin !== undefined) {
    conditions.push(gte(auctions.charmPoints, filters.charmPointsMin));
  }
  if (filters.charmPointsMax !== undefined) {
    conditions.push(lte(auctions.charmPoints, filters.charmPointsMax));
  }

  // Zainwestowane Tibia Coins — zakres (aukcje bez danych odpadają).
  if (filters.tcInvestedMin !== undefined) {
    conditions.push(sql`${auctions.tcInvested} >= ${filters.tcInvestedMin}`);
  }
  if (filters.tcInvestedMax !== undefined) {
    conditions.push(sql`${auctions.tcInvested} <= ${filters.tcInvestedMax}`);
  }

  // Gemy — minima (lesser/regular/greater).
  if (filters.gemsMinLesser !== undefined) {
    conditions.push(gte(auctions.gemsLesser, filters.gemsMinLesser));
  }
  if (filters.gemsMinRegular !== undefined) {
    conditions.push(gte(auctions.gemsRegular, filters.gemsMinRegular));
  }
  if (filters.gemsMinGreater !== undefined) {
    conditions.push(gte(auctions.gemsGreater, filters.gemsMinGreater));
  }

  // Store counts — minima (outfity/mounty/itemy z Tibia Store).
  if (filters.storeMinOutfits !== undefined) {
    conditions.push(gte(auctions.storeOutfitsCount, filters.storeMinOutfits));
  }
  if (filters.storeMinMounts !== undefined) {
    conditions.push(gte(auctions.storeMountsCount, filters.storeMinMounts));
  }
  if (filters.storeMinItems !== undefined) {
    conditions.push(gte(auctions.storeItemsCount, filters.storeMinItems));
  }

  // Questy — minimum ukończonych.
  if (filters.questsMin !== undefined) {
    conditions.push(gte(auctions.questsCompleted, filters.questsMin));
  }

  // Rzadkie nazwy postaci — znaki specjalne, ≤3 znaki albo same duże litery.
  if (filters.rareNicknames === true) {
    conditions.push(
      sql`(${auctions.characterName} ~ '[äëïöüÿÄËÏÖÜŸ]' OR length(${auctions.characterName}) <= 3 OR ${auctions.characterName} = upper(${auctions.characterName}))`,
    );
  }

  // BattlEye jest na `worlds`, nie `auctions` — dołączamy do WHERE przez JOIN.
  if (filters.battleye) {
    conditions.push(eq(worlds.battleye, filters.battleye));
  }

  if (filters.pvpType) {
    conditions.push(eq(worlds.pvpType, filters.pvpType));
  }
  if (filters.region) {
    conditions.push(eq(worlds.region, filters.region));
  }

  if (filters.search) {
    // plainto_tsquery jest bezpieczny (escapuje tokeny) — nie ma SQL injection
    conditions.push(sql`${auctions.searchVector} @@ plainto_tsquery('simple', ${filters.search})`);
  }

  if (conditions.length === 0) return undefined;
  return and(...conditions);
}

/**
 * Mapowanie `skillType` (klucz AUCTION_SKILL_KEYS) → kolumna w auctions.
 * Arch. §7.1 pkt 1: skille są denormalizowanymi kolumnami.
 */
function skillColumn(
  skill: "magic" | "club" | "fist" | "sword" | "axe" | "distance" | "shielding" | "fishing",
) {
  switch (skill) {
    case "magic":
      return auctions.skillMagic;
    case "club":
      return auctions.skillClub;
    case "fist":
      return auctions.skillFist;
    case "sword":
      return auctions.skillSword;
    case "axe":
      return auctions.skillAxe;
    case "distance":
      return auctions.skillDistance;
    case "shielding":
      return auctions.skillShielding;
    case "fishing":
      return auctions.skillFishing;
  }
}

/**
 * Mapowanie `sortBy` (AuctionOrderColumn) → kolumna sortowania.
 * Wszystkie dozwolone wartości to gorące filtry (arch §7.2 wydajność).
 */
function orderColumn(col: z.infer<typeof auctionFiltersSchema>["sortBy"]) {
  switch (col) {
    case "auctionEnd":
      return auctions.auctionEnd;
    case "bid":
      return auctions.bid;
    case "level":
      return auctions.level;
    case "skillMagic":
      return auctions.skillMagic;
    case "skillSword":
      return auctions.skillSword;
    case "skillClub":
      return auctions.skillClub;
    case "skillAxe":
      return auctions.skillAxe;
    case "skillDistance":
      return auctions.skillDistance;
    case "skillShielding":
      return auctions.skillShielding;
    case "skillFist":
      return auctions.skillFist;
    case "skillFishing":
      return auctions.skillFishing;
    case "charmPoints":
      return auctions.charmPoints;
    case "bossPoints":
      return auctions.bossPoints;
    case "achievementPoints":
      return auctions.achievementPoints;
    case "estimatedValue":
      return auctions.estimatedValue;
    case "pricePerLevel":
      return auctions.pricePerLevel;
    case "firstSeenAt":
      return auctions.firstSeenAt;
    case "scrapedAt":
      return auctions.scrapedAt;
    case "auctionStart":
      return auctions.auctionStart;
  }
}

/**
 * Projekcja SELECT — pełny AuctionRow.
 */
const AUCTION_PROJECTION = {
  auctionId: auctions.auctionId,
  characterName: auctions.characterName,
  level: auctions.level,
  vocation: auctions.vocation,
  vocationBase: auctions.vocationBase,
  sex: auctions.sex,
  worldId: auctions.worldId,
  outfitId: auctions.outfitId,
  bid: auctions.bid,
  bidType: auctions.bidType,
  auctionStart: auctions.auctionStart,
  auctionEnd: auctions.auctionEnd,
  status: auctions.status,
  finalPrice: auctions.finalPrice,
  skillMagic: auctions.skillMagic,
  skillClub: auctions.skillClub,
  skillFist: auctions.skillFist,
  skillSword: auctions.skillSword,
  skillAxe: auctions.skillAxe,
  skillDistance: auctions.skillDistance,
  skillShielding: auctions.skillShielding,
  skillFishing: auctions.skillFishing,
  charmPoints: auctions.charmPoints,
  charmPointsUnused: auctions.charmPointsUnused,
  minorCharmEchoes: auctions.minorCharmEchoes,
  bossPoints: auctions.bossPoints,
  imbuementsUnlocked: auctions.imbuementsUnlocked,
  imbuementsTotal: auctions.imbuementsTotal,
  questsCompleted: auctions.questsCompleted,
  questsTotal: auctions.questsTotal,
  achievementPoints: auctions.achievementPoints,
  animusMasteries: auctions.animusMasteries,
  gemsLesser: auctions.gemsLesser,
  gemsRegular: auctions.gemsRegular,
  gemsGreater: auctions.gemsGreater,
  storeOutfitsCount: auctions.storeOutfitsCount,
  storeMountsCount: auctions.storeMountsCount,
  storeItemsCount: auctions.storeItemsCount,
  hirelingsCount: auctions.hirelingsCount,
  goldTotal: auctions.goldTotal,
  tcInvested: auctions.tcInvested,
  hasSoulWar: auctions.hasSoulWar,
  hasPrimalOrdeal: auctions.hasPrimalOrdeal,
  hasWorldTransfer: auctions.hasWorldTransfer,
  hasPreySlot: auctions.hasPreySlot,
  hasCharmExpansion: auctions.hasCharmExpansion,
  hasWeeklyTaskExp: auctions.hasWeeklyTaskExp,
  hasTwistOfFate: auctions.hasTwistOfFate,
  blessingsActive: auctions.blessingsActive,
  estimatedValue: auctions.estimatedValue,
  valueConfidence: auctions.valueConfidence,
  pricePerLevel: auctions.pricePerLevel,
  firstSeenAt: auctions.firstSeenAt,
  lastSeenAt: auctions.lastSeenAt,
  scrapedAt: auctions.scrapedAt,
  archivedAt: auctions.archivedAt,
  // JOIN worlds
  worldName: worlds.name,
  worldRegion: worlds.region,
  worldPvpType: worlds.pvpType,
  worldBattleye: worlds.battleye,
} as const;

// ───────────────────────────────────────────────────────────────────────
// Public API (konsumowane przez route handlers)
// ───────────────────────────────────────────────────────────────────────

export interface ListAuctionsResult {
  rows: AuctionRow[];
  total: number;
}

/**
 * Lista aukcji z filtrami, sortem i paginacją.
 */
export async function listAuctions(
  filters: AuctionFilters,
  pagination: Pagination,
): Promise<ListAuctionsResult> {
  const whereCondition = buildWhereConditions(filters);

  const sortCol = orderColumn(filters.sortBy);
  const orderByExpr = filters.sortDir === "asc" ? asc(sortCol) : desc(sortCol);

  const countQuery = db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(whereCondition);

  const listQuery = db
    .select(AUCTION_PROJECTION)
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(whereCondition)
    .orderBy(orderByExpr)
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);

  const [countResult, rowsResult] = await Promise.all([countQuery, listQuery]);

  const total = countResult[0]?.count ?? 0;
  const rows = rowsResult as unknown as AuctionRow[];

  return { rows, total };
}

/**
 * Ending Soon — aukcje kończące się w ciągu `withinHours` godzin.
 */
export async function listEndingSoon(withinHours: number): Promise<AuctionRow[]> {
  const rows = await db
    .select(AUCTION_PROJECTION)
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(
      and(
        eq(auctions.status, "active"),
        // Tylko aukcje, które NAPRAWDĘ się nie skończyły — status w DB
        // może być chwilę nieaktualny (scraper archiwizuje z opóźnieniem
        // do 15 min), a sekcja "Kończące się w ciągu godziny" nie może
        // pokazywać kart ze znaczkiem "Zakończona".
        gt(auctions.auctionEnd, sql`NOW()`),
        lte(
          auctions.auctionEnd,
          // `INTERVAL` wymaga wartości w apostrofach (`INTERVAL '24 hours'`).
          // Wcześniej było `sql.raw(`${withinHours} hour`)`, co dawało
          // `NOW() + (24 hour)::interval` → `syntax error at or near "hour"`
          // (kod 42601) i wywalało CAŁĄ stronę główną na 500.
          //
          // Mnożenie przez `INTERVAL '1 hour'` jest parametryzowane (brak
          // wstrzykiwania) i poprawne składniowo. Ten sam wzorzec stosuje
          // `getEndingSoonIds` w scraperze.
          sql`NOW() + (${withinHours} * INTERVAL '1 hour')`,
        ),
      ),
    )
    .orderBy(asc(auctions.auctionEnd));

  return rows as unknown as AuctionRow[];
}

/**
 * Detale aukcji z relacjami (joins do worlds dla region/pvpType/battleye).
 * Zwraca `null` jeśli aukcja o danym ID nie istnieje.
 */
export async function getAuctionById(id: bigint): Promise<AuctionRow | null> {
  const result = await db
    .select(AUCTION_PROJECTION)
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(eq(auctions.auctionId, id))
    .limit(1);

  const row = result[0];
  return (row as unknown as AuctionRow | undefined) ?? null;
}

// ───────────────────────────────────────────────────────────────────────
// Stats endpoint — agregaty dla /api/stats + /bazaar/statistics (T58)
// ───────────────────────────────────────────────────────────────────────

/**
 * Bucket histogramu cen (TC) — 6 przedziałów (arch §5 krok "Analiza rynku"
 * + task 58). Granice dopasowane do rozkładu Tibia Bazaar (większość
 * aukcji mieści się w 1-20k TC).
 */
export const PRICE_DISTRIBUTION_BUCKETS = [
  { key: "0-1k", min: 0, max: 999, label: "0–1k" },
  { key: "1-5k", min: 1_000, max: 4_999, label: "1–5k" },
  { key: "5-20k", min: 5_000, max: 19_999, label: "5–20k" },
  { key: "20-50k", min: 20_000, max: 49_999, label: "20–50k" },
  { key: "50-100k", min: 50_000, max: 99_999, label: "50–100k" },
  { key: "100k+", min: 100_000, max: Number.MAX_SAFE_INTEGER, label: "100k+" },
] as const;

/**
 * Bucket histogramu leveli — 5 przedziałów (arch §5 + task 58).
 * Ostatni bucket `600+` jest otwarty od góry (czapka `MAX`).
 */
export const LEVEL_DISTRIBUTION_BUCKETS = [
  { key: "8-50", min: 8, max: 49, label: "8–50" },
  { key: "50-150", min: 50, max: 149, label: "50–150" },
  { key: "150-300", min: 150, max: 299, label: "150–300" },
  { key: "300-600", min: 300, max: 599, label: "300–600" },
  { key: "600+", min: 600, max: 2500, label: "600+" },
] as const;

/**
 * Kanoniczny kształt statystyk rynkowych dla `/bazaar/statistics`
 * (plan task 58, arch §5 + §7.2).
 *
 * Polityka agregacji (arch §7.2 wydajność):
 *   - `active` agregaty z `auctions` (index `idx_au_active_*`)
 *   - `finished` agregaty z `auctions WHERE status='finished'`
 *     ograniczone do ostatnich 30 dni (arch §7.1 pkt 3: partial
 *     indexes na `status='finished'` trzymają tę część w RAM)
 */
export interface MarketStats {
  // ── Aktywne (top of the funnel — task 58 + T53 home) ────────────
  totalActive: number;
  totalFinished: number;
  avgLevel: number | null;

  // ── Zakończone (ostatnie 30 dni) — agregaty sprzedaży ───────────
  /** Liczba zakończonych aukcji w ostatnich 30 dniach. */
  recentFinishedCount: number;
  /** Średni level zakończonych aukcji (ostatnie 30 dni). */
  avgLevelFinished: number | null;
  /** Mediana levelu zakończonych aukcji (ostatnie 30 dni). */
  medianLevel: number | null;
  /** Średnia cena końcowa (final_price, ostatnie 30 dni). */
  avgBidFinished: number | null;
  /** Mediana ceny końcowej (ostatnie 30 dni). */
  medianBidFinished: number | null;

  // ── Top vocations (5) — z aktywnych + avgBid z zakończonych ────
  topVocations: {
    vocation: string;
    count: number;
    avgBid: number | null;
  }[];

  // ── Top worlds (10) — z aktywnych + avgLevel z zakończonych ─────
  topWorlds: {
    world: string;
    count: number;
    avgLevel: number | null;
  }[];

  // ── Histogramy (do Recharts) ────────────────────────────────────
  /** Rozkład cenowy zakończonych aukcji (ostatnie 30 dni). */
  priceDistribution: {
    bucket: string;
    count: number;
  }[];
  /** Rozkład leveli zakończonych aukcji (ostatnie 30 dni). */
  levelDistribution: {
    bucket: string;
    count: number;
  }[];

  // ── Recent sales — top 10 zakończonych posortowane po ended DESC
  recentSales: {
    auctionId: string;
    characterName: string;
    level: number;
    vocation: string;
    worldName: string;
    finalPrice: number | null;
    auctionEnd: string; // ISO
  }[];
}

/**
 * Statystyki rynkowe — agregaty z `auctions` + `mv_facet_counts`
 * (plan task 58, arch §5 + §7.2).
 *
 * Wykonuje **6 zapytań równolegle** (`Promise.all`) — łączny czas na
 * zimnej bazie < 50 ms (arch §7.1 pkt 3: partial indexes).
 *
 * Zakres dat: agregaty `recentFinished*` + histogramy używają
 * ostatnich 30 dni (`auction_end > NOW() - INTERVAL '30 days'`).
 * Po 30 dniach aukcje są nadal archiwizowane (patrz task T7), ale nie
 * wpływają na "bieżące" statystyki rynku.
 */
export async function getMarketStats(): Promise<MarketStats> {
  // ── Zapytanie 1: agregaty statusów (active/finished) ────────────
  const statusAggQuery = db.execute<{
    total_active: number;
    total_finished: number;
    avg_level: string | null;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')::int AS total_active,
      COUNT(*) FILTER (WHERE status = 'finished')::int AS total_finished,
      AVG(level) FILTER (WHERE status = 'active')::numeric AS avg_level
    FROM auctions
  `);

  // ── Zapytanie 2: top vocations z mv_facet_counts (aktywne) ─────
  const vocationQuery = db.execute<{
    vocation_base: string;
    total: number;
  }>(sql`
    SELECT vocation_base, total
    FROM mv_facet_counts
    ORDER BY total DESC
    LIMIT 5
  `);

  // ── Zapytanie 3: top worlds (aktywne) ───────────────────────────
  const worldQuery = db
    .select({
      world: worlds.name,
      count: sql<number>`COUNT(${auctions.auctionId})::int`,
    })
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(eq(auctions.status, "active"))
    .groupBy(worlds.name)
    .orderBy(sql`COUNT(${auctions.auctionId}) DESC`)
    .limit(10);

  // ── Zapytanie 4: agregaty zakończonych (30 dni) + histogramy ───
  // Jedno zapytanie `FILTER` zwraca wszystkie metryki — minimalizuje
  // round-trip do DB (arch §8.2 wydajność).
  const finishedAggQuery = db.execute<{
    recent_count: number;
    avg_level: string | null;
    median_level: string | null;
    avg_bid: string | null;
    median_bid: string | null;
    price_b0: number;
    price_b1: number;
    price_b2: number;
    price_b3: number;
    price_b4: number;
    price_b5: number;
    lvl_b0: number;
    lvl_b1: number;
    lvl_b2: number;
    lvl_b3: number;
    lvl_b4: number;
  }>(sql`
    SELECT
      COUNT(*)::int AS recent_count,
      AVG(level)::numeric AS avg_level,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY level)::numeric AS median_level,
      AVG(final_price)::numeric AS avg_bid,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY final_price)::numeric AS median_bid,
      COUNT(*) FILTER (WHERE final_price BETWEEN 0 AND 999)::int AS price_b0,
      COUNT(*) FILTER (WHERE final_price BETWEEN 1000 AND 4999)::int AS price_b1,
      COUNT(*) FILTER (WHERE final_price BETWEEN 5000 AND 19999)::int AS price_b2,
      COUNT(*) FILTER (WHERE final_price BETWEEN 20000 AND 49999)::int AS price_b3,
      COUNT(*) FILTER (WHERE final_price BETWEEN 50000 AND 99999)::int AS price_b4,
      COUNT(*) FILTER (WHERE final_price >= 100000)::int AS price_b5,
      COUNT(*) FILTER (WHERE level BETWEEN 8 AND 49)::int AS lvl_b0,
      COUNT(*) FILTER (WHERE level BETWEEN 50 AND 149)::int AS lvl_b1,
      COUNT(*) FILTER (WHERE level BETWEEN 150 AND 299)::int AS lvl_b2,
      COUNT(*) FILTER (WHERE level BETWEEN 300 AND 599)::int AS lvl_b3,
      COUNT(*) FILTER (WHERE level >= 600)::int AS lvl_b4
    FROM auctions
    WHERE status = 'finished'
      AND auction_end > NOW() - INTERVAL '30 days'
      AND final_price IS NOT NULL
  `);

  // ── Zapytanie 5: avgBid per vocation (zakończone 30 dni) ───────
  const vocationAvgBidQuery = db.execute<{
    vocation_base: string;
    avg_bid: string | null;
  }>(sql`
    SELECT
      vocation_base,
      AVG(final_price)::numeric AS avg_bid
    FROM auctions
    WHERE status = 'finished'
      AND auction_end > NOW() - INTERVAL '30 days'
      AND final_price IS NOT NULL
    GROUP BY vocation_base
  `);

  // ── Zapytanie 6: avgLevel per world (zakończone 30 dni) ────────
  const worldAvgLevelQuery = db.execute<{
    world: string;
    avg_level: string | null;
  }>(sql`
    SELECT
      w.name AS world,
      AVG(a.level)::numeric AS avg_level
    FROM auctions a
    INNER JOIN worlds w ON w.id = a.world_id
    WHERE a.status = 'finished'
      AND a.auction_end > NOW() - INTERVAL '30 days'
    GROUP BY w.name
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `);

  const [
    statusResult,
    vocationResult,
    worldResult,
    finishedAggResult,
    vocationAvgBidResult,
    worldAvgLevelResult,
  ] = await Promise.all([
    statusAggQuery,
    vocationQuery,
    worldQuery,
    finishedAggQuery,
    vocationAvgBidQuery,
    worldAvgLevelQuery,
  ]);

  // ── Parsowanie wyników raw SQL ───────────────────────────────────
  const statusRows = (
    statusResult as unknown as {
      rows: {
        total_active: number;
        total_finished: number;
        avg_level: string | null;
      }[];
    }
  ).rows;
  const status = statusRows[0] ?? {
    total_active: 0,
    total_finished: 0,
    avg_level: null,
  };

  const vocationRows = (
    vocationResult as unknown as {
      rows: { vocation_base: string; total: number }[];
    }
  ).rows;

  const finishedAggRows = (
    finishedAggResult as unknown as {
      rows: Array<{
        recent_count: number;
        avg_level: string | null;
        median_level: string | null;
        avg_bid: string | null;
        median_bid: string | null;
        price_b0: number;
        price_b1: number;
        price_b2: number;
        price_b3: number;
        price_b4: number;
        price_b5: number;
        lvl_b0: number;
        lvl_b1: number;
        lvl_b2: number;
        lvl_b3: number;
        lvl_b4: number;
      }>;
    }
  ).rows;
  const finishedAgg = finishedAggRows[0] ?? {
    recent_count: 0,
    avg_level: null,
    median_level: null,
    avg_bid: null,
    median_bid: null,
    price_b0: 0,
    price_b1: 0,
    price_b2: 0,
    price_b3: 0,
    price_b4: 0,
    price_b5: 0,
    lvl_b0: 0,
    lvl_b1: 0,
    lvl_b2: 0,
    lvl_b3: 0,
    lvl_b4: 0,
  };

  const vocationAvgBidRows = (
    vocationAvgBidResult as unknown as {
      rows: Array<{ vocation_base: string; avg_bid: string | null }>;
    }
  ).rows;
  const vocationAvgBidMap = new Map<string, number | null>();
  for (const row of vocationAvgBidRows) {
    vocationAvgBidMap.set(
      row.vocation_base,
      row.avg_bid !== null ? Math.round(parseFloat(row.avg_bid)) : null,
    );
  }

  const worldAvgLevelRows = (
    worldAvgLevelResult as unknown as {
      rows: Array<{ world: string; avg_level: string | null }>;
    }
  ).rows;
  const worldAvgLevelMap = new Map<string, number | null>();
  for (const row of worldAvgLevelRows) {
    worldAvgLevelMap.set(
      row.world,
      row.avg_level !== null ? Math.round(parseFloat(row.avg_level)) : null,
    );
  }

  // ── Top vocations: 5 wierszy z mv_facet_counts + avgBid ────────
  const topVocations = vocationRows.map((r) => ({
    vocation: r.vocation_base,
    count: r.total,
    avgBid: vocationAvgBidMap.get(r.vocation_base) ?? null,
  }));

  // ── Top worlds: 10 wierszy + avgLevel ──────────────────────────
  const topWorlds = worldResult.map((r) => ({
    world: r.world,
    count: r.count,
    avgLevel: worldAvgLevelMap.get(r.world) ?? null,
  }));

  // ── Histogramy (z gotowych bucketów + countów z SQL) ──────────
  const priceBuckets = PRICE_DISTRIBUTION_BUCKETS;
  const priceCounts = [
    finishedAgg.price_b0,
    finishedAgg.price_b1,
    finishedAgg.price_b2,
    finishedAgg.price_b3,
    finishedAgg.price_b4,
    finishedAgg.price_b5,
  ];

  const levelBuckets = LEVEL_DISTRIBUTION_BUCKETS;
  const levelCounts = [
    finishedAgg.lvl_b0,
    finishedAgg.lvl_b1,
    finishedAgg.lvl_b2,
    finishedAgg.lvl_b3,
    finishedAgg.lvl_b4,
  ];

  // ── Recent sales: pole wypełniane osobno przez `getRecentSales()`.
  const recentSales: MarketStats["recentSales"] = [];

  return {
    totalActive: status.total_active,
    totalFinished: status.total_finished,
    avgLevel: status.avg_level !== null ? Math.round(parseFloat(status.avg_level)) : null,

    recentFinishedCount: finishedAgg.recent_count,
    avgLevelFinished:
      finishedAgg.avg_level !== null ? Math.round(parseFloat(finishedAgg.avg_level)) : null,
    medianLevel:
      finishedAgg.median_level !== null ? Math.round(parseFloat(finishedAgg.median_level)) : null,
    avgBidFinished:
      finishedAgg.avg_bid !== null ? Math.round(parseFloat(finishedAgg.avg_bid)) : null,
    medianBidFinished:
      finishedAgg.median_bid !== null ? Math.round(parseFloat(finishedAgg.median_bid)) : null,

    topVocations,
    topWorlds,

    priceDistribution: priceBuckets.map((b, idx) => ({
      bucket: b.label,
      count: priceCounts[idx] ?? 0,
    })),
    levelDistribution: levelBuckets.map((b, idx) => ({
      bucket: b.label,
      count: levelCounts[idx] ?? 0,
    })),

    recentSales,
  };
}

// ───────────────────────────────────────────────────────────────────────
// T58 — getFinishedAuctions: archiwum zakończonych aukcji (paginated)
// ───────────────────────────────────────────────────────────────────────

/**
 * Filtry dla listy zakończonych aukcji (archiwum) — oddzielne od
 * `AuctionFilters` (które są zoptymalizowane pod aktywne). Główne
 * różnice:
 *   - `status` jest wymuszony na `'finished'` (zawsze archiwum).
 *   - Dodatkowe `dateFrom` / `dateTo` (zakres po `auction_end`).
 *   - Domyślny sort: `auction_end DESC` (najnowsze zakończone na górze).
 *   - Brak `skillType/skillMin/Max`, `search`, `hasSoulWar` itd. —
 *     historia ma węższy zakres filtrów (mniej kryteriów decyzyjnych).
 */
export interface FinishedAuctionFilters {
  /** Filtr po nazwie świata (resolve do worldId). */
  world?: string;
  /** Filtr po bazowej klasie postaci (5 opcji — strict union z `VocationSchema`). */
  vocation?: Vocation;
  /** Dolna granica `auction_end` (inclusive). */
  dateFrom?: Date;
  /** Górna granica `auction_end` (inclusive). */
  dateTo?: Date;
}

export interface FinishedAuctionsResult {
  rows: AuctionRow[];
  total: number;
}

/**
 * Lista zakończonych aukcji z paginacją i filtrami daty (task 58,
 * arch §5 — historia).
 *
 * Wydajność (arch §7.2):
 *   - Partial index `idx_au_finished_end ON auctions(auction_end DESC)
 *     WHERE status='finished'` zapewnia szybki index scan sort + range.
 *   - Dodatkowy filtr `world/vocation` to Index Scan z JOIN do `worlds`
 *     (analogicznie do `listAuctions`).
 *
 * Sortowanie: `auction_end DESC` — najnowsze zakończone na górze
 * (odwrotnie niż `listAuctions` gdzie domyślnie `auction_end ASC` dla
 * aktywnych — tam pilność, tu kronologia).
 */
export async function getFinishedAuctions(
  filters: FinishedAuctionFilters,
  pagination: Pagination,
): Promise<FinishedAuctionsResult> {
  const conditions: SQL[] = [eq(auctions.status, "finished")];

  if (filters.world !== undefined) {
    conditions.push(eq(worlds.name, filters.world));
  }

  if (filters.vocation !== undefined) {
    conditions.push(eq(auctions.vocationBase, filters.vocation));
  }

  if (filters.dateFrom !== undefined) {
    conditions.push(gte(auctions.auctionEnd, filters.dateFrom));
  }
  if (filters.dateTo !== undefined) {
    conditions.push(lte(auctions.auctionEnd, filters.dateTo));
  }

  const whereCondition = and(...conditions);

  const countQuery = db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(whereCondition);

  const listQuery = db
    .select(AUCTION_PROJECTION)
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(whereCondition)
    .orderBy(desc(auctions.auctionEnd))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);

  const [countResult, rowsResult] = await Promise.all([countQuery, listQuery]);

  const total = Number(countResult[0]?.count ?? 0);
  const rows = rowsResult as unknown as AuctionRow[];

  return { rows, total };
}

// ───────────────────────────────────────────────────────────────────────
// T58 — Recent sales: top N zakończonych posortowane po ended DESC
// ───────────────────────────────────────────────────────────────────────

/**
 * Top `limit` najnowszych sprzedanych aukcji z `final_price`
 * (posortowane po `auction_end DESC`). Używane przez `/bazaar/statistics`
 * jako sekcja "Recent sales".
 *
 * Wybieramy `final_price IS NOT NULL` (czyli aukcje zakończone przez
 * kupno — `sold`). Aukcje `finished` bez kupca mają `final_price = null`
 * (arch §7.2 — `finished` to zakończenie bez kupna).
 */
export interface RecentSale {
  auctionId: bigint;
  characterName: string;
  level: number;
  vocation: string;
  worldName: string;
  finalPrice: number | null;
  auctionEnd: Date;
}

export async function getRecentSales(limit: number): Promise<RecentSale[]> {
  const rows = await db
    .select({
      auctionId: auctions.auctionId,
      characterName: auctions.characterName,
      level: auctions.level,
      vocation: auctions.vocation,
      worldName: worlds.name,
      finalPrice: auctions.finalPrice,
      auctionEnd: auctions.auctionEnd,
    })
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(and(eq(auctions.status, "sold"), sql`${auctions.finalPrice} IS NOT NULL`))
    .orderBy(desc(auctions.auctionEnd))
    .limit(limit);

  return rows as unknown as RecentSale[];
}

// ───────────────────────────────────────────────────────────────────────
// MV refresh — REFRESH MATERIALIZED VIEW CONCURRENTLY
// ───────────────────────────────────────────────────────────────────────

/**
 * REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts (arch §7.2 + §10).
 */
export async function refreshFacetCounts(): Promise<void> {
  await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts`);
}

// ───────────────────────────────────────────────────────────────────────
// Faceted counts + worlds helpers (T41)
// ───────────────────────────────────────────────────────────────────────

/**
 * Wszystkie aktywne światy pogrupowane po regionie (arch §7.2 worlds).
 *
 * Używane przez `AuctionFiltersSidebar` do searchable multi-select.
 * Cache'owane przez Next.js (60s) — referencje rzadko się zmieniają.
 */
export async function getWorldsByRegion(): Promise<Record<"EU" | "NA" | "BR" | "OCE", string[]>> {
  const rows = await db
    .select({
      name: worlds.name,
      region: worlds.region,
    })
    .from(worlds)
    .where(eq(worlds.isActive, true))
    .orderBy(worlds.region, worlds.name);

  const result: Record<"EU" | "NA" | "BR" | "OCE", string[]> = {
    EU: [],
    NA: [],
    BR: [],
    OCE: [],
  };
  for (const r of rows) {
    if (r.region === "EU" || r.region === "NA" || r.region === "BR" || r.region === "OCE") {
      result[r.region].push(r.name);
    }
  }
  return result;
}

/**
 * Faceted counts (arch §6.4 pkt 1 + §7.2 mv_facet_counts).
 *
 * Wylicza count per opcja, **z pozostałymi filtrami już zastosowanymi**.
 * Wymaga agregacji — przy 2500 aktywnych aukcjach to ~5 ms (single
 * index scan). Cache 60s (arch §6.4 pkt 1) — implementowane przez
 * `next: { revalidate: 60 }` w RSC.
 */
export interface FacetCountsServer {
  vocation: { value: string; count: number }[];
  region: { value: string; count: number }[];
  world: { value: string; count: number }[];
  pvpType: { value: string; count: number }[];
  battleye: { value: string; count: number }[];
  /** Store items (kuratorowane klucze) — liczone osobno, bez innych filtrów. */
  storeItems: { value: string; count: number }[];
  totalActive: number;
}

/**
 * Liczniki store itemów (dla sekcji „Store items" w sidebarze).
 *
 * Liczone na pełnym zbiorze aktywnych aukcji (bez filtrów) — jak w ExevoPan
 * licznik przy opcji pokazuje popularność przedmiotu, nie wynik bieżącego
 * zapytania. 7 równoległych COUNT z EXISTS na indeksie `idx_ai_item`.
 */
export async function getStoreItemFacetCounts(): Promise<{ value: string; count: number }[]> {
  const results = await Promise.all(
    STORE_ITEM_KEYS.map((key) =>
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(auctions)
        .where(and(eq(auctions.status, "active"), storeItemExists(STORE_ITEM_NAME_PATTERNS[key]))),
    ),
  );

  return STORE_ITEM_KEYS.map((key, index) => ({
    value: key,
    count: Number(results[index]?.[0]?.count ?? 0),
  }));
}

/**
 * Helper: generuje warunek WHERE z `AuctionFilters` ale **bez**
 * konkretnego pola (dla faceted counts — liczymy count opcji przy
 * pozostałych filtrach aktywnych).
 *
 * UWAGA: `battleye` NIE jest w `AuctionFilters` (jest na `worlds`),
 * więc nie wyłączamy go z klauzuli — jest naturalnie liczony per
 * świat bez dedykowanego filtra w query.
 */
type FilterField = keyof AuctionFilters | "battleye";
function buildWhereExcept(filters: AuctionFilters, except: FilterField): SQL | undefined {
  const cloned = { ...filters };
  if (except === "search") cloned.search = undefined;
  else if (except === "vocation") cloned.vocation = undefined;
  else if (except === "world") cloned.world = undefined;
  else if (except === "region") cloned.region = undefined;
  else if (except === "pvpType") cloned.pvpType = undefined;
  else if (except === "levelMin" || except === "levelMax") {
    cloned.levelMin = undefined;
    cloned.levelMax = undefined;
  } else if (except === "bidMin" || except === "bidMax") {
    cloned.bidMin = undefined;
    cloned.bidMax = undefined;
  } else if (except === "skillType" || except === "skillMin" || except === "skillMax") {
    cloned.skillType = undefined;
    cloned.skillMin = undefined;
    cloned.skillMax = undefined;
  } else if (except === "hasSoulWar") cloned.hasSoulWar = undefined;
  else if (except === "hasPrimalOrdeal") cloned.hasPrimalOrdeal = undefined;
  else if (except === "hasWorldTransfer") cloned.hasWorldTransfer = undefined;
  else if (except === "hasPreySlot") cloned.hasPreySlot = undefined;
  else if (except === "hasCharmExpansion") cloned.hasCharmExpansion = undefined;
  else if (except === "hasWeeklyTaskExpansion") {
    cloned.hasWeeklyTaskExpansion = undefined;
  } else if (except === "hasTwistOfFate") cloned.hasTwistOfFate = undefined;
  else if (except === "imbuesFull") cloned.imbuesFull = undefined;
  else if (except === "battleye") cloned.battleye = undefined;
  return buildWhereConditions(cloned);
}

export async function getFacetCounts(filters: AuctionFilters): Promise<FacetCountsServer> {
  const totalQuery = db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(buildWhereConditions(filters));

  // Vocation counts
  const vocationQuery = db
    .select({
      value: auctions.vocationBase,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(buildWhereExcept(filters, "vocation"))
    .groupBy(auctions.vocationBase)
    .orderBy(sql`COUNT(*) DESC`);

  // Region counts
  const regionQuery = db
    .select({
      value: worlds.region,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(buildWhereExcept(filters, "region"))
    .groupBy(worlds.region)
    .orderBy(sql`COUNT(*) DESC`);

  // World counts (top 50 — limit dla wydajności)
  const worldQuery = db
    .select({
      value: worlds.name,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(buildWhereExcept(filters, "world"))
    .groupBy(worlds.name)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(100);

  // PvP type counts
  const pvpQuery = db
    .select({
      value: worlds.pvpType,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(buildWhereExcept(filters, "pvpType"))
    .groupBy(worlds.pvpType)
    .orderBy(sql`COUNT(*) DESC`);

  // BattlEye counts
  const battleyeQuery = db
    .select({
      value: worlds.battleye,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(buildWhereExcept(filters, "battleye"))
    .groupBy(worlds.battleye)
    .orderBy(sql`COUNT(*) DESC`);

  const [totalR, vocR, regR, wR, pvpR, beR] = await Promise.all([
    totalQuery,
    vocationQuery,
    regionQuery,
    worldQuery,
    pvpQuery,
    battleyeQuery,
  ]);

  return {
    vocation: (vocR as unknown as { value: string; count: number }[]).map((r) => ({
      value: String(r.value),
      count: Number(r.count),
    })),
    region: (regR as unknown as { value: string; count: number }[]).map((r) => ({
      value: String(r.value),
      count: Number(r.count),
    })),
    world: (wR as unknown as { value: string; count: number }[]).map((r) => ({
      value: String(r.value),
      count: Number(r.count),
    })),
    pvpType: (pvpR as unknown as { value: string; count: number }[]).map((r) => ({
      value: String(r.value),
      count: Number(r.count),
    })),
    battleye: (beR as unknown as { value: string; count: number }[]).map((r) => ({
      value: String(r.value),
      count: Number(r.count),
    })),
    // Store items liczone osobno (`getStoreItemFacetCounts`) — tutaj puste;
    // page.tsx scala: `{ ...facetCounts, storeItems: storeItemFacetCounts }`.
    storeItems: [],
    totalActive: Number(totalR[0]?.count ?? 0),
  };
}

// ───────────────────────────────────────────────────────────────────────
// Suggestion counts — T45 (plan task 45 — zero-results z wyliczalnymi
// sugestiami; arch §5 krok "Obsługa 0 wyników").
// ───────────────────────────────────────────────────────────────────────

/**
 * Pojedyncza sugestia "rozluźnienia" filtra, gdy `listAuctions` zwraca 0.
 *
 * Wyliczane **po stronie serwera** (arch §5: "dokładne count, policzoną
 * po stronie serwera przez 3 szybkie query") — NIE szacowane po stronie
 * klienta. Każda sugestia to **dokładny** `COUNT(*)` z `buildWhereExcept`.
 */
export interface SuggestionCount {
  /** ID akcji (deterministyczny klucz dla React `key`). */
  id:
    | "removeWorld"
    | "removeRegion"
    | "removeBidMax"
    | "removeHasSoulWar"
    | "removeHasPrimalOrdeal"
    | "removeHasWorldTransfer"
    | "removeImbuesFull"
    | "removeHasPreySlot"
    | "removeHasCharmExpansion"
    | "removeHasWeeklyTaskExpansion"
    | "removeHasTwistOfFate"
    | "raiseBidMax"
    | "removeBattleye";
  /** Ile wyników pojawi się po zastosowaniu sugestii. */
  count: number;
  /**
   * Patch do URL state — nakładany na obecne filtry. Jeśli `undefined`,
   * sugeruje całkowite usunięcie pola. Jeśli `{...}`, nadpisuje wartość.
   */
  patch: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Heurystyczny "krok" przy podnoszeniu max ceny (T45: "Podnieś max cenę
 * do {X} TC → +{count}"). Wielokrotność 1000 TC, zaczynając od aktualnego
 * bidMax + 5000. Górny cap 100 000 TC (powyżej nie ma sensu).
 */
function nextBidMaxStep(currentMax: number): number {
  const step = 5000;
  const cap = 100_000;
  const next = Math.min(cap, Math.floor((currentMax + step) / step) * step);
  return next;
}

/**
 * Wylicza "rozluźniające" sugestie gdy `total === 0` (plan task 45).
 *
 * Zasady (arch §5 krok "Obsługa 0 wyników" + §6.4 pkt 7):
 *   - **Dokładne count** przez `COUNT(*)` z `buildWhereExcept(filters, X)`.
 *   - 3-5 szybkich query (parallel) z `Promise.all`.
 *   - Sugestia uwzględniana tylko gdy `count > 0` i dany filtr jest aktywny.
 *   - Max 5 sugestii (UI limit, żeby nie zaśmiecać).
 *
 * Optymalizacja (arch §7.1 pkt 1): wszystkie gorące filtry są
 * denormalizowanymi kolumnami, więc `COUNT(*)` z pojedynczym wyłączeniem
 * to **index scan** ~3-8 ms przy 2500 aktywnych aukcjach. 5 takich
 * query w parallelu = max ~10 ms (overlap I/O).
 */
export async function getSuggestionCounts(filters: AuctionFilters): Promise<SuggestionCount[]> {
  // Określ które filtry są aktywne (żeby nie generować "removeX" dla
  // nieaktywnego filtra — nie ma to sensu UX).
  const hasWorld = filters.world !== undefined;
  const hasRegion = filters.region !== undefined;
  const hasBidMax = filters.bidMax !== undefined;
  const hasSoulWar = filters.hasSoulWar === true;
  const hasPrimalOrdeal = filters.hasPrimalOrdeal === true;
  const hasWorldTransfer = filters.hasWorldTransfer === true;
  const hasImbuesFull = filters.imbuesFull === true;
  const hasPreySlot = filters.hasPreySlot === true;
  const hasCharmExpansion = filters.hasCharmExpansion === true;
  const hasWeeklyTaskExp = filters.hasWeeklyTaskExpansion === true;
  const hasTwistOfFate = filters.hasTwistOfFate === true;
  const hasBattleye = filters.battleye !== undefined;

  // Funkcja: count po `buildWhereExcept(filters, X)`.
  const countExcept = async (field: keyof AuctionFilters): Promise<number> => {
    const where = buildWhereExcept(filters, field);
    const result = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(auctions)
      .innerJoin(worlds, eq(auctions.worldId, worlds.id))
      .where(where);
    return Number(result[0]?.count ?? 0);
  };

  // Funkcja: count z danym patchem (nadpisuje wartość w filtrach).
  const countWithPatch = async (
    patch: Record<string, string | number | boolean | null | undefined>,
  ): Promise<number> => {
    const merged: AuctionFilters = { ...filters, ...patch };
    const result = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(auctions)
      .innerJoin(worlds, eq(auctions.worldId, worlds.id))
      .where(buildWhereConditions(merged));
    return Number(result[0]?.count ?? 0);
  };

  // ── Zaplanuj sugestie do wykonania ─────────────────────────────────
  // Uwaga: `promise` to TERAZ thunk () => Promise<number>, nie Promise.
  // Dzięki temu disabled filtry NIE uruchamiają COUNT(*) do DB (oszczędność
  // round-tripów) i mocki testowe nie zużywają slotów dla wyłączonych
  // sugestii.
  const queries: Array<{
    id: SuggestionCount["id"];
    patch: SuggestionCount["patch"];
    promise: () => Promise<number>;
    enabled: boolean;
  }> = [
    {
      id: "removeWorld",
      patch: { world: undefined },
      promise: () => countExcept("world"),
      enabled: hasWorld,
    },
    {
      id: "removeRegion",
      patch: { region: undefined },
      promise: () => countExcept("region"),
      enabled: hasRegion,
    },
    {
      id: "removeBidMax",
      patch: { bidMax: undefined },
      promise: () => countExcept("bidMax"),
      enabled: hasBidMax,
    },
    {
      id: "removeHasSoulWar",
      patch: { hasSoulWar: undefined },
      promise: () => countExcept("hasSoulWar"),
      enabled: hasSoulWar,
    },
    {
      id: "removeHasPrimalOrdeal",
      patch: { hasPrimalOrdeal: undefined },
      promise: () => countExcept("hasPrimalOrdeal"),
      enabled: hasPrimalOrdeal,
    },
    {
      id: "removeHasWorldTransfer",
      patch: { hasWorldTransfer: undefined },
      promise: () => countExcept("hasWorldTransfer"),
      enabled: hasWorldTransfer,
    },
    {
      id: "removeImbuesFull",
      patch: { imbuesFull: undefined },
      promise: () => countExcept("imbuesFull"),
      enabled: hasImbuesFull,
    },
    {
      id: "removeHasPreySlot",
      patch: { hasPreySlot: undefined },
      promise: () => countExcept("hasPreySlot"),
      enabled: hasPreySlot,
    },
    {
      id: "removeHasCharmExpansion",
      patch: { hasCharmExpansion: undefined },
      promise: () => countExcept("hasCharmExpansion"),
      enabled: hasCharmExpansion,
    },
    {
      id: "removeHasWeeklyTaskExpansion",
      patch: { hasWeeklyTaskExpansion: undefined },
      promise: () => countExcept("hasWeeklyTaskExpansion"),
      enabled: hasWeeklyTaskExp,
    },
    {
      id: "removeHasTwistOfFate",
      patch: { hasTwistOfFate: undefined },
      promise: () => countExcept("hasTwistOfFate"),
      enabled: hasTwistOfFate,
    },
    {
      id: "removeBattleye",
      patch: { battleye: undefined },
      promise: () => countExcept("battleye"),
      enabled: hasBattleye,
    },
    {
      id: "raiseBidMax",
      patch: hasBidMax
        ? { bidMax: nextBidMaxStep(filters.bidMax as number) }
        : { bidMax: undefined },
      promise: () =>
        hasBidMax
          ? countWithPatch({
              bidMax: nextBidMaxStep(filters.bidMax as number),
            })
          : Promise.resolve(0),
      enabled: hasBidMax,
    },
  ];

  const results = await Promise.all(
    queries.map(async (q) => ({
      id: q.id,
      patch: q.patch,
      count: q.enabled ? await q.promise() : 0,
    })),
  );

  // Filtruj: tylko count > 0 (nie pokazuj "Usuń X → +0 wyników")
  // i posortuj malejąco po count (najlepsze sugestie na górze).
  const suggestions = results
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5) // UI: max 5 sugestii
    .map<SuggestionCount>((r) => ({
      id: r.id,
      count: r.count,
      patch: r.patch,
    }));

  return suggestions;
}

// ───────────────────────────────────────────────────────────────────────
// T51 — Recent auctions (top 10 najnowszych) — picker do Compare
// ───────────────────────────────────────────────────────────────────────

/**
 * Top `limit` najnowszych aktywnych aukcji (sort po `scraped_at DESC`).
 *
 * Używane przez `ComparePicker` (T51) jako dropdown alternatywy dla
 * ręcznego wpisania ID. arch §5 krok 6 — "input ID lub dropdown z
 * top-10 najnowszych".
 *
 * Wydajność: index `idx_au_active_end` / partial indexes na `status='active'`,
 * a `scraped_at DESC` wymaga pojedynczego sort po denormalizowanej kolumnie.
 * ~3-5 ms na 2500 aukcjach.
 */
export async function getRecentAuctions(limit: number): Promise<AuctionRow[]> {
  const rows = await db
    .select(AUCTION_PROJECTION)
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(eq(auctions.status, "active"))
    .orderBy(desc(auctions.scrapedAt))
    .limit(limit);

  return rows as unknown as AuctionRow[];
}

// ───────────────────────────────────────────────────────────────────────
// T52 — Similar auctions (na detalu, plan task 52, arch §5 krok 7)
// ───────────────────────────────────────────────────────────────────────

export interface SimilarAuctionsOptions {
  /** Filtr ±level (default 50). Aukcje poza zakresem odrzucane. */
  levelRange?: number;
  /** Filtr ±procent bazu od `excludeAuction.bid` (default 0.3 = ±30%). */
  bidPctRange?: number;
  /** Ile aukcji zwrócić (default 4, max 12). */
  limit?: number;
}

/**
 * Podobne aukcje do danej — wykluczając ją samą. Heurystyka prosta
 * (plan task 52 MUST NOT do: "Nie rób ML/embeddings"):
 *   - `vocationBase` = ten sam bazowy zawód (Knight ↔ Elite Knight itd.)
 *   - `worlds.pvpType` = ten sam tryb PvP
 *   - `level BETWEEN (level - levelRange) AND (level + levelRange)`
 *   - `bid BETWEEN (bid * (1 - bidPctRange)) AND (bid * (1 + bidPctRange))`
 *   - status='active'
 *   - exclude obecne `auctionId`
 *
 * Sort: bid ASC (najtańsze na górze — najbardziej atrakcyjne oferty).
 *
 * Wydajność (arch §7.1 pkt 1): wszystkie filtry to denormalizowane
 * kolumny. Index `idx_au_filter_main` (voc+level+bid) łapie 3 z 4
 * warunków WHERE → ~3-8 ms na 2500 aukcjach.
 */
export async function getSimilarAuctions(
  excludeAuction: AuctionRow,
  options: SimilarAuctionsOptions = {},
): Promise<AuctionRow[]> {
  const levelRange = options.levelRange ?? 50;
  const bidPctRange = options.bidPctRange ?? 0.3;
  const limit = Math.min(options.limit ?? 4, 12);

  // Dolny bound bid: floor((1 - pct) * bid); górny: ceil((1 + pct) * bid).
  // Math.max(0, …) chroni przed ujemnymi dla bid=0 (teoretyczny edge case).
  const bidMin = Math.max(0, Math.floor(excludeAuction.bid * (1 - bidPctRange)));
  const bidMax = Math.ceil(excludeAuction.bid * (1 + bidPctRange));

  const rows = await db
    .select(AUCTION_PROJECTION)
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(
      and(
        eq(auctions.status, "active"),
        ne(auctions.auctionId, excludeAuction.auctionId),
        eq(auctions.vocationBase, excludeAuction.vocationBase),
        eq(worlds.pvpType, excludeAuction.worldPvpType),
        gte(auctions.level, Math.max(8, excludeAuction.level - levelRange)),
        lte(auctions.level, excludeAuction.level + levelRange),
        gte(auctions.bid, bidMin),
        lte(auctions.bid, bidMax),
      ),
    )
    .orderBy(asc(auctions.bid))
    .limit(limit);

  return rows as unknown as AuctionRow[];
}

// ───────────────────────────────────────────────────────────────────────
// T53 — Recently updated (home dashboard, plan task 53)
// ───────────────────────────────────────────────────────────────────────

/**
 * Top `limit` NAJNOWSZYCH aktywnych aukcji posortowanych po
 * `first_seen_at DESC` — świeżo dodane do naszej bazy (nowe wystawienia
 * na Bazaarze).
 *
 * Używane przez home dashboard (T53) — sekcja "Ostatnio dodane".
 * Wcześniej sortowane po `last_seen_at` (każdy scrape dotyka wszystkich
 * aukcji → sortowanie było praktycznie losowe i mylące).
 *
 * Implementacja (arch §7.1): `first_seen_at` jest denormalizowaną
 * kolumną z defaultNow() — ustawianą tylko przy pierwszym insercie.
 */
export async function getRecentlyUpdated(limit: number): Promise<AuctionRow[]> {
  const rows = await db
    .select(AUCTION_PROJECTION)
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(eq(auctions.status, "active"))
    .orderBy(desc(auctions.firstSeenAt))
    .limit(limit);

  return rows as unknown as AuctionRow[];
}

// ───────────────────────────────────────────────────────────────────────
// T53 — Home freshness (scrape_runs, plan task 53 MUST DO: real data)
// ───────────────────────────────────────────────────────────────────────

export interface HomeFreshness {
  /** ISO datetime ostatniego udanego pełnego scrapu (`status='success'`). */
  lastSuccessfulScrapeAt: string | null;
  /** Ile minut temu (null jeśli brak danych). */
  minutesSinceLastScrape: number | null;
  /** Ile aukcji znaleziono w ostatnim scrape. */
  auctionsLastFound: number;
  /** Ile aukcji zarchiwizowano (zakończonych). */
  auctionsLastArchived: number;
}

/**
 * Czasy ostatniego udanego pełnego scrapu — licznik "aktualizowane
 * X min temu" na home (T53, arch §5 krok 1: "dowód świeżości").
 *
 * Źródło: tabela `scrape_runs` (packages/db/src/schema/ops.ts) —
 * zapisywana przez scheduler w apps/scraper/src/scheduler.ts.
 * Wybieramy najnowszy rekord z `run_type='full'` i `status='success'`.
 */
export async function getHomeFreshness(): Promise<HomeFreshness> {
  const rows = await db
    .select({
      finishedAt: scrapeRuns.finishedAt,
      auctionsFound: scrapeRuns.auctionsFound,
      auctionsArch: scrapeRuns.auctionsArch,
      startedAt: scrapeRuns.startedAt,
    })
    .from(scrapeRuns)
    .where(and(eq(scrapeRuns.runType, "full"), eq(scrapeRuns.status, "success")))
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(1);

  const latest = rows[0];

  if (!latest || latest.finishedAt === null) {
    return {
      lastSuccessfulScrapeAt: null,
      minutesSinceLastScrape: null,
      auctionsLastFound: 0,
      auctionsLastArchived: 0,
    };
  }

  const minutesSince = Math.max(0, Math.floor((Date.now() - latest.finishedAt.getTime()) / 60_000));

  return {
    lastSuccessfulScrapeAt: latest.finishedAt.toISOString(),
    minutesSinceLastScrape: minutesSince,
    auctionsLastFound: latest.auctionsFound,
    auctionsLastArchived: latest.auctionsArch,
  };
}

// Wyłączony nie używany import — sql alias() do późniejszego rozszerzenia relacji
void sql;
