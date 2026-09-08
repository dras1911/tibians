/**
 * @tibians/character-context — public API.
 *
 * Rdzeń architektury Tibians (arch. §13.1). Łączy Bazaar, kalkulatory
 * i Workspace przez jeden współdzielony typ `CharacterSnapshot`.
 *
 * Konsumenci:
 *   - packages/calc (czyste funkcje kalkulacyjne, task 14)
 *   - apps/web Workspace (Zustand store, localStorage, task 11-12)
 *   - apps/scraper → auctionToSnapshot (most Faza 2↔5, task 37)
 *   - apps/web Character Value (alg. §8.4, task 22)
 *
 * Reguła: jeden Zod schema = jeden typ TS (zero ręcznego utrzymywania
 * obok siebie). Wszystko w `schema.ts`, ten plik tylko re-eksportuje.
 */

// ──────────────────────────────────────────────────────────────────────────
// Schema (Zod) — jedyne źródło prawdy (wartości runtime)
// ──────────────────────────────────────────────────────────────────────────

export {
  // Główny schema
  CharacterSnapshotSchema,
  // Zagnieżdżone schemy (dla konsumentów, którzy chcą walidować fragmenty)
  IdentitySchema,
  SkillsSchema,
  ProgressionSchema,
  AssetsSchema,
  FlagsSchema,
  AuctionContextSchema,
  SourceSchema,
  AuctionSourceSchema,
  ManualSourceSchema,
  ImportedSourceSchema,
  VocationBaseSchema,
  VocationPromotedSchema,
  SkillKeySchema,
  LoyaltyPctSchema,
  SexSchema,
  InventoryItemSchema,
  OwnedOutfitSchema,
  GemsSchema,
  StoreCountsSchema,
  TierSchema,
  BidTypeSchema,
  AuctionStatusSchema,
  // Stałe
  SKILL_KEYS,
} from "./schema.js";

// ──────────────────────────────────────────────────────────────────────────
// Typy — kanoniczne nazwy (z schema.ts) + aliasy z prefixem (z types.ts)
// ──────────────────────────────────────────────────────────────────────────

// Kanoniczne (bez prefixu) — używane wewnętrznie i przez konsumentów.
export type {
  CharacterSnapshot,
  Identity,
  Skills,
  SkillEntry,
  Progression,
  Assets,
  Flags,
  AuctionContext,
  Gems,
  InventoryItem,
  OwnedOutfit,
  StoreCounts,
  Source,
  AuctionSource,
  ManualSource,
  ImportedSource,
  VocationBase,
  VocationPromoted,
  Sex,
  SkillKey,
  Tier,
  LoyaltyPct,
  BidType,
  AuctionStatus,
} from "./schema.js";

// Aliasy z prefixem `Character*` — dla czytelności importów zgodnie z arch. §13.1.
export type {
  CharacterIdentity,
  CharacterSkills,
  CharacterProgression,
  CharacterAssets,
  CharacterFlags,
  CharacterAuction,
  CharacterSkillEntry,
  CharacterInventoryItem,
  CharacterOutfit,
  CharacterGems,
  CharacterStoreCounts,
  CharacterSource,
  CharacterAuctionSource,
  CharacterManualSource,
  CharacterImportedSource,
  CharacterVocationBase,
  CharacterVocationPromoted,
  CharacterSex,
  CharacterSkillKey,
  CharacterLoyaltyPct,
  CharacterTier,
  CharacterBidType,
  CharacterAuctionStatus,
} from "./types.js";

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

export {
  isAuctionSource,
  isManualSource,
  isImportedSource,
  hasAuctionContext,
  auctionIdToNumber,
} from "./source.js";

export { computeValueConfidence } from "./value-confidence.js";
