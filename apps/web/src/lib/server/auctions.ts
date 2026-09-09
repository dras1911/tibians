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

// Wyłączony nie używany import — sql alias() do późniejszego rozszerzenia relacji
void sql;
