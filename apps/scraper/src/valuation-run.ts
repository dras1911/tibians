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
  /** Pominięte — walidacja `AuctionSchema` nie przeszła (tylko fallback). */
  readonly skipped: number;
  /** Błędy (logowane, nie przerywają pętli). */
  readonly failed: number;
  /** Wyceny z mediany rynkowej (metoda główna). */
  readonly marketCount: number;
  /** Wyceny z formuły T35 (fallback — rynek ma <10 próbek). */
  readonly formulaCount: number;
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

// ──────────────────────────────────────────────────────────────────────
// Mediana rynkowa — helpery (W18)
// ──────────────────────────────────────────────────────────────────────

/** Dolny bound (pierwszy index z `arr[i] >= value`). */
function lowerBound(arr: readonly number[], value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((arr[mid] ?? 0) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Górny bound (pierwszy index z `arr[i] > value`). */
function upperBound(arr: readonly number[], value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((arr[mid] ?? 0) <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Mediana posortowanej listy (parzysta długość → średnia środkowych). */
function medianOf(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = n >> 1;
  if (n % 2 === 1) return sorted[mid] ?? 0;
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

/**
 * Mediana rynkowa dla aukcji: próbki tego samego `vocation_base` w oknie
 * poziomu. Najpierw ±15%, gdy <10 próbek — ±30%. `null` = za mało danych
 * (→ fallback na formułę `estimateValue`).
 */
function marketMedianFor(
  bucket: { levels: number[]; prices: number[] } | undefined,
  level: number,
): { median: number; samples: number } | null {
  if (bucket === undefined || bucket.levels.length === 0) return null;

  for (const window of [0.15, 0.3]) {
    const lo = level * (1 - window);
    const hi = level * (1 + window);
    const left = lowerBound(bucket.levels, lo);
    const right = upperBound(bucket.levels, hi);
    const samples = right - left;
    if (samples >= 10) {
      const prices = bucket.prices.slice(left, right).sort((a, b) => a - b);
      return { median: medianOf(prices), samples };
    }
  }
  return null;
}

/**
 * Liczy i zapisuje wyceny dla aktywnych aukcji.
 *
 * METODA (W18, 2026-09-18 — po analizie 11k zakończonych aukcji):
 *   **Mediana rynkowa** — dla każdej aktywnej aukcji szukamy zakończonych
 *   z `final_price > 0` o tym samym `vocation_base` i poziomie w oknie
 *   ±15% (±30% gdy <10 próbek). Mediana = „spodziewana cena" (rynek, nie
 *   formuła). Formuła `estimateValue` (T35) zostaje jako FALLBACK gdy
 *   rynek ma <10 próbek.
 *
 *   Dlaczego nie sama formuła? Wagi z seedu (§6.2 „z sufitu") dawały
 *   ~9× przeszacowanie (mediana est/final = 9.3); kalibracja liniowa na
 *   surowych kwotach zawodzi przy skośnym rozkładzie (mediana rynku
 *   1300 TC vs średnia ~10k). Mediana rynkowa jest odporna na skos
 *   i pokazuje realia: Knight 100-200 lvl ≈ 200 TC, 600-700 ≈ 5000 TC,
 *   1100+ ≈ 60000 TC.
 *
 * Idempotentne: kolejny run nadpisuje `estimated_value` i dopisuje nowy
 * wiersz `valuation_history` (PK: auctionId + computedAt).
 *
 * @param options.includeFinished — dołącz zakończone z `final_price > 0`
 *   (dane kalibracyjne: porównanie naszej wyceny z realną ceną sprzedaży).
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

  // ── Rynek: próbki (level, final_price) per vocation_base ────────────
  // Wszystkie zakończone z realną ceną — z tego liczymy mediany okienne.
  const marketRows = await db
    .select({
      vocationBase: auctions.vocationBase,
      level: auctions.level,
      finalPrice: auctions.finalPrice,
    })
    .from(auctions)
    .where(and(eq(auctions.status, "finished"), gt(auctions.finalPrice, 0)));

  const marketByVocation = new Map<string, { levels: number[]; prices: number[] }>();
  for (const r of marketRows) {
    if (r.finalPrice === null) continue;
    let bucket = marketByVocation.get(r.vocationBase);
    if (bucket === undefined) {
      bucket = { levels: [], prices: [] };
      marketByVocation.set(r.vocationBase, bucket);
    }
    bucket.levels.push(r.level);
    bucket.prices.push(r.finalPrice);
  }
  // Sortuj per level (dla binary search okna).
  for (const bucket of marketByVocation.values()) {
    const order = bucket.levels
      .map((_, i) => i)
      .sort((a, b) => (bucket.levels[a] ?? 0) - (bucket.levels[b] ?? 0));
    const sortedLevels = order.map((i) => bucket.levels[i] ?? 0);
    const sortedPrices = order.map((i) => bucket.prices[i] ?? 0);
    bucket.levels = sortedLevels;
    bucket.prices = sortedPrices;
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
  let marketCount = 0;
  let formulaCount = 0;
  let sampleEstimated: number | null = null;
  let sampleBreakdown: Record<string, number> | null = null;

  for (const row of rows) {
    try {
      // 1. Mediana rynkowa (vocation + okno level) — metoda główna.
      const market = marketMedianFor(marketByVocation.get(row.vocationBase), row.level);

      let estimated: number;
      let breakdown: Record<string, number>;
      let confidence: string | null;

      if (market !== null) {
        estimated = market.median;
        breakdown = { market_median: market.median, market_samples: market.samples };
        // Pewność rośnie z liczbą próbek (50+ = 1.00).
        confidence = Math.min(1, market.samples / 50).toFixed(2);
        marketCount += 1;
      } else {
        // 2. Fallback: formuła T35 (rynek ma <10 próbek w oknie).
        const parsed = AuctionSchema.safeParse(rowToAuctionCandidate(row));
        if (!parsed.success) {
          skipped += 1;
          continue;
        }
        const result = estimateValue(parsed.data as Auction, ruleList);
        estimated = Number(result.estimatedValue);
        breakdown = flattenBreakdown(result.breakdown);
        confidence = null;
        formulaCount += 1;
      }

      await db
        .update(auctions)
        .set({ estimatedValue: estimated, valueConfidence: confidence })
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
    marketCount,
    formulaCount,
    sampleEstimated,
    sampleBreakdown,
  };
}
