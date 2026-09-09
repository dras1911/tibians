/**
 * @tibians/shared — publiczne typy TS dla modułu aukcji Bazaar.
 *
 * Wszystkie typy są **wnioskowane** z Zod schema w `schema.ts` (`z.infer`).
 * Ten plik służy wyłącznie do:
 *   1. re-eksportu pod nazwami zgodnymi z arch. §7.2 (np. `Auction`,
 *      `AuctionItem`) — żeby konsumenci nie musieli importować
 *      „wewnętrznych" nazw schemy,
 *   2. udostępnienia typów pomocniczych (`AuctionSkillKey` itd.) do
 *      budowy filtrów/sortowania w UI i API.
 *
 * Reguła: zero ręcznych definicji `interface` — to złamałoby regułę
 * "jeden Zod schema = jeden TS typ". Gdy schema się zmieni, typy
 * zmienią się automatycznie (TypeScript inference).
 */

import type {
  Auction as SchemaAuction,
  AuctionSkill as SchemaAuctionSkill,
  AuctionItem as SchemaAuctionItem,
  AuctionOutfit as SchemaAuctionOutfit,
  AuctionMount as SchemaAuctionMount,
  AuctionUsp as SchemaAuctionUsp,
  AuctionSkillLoyalty as SchemaAuctionSkillLoyalty,
  AuctionSkillKey as SchemaAuctionSkillKey,
  AuctionTier as SchemaAuctionTier,
} from "./schema.js";

// ──────────────────────────────────────────────────────────────────────────
// Główne encje — 1 Auction + 6 relacji 1:N (arch. §7.2)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Główny typ kontraktu aukcji. Zawiera WSZYSTKIE 60+ kolumn z arch. §7.2
 * auctions (gorące filtry jako denormalizowane pola + flagi boolean +
 * JSONB raw + wyliczane TSVECTOR/NUMERIC).
 *
 * Reguły:
 *   - denormalizacja pól gorących filtrów (arch. §7.1 pkt 1) — skille
 *     są OSOBNYMI kolumnami `skillMagic`...`skillFishing`, nie joinem;
 *   - `rawJson` przechowuje pełny payload ze scrapera (arch. §7.1 pkt 2)
 *     — future-proof na nowe pola Tibii bez re-scrape'u;
 *   - `searchVector` jest GENERATED w DB, ale w TS można go wyliczyć
 *     z `name` przez `AuctionSchema.transform(...)` (fallback).
 */
export type Auction = SchemaAuction;

/**
 * Relacja 1:N `auction_items` (arch. §7.2) — itemy z aukcji z tierem
 * fornging (0=base, 3=powerful). PK: `(auctionId, itemId, tier)`.
 */
export type AuctionItem = SchemaAuctionItem;

/**
 * Relacja 1:N `auction_outfits` — outfit z aukcji z liczbą addonów
 * (0-3, maska bitowa). PK: `(auctionId, outfitId)`.
 */
export type AuctionOutfit = SchemaAuctionOutfit;

/**
 * Relacja 1:N `auction_mounts` — mount posiadany przez postać.
 * PK: `(auctionId, mountId)`.
 */
export type AuctionMount = SchemaAuctionMount;

/**
 * Relacja 1:N `auction_usps` — "Unique Selling Points", te kolorowe
 * linijki z listy Tibii (np. "114 Axe Fighting (Loyalty bonus not included)").
 * Sortowane po `sortOrder` ASC.
 */
export type AuctionUsp = SchemaAuctionUsp;

/**
 * Relacja 1:N `auction_skill_loyalty` — wartość bazowa vs wyświetlana
 * (z bonusem lojalności). Służy do kalkulatora "true skill".
 * PK: `(auctionId, skill)`.
 */
export type AuctionSkillLoyalty = SchemaAuctionSkillLoyalty;

/**
 * Relacja 1:N `auction_skills` (arch. §7.2) — pełna tabela skilli
 * z bazą i lojalnością (8 wierszy per postać). Rzadko używana w
 * filtrowaniu (są denormalizowane kolumny), ale przydatna do wyświetlania.
 * PK: `(auctionId, skill)`.
 */
export type AuctionSkill = SchemaAuctionSkill;

// ──────────────────────────────────────────────────────────────────────────
// Primitives / enumeracje (z schema.ts → enums.ts)
// ──────────────────────────────────────────────────────────────────────────

/** 8 kluczy skilli w kolejności referencyjnej (arch. §13.1 + §7.2). */
export type AuctionSkillKey = SchemaAuctionSkillKey;

/** Tier itemu (forging): 0=base, 1=basic, 2=intricate, 3=powerful. */
export type AuctionTier = SchemaAuctionTier;