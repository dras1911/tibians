/**
 * Client-safe shape dla wiersza aukcji Bazaar.
 *
 * `AuctionRow` z `lib/server/auctions` zawiera kolumny z Drizzle
 * (m.in. `bigint` dla `auctionId` i `goldTotal`). Server Component
 * (`/bazaar`) renderuje tę stronę z SSR — RSC nie serializuje
 * `bigint` do client komponentów.
 *
 * `toAuctionSummary` konwertuje `AuctionRow` → `AuctionSummary` z:
 *   - `auctionId: string` (decimal bez sufiksu `n`)
 *   - `auctionEnd: string` (ISO datetime — `Date` nie przechodzi przez
 *     granicę server/client bezpiecznie w React 19 / RSC)
 *   - `auctionStart` → opcjonalnie pomijamy w liście (i tak nieużywane)
 *   - pozostałe pola: passthrough, bo już są `number | boolean | string`.
 *
 * Architektura (arch §5 krok 5 — karta aukcji):
 *   - To jest kanoniczny kształt danych dla WSZYSTKICH Bazaar UI
 *     komponentów (karta, tabela, porównanie).
 *   - BigInt (auctionId, goldTotal) → string (arch §8.2 / json.ts).
 *   - Date → ISO string (konwencja Next.js / jsonSafe).
 *
 * Zasada: zero ręcznego mapowania w komponentach — komponenty
 * przyjmują wyłącznie `AuctionSummary`.
 */

import type { AuctionRow } from "@/lib/server/auctions";

/**
 * Wszystkie pola potrzebne do wyrenderowania listy/karty aukcji.
 * Publiczny kontrakt UI ↔ server.
 */
export interface AuctionSummary {
  /** ID aukcji jako string (decimal). Tibia ID > Number.MAX_SAFE_INTEGER. */
  id: string;
  /** Nazwa postaci. */
  name: string;
  /** Level 8..2500. */
  level: number;
  /** Bazowa klasa (Knight/Paladin/Druid/Sorcerer/Monk). */
  vocation: string;
  /** Promowana klasa (np. "Elite Knight"). */
  vocationPromoted: string;
  /** Płeć. */
  sex: "M" | "F";
  /** FK → worlds.id (smallint). */
  worldId: number;
  /** ID outfitu (FK do outfits.id). */
  outfitId: number | null;
  /** Aktualna lub minimalna oferta w TC. */
  bid: number;
  /** `current` | `minimum`. */
  bidType: "current" | "minimum";
  /** ISO datetime rozpoczęcia. */
  auctionStart: string;
  /** ISO datetime zakończenia — klucz do live countdown. */
  auctionEnd: string;
  /** Status aukcji. */
  status: "active" | "finished" | "cancelled" | "sold";

  /**
   * Końcowa cena sprzedaży w TC (T58 / arch §7.2).
   * = `null` dla `status='active'` (aukcja jeszcze trwa).
   * = kwota dla `status='sold'` (kupiona) i `status='finished'`
   *   z finalPrice (rzadko — zwykle zakończone bez kupca mają null).
   */
  finalPrice: number | null;

  // 8 denormalizowanych skilli (arch §7.1 pkt 1)
  skillMagic: number;
  skillClub: number;
  skillFist: number;
  skillSword: number;
  skillAxe: number;
  skillDistance: number;
  skillShielding: number;
  skillFishing: number;

  // Progresja
  charmPoints: number;
  imbuementsUnlocked: number;
  imbuementsTotal: number;
  questsCompleted: number;
  questsTotal: number;
  bossPoints: number;
  achievementPoints: number;
  animusMasteries: number;

  // Heurystyczne flagi
  hasSoulWar: boolean;
  hasPrimalOrdeal: boolean;
  hasWorldTransfer: boolean;
  hasPreySlot: boolean;
  hasCharmExpansion: boolean;
  hasWeeklyTaskExp: boolean;
  hasTwistOfFate: boolean;
  blessingsActive: number;

  // Wycena
  estimatedValue: number | null;
  pricePerLevel: number | null;

  // Relacja JOIN worlds
  world: string;
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
 * Adapter `AuctionRow` (server) → `AuctionSummary` (client-safe).
 *
 * Czysta funkcja — bez efektów ubocznych, wywoływana w Server Component
 * przed przekazaniem danych do klienta. Nie używamy `jsonSafe()` z
 * `lib/server/json` tutaj, bo to zbyt agresywna transformacja (zrzuca
 * wszystkie nieznane pola); zamiast tego mapujemy explicite do
 * `AuctionSummary` (kanoniczny kształt dla UI).
 */
export function toAuctionSummary(row: AuctionRow): AuctionSummary {
  return {
    id: row.auctionId.toString(),
    name: row.characterName,
    level: row.level,
    vocation: row.vocationBase,
    vocationPromoted: row.vocation,
    sex: row.sex,
    worldId: row.worldId,
    outfitId: row.outfitId,
    bid: row.bid,
    bidType: row.bidType,
    auctionStart: row.auctionStart.toISOString(),
    auctionEnd: row.auctionEnd.toISOString(),
    status: row.status,
    finalPrice: row.finalPrice,

    skillMagic: row.skillMagic,
    skillClub: row.skillClub,
    skillFist: row.skillFist,
    skillSword: row.skillSword,
    skillAxe: row.skillAxe,
    skillDistance: row.skillDistance,
    skillShielding: row.skillShielding,
    skillFishing: row.skillFishing,

    charmPoints: row.charmPoints,
    imbuementsUnlocked: row.imbuementsUnlocked,
    imbuementsTotal: row.imbuementsTotal,
    questsCompleted: row.questsCompleted,
    questsTotal: row.questsTotal,
    bossPoints: row.bossPoints,
    achievementPoints: row.achievementPoints,
    animusMasteries: row.animusMasteries,

    hasSoulWar: row.hasSoulWar,
    hasPrimalOrdeal: row.hasPrimalOrdeal,
    hasWorldTransfer: row.hasWorldTransfer,
    hasPreySlot: row.hasPreySlot,
    hasCharmExpansion: row.hasCharmExpansion,
    hasWeeklyTaskExp: row.hasWeeklyTaskExp,
    hasTwistOfFate: row.hasTwistOfFate,
    blessingsActive: row.blessingsActive,

    estimatedValue: row.estimatedValue,
    pricePerLevel:
      row.pricePerLevel !== null
        ? Number.parseFloat(row.pricePerLevel)
        : null,

    world: row.worldName,
    worldRegion: row.worldRegion,
    worldPvpType: row.worldPvpType,
    worldBattleye: row.worldBattleye,
  };
}

/**
 * Wygodny helper do batch konwersji (server → client shape).
 */
export function toAuctionSummaries(rows: AuctionRow[]): AuctionSummary[] {
  return rows.map(toAuctionSummary);
}