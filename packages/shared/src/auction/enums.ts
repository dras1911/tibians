/**
 * @tibians/shared — enumeracje dla modułu aukcji Bazaar.
 *
 * Wszystkie wartości odpowiadają temu, co raportuje tibia.com (parser HTML
 * w task 30-31). To jest **shared types** — nie Drizzle enum — więc:
 *   - zero zależności od bazy danych
 *   - TS typy = Zod `.enum[]` (jedno źródło prawdy, z.infer)
 *   - łatwe do reużycia w scraperze, API i UI (Faza 5-7)
 *
 * Zasady (arch. §7.2):
 *   - `Vocation` (5 bazowych) i `VocationPromoted` (5 promowanych)
 *     są rozłącznymi enumeracjami — mapowanie jest w `VOCATION_BASE_TO_PROMOTED`.
 *   - `UspCategory` jest liczbą 0-13 (zgodnie z arch. §7.2 auction_usps.category).
 *   - `AuctionOrderColumn` odpowiada kolumnom, po których UI/API może sortować.
 */
import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────
// Vocations — arch. §7.2 auctions.vocation / auctions.vocation_base
// ──────────────────────────────────────────────────────────────────────────

/**
 * Bazowe klasy postaci (niezależnie od promocji).
 *
 * Arch. §7.2 `auctions.vocation_base` — DB trzyma je jako TEXT, ale Tibia
 * zwraca dokładnie te stringi w HTML listy aukcji i detalu.
 *
 * UWAGA: `None` to realny przypadek z tibia.com — postacie BEZ profesji
 * (challenge/Rookgaard-style, poziom potrafi być wysoki; obserwowane
 * 2026-09-17, np. „Digi mortal" lvl 207). Tibia.com dosłownie renderuje
 * `Vocation: None` — musimy je akceptować, bo to ~kilka % aukcji.
 */
export const VocationSchema = z.enum(["Knight", "Paladin", "Druid", "Sorcerer", "Monk", "None"]);
export type Vocation = z.infer<typeof VocationSchema>;

/**
 * Promowane warianty (widoczne w nagłówku aukcji Tibii) + `None`
 * (postacie bez profesji nie mają wariantu promowanego).
 *
 * Arch. §7.2 `auctions.vocation` — DB trzyma je jako TEXT.
 */
export const VocationPromotedSchema = z.enum([
  "Elite Knight",
  "Royal Paladin",
  "Elder Druid",
  "Master Sorcerer",
  "Exalted Monk",
  "None",
]);
export type VocationPromoted = z.infer<typeof VocationPromotedSchema>;

/**
 * Deterministyczne mapowanie bazowej → promowanej. Używane w:
 *   - `AuctionSchema.refine()` (walidacja spójności vocation ↔ vocationPromoted)
 *   - formularzach UI (auto-uzupełnienie promotion po wybraniu bazowej)
 *   - migracjach Drizzle (gdyby vocation_base → vocation trzeba było odtworzyć)
 *
 * Zgodne z arch. §13.1 + character-context/src/transforms/form-to-snapshot.ts.
 */
export const VOCATION_BASE_TO_PROMOTED = {
  Knight: "Elite Knight",
  Paladin: "Royal Paladin",
  Druid: "Elder Druid",
  Sorcerer: "Master Sorcerer",
  Monk: "Exalted Monk",
  None: "None",
} as const satisfies Record<Vocation, VocationPromoted>;

// ──────────────────────────────────────────────────────────────────────────
// Sex — arch. §7.2 auctions.sex (CHAR(1) 'M' | 'F')
// ──────────────────────────────────────────────────────────────────────────

export const SexSchema = z.enum(["M", "F"]);
export type Sex = z.infer<typeof SexSchema>;

// ──────────────────────────────────────────────────────────────────────────
// BidType — arch. §7.2 auctions.bid_type
// ──────────────────────────────────────────────────────────────────────────

/**
 * Rodzaj oferty: `current` to aktualna kwota (ktoś już licytuje),
 * `minimum` to najniższa dopuszczalna oferta (aukcja bez licytacji).
 */
export const BidTypeSchema = z.enum(["current", "minimum"]);
export type BidType = z.infer<typeof BidTypeSchema>;

// ──────────────────────────────────────────────────────────────────────────
// AuctionStatus — arch. §7.2 auctions.status
// ──────────────────────────────────────────────────────────────────────────

/**
 * Status aukcji — tylko `active` pokazuje się w bieżącej liście Bazaara.
 * `sold` wymaga pola `finalPrice`, `finished` bez finalPrice (aukcja
 * zakończyła się bez kupca).
 */
export const AuctionStatusSchema = z.enum(["active", "finished", "cancelled", "sold"]);
export type AuctionStatus = z.infer<typeof AuctionStatusSchema>;

// ──────────────────────────────────────────────────────────────────────────
// PvPType — arch. §7.2 worlds.pvp_type
// ──────────────────────────────────────────────────────────────────────────

/**
 * Wariant PvP dla świata postaci (filtry faceted w UI).
 * `Retro *` warianty są dla serwerów retro (inna mechanika progression).
 */
export const PvPTypeSchema = z.enum([
  "Open PvP",
  "Optional PvP",
  "Hardcore PvP",
  "Retro Open PvP",
  "Retro Hardcore PvP",
]);
export type PvPType = z.infer<typeof PvPTypeSchema>;

// ──────────────────────────────────────────────────────────────────────────
// BattlEyeType — arch. §7.2 worlds.battleye
// ──────────────────────────────────────────────────────────────────────────

/**
 * Status ochrony BattlEye — `initially protected` znika po pewnym czasie
 * od założenia konta. Gracze premium często filtrują tylko `protected`.
 */
export const BattlEyeTypeSchema = z.enum(["protected", "initially protected", "not protected"]);
export type BattlEyeType = z.infer<typeof BattlEyeTypeSchema>;

// ──────────────────────────────────────────────────────────────────────────
// UspCategory — arch. §7.2 auction_usps.category (SMALLINT 0-13)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Kategoria "Unique Selling Point" — kolorowe linijki na karcie aukcji.
 * Wartość liczbowa, bo tak jest w DB; mapowanie na string czytelny dla
 * użytkownika jest w UI (np. 0="Skill", 1="Gold", 13="Boss").
 *
 * Stałe pomocnicze poniżej mapują indeks → opis.
 */
export const UspCategorySchema = z.number().int().min(0).max(13);
export type UspCategory = z.infer<typeof UspCategorySchema>;

/**
 * Mapowanie kategorii USP na czytelne opisy (do logów/testów).
 * Numeracja zgodna z arch. §7.2 (0=skill, 1=gold, 2=achiev, ..., 13=boss).
 */
export const USP_CATEGORY_LABELS = [
  "skill", // 0
  "gold", // 1
  "achievement", // 2
  "charm", // 3
  "imbuement", // 4
  "outfit", // 5
  "mount", // 6
  "store", // 7
  "premium", // 8
  "blessing", // 9
  "quest", // 10
  "rare_item", // 11
  "soul_war", // 12
  "boss", // 13
] as const;

// ──────────────────────────────────────────────────────────────────────────
// AuctionOrderColumn / AuctionOrderDirection — sortowanie (UI + API)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Kolumny, po których UI/API może sortować listę aukcji.
 *
 * Reguła: tylko kolumny **gorących filtrów** + pola z indeksów partial
 * (arch. §7.2). Dzięki temu każde sortowanie ma wsparcie indeksu i nie
 * wymaga pełnego skanu tabeli.
 */
export const AuctionOrderColumnSchema = z.enum([
  // czas (częsty default: kończące się najwcześniej)
  "auctionEnd",
  // oferta
  "bid",
  // progresja
  "level",
  // skille (denormalizowane)
  "skillMagic",
  "skillSword",
  "skillClub",
  "skillAxe",
  "skillDistance",
  "skillShielding",
  "skillFist",
  "skillFishing",
  // progresja rozszerzona
  "charmPoints",
  "bossPoints",
  "achievementPoints",
  // wartość
  "estimatedValue",
  "pricePerLevel",
  // meta
  "firstSeenAt",
  "scrapedAt",
]);
export type AuctionOrderColumn = z.infer<typeof AuctionOrderColumnSchema>;

/**
 * Kierunek sortowania. `desc` to default dla większości filtrów
 * (najlepsze postacie na górze), `asc` dla `auctionEnd` (kończące się).
 */
export const AuctionOrderDirectionSchema = z.enum(["asc", "desc"]);
export type AuctionOrderDirection = z.infer<typeof AuctionOrderDirectionSchema>;
