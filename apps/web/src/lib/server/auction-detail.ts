/**
 * Server-only helper dla detail page (`/bazaar/[id]`, plan T48).
 *
 * Rozszerza `getAuctionById` (T38) o relacje 1:N:
 *   - `auction_items`      — przedmioty ekwipunku (z tier)
 *   - `auction_outfits`    — outfity z addons
 *   - `auction_mounts`     — mounty
 *   - `auction_skill_loyalty` — base vs displayed (kalk. true-skill, T21)
 *   - `auction_price_history` — punkty czasowe do wykresu (T48 chart)
 *
 * Architektura (arch §5 krok 7, §7.1 + §7.2):
 *   - Wszystkie query w `Promise.all` → łączny czas ~10-30 ms dla 50-200
 *     relacji (single-pass index scan na PK).
 *   - Server-only (DB import) — NIE używaj z komponentów klienta.
 *   - Cache tag `auction-{id}` ustawiony przez caller (page.tsx) poprzez
 *     `unstable_cache` lub `next: { tags: [...] }`.
 *
 * Polityka "zero N+1": wszystkie JOIN-y wykonywane razem, nigdy per-item.
 */
import { asc, eq } from "drizzle-orm";

import { db } from "@tibians/db";
import {
  auctionItems,
  auctionMounts,
  auctionOutfits,
  auctionSkillLoyalty,
  auctionPriceHistory,
} from "@tibians/db/schema";

import { getAuctionById, type AuctionRow } from "./auctions";

// ───────────────────────────────────────────────────────────────────────
// Public types — client-safe shape (bigint → string, Date → ISO string)
// ───────────────────────────────────────────────────────────────────────

export interface AuctionItemEntry {
  itemId: number;
  quantity: number;
  /** 0..3 (forging tier) — `null` gdy brak. */
  tier: number | null;
}

export interface AuctionOutfitEntry {
  outfitId: number;
  /** Maska addons (bit 0 = addon 1, bit 1 = addon 2, bit 2 = addon 3). */
  addons: number;
}

export interface AuctionMountEntry {
  mountId: number;
}

export type SkillLoyaltyKey =
  "magic" | "club" | "fist" | "sword" | "axe" | "distance" | "shielding" | "fishing";

export interface AuctionSkillLoyaltyEntry {
  skill: SkillLoyaltyKey;
  baseValue: number;
  /** 0..50 — procent lojalności (Tibia wyświetla displayed = base * (1 + pct/100)). */
  loyaltyPct: number | null;
}

/**
 * Pojedynczy punkt na wykresie bidów (arch §5 krok 7: "linia czasu").
 *
 * ISO string zamiast `Date` — RSC nie serializuje `Date` do client
 * komponentów (ta sama konwencja co `AuctionSummary.auctionEnd`).
 */
export interface AuctionPriceHistoryPointDto {
  /** ISO datetime. */
  recordedAt: string;
  bid: number;
}

/**
 * Pełny kształt zwracany przez `getAuctionDetail` — gotowy do przekazania
 * w props do client komponentów (zero BigInt/Date leak).
 */
export interface AuctionDetail {
  /** Wiersz główny z `auctions + worlds` (T38 — `getAuctionById`). */
  auction: {
    id: string;
    name: string;
    level: number;
    vocationBase: string;
    vocationPromoted: string;
    sex: "M" | "F";
    outfitId: number | null;
    bid: number;
    bidType: "current" | "minimum";
    auctionStart: string;
    auctionEnd: string;
    status: "active" | "finished" | "cancelled" | "sold";

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
    goldTotal: string;
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
    pricePerLevel: number | null;

    world: string;
    worldRegion: "EU" | "NA" | "BR" | "OCE";
    worldPvpType:
      "Open PvP" | "Optional PvP" | "Hardcore PvP" | "Retro Open PvP" | "Retro Hardcore PvP";
    worldBattleye: "protected" | "initially protected" | "not protected";

    firstSeenAt: string;
    lastSeenAt: string;
    scrapedAt: string;
  };

  /** Relacje 1:N — patrz typy wyżej. */
  items: AuctionItemEntry[];
  outfits: AuctionOutfitEntry[];
  mounts: AuctionMountEntry[];
  /** Pusta tablica gdy brak danych loyalty (większość aukcji). */
  skillLoyalty: AuctionSkillLoyaltyEntry[];
  /** Posortowane po `recordedAt ASC` — gotowe do `<LineChart>`. */
  priceHistory: AuctionPriceHistoryPointDto[];
}

// ───────────────────────────────────────────────────────────────────────
// Adapter — AuctionRow → AuctionDetail.auction (client-safe)
// ───────────────────────────────────────────────────────────────────────

/**
 * Konwersja `AuctionRow` (server, bigint/Date) na `AuctionDetail.auction`
 * (client-safe). Wyodrębniona dla czytelności i testowalności.
 */
function auctionRowToDetail(row: AuctionRow): AuctionDetail["auction"] {
  return {
    id: row.auctionId.toString(),
    name: row.characterName,
    level: row.level,
    vocationBase: row.vocationBase,
    vocationPromoted: row.vocation,
    sex: row.sex,
    outfitId: row.outfitId,
    bid: row.bid,
    bidType: row.bidType,
    auctionStart: row.auctionStart.toISOString(),
    auctionEnd: row.auctionEnd.toISOString(),
    status: row.status,

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
    goldTotal: row.goldTotal.toString(),
    tcInvested: row.tcInvested,

    hasSoulWar: row.hasSoulWar,
    hasPrimalOrdeal: row.hasPrimalOrdeal,
    hasWorldTransfer: row.hasWorldTransfer,
    hasPreySlot: row.hasPreySlot,
    hasCharmExpansion: row.hasCharmExpansion,
    hasWeeklyTaskExp: row.hasWeeklyTaskExp,
    hasTwistOfFate: row.hasTwistOfFate,
    blessingsActive: row.blessingsActive,

    estimatedValue: row.estimatedValue,
    valueConfidence: row.valueConfidence,
    pricePerLevel: row.pricePerLevel !== null ? Number.parseFloat(row.pricePerLevel) : null,

    world: row.worldName,
    worldRegion: row.worldRegion,
    worldPvpType: row.worldPvpType,
    worldBattleye: row.worldBattleye,

    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    scrapedAt: row.scrapedAt.toISOString(),
  };
}

// ───────────────────────────────────────────────────────────────────────
// getAuctionDetail — główna funkcja
// ───────────────────────────────────────────────────────────────────────

/**
 * Detal aukcji z relacjami (plan task 48, arch §5 krok 7).
 *
 * Zwraca `null` gdy aukcja o danym ID nie istnieje. Wszystkie 5 zapytań
 * lecą równolegle (`Promise.all`) — łączny czas dominowany przez najwolniejsze.
 *
 * @param id — ID aukcji (bigint, decimal > Number.MAX_SAFE_INTEGER w Tibia).
 */
export async function getAuctionDetail(id: bigint): Promise<AuctionDetail | null> {
  const row = await getAuctionById(id);
  if (row === null) {
    return null;
  }

  const [itemsRows, outfitsRows, mountsRows, loyaltyRows, historyRows] = await Promise.all([
    db
      .select({
        itemId: auctionItems.itemId,
        quantity: auctionItems.quantity,
        tier: auctionItems.tier,
      })
      .from(auctionItems)
      .where(eq(auctionItems.auctionId, id))
      .orderBy(asc(auctionItems.itemId)),
    db
      .select({
        outfitId: auctionOutfits.outfitId,
        addons: auctionOutfits.addons,
      })
      .from(auctionOutfits)
      .where(eq(auctionOutfits.auctionId, id))
      .orderBy(asc(auctionOutfits.outfitId)),
    db
      .select({ mountId: auctionMounts.mountId })
      .from(auctionMounts)
      .where(eq(auctionMounts.auctionId, id))
      .orderBy(asc(auctionMounts.mountId)),
    db
      .select({
        skill: auctionSkillLoyalty.skill,
        baseValue: auctionSkillLoyalty.baseValue,
        loyaltyPct: auctionSkillLoyalty.loyaltyPct,
      })
      .from(auctionSkillLoyalty)
      .where(eq(auctionSkillLoyalty.auctionId, id)),
    db
      .select({
        recordedAt: auctionPriceHistory.recordedAt,
        bid: auctionPriceHistory.bid,
      })
      .from(auctionPriceHistory)
      .where(eq(auctionPriceHistory.auctionId, id))
      .orderBy(asc(auctionPriceHistory.recordedAt)),
  ]);

  return {
    auction: auctionRowToDetail(row),
    items: itemsRows.map((r) => ({
      itemId: r.itemId,
      quantity: r.quantity,
      tier: r.tier,
    })),
    outfits: outfitsRows.map((r) => ({
      outfitId: r.outfitId,
      addons: r.addons,
    })),
    mounts: mountsRows.map((r) => ({ mountId: r.mountId })),
    skillLoyalty: loyaltyRows.map((r) => ({
      skill: r.skill as SkillLoyaltyKey,
      baseValue: r.baseValue,
      loyaltyPct: r.loyaltyPct,
    })),
    priceHistory: historyRows.map((r) => ({
      recordedAt: r.recordedAt.toISOString(),
      bid: r.bid,
    })),
  };
}
