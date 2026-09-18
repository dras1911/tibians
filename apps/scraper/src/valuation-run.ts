/**
 * Runner wyceny — spina wiersze `auctions` z silnikiem `estimateValue`
 * (T35, arch §8.4) i zapisuje wyniki (W18, 2026-09-18).
 *
 * DLACZEGO: silnik wyceny (`valuation.ts`) był w repo od dawna, ale NIKT
 * go nie wołał — `auctions.estimated_value` i `valuation_history` były puste
 * (0/2948). Ten moduł domyka pętlę:
 *
 *   1. `valuation_rules` (22 reguły, seed) → `ValuationRule[]`,
 *   2. wiersze `auctions` (status='active') → snapshot `Auction` (Zod strict),
 *   3. `estimateValue(snapshot, rules)` → `estimatedValue` (bigint),
 *   4. `UPDATE auctions.estimated_value` + `INSERT valuation_history`
 *      (breakdown spłaszczony: bigint → number, bo jsonb nie zna bigintów).
 *
 * Mapowanie wiersz→snapshot: pola 1:1 po nazwach, z trzema wyjątkami:
 *   - `id` ← `auctionId`, `name` ← `characterName`,
 *   - `vocation` (shared = BAZOWA) ← `vocationBase`; `vocationPromoted` ← `vocation`,
 *   - `hasWeeklyTaskExpansion` (shared) ← `hasWeeklyTaskExp` (DB),
 *   - daty: `Date` → ISO string.
 *
 * `AuctionSchema` jest `.strict()` — nadmiarowe pola odrzuci, więc
 * mapowanie jest jawnie wyliczone (bez spreadów).
 */

import { db } from "@tibians/db";
import { auctions, valuationHistory, valuationRules } from "@tibians/db/schema";
import { AuctionSchema, type Auction } from "@tibians/shared/auction";
import { and, eq, gt, or } from "drizzle-orm";

import { estimateValue, type ValuationBreakdown, type ValuationRule } from "./valuation.js";

export interface ValuationRunStats {
  /** Wiersze wzięte pod uwagę (status='active'). */
  readonly total: number;
  /** Udane wyceny (UPDATE + INSERT history). */
  readonly computed: number;
  /** Pominięte — walidacja `AuctionSchema` nie przeszła. */
  readonly skipped: number;
  /** Błędy (logowane, nie przerywają pętli). */
  readonly failed: number;
  /** Pierwsza wycena (do sanity-checku w logach). */
  readonly sampleEstimated: number | null;
  /** Próbka breakdownu pierwszej wyceny. */
  readonly sampleBreakdown: Record<string, number> | null;
}

/** Wiersz `auctions` → kandydat na snapshot `Auction` (shared). */
function rowToAuctionCandidate(row: typeof auctions.$inferSelect): Record<string, unknown> {
  return {
    id: row.auctionId,
    name: row.characterName,
    level: row.level,
    // shared: `vocation` = BAZOWA; DB: `vocation` = promowana, `vocationBase` = bazowa.
    vocation: row.vocationBase,
    vocationPromoted: row.vocation,
    sex: row.sex,
    worldId: row.worldId,
    outfitId: row.outfitId ?? undefined,

    bid: row.bid,
    bidType: row.bidType,
    auctionStart: row.auctionStart.toISOString(),
    auctionEnd: row.auctionEnd.toISOString(),
    status: row.status,
    finalPrice: row.finalPrice ?? undefined,

    skillMagic: row.skillMagic,
    skillClub: row.skillClub,
    skillFist: row.skillFist,
    skillSword: row.skillSword,
    skillAxe: row.skillAxe,
    skillDistance: row.skillDistance,
    skillShielding: row.skillShielding,
    skillFishing: row.skillFishing,

    charmPoints: row.charmPoints,
    charmPointsUnused: row.charmPointsUnused,
    minorCharmEchoes: row.minorCharmEchoes,
    bossPoints: row.bossPoints,
    imbuementsUnlocked: row.imbuementsUnlocked,
    imbuementsTotal: row.imbuementsTotal,
    questsCompleted: row.questsCompleted,
    questsTotal: row.questsTotal,
    achievementPoints: row.achievementPoints,
    animusMasteries: row.animusMasteries,

    gemsLesser: row.gemsLesser,
    gemsRegular: row.gemsRegular,
    gemsGreater: row.gemsGreater,
    storeOutfitsCount: row.storeOutfitsCount,
    storeMountsCount: row.storeMountsCount,
    storeItemsCount: row.storeItemsCount,
    hirelingsCount: row.hirelingsCount,
    goldTotal: row.goldTotal,
    tcInvested: row.tcInvested ?? undefined,

    hasSoulWar: row.hasSoulWar,
    hasPrimalOrdeal: row.hasPrimalOrdeal,
    hasWorldTransfer: row.hasWorldTransfer,
    hasPreySlot: row.hasPreySlot,
    hasCharmExpansion: row.hasCharmExpansion,
    hasWeeklyTaskExpansion: row.hasWeeklyTaskExp,
    hasTwistOfFate: row.hasTwistOfFate,
    blessingsActive: row.blessingsActive,

    rawJson: row.rawJson,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    scrapedAt: row.scrapedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? undefined,
  };
}

/**
 * Spłaszcza breakdown (6 komponentów, biginty) do `Record<string, number>`
 * — format `valuation_history.breakdown` (jsonb).
 *
 * Klucze: `base`, `skill_<key>` (8), `skills`, `feature_*`, `features`,
 * `progression_*`, `progression`, `cosmetic_*`, `cosmetics`, `asset_*`,
 * `assets` — płasko, żeby dało się je czytać w SQL bez JSON-pathów.
 */
export function flattenBreakdown(b: ValuationBreakdown): Record<string, number> {
  const out: Record<string, number> = {};
  out["base"] = Number(b.base.value);
  for (const [key, value] of Object.entries(b.skills.perSkill)) {
    out[`skill_${key}`] = Number(value);
  }
  out["skills"] = Number(b.skills.value);
  for (const item of b.features.items) out[item.key] = Number(item.value);
  out["features"] = Number(b.features.value);
  for (const item of b.progression.items) out[item.key] = Number(item.value);
  out["progression"] = Number(b.progression.value);
  for (const item of b.cosmetics.items) out[item.key] = Number(item.value);
  out["cosmetics"] = Number(b.cosmetics.value);
  for (const item of b.assets.items) out[item.key] = Number(item.value);
  out["assets"] = Number(b.assets.value);
  return out;
}

/**
 * Liczy i zapisuje wyceny dla aktywnych aukcji.
 *
 * Idempotentne: kolejny run nadpisuje `estimated_value` i dopisuje nowy
 * wiersz `valuation_history` (PK: auctionId + computedAt).
 *
 * @param options.includeFinished — W18: dołącz zakończone z `final_price > 0`
 *   (dane kalibracyjne: porównanie naszej wyceny z realną ceną sprzedaży —
 *   podstawa strojenia wag `valuation_rules`).
 */
export async function runValuation(
  options: { includeFinished?: boolean } = {},
): Promise<ValuationRunStats> {
  const ruleRows = await db.select().from(valuationRules).where(eq(valuationRules.isActive, true));

  const ruleList: ValuationRule[] = ruleRows.map((r) => ({
    id: r.id,
    ruleKey: r.ruleKey,
    category: r.category,
    weight: r.weight,
    formula: r.formula,
    isActive: r.isActive,
    updatedAt: r.updatedAt,
  }));

  if (ruleList.length === 0) {
    throw new Error("[valuation] brak aktywnych reguł w valuation_rules — nie ma na czym liczyć");
  }

  const rows = options.includeFinished
    ? await db
        .select()
        .from(auctions)
        .where(
          or(
            eq(auctions.status, "active"),
            and(eq(auctions.status, "finished"), gt(auctions.finalPrice, 0)),
          ),
        )
    : await db.select().from(auctions).where(eq(auctions.status, "active"));

  let computed = 0;
  let skipped = 0;
  let failed = 0;
  let sampleEstimated: number | null = null;
  let sampleBreakdown: Record<string, number> | null = null;

  for (const row of rows) {
    try {
      const parsed = AuctionSchema.safeParse(rowToAuctionCandidate(row));
      if (!parsed.success) {
        skipped += 1;
        continue;
      }

      const snapshot: Auction = parsed.data;
      const result = estimateValue(snapshot, ruleList);
      const estimated = Number(result.estimatedValue);
      const breakdown = flattenBreakdown(result.breakdown);

      await db
        .update(auctions)
        .set({ estimatedValue: estimated })
        .where(eq(auctions.auctionId, row.auctionId));

      await db.insert(valuationHistory).values({
        auctionId: row.auctionId,
        estimatedTc: estimated,
        breakdown,
      });

      if (sampleEstimated === null) {
        sampleEstimated = estimated;
        sampleBreakdown = breakdown;
      }
      computed += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        `[valuation] aukcja ${row.auctionId.toString()} — błąd: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    total: rows.length,
    computed,
    skipped,
    failed,
    sampleEstimated,
    sampleBreakdown,
  };
}
