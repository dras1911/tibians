/**
 * @tibians/shared — Zod schemas dla modułu aukcji Bazaar.
 *
 * Jedyne źródło prawdy dla kontraktu między scraperem (task 30-31),
 * HTTP API (task 38), a UI (Bazaar, Workspace). Reguły:
 *   - jeden Zod schema = jeden typ TS (z.infer)
 *   - WSZYSTKIE kolumny z arch. §7.2 auctions (58 + 6 relations)
 *   - `.strict()` — odrzuca nieznane pola (R1 future-proof)
 *   - cross-validation refinements (auctionEnd > auctionStart, itd.)
 *
 * Decyzje projektowe (arch. §7.1):
 *   1. Denormalizacja gorących filtrów: `skillMagic`...`skillFishing`
 *      są OSOBNYMI polami w AuctionSchema (nie join do `auction_skills`)
 *      — wydajność single-index-scan vs 8× join przy 2500 aukcjach.
 *   2. `rawJson` jako `z.record(z.unknown())` — pełny payload ze
 *      scrapera, źródło backfill przy nowych polach Tibii.
 *   3. `searchVector` jest GENERATED w DB; w TS akceptujemy string
 *      (tekstowa forma TSVECTOR: `'migzen':1`) lub generujemy z `name`
 *      przez `.transform()`.
 *   4. `pricePerLevel` jest GENERATED (bid / NULLIF(level, 0)); w TS
 *      akceptujemy number lub walidujemy zgodność przez `.refine()`.
 *
 * Walidacje krzyżowe (refinements):
 *   - auctionEnd > auctionStart
 *   - questsCompleted ≤ questsTotal
 *   - imbuementsUnlocked ≤ imbuementsTotal
 *   - status='sold' → finalPrice required (nullable → required)
 *   - status='finished' → finalPrice nullable (auction ended without buyer)
 *   - vocationPromoted musi pasować do vocation (VOCATION_BASE_TO_PROMOTED)
 *   - bidType='current'|'minimum' → bid ≥ 0 (oba takie same)
 *
 * Konwencja nazewnictwa:
 *   - `AuctionSchema` ↔ `Auction` (z.infer) — kanoniczna para
 *   - `*Promoted` dla promowanych wariantów (Elite Knight itd.)
 *   - `*Skill*` dla relacji 1:N z tabel skilli
 *   - wszystkie `id` FK jako `bigint()` (auctionId) lub `number().int()` (itemId)
 */
import { z } from "zod";

import {
  AuctionStatusSchema,
  BidTypeSchema,
  SexSchema,
  VOCATION_BASE_TO_PROMOTED,
  VocationPromotedSchema,
  VocationSchema,
} from "./enums.js";

// ──────────────────────────────────────────────────────────────────────────
// Primitives / building blocks
// ──────────────────────────────────────────────────────────────────────────

/**
 * 8 skilli z arch. §7.2 auctions (skill_magic, skill_club, ..., skill_fishing).
 * Kolejność stabilna (jak w `character-context/src/schema.ts`).
 */
export const AUCTION_SKILL_KEYS = [
  "magic",
  "club",
  "fist",
  "sword",
  "axe",
  "distance",
  "shielding",
  "fishing",
] as const;
export const AuctionSkillKeySchema = z.enum(AUCTION_SKILL_KEYS);
export type AuctionSkillKey = z.infer<typeof AuctionSkillKeySchema>;

/**
 * Tier itemu (forging) — 0=base, 1=basic, 2=intricate, 3=powerful.
 * `null` oznacza brak informacji o tierze.
 */
export const AuctionTierSchema = z
  .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
  .nullable();
export type AuctionTier = z.infer<typeof AuctionTierSchema>;

/**
 * ISO-8601 timestamp (np. `"2026-09-08T22:00:00Z"`).
 * Używamy stringów zamiast `z.date()` dla bezpiecznej serializacji JSON.
 */
const IsoDateTimeSchema = z
  .string()
  .min(1, "Pole daty nie może być puste")
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "Nieprawidłowy format ISO-8601 daty",
  });

// ──────────────────────────────────────────────────────────────────────────
// AuctionSkillSchema — relacja 1:N auction_skills (arch. §7.2)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pojedynczy wiersz tabeli `auction_skills` (arch. §7.2):
 *   - PK: (auctionId, skill)
 *   - `baseValue` — wartość bez bonusu lojalności (to pokazuje Bazaar)
 *   - `loyaltyValue` — wartość z bonusem lojalności (nullable, bo
 *     Bazaar nie zawsze raportuje).
 *
 * UWAGA: 8 skilli jest też denormalizowanych w AuctionSchema jako
 * `skillMagic`...`skillFishing` (wydajność filtrów). Ta tabela jest
 * reliktowa — używana tylko do wyświetlania i ewentualnych audytów.
 */
export const AuctionSkillSchema = z
  .object({
    auctionId: z
      .bigint()
      .positive("auctionId musi być dodatni (bigint PK z auctions.auction_id)"),
    skill: AuctionSkillKeySchema,
    baseValue: z
      .number()
      .int()
      .min(0, "Bazowy skill nie może być ujemny")
      .max(250, "Skill powyżej 250 jest niemożliwy w Tibii"),
    loyaltyValue: z
      .number()
      .int()
      .min(0)
      .max(500)
      .nullable()
      .optional(),
  })
  .strict();
export type AuctionSkill = z.infer<typeof AuctionSkillSchema>;

// ──────────────────────────────────────────────────────────────────────────
// AuctionItemSchema — relacja 1:N auction_items (arch. §7.2)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pojedynczy item w inventory aukcji (arch. §7.2):
 *   - PK: (auctionId, itemId, tier)
 *   - `quantity` ≥ 1
 *   - `tier` 0-3 nullable (są itemy bez tieru, np. stackable runes)
 */
export const AuctionItemSchema = z
  .object({
    auctionId: z.bigint().positive(),
    itemId: z
      .number()
      .int()
      .positive("itemId musi być dodatni (FK do items.id)"),
    quantity: z
      .number()
      .int()
      .min(1, "Ilość itemu musi wynosić co najmniej 1"),
    tier: AuctionTierSchema,
  })
  .strict();
export type AuctionItem = z.infer<typeof AuctionItemSchema>;

// ──────────────────────────────────────────────────────────────────────────
// AuctionOutfitSchema — relacja 1:N auction_outfits (arch. §7.2)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pojedynczy outfit aukcji z liczbą addonów (0-3).
 * PK: (auctionId, outfitId).
 */
export const AuctionOutfitSchema = z
  .object({
    auctionId: z.bigint().positive(),
    outfitId: z.number().int().positive("outfitId musi być dodatni (FK)"),
    /**
     * Maska addons: 0=brak, 1=addon 1, 2=addon 2, 3=addon 1+2,
     * z wartością 3 oznaczającą też "pełne addony" w Tibii.
     */
    addons: z
      .number()
      .int()
      .min(0, "Addony nie mogą być ujemne")
      .max(3, "Maska addons to 0..3 (3 bity)"),
  })
  .strict();
export type AuctionOutfit = z.infer<typeof AuctionOutfitSchema>;

// ──────────────────────────────────────────────────────────────────────────
// AuctionMountSchema — relacja 1:N auction_mounts (arch. §7.2)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Mount posiadany przez postać. PK: (auctionId, mountId).
 */
export const AuctionMountSchema = z
  .object({
    auctionId: z.bigint().positive(),
    mountId: z.number().int().positive("mountId musi być dodatni (FK)"),
  })
  .strict();
export type AuctionMount = z.infer<typeof AuctionMountSchema>;

// ──────────────────────────────────────────────────────────────────────────
// AuctionUspSchema — relacja 1:N auction_usps (arch. §7.2)
// ──────────────────────────────────────────────────────────────────────────

/**
 * "Unique Selling Point" — kolorowa linijka z karty aukcji (np.
 * "114 Axe Fighting (Loyalty bonus not included)"). Sortowane
 * po `sortOrder` ASC.
 */
export const AuctionUspSchema = z
  .object({
    auctionId: z.bigint().positive(),
    category: z.number().int().min(0).max(13),
    text: z.string().min(1, "USP nie może być pusty"),
    sortOrder: z.number().int().min(0),
  })
  .strict();
export type AuctionUsp = z.infer<typeof AuctionUspSchema>;

// ──────────────────────────────────────────────────────────────────────────
// AuctionSkillLoyaltySchema — relacja 1:N auction_skill_loyalty (arch. §7.2)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Skill z osobnym zapisem wartości bazowej vs wyświetlanej (z bonusem
 * lojalności). Służy do kalkulatora "true skill" w UI.
 *
 * `loyaltyPct` to jeden z progów: 0|5|10|15|20|25|30|35|40|45|50.
 */
export const LoyaltyPctRangeSchema = z
  .number()
  .int()
  .min(0)
  .max(50)
  .refine((n) => n % 5 === 0, {
    message: "Loyalty % musi być wielokrotnością 5 (0, 5, 10, ..., 50)",
  });

export const AuctionSkillLoyaltySchema = z
  .object({
    auctionId: z.bigint().positive(),
    skill: AuctionSkillKeySchema,
    baseValue: z
      .number()
      .int()
      .min(0)
      .max(250, "Bazowy skill nie może przekraczać 250"),
    loyaltyPct: LoyaltyPctRangeSchema.nullable().optional(),
  })
  .strict();
export type AuctionSkillLoyalty = z.infer<typeof AuctionSkillLoyaltySchema>;

// ──────────────────────────────────────────────────────────────────────────
// AuctionSchema — rdzeń (60+ kolumn z arch. §7.2 auctions)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Główny schema aukcji. Mirroruje WSZYSTKIE 58 kolumn z arch. §7.2
 * auctions, plus pola denormalizowane i GENERATED.
 *
 * Pola pogrupowane tematycznie:
 *   1. Tożsamość postaci (8 kolumn)
 *   2. Aukcja (7 kolumn)
 *   3. ★ Denormalizowane skille (8 kolumn — gorące filtry)
 *   4. Progresja (13 kolumn)
 *   5. Gemy + zasoby (8 kolumn)
 *   6. ★ Flagi boolean (7 kolumn)
 *   7. ★ Pola wyliczane (3 kolumny)
 *   8. Meta / timestamps (5 kolumn)
 *
 * Wszystkie kolumny zgodne z arch. §7.2 auctions table.
 */
export const AuctionSchema = z
  .object({
    // ── 1. Tożsamość postaci ──────────────────────────────────────────
    /** PK z tibia.com (`?auctionid=2173376`). bigint bo ID > Number.MAX_SAFE_INTEGER. */
    id: z
      .bigint()
      .positive("id aukcji musi być dodatnie (PK z tibia.com)"),
    /** Nazwa postaci (1-50 znaków). */
    name: z
      .string()
      .min(1, "Nazwa postaci nie może być pusta")
      .max(50, "Nazwa postaci nie może przekraczać 50 znaków (limit Tibii)"),
    /** Poziom postaci (8..2500, realny zakres z gry). */
    level: z
      .number()
      .int()
      .min(8, "Minimalny level w Tibii to 8")
      .max(2500, "Maksymalny level w Tibii to 2500"),
    /** Bazowa klasa (5 opcji, do filtrowania głównego). */
    vocation: VocationSchema,
    /** Promowana klasa (5 opcji, widoczna w nagłówku aukcji). */
    vocationPromoted: VocationPromotedSchema,
    /** Płeć postaci: 'M' | 'F'. */
    sex: SexSchema,
    /** FK do `worlds.id` (smallint). */
    worldId: z.number().int().positive("worldId musi być dodatni (FK)"),
    /** ID outfitu (FK do outfits.id). Nullable — postać może nie mieć outfitu. */
    outfitId: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),

    // ── 2. Aukcja ─────────────────────────────────────────────────────
    /** Aktualna lub minimalna oferta w TC. ≥ 0. */
    bid: z
      .number()
      .int()
      .min(0, "Oferta nie może być ujemna"),
    /** `current` (ktoś licytuje) lub `minimum` (aukcja bez licytacji). */
    bidType: BidTypeSchema,
    /** ISO datetime rozpoczęcia aukcji. */
    auctionStart: IsoDateTimeSchema,
    /** ISO datetime zakończenia aukcji. */
    auctionEnd: IsoDateTimeSchema,
    /** Status aukcji (active/finished/cancelled/sold). */
    status: AuctionStatusSchema,
    /** Finalna cena (uzupełniana po zakończeniu). Nullable. */
    finalPrice: z.number().int().min(0).nullable().optional(),

    // ── 3. ★ Denormalizowane skille (arch. §7.1 pkt 1) ───────────────
    skillMagic: z.number().int().min(0).default(0),
    skillClub: z.number().int().min(0).default(0),
    skillFist: z.number().int().min(0).default(0),
    skillSword: z.number().int().min(0).default(0),
    skillAxe: z.number().int().min(0).default(0),
    skillDistance: z.number().int().min(0).default(0),
    skillShielding: z.number().int().min(0).default(0),
    skillFishing: z.number().int().min(0).default(0),

    // ── 4. Progresja (arch. §7.2 auctions.*_points) ───────────────────
    charmPoints: z.number().int().min(0).default(0),
    /** Niewykorzystane punkty charmów (do urozmaicenia strategii). */
    charmPointsUnused: z.number().int().min(0).default(0),
    /** "Minor Charm Echoes" — bilans za 2024 prerefund event. */
    minorCharmEchoes: z.number().int().min(0).default(0),
    bossPoints: z.number().int().min(0).default(0),
    imbuementsUnlocked: z.number().int().min(0).default(0),
    imbuementsTotal: z.number().int().min(0).default(23),
    questsCompleted: z.number().int().min(0).default(0),
    questsTotal: z.number().int().min(0).default(42),
    achievementPoints: z.number().int().min(0).default(0),
    animusMasteries: z.number().int().min(0).default(0),

    // ── 5. Gemy + zasoby ─────────────────────────────────────────────
    gemsLesser: z.number().int().min(0).default(0),
    gemsRegular: z.number().int().min(0).default(0),
    gemsGreater: z.number().int().min(0).default(0),
    /** Liczba store outfitów posiadanych przez postać. */
    storeOutfitsCount: z.number().int().min(0).default(0),
    /** Liczba store mountów. */
    storeMountsCount: z.number().int().min(0).default(0),
    /** Liczba store itemów. */
    storeItemsCount: z.number().int().min(0).default(0),
    /** Liczba hirelingsów (pomocników). */
    hirelingsCount: z.number().int().min(0).default(0),
    /** Bank + inventory + depot (bigint — Tibia pozwala >2^31). */
    goldTotal: z.bigint().min(0n).default(0n),
    /** Zainwestowane TC (opcjonalne — UI premium, Exevo Pan chowa za paywallem). */
    tcInvested: z.number().int().min(0).nullable().optional(),

    // ── 6. ★ Flagi boolean (arch. §7.2 auctions.has_*) ───────────────
    hasSoulWar: z.boolean().default(false),
    hasPrimalOrdeal: z.boolean().default(false),
    hasWorldTransfer: z.boolean().default(false),
    hasPreySlot: z.boolean().default(false),
    hasCharmExpansion: z.boolean().default(false),
    hasWeeklyTaskExpansion: z.boolean().default(false),
    hasTwistOfFate: z.boolean().default(false),
    /** 0..7 (maska 3-bit dla 7 błogosławieństw Tibii). */
    blessingsActive: z.number().int().min(0).max(7).default(0),

    // ── 7. ★ Pola wyliczane (alg. §8.4 + GENERATED) ──────────────────
    /** Szacowana wartość w TC (algorytm waloryzacji). */
    estimatedValue: z.number().int().min(0).nullable().optional(),
    /** Pewność wyceny 0.00-1.00 (ile danych mamy). */
    valueConfidence: z
      .number()
      .min(0, "valueConfidence nie może być ujemne")
      .max(1, "valueConfidence nie może przekraczać 1")
      .nullable()
      .optional(),
    /**
     * GENERATED w DB jako `bid::numeric / NULLIF(level, 0) STORED`.
     * W TS akceptujemy number lub walidujemy zgodność (jeśli podane).
     * Wyliczane też przez transform, gdy brak.
     */
    pricePerLevel: z.number().min(0).optional(),
    /** Pełny payload ze scrapera (JSONB). Future-proof na nowe pola. */
    rawJson: z.record(z.unknown()),
    /**
     * GENERATED w DB jako `to_tsvector('simple', character_name) STORED`.
     * W TS traktujemy jako string (forma tekstowa TSVECTOR). Auto-uzupełniane
     * z `name` przez `.transform()` gdy brak.
     */
    searchVector: z.string().optional(),

    // ── 8. Meta / timestamps (arch. §7.2 auctions.first_seen_at itd.) ─
    firstSeenAt: IsoDateTimeSchema,
    lastSeenAt: IsoDateTimeSchema,
    scrapedAt: IsoDateTimeSchema,
    archivedAt: IsoDateTimeSchema.nullable().optional(),
  })
  .strict()
  // ─────────────────────────────────────────────────────────────────────
  // Cross-validation refinements (arch. §7.2 + task 28 spec)
  // ─────────────────────────────────────────────────────────────────────
  /** auctionEnd musi być po auctionStart. */
  .refine(
    (a) => Date.parse(a.auctionEnd) > Date.parse(a.auctionStart),
    {
      message: "auctionEnd musi być po auctionStart",
      path: ["auctionEnd"],
    },
  )
  /** questsCompleted ≤ questsTotal. */
  .refine(
    (a) => a.questsCompleted <= a.questsTotal,
    {
      message: "questsCompleted nie może przekraczać questsTotal",
      path: ["questsCompleted"],
    },
  )
  /** imbuementsUnlocked ≤ imbuementsTotal. */
  .refine(
    (a) => a.imbuementsUnlocked <= a.imbuementsTotal,
    {
      message: "imbuementsUnlocked nie może przekraczać imbuementsTotal",
      path: ["imbuementsUnlocked"],
    },
  )
  /** status='sold' → finalPrice required (nie może być null). */
  .refine(
    (a) => a.status !== "sold" || a.finalPrice !== null && a.finalPrice !== undefined,
    {
      message: "finalPrice jest wymagany gdy status='sold'",
      path: ["finalPrice"],
    },
  )
  /** vocationPromoted musi odpowiadać bazowej (VOCATION_BASE_TO_PROMOTED). */
  .refine(
    (a) => VOCATION_BASE_TO_PROMOTED[a.vocation] === a.vocationPromoted,
    {
      message:
        "vocationPromoted musi odpowiadać vocation (Knight→Elite Knight itd.)",
      path: ["vocationPromoted"],
    },
  )
  /** pricePerLevel (jeśli podany) musi zgadzać się z bid/level. */
  .refine(
    (a) =>
      a.pricePerLevel === undefined ||
      // tolerancja 0.01 (NUMERIC(10,2) w DB)
      Math.abs(a.pricePerLevel - a.bid / a.level) < 0.01,
    {
      message:
        "pricePerLevel musi odpowiadać bid/level (GENERATED w DB, tolerancja 0.01)",
      path: ["pricePerLevel"],
    },
  )
  // ─────────────────────────────────────────────────────────────────────
  // Transform — auto-uzupełnienie pól GENERATED (searchVector, pricePerLevel)
  // ─────────────────────────────────────────────────────────────────────
  .transform((a) => {
    /**
     * Jeśli scraper nie podał `pricePerLevel`, liczymy je jak DB
     * (`bid::numeric / NULLIF(level, 0)`). Pozwala API odpowiadać bez
     * konieczności przeliczania po stronie klienta.
     */
    const computedPricePerLevel =
      a.pricePerLevel ?? (a.level > 0 ? a.bid / a.level : 0);
    /**
     * searchVector (TSVECTOR) — auto-generujemy prostą formę tekstową
     * z `name`. W DB wygeneruje `to_tsvector('simple', name)`, my robimy
     * spacje-normalizowanego lowercasa (wystarczające do wyszukiwania
     * bez potrzeby parsowania leksera PostgreSQL).
     */
    const computedSearchVector =
      a.searchVector ?? a.name.toLowerCase().trim();

    return {
      ...a,
      pricePerLevel: computedPricePerLevel,
      searchVector: computedSearchVector,
    };
  });

/**
 * Wnioskowany typ TS — kanoniczna nazwa kontraktu aukcji.
 * Pokrywa WSZYSTKIE 60+ kolumn z arch. §7.2 auctions + relacje.
 */
export type Auction = z.infer<typeof AuctionSchema>;