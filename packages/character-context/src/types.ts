/**
 * @tibians/character-context — publiczne typy pomocnicze.
 *
 * Wszystkie typy są **wnioskowane** z Zod schema w `schema.ts` (`z.infer`).
 * Ten plik służy wyłącznie do re-eksportu pod nazwami zgodnymi z arch. §13.1
 * (`CharacterIdentity`, `CharacterSkills`, ...) — żeby konsumenci mogli
 * importować segmenty snapshotu bez odwoływania się do „wewnętrznych" nazw
 * schemy.
 *
 * NIE definiujemy tu typów ręcznie — to by złamało regułę „jedno źródło
 * prawdy" (schema.ts). Gdy schema się zmieni, typy zmienią się automatycznie.
 */

import type {
  Assets,
  AuctionContext,
  AuctionSource,
  Flags,
  Gems,
  Identity,
  ImportedSource,
  InventoryItem,
  ManualSource,
  OwnedOutfit,
  Progression,
  Sex,
  Skills,
  SkillEntry,
  SkillKey,
  Source,
  StoreCounts,
  Tier,
  VocationBase,
  VocationPromoted,
  CharacterSnapshot as SchemaCharacterSnapshot,
  LoyaltyPct,
  BidType,
  AuctionStatus,
} from "./schema.js";

// ──────────────────────────────────────────────────────────────────────────
// Rdzeń — CharacterSnapshot
// ──────────────────────────────────────────────────────────────────────────

/** Główny kontrakt — jedyne źródło prawdy (z.infer z CharacterSnapshotSchema). */
export type CharacterSnapshot = SchemaCharacterSnapshot;

// ──────────────────────────────────────────────────────────────────────────
// Sekcje snapshotu — aliasy zgodne z arch. §13.1
// ──────────────────────────────────────────────────────────────────────────

/** Tożsamość postaci (name, level, vocation, world). arch. §13.1 identity. */
export type CharacterIdentity = Identity;

/** 8 skilli zagnieżdżonych jako Record<SkillKey, SkillEntry>. */
export type CharacterSkills = Skills;

/** Postęp (charmy, boss, questy, imbuementy, achievementy). */
export type CharacterProgression = Progression;

/** Zasoby postaci (items, outfits, mounts, gems, gold, tc). */
export type CharacterAssets = Assets;

/** Flagi boolean + blessingsActive. */
export type CharacterFlags = Flags;

/** Kontekst aukcji (obecny tylko gdy source.kind === 'auction'). */
export type CharacterAuction = AuctionContext;

// ──────────────────────────────────────────────────────────────────────────
// Składowe poszczególnych sekcji
// ──────────────────────────────────────────────────────────────────────────

/** Pojedynczy wpis skilla (base + opcjonalne loyaltyPct, percentToNext). */
export type CharacterSkillEntry = SkillEntry;

/** Pojedynczy item w inventory (itemId, quantity, tier?). */
export type CharacterInventoryItem = InventoryItem;

/** Pojedynczy posiadany outfit (outfitId + maska addons). */
export type CharacterOutfit = OwnedOutfit;

/** Struktura gemów (lesser/regular/greater). */
export type CharacterGems = Gems;

/** Liczniki sklepowych kolekcji (outfits, mounts, items). */
export type CharacterStoreCounts = StoreCounts;

// ──────────────────────────────────────────────────────────────────────────
// Source — discriminated union
// ──────────────────────────────────────────────────────────────────────────

/** Pełny discriminated union dla źródła (auction | manual | imported). */
export type CharacterSource = Source;

/** Wariant aukcyjny — posiada auctionId (bigint). */
export type CharacterAuctionSource = AuctionSource;

/** Wariant ręczny — postać wpisana przez gracza. */
export type CharacterManualSource = ManualSource;

/** Wariant importu z tibia.com/community. */
export type CharacterImportedSource = ImportedSource;

// ──────────────────────────────────────────────────────────────────────────
// Primitives / enumeracje
// ──────────────────────────────────────────────────────────────────────────

/** 5 bazowych klas postaci. */
export type CharacterVocationBase = VocationBase;

/** 5 promowanych klas (Elite Knight, Royal Paladin, ...). */
export type CharacterVocationPromoted = VocationPromoted;

/** Płeć postaci. */
export type CharacterSex = Sex;

/** 8 kluczy skilli (alfabetycznie dla stabilności). */
export type CharacterSkillKey = SkillKey;

/** Dozwolone wartości procentu lojalności (0..50 co 5). */
export type CharacterLoyaltyPct = LoyaltyPct;

/** Tier imbuementu / itemu (0..3). */
export type CharacterTier = Tier;

/** Typ oferty aukcji — aktualna vs minimalna. */
export type CharacterBidType = BidType;

/** Status aukcji (active, finished, cancelled, sold). */
export type CharacterAuctionStatus = AuctionStatus;
