/**
 * Mappery: kontrakty domenowe (shared / scraper) → wiersze DB (Drizzle insert).
 *
 * DLACZEGO TYPY STRUKTURALNE, A NIE IMPORT Z `@tibians/shared`:
 *   `packages/db` **nie ma** `@tibians/shared` w zależnościach (tylko
 *   drizzle-orm, dotenv, pg, zod). Import z shared albo z `apps/scraper`
 *   byłby odwróceniem zależności (pakiet DB nie może zależeć od aplikacji).
 *   Dlatego definiujemy tu minimalne widoki strukturalne wejścia —
 *   realne typy (`Auction`, `Item`, `Outfit`, `Mount`) spełniają je
 *   strukturalnie, więc `wiring.ts` przekazuje je bez rzutowania.
 *
 *   Type-safety kontraktu pilnuje `apps/scraper/src/wiring.ts`, gdzie
 *   dostępne są OBA typy (shared + DB) i gdzie następuje przypisanie.
 */

import type {
  NewAuction,
  NewAuctionItem,
  NewAuctionMount,
  NewAuctionOutfit,
  NewAuctionSkillLoyalty,
  NewAuctionUsp,
  NewItem,
  NewMount,
  NewOutfit,
} from '../schema';

/* ════════════════════════════════════════════════════════════════
 *  WIDOKI STRUKTURALNE WEJŚCIA
 * ════════════════════════════════════════════════════════════════ */

/**
 * Podzbiór `Auction` z `@tibians/shared/auction` — pola, których
 * potrzebuje `auctions` (arch §7.2). Wszystkie pola wymagane przez
 * DB insert są tu obecne.
 *
 * UWAGA na asymetrię nazw: w DB `vocation` = **promowana** klasa
 * ('Elite Knight'), a `vocationBase` = bazowa ('Knight'). W kontrakcie
 * shared jest odwrotnie: `vocation` = bazowa, `vocationPromoted` = promowana.
 */
export interface ScraperAuctionLike {
  readonly id: bigint;
  readonly name: string;
  readonly level: number;
  readonly vocation: string;
  readonly vocationPromoted: string;
  readonly sex: 'M' | 'F';
  readonly worldId: number;
  readonly outfitId?: number | null | undefined;
  readonly bid: number;
  readonly bidType: 'current' | 'minimum';
  readonly auctionStart: string;
  readonly auctionEnd: string;
  readonly status: 'active' | 'finished' | 'cancelled' | 'sold';
  readonly finalPrice?: number | null | undefined;

  readonly skillMagic: number;
  readonly skillClub: number;
  readonly skillFist: number;
  readonly skillSword: number;
  readonly skillAxe: number;
  readonly skillDistance: number;
  readonly skillShielding: number;
  readonly skillFishing: number;

  readonly charmPoints: number;
  readonly charmPointsUnused: number;
  readonly minorCharmEchoes: number;
  readonly bossPoints: number;
  readonly imbuementsUnlocked: number;
  readonly imbuementsTotal: number;
  readonly questsCompleted: number;
  readonly questsTotal: number;
  readonly achievementPoints: number;
  readonly animusMasteries: number;

  readonly gemsLesser: number;
  readonly gemsRegular: number;
  readonly gemsGreater: number;

  readonly storeOutfitsCount: number;
  readonly storeMountsCount: number;
  readonly storeItemsCount: number;
  readonly hirelingsCount: number;
  readonly goldTotal: bigint;
  readonly tcInvested?: number | null | undefined;

  readonly hasSoulWar: boolean;
  readonly hasPrimalOrdeal: boolean;
  readonly hasWorldTransfer: boolean;
  readonly hasPreySlot: boolean;
  readonly hasCharmExpansion: boolean;
  /** W DB kolumna nazywa się `has_weekly_task_exp` (bez "ansion"). */
  readonly hasWeeklyTaskExpansion: boolean;
  readonly hasTwistOfFate: boolean;
  readonly blessingsActive: number;

  readonly estimatedValue?: number | null | undefined;
  readonly valueConfidence?: number | null | undefined;

  readonly rawJson: Record<string, unknown>;

  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly scrapedAt: string;
  readonly archivedAt?: string | null | undefined;
}

/**
 * Wspólny widok dla `outfits` / `mounts` ze scrapera
 * (`apps/scraper/src/scrapers/reference-data.ts`). Obie mają identyczny
 * kształt — różni je tylko tabela docelowa.
 */
export interface ScraperReferenceLike {
  readonly id: number;
  readonly name: string;
  readonly namePl: string | null;
  readonly isStore: boolean;
  readonly isRare: boolean;
  readonly imageUrl: string;
}

/**
 * Widok `items` ze scrapera (`ItemSchema` w `reference-data.ts`).
 *
 * UWAGA: w odróżnieniu od `outfits`/`mounts` item **nie ma `isStore`** —
 * ma `isStoreItem` oraz pełny zestaw pól mirrorujących tabelę `items`
 * (kategoria, ceny). Mapper jest więc niemal tożsamościowy — nie ma tu
 * odpowiednika pułapki `isStore` → `isStoreItem` z wcześniejszej wersji.
 */
export interface ScraperItemLike {
  readonly id: number;
  readonly name: string;
  readonly namePl: string | null;
  readonly category: NewItem['category'];
  readonly marketPrice: number | null;
  readonly tcValue: number | null;
  readonly isStoreItem: boolean;
  readonly isRare: boolean;
  readonly imageUrl: string;
}

/** Relacja: item w ekwipunku (kontrakt shared `AuctionItem`). */
export interface ScraperAuctionItemLike {
  readonly itemId: number;
  readonly quantity: number;
  readonly tier?: 0 | 1 | 2 | 3 | null | undefined;
}

/** Relacja: outfit (kontrakt shared `AuctionOutfit`). */
export interface ScraperAuctionOutfitLike {
  readonly outfitId: number;
  readonly addons: number;
}

/** Relacja: mount (kontrakt shared `AuctionMount`). */
export interface ScraperAuctionMountLike {
  readonly mountId: number;
}

/** Relacja: USP (kontrakt shared `AuctionUsp`) — `category` jest KODEM liczbowym. */
export interface ScraperAuctionUspLike {
  readonly category: number;
  readonly text: string;
  readonly sortOrder: number;
}

/** Relacja: skill z lojalnością (kontrakt shared `AuctionSkillLoyalty`). */
export interface ScraperAuctionSkillLoyaltyLike {
  readonly skill:
    | 'magic'
    | 'club'
    | 'fist'
    | 'sword'
    | 'axe'
    | 'distance'
    | 'shielding'
    | 'fishing';
  readonly baseValue: number;
  readonly loyaltyPct?: number | null | undefined;
}

/* ════════════════════════════════════════════════════════════════
 *  USP CATEGORY: kod liczbowy (tibia.com) → enum DB
 * ════════════════════════════════════════════════════════════════ */

/**
 * Mapowanie kodów kategorii USP z tibia.com na `usp_category` (DB).
 *
 * Kody wg komentarza w `schema/auction-relations.ts`:
 *   0=skill, 1=gold, 2=achievements, 3=blessings, 4=store items,
 *   5=mounts/outfits/slots, 6=imbuements, 7=charms, 11=world transfer,
 *   13=boss points.
 *
 * Kody nieznane (Tibia doda nowe) → `'other'` (bezpieczny fallback,
 * nie gubimy danych bo pełny payload i tak ląduje w `auctions.raw_json`).
 */
const USP_CATEGORY_BY_CODE: Readonly<Record<number, NewAuctionUsp['category']>> = {
  0: 'skill',
  1: 'gold',
  2: 'achievement',
  3: 'blessing',
  4: 'store',
  5: 'cosmetic',
  6: 'imbuement',
  7: 'charm',
  11: 'world_transfer',
  13: 'boss',
};

/** Konwertuje kod liczbowy USP na wartość enuma DB. */
export function uspCategoryFromCode(code: number): NewAuctionUsp['category'] {
  return USP_CATEGORY_BY_CODE[code] ?? 'other';
}

/* ════════════════════════════════════════════════════════════════
 *  MAPPER: aukcja
 * ════════════════════════════════════════════════════════════════ */

/**
 * `ScraperAuctionLike` → wiersz `auctions`.
 *
 * NIE ustawia `pricePerLevel` ani `searchVector` — obie kolumny są
 * `GENERATED ALWAYS` w Postgresie; próba insertu kończy się błędem.
 *
 * `valueConfidence` jest `NUMERIC(3,2)` → Drizzle zwraca/oczekuje
 * `string` (nie `number`), dlatego konwersja przez `String(...)`.
 */
export function auctionToNewAuction(a: ScraperAuctionLike): NewAuction {
  return {
    auctionId: a.id,
    characterName: a.name,
    level: a.level,
    // Asymetria nazw (patrz docstring `ScraperAuctionLike`):
    vocation: a.vocationPromoted,
    vocationBase: a.vocation,
    sex: a.sex,
    worldId: a.worldId,
    outfitId: a.outfitId ?? null,

    bid: a.bid,
    bidType: a.bidType,
    auctionStart: new Date(a.auctionStart),
    auctionEnd: new Date(a.auctionEnd),
    status: a.status,
    finalPrice: a.finalPrice ?? null,

    skillMagic: a.skillMagic,
    skillClub: a.skillClub,
    skillFist: a.skillFist,
    skillSword: a.skillSword,
    skillAxe: a.skillAxe,
    skillDistance: a.skillDistance,
    skillShielding: a.skillShielding,
    skillFishing: a.skillFishing,

    charmPoints: a.charmPoints,
    charmPointsUnused: a.charmPointsUnused,
    minorCharmEchoes: a.minorCharmEchoes,
    bossPoints: a.bossPoints,
    imbuementsUnlocked: a.imbuementsUnlocked,
    imbuementsTotal: a.imbuementsTotal,
    questsCompleted: a.questsCompleted,
    questsTotal: a.questsTotal,
    achievementPoints: a.achievementPoints,
    animusMasteries: a.animusMasteries,

    gemsLesser: a.gemsLesser,
    gemsRegular: a.gemsRegular,
    gemsGreater: a.gemsGreater,

    storeOutfitsCount: a.storeOutfitsCount,
    storeMountsCount: a.storeMountsCount,
    storeItemsCount: a.storeItemsCount,
    hirelingsCount: a.hirelingsCount,
    goldTotal: a.goldTotal,
    tcInvested: a.tcInvested ?? null,

    hasSoulWar: a.hasSoulWar,
    hasPrimalOrdeal: a.hasPrimalOrdeal,
    hasWorldTransfer: a.hasWorldTransfer,
    hasPreySlot: a.hasPreySlot,
    hasCharmExpansion: a.hasCharmExpansion,
    // Nazwa w DB krótsza niż w kontrakcie shared:
    hasWeeklyTaskExp: a.hasWeeklyTaskExpansion,
    hasTwistOfFate: a.hasTwistOfFate,
    blessingsActive: a.blessingsActive,

    estimatedValue: a.estimatedValue ?? null,
    valueConfidence:
      a.valueConfidence === null || a.valueConfidence === undefined
        ? null
        : String(a.valueConfidence),

    rawJson: a.rawJson,

    firstSeenAt: new Date(a.firstSeenAt),
    lastSeenAt: new Date(a.lastSeenAt),
    scrapedAt: new Date(a.scrapedAt),
    archivedAt: a.archivedAt ? new Date(a.archivedAt) : null,
  };
}

/* ════════════════════════════════════════════════════════════════
 *  MAPPER: relacje aukcji
 * ════════════════════════════════════════════════════════════════ */

/**
 * Item w ekwipunku → wiersz `auction_items`.
 *
 * ⚠️ `tier` MUSI być niepuste. Kolumna jest wprawdzie zadeklarowana jako
 * `smallint` (nullable), ale wchodzi w skład PRIMARY KEY — a PostgreSQL
 * wymusza NOT NULL na kolumnach PK. Insert z `tier: null` kończy się
 * błędem `null value in column "tier" violates not-null constraint`.
 * Dlatego `null` normalizujemy do `0` (= tier bazowy).
 */
export function auctionItemToNewAuctionItem(
  auctionId: bigint,
  item: ScraperAuctionItemLike,
): NewAuctionItem {
  return {
    auctionId,
    itemId: item.itemId,
    quantity: item.quantity,
    tier: item.tier ?? 0,
  };
}

/** Outfit → wiersz `auction_outfits`. */
export function auctionOutfitToNewAuctionOutfit(
  auctionId: bigint,
  outfit: ScraperAuctionOutfitLike,
): NewAuctionOutfit {
  return {
    auctionId,
    outfitId: outfit.outfitId,
    addons: outfit.addons,
  };
}

/** Mount → wiersz `auction_mounts`. */
export function auctionMountToNewAuctionMount(
  auctionId: bigint,
  mount: ScraperAuctionMountLike,
): NewAuctionMount {
  return {
    auctionId,
    mountId: mount.mountId,
  };
}

/** USP → wiersz `auction_usps` (bez `id` — GENERATED ALWAYS). */
export function auctionUspToNewAuctionUsp(
  auctionId: bigint,
  usp: ScraperAuctionUspLike,
): NewAuctionUsp {
  return {
    auctionId,
    category: uspCategoryFromCode(usp.category),
    text: usp.text,
    sortOrder: usp.sortOrder,
  };
}

/** Skill loyalty → wiersz `auction_skill_loyalty`. */
export function auctionSkillLoyaltyToNewAuctionSkillLoyalty(
  auctionId: bigint,
  loyalty: ScraperAuctionSkillLoyaltyLike,
): NewAuctionSkillLoyalty {
  return {
    auctionId,
    skill: loyalty.skill,
    baseValue: loyalty.baseValue,
    loyaltyPct: loyalty.loyaltyPct ?? null,
  };
}

/* ════════════════════════════════════════════════════════════════
 *  MAPPER: reference data
 * ════════════════════════════════════════════════════════════════ */

/**
 * Item (scraper) → wiersz `items`. Mapowanie niemal tożsamościowe —
 * `ItemSchema` scrapera mirroruje kolumny tabeli `items`.
 */
export function referenceItemToNewItem(item: ScraperItemLike): NewItem {
  return {
    id: item.id,
    name: item.name,
    namePl: item.namePl,
    category: item.category,
    marketPrice: item.marketPrice,
    tcValue: item.tcValue,
    isStoreItem: item.isStoreItem,
    isRare: item.isRare,
    imageUrl: item.imageUrl,
  };
}

/** Outfit (scraper) → wiersz `outfits`. */
export function referenceOutfitToNewOutfit(outfit: ScraperReferenceLike): NewOutfit {
  return {
    id: outfit.id,
    name: outfit.name,
    namePl: outfit.namePl,
    isStore: outfit.isStore,
    isRare: outfit.isRare,
    imageUrl: outfit.imageUrl,
  };
}

/** Mount (scraper) → wiersz `mounts`. */
export function referenceMountToNewMount(mount: ScraperReferenceLike): NewMount {
  return {
    id: mount.id,
    name: mount.name,
    namePl: mount.namePl,
    isStore: mount.isStore,
    isRare: mount.isRare,
    imageUrl: mount.imageUrl,
  };
}
