/**
 * @tibians/shared — publiczne API modułu aukcji Bazaar (task 28).
 *
 * Re-eksport Zod schemas + wnioskowanych typów TS dla wszystkich
 * 7 encji aukcji (Auction + 6 relacji 1:N) z arch. §7.2.
 *
 * Konsumenci:
 *   - apps/scraper (task 30-31): walidacja payloadów z tibia.com
 *   - apps/web Bazaar (Faza 5): filtry, sortowanie, widok detalu
 *   - apps/web Workspace (task 11-27): konwersja Auction → CharacterSnapshot
 *   - apps/scraper Valuation Engine (task 36): obliczanie estimatedValue
 *
 * Reguła: zero logiki runtime — ten moduł to **tylko typy i schemy**.
 * Nie ma tu żadnych helperów ani funkcji biznesowych (te trafią do
 * `packages/character-context` i `packages/calc`).
 */

// ──────────────────────────────────────────────────────────────────────────
// Schema (Zod) — jedyne źródło prawdy (wartości runtime)
// ──────────────────────────────────────────────────────────────────────────

export {
  // Schemat (Zod) — jedyne źródło prawdy (wartości runtime)
  AuctionSchema,
  // Relacje 1:N (arch. §7.2)
  AuctionSkillSchema,
  AuctionItemSchema,
  AuctionOutfitSchema,
  AuctionMountSchema,
  AuctionUspSchema,
  AuctionSkillLoyaltySchema,
  // Sub-schemy pomocnicze
  AuctionSkillKeySchema,
  AuctionTierSchema,
  LoyaltyPctRangeSchema,
  // Stałe runtime
  AUCTION_SKILL_KEYS,
} from "./schema.js";

// Filtry i paginacja (task 38 — HTTP API kontrakt)
export {
  auctionFiltersObject,
  auctionFiltersSchema,
  paginationSchema,
  endingSoonQuerySchema,
  totalPagesOf,
  STORE_ITEM_KEYS,
  HIGHLIGHT_KEYS,
  type HighlightKey,
  type StoreItemKey,
  type AuctionFilters,
  type Pagination,
  type EndingSoonQuery,
} from "./filters.js";

export {
  // Enumeracje
  VocationSchema,
  VocationPromotedSchema,
  SexSchema,
  BidTypeSchema,
  AuctionStatusSchema,
  PvPTypeSchema,
  BattlEyeTypeSchema,
  UspCategorySchema,
  AuctionOrderColumnSchema,
  AuctionOrderDirectionSchema,
  // Stałe runtime (z enums.ts)
  USP_CATEGORY_LABELS,
  VOCATION_BASE_TO_PROMOTED,
} from "./enums.js";

// ──────────────────────────────────────────────────────────────────────────
// Typy — kanoniczne (z schema.ts) + aliasy (z types.ts)
// ──────────────────────────────────────────────────────────────────────────

// Kanoniczne (bez prefixu) — używane wewnętrznie i przez konsumentów.
export type {
  // Główna encja
  Auction,
  // Relacje 1:N
  AuctionSkill,
  AuctionItem,
  AuctionOutfit,
  AuctionMount,
  AuctionUsp,
  AuctionSkillLoyalty,
  // Primitives
  AuctionSkillKey,
  AuctionTier,
} from "./schema.js";

export type {
  // Aliasy zgodne z arch. §7.2 (np. AuctionSkill dla relacji tabeli auction_skills)
  AuctionSkillKey as AuctionSkillKeyAlias,
} from "./types.js";

// Re-eksport enumeracji jako typy.
export type {
  Vocation,
  VocationPromoted,
  Sex,
  BidType,
  AuctionStatus,
  PvPType,
  BattlEyeType,
  UspCategory,
  AuctionOrderColumn,
  AuctionOrderDirection,
} from "./enums.js";
