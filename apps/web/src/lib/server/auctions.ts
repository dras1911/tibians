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

import { and, asc, desc, eq, gte, lte, sql, SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@tibians/db";
import { auctions, worlds } from "@tibians/db/schema";
import {
  auctionFiltersSchema,
  type AuctionFilters,
  type Pagination,
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
  worldRegion: "EU" | "NA" | "BR";
  worldPvpType:
    | "Open PvP"
    | "Optional PvP"
    | "Hardcore PvP"
    | "Retro Open PvP"
    | "Retro Hardcore PvP";
  worldBattleye: "protected" | "initially protected" | "not protected";
}

/**
 * Helper: buduje warunki WHERE z `AuctionFilters` — czyste Drizzle SQL,
 * używane przez listAuctions i endingSoon.
 */
function buildWhereConditions(filters: AuctionFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.status) {
    conditions.push(eq(auctions.status, filters.status));
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
    conditions.push(
      eq(auctions.hasCharmExpansion, filters.hasCharmExpansion),
    );
  }
  if (filters.hasWeeklyTaskExpansion !== undefined) {
    conditions.push(
      eq(auctions.hasWeeklyTaskExp, filters.hasWeeklyTaskExpansion),
    );
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
    conditions.push(
      sql`${auctions.searchVector} @@ plainto_tsquery('simple', ${filters.search})`,
    );
  }

  if (conditions.length === 0) return undefined;
  return and(...conditions);
}

/**
 * Mapowanie `skillType` (klucz AUCTION_SKILL_KEYS) → kolumna w auctions.
 * Arch. §7.1 pkt 1: skille są denormalizowanymi kolumnami.
 */
function skillColumn(
  skill:
    | "magic"
    | "club"
    | "fist"
    | "sword"
    | "axe"
    | "distance"
    | "shielding"
    | "fishing",
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
function orderColumn(
  col: z.infer<typeof auctionFiltersSchema>["sortBy"],
) {
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
  const orderByExpr =
    filters.sortDir === "asc" ? asc(sortCol) : desc(sortCol);

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

  const [countResult, rowsResult] = await Promise.all([
    countQuery,
    listQuery,
  ]);

  const total = countResult[0]?.count ?? 0;
  const rows = rowsResult as unknown as AuctionRow[];

  return { rows, total };
}

/**
 * Ending Soon — aukcje kończące się w ciągu `withinHours` godzin.
 */
export async function listEndingSoon(
  withinHours: number,
): Promise<AuctionRow[]> {
  const hoursInterval = sql.raw(`${withinHours} hour`);

  const rows = await db
    .select(AUCTION_PROJECTION)
    .from(auctions)
    .innerJoin(worlds, eq(auctions.worldId, worlds.id))
    .where(
      and(
        eq(auctions.status, "active"),
        lte(
          auctions.auctionEnd,
          sql`NOW() + (${hoursInterval})::interval`,
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
export async function getAuctionById(
  id: bigint,
): Promise<AuctionRow | null> {
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
// Stats endpoint — agregaty dla /api/stats
// ───────────────────────────────────────────────────────────────────────

export interface MarketStats {
  totalActive: number;
  totalFinished: number;
  avgLevel: number | null;
  topVocations: { vocation: string; count: number }[];
  topWorlds: { world: string; count: number }[];
}

/**
 * Statystyki rynkowe — agregaty z auctions + mv_facet_counts.
 */
export async function getMarketStats(): Promise<MarketStats> {
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

  const vocationQuery = db.execute<{
    vocation_base: string;
    total: number;
  }>(sql`
    SELECT vocation_base, total
    FROM mv_facet_counts
    ORDER BY total DESC
    LIMIT 5
  `);

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
    .limit(5);

  const [statusResult, vocationResult, worldResult] = await Promise.all([
    statusAggQuery,
    vocationQuery,
    worldQuery,
  ]);

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

  return {
    totalActive: status.total_active,
    totalFinished: status.total_finished,
    avgLevel:
      status.avg_level !== null
        ? Math.round(parseFloat(status.avg_level))
        : null,
    topVocations: vocationRows.map((r) => ({
      vocation: r.vocation_base,
      count: r.total,
    })),
    topWorlds: worldResult,
  };
}

// ───────────────────────────────────────────────────────────────────────
// MV refresh — REFRESH MATERIALIZED VIEW CONCURRENTLY
// ───────────────────────────────────────────────────────────────────────

/**
 * REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts (arch §7.2 + §10).
 */
export async function refreshFacetCounts(): Promise<void> {
  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_facet_counts`,
  );
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
export async function getWorldsByRegion(): Promise<
  Record<"EU" | "NA" | "BR", string[]>
> {
  const rows = await db
    .select({
      name: worlds.name,
      region: worlds.region,
    })
    .from(worlds)
    .where(eq(worlds.isActive, true))
    .orderBy(worlds.region, worlds.name);

  const result: Record<"EU" | "NA" | "BR", string[]> = { EU: [], NA: [], BR: [] };
  for (const r of rows) {
    if (r.region === "EU" || r.region === "NA" || r.region === "BR") {
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
  totalActive: number;
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
function buildWhereExcept(
  filters: AuctionFilters,
  except: FilterField,
): SQL | undefined {
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

export async function getFacetCounts(
  filters: AuctionFilters,
): Promise<FacetCountsServer> {
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
    vocation: (vocR as unknown as { value: string; count: number }[]).map(
      (r) => ({ value: String(r.value), count: Number(r.count) }),
    ),
    region: (regR as unknown as { value: string; count: number }[]).map(
      (r) => ({ value: String(r.value), count: Number(r.count) }),
    ),
    world: (wR as unknown as { value: string; count: number }[]).map((r) => ({
      value: String(r.value),
      count: Number(r.count),
    })),
    pvpType: (pvpR as unknown as { value: string; count: number }[]).map(
      (r) => ({ value: String(r.value), count: Number(r.count) }),
    ),
    battleye: (beR as unknown as { value: string; count: number }[]).map(
      (r) => ({ value: String(r.value), count: Number(r.count) }),
    ),
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
export async function getSuggestionCounts(
  filters: AuctionFilters,
): Promise<SuggestionCount[]> {
  // Określ które filtry są aktywne (żeby nie generować "removeX" dla
  // nieaktywnego filtra — nie ma to sensu UX).
  const hasWorld = filters.world !== undefined;
  const hasRegion = filters.region !== undefined;
  const hasBidMax = filters.bidMax !== undefined;
  const hasSoulWar = filters.hasSoulWar === true;
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
  const queries: Array<{
    id: SuggestionCount["id"];
    patch: SuggestionCount["patch"];
    promise: Promise<number>;
    enabled: boolean;
  }> = [
    {
      id: "removeWorld",
      patch: { world: undefined },
      promise: countExcept("world"),
      enabled: hasWorld,
    },
    {
      id: "removeRegion",
      patch: { region: undefined },
      promise: countExcept("region"),
      enabled: hasRegion,
    },
    {
      id: "removeBidMax",
      patch: { bidMax: undefined },
      promise: countExcept("bidMax"),
      enabled: hasBidMax,
    },
    {
      id: "removeHasSoulWar",
      patch: { hasSoulWar: undefined },
      promise: countExcept("hasSoulWar"),
      enabled: hasSoulWar,
    },
    {
      id: "removeImbuesFull",
      patch: { imbuesFull: undefined },
      promise: countExcept("imbuesFull"),
      enabled: hasImbuesFull,
    },
    {
      id: "removeHasPreySlot",
      patch: { hasPreySlot: undefined },
      promise: countExcept("hasPreySlot"),
      enabled: hasPreySlot,
    },
    {
      id: "removeHasCharmExpansion",
      patch: { hasCharmExpansion: undefined },
      promise: countExcept("hasCharmExpansion"),
      enabled: hasCharmExpansion,
    },
    {
      id: "removeHasWeeklyTaskExpansion",
      patch: { hasWeeklyTaskExpansion: undefined },
      promise: countExcept("hasWeeklyTaskExpansion"),
      enabled: hasWeeklyTaskExp,
    },
    {
      id: "removeHasTwistOfFate",
      patch: { hasTwistOfFate: undefined },
      promise: countExcept("hasTwistOfFate"),
      enabled: hasTwistOfFate,
    },
    {
      id: "removeBattleye",
      patch: { battleye: undefined },
      promise: countExcept("battleye"),
      enabled: hasBattleye,
    },
    {
      id: "raiseBidMax",
      patch: hasBidMax
        ? { bidMax: nextBidMaxStep(filters.bidMax as number) }
        : { bidMax: undefined },
      promise: hasBidMax
        ? countWithPatch({ bidMax: nextBidMaxStep(filters.bidMax as number) })
        : Promise.resolve(0),
      enabled: hasBidMax,
    },
  ];

  const results = await Promise.all(
    queries.map(async (q) => ({
      id: q.id,
      patch: q.patch,
      count: q.enabled ? await q.promise : 0,
    })),
  );

  // Filtruj: tylko count > 0 (nie pokazuj "Usuń X → +0 wyników")
  // i posortuj malejąco po count (najlepsze sugestie na górze).
  const suggestions = results
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5) // UI: max 5 sugestii
    .map< SuggestionCount>((r) => ({
      id: r.id,
      count: r.count,
      patch: r.patch,
    }));

  return suggestions;
}

// Wyłączony nie używany import — sql alias() do późniejszego rozszerzenia relacji
void sql;
