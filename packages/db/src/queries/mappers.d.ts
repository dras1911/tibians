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
import type { NewAuction, NewAuctionItem, NewAuctionMount, NewAuctionOutfit, NewAuctionSkillLoyalty, NewAuctionUsp, NewItem, NewMount, NewOutfit } from '../schema';
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
    readonly skill: 'magic' | 'club' | 'fist' | 'sword' | 'axe' | 'distance' | 'shielding' | 'fishing';
    readonly baseValue: number;
    readonly loyaltyPct?: number | null | undefined;
}
/** Konwertuje kod liczbowy USP na wartość enuma DB. */
export declare function uspCategoryFromCode(code: number): NewAuctionUsp['category'];
/**
 * `ScraperAuctionLike` → wiersz `auctions`.
 *
 * NIE ustawia `pricePerLevel` ani `searchVector` — obie kolumny są
 * `GENERATED ALWAYS` w Postgresie; próba insertu kończy się błędem.
 *
 * `valueConfidence` jest `NUMERIC(3,2)` → Drizzle zwraca/oczekuje
 * `string` (nie `number`), dlatego konwersja przez `String(...)`.
 */
export declare function auctionToNewAuction(a: ScraperAuctionLike): NewAuction;
/**
 * Item w ekwipunku → wiersz `auction_items`.
 *
 * ⚠️ `tier` MUSI być niepuste. Kolumna jest wprawdzie zadeklarowana jako
 * `smallint` (nullable), ale wchodzi w skład PRIMARY KEY — a PostgreSQL
 * wymusza NOT NULL na kolumnach PK. Insert z `tier: null` kończy się
 * błędem `null value in column "tier" violates not-null constraint`.
 * Dlatego `null` normalizujemy do `0` (= tier bazowy).
 */
export declare function auctionItemToNewAuctionItem(auctionId: bigint, item: ScraperAuctionItemLike): NewAuctionItem;
/** Outfit → wiersz `auction_outfits`. */
export declare function auctionOutfitToNewAuctionOutfit(auctionId: bigint, outfit: ScraperAuctionOutfitLike): NewAuctionOutfit;
/** Mount → wiersz `auction_mounts`. */
export declare function auctionMountToNewAuctionMount(auctionId: bigint, mount: ScraperAuctionMountLike): NewAuctionMount;
/** USP → wiersz `auction_usps` (bez `id` — GENERATED ALWAYS). */
export declare function auctionUspToNewAuctionUsp(auctionId: bigint, usp: ScraperAuctionUspLike): NewAuctionUsp;
/** Skill loyalty → wiersz `auction_skill_loyalty`. */
export declare function auctionSkillLoyaltyToNewAuctionSkillLoyalty(auctionId: bigint, loyalty: ScraperAuctionSkillLoyaltyLike): NewAuctionSkillLoyalty;
/**
 * Item (scraper) → wiersz `items`. Mapowanie niemal tożsamościowe —
 * `ItemSchema` scrapera mirroruje kolumny tabeli `items`.
 */
export declare function referenceItemToNewItem(item: ScraperItemLike): NewItem;
/** Outfit (scraper) → wiersz `outfits`. */
export declare function referenceOutfitToNewOutfit(outfit: ScraperReferenceLike): NewOutfit;
/** Mount (scraper) → wiersz `mounts`. */
export declare function referenceMountToNewMount(mount: ScraperReferenceLike): NewMount;
//# sourceMappingURL=mappers.d.ts.map