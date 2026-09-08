/**
 * @tibians/character-context — CharacterSnapshot schema.
 *
 * Jedyne źródło prawdy dla kontraktu między Bazarem, kalkulatorami i Workspace
 * (arch. §13.1). Zod schema = walidacja + inferowany typ TS — jeden plik,
 * jeden typ, zero rozbieżności.
 *
 * Reguły (arch. §13.1):
 *   - source.kind jako discriminator (różne pola per kind)
 *   - 8 skilli zagnieżdżonych jako Record<SkillKey, SkillSchema>
 *   - auction opcjonalny (obecny tylko przy source.kind === 'auction')
 *   - tcInvested opcjonalny (premium w warstwie UI, NIE w typie)
 *
 * Walidacja (arch. §13.1 + task 9):
 *   - level: integer 8..2500
 *   - vocation: enum z 5 bazowych
 *   - skill.base: integer ≥ 0
 *   - gems: integer ≥ 0 (lesser/regular/greater)
 *   - gold_total: integer ≥ 0
 *   - loyaltyPct: jeden z 0|5|10|...|50
 */
import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────
// Vocations & skills — enumeracje z arch. §2.1 / §13.1
// ──────────────────────────────────────────────────────────────────────────

/** Pięć bazowych klas postaci (niezależnie od promocji). */
export const VocationBaseSchema = z.enum([
  "Knight",
  "Paladin",
  "Druid",
  "Sorcerer",
  "Monk",
]);
export type VocationBase = z.infer<typeof VocationBaseSchema>;

/** Promowane warianty — widoczne w nagłówku aukcji (np. „Elite Knight"). */
export const VocationPromotedSchema = z.enum([
  "Elite Knight",
  "Royal Paladin",
  "Elder Druid",
  "Master Sorcerer",
  "Exalted Monk",
]);
export type VocationPromoted = z.infer<typeof VocationPromotedSchema>;

/**
 * 8 skilli z arch. §13.1 — w kolejności referencyjnej z dokumentacji.
 * Kolejność jest stabilna (używana jako klucze URL w T10) i odpowiada
 * kolejności wyświetlania w Tibia Bazaar.
 */
export const SKILL_KEYS = [
  "magic",
  "club",
  "fist",
  "sword",
  "axe",
  "distance",
  "shielding",
  "fishing",
] as const;
export const SkillKeySchema = z.enum(SKILL_KEYS);
export type SkillKey = (typeof SKILL_KEYS)[number];

/** Lojalność dodawana do wyświetlanego skilla w grze (Tibia: 5% co 360 pkt). */
export const LoyaltyPctSchema = z.union([
  z.literal(0),
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(20),
  z.literal(25),
  z.literal(30),
  z.literal(35),
  z.literal(40),
  z.literal(45),
  z.literal(50),
]);
export type LoyaltyPct = z.infer<typeof LoyaltyPctSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Source — discriminated union (arch. §13.1 source)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Aukcja pochodzi z Bazaara — auctionId to klucz z tibia.com.
 * bigint (nie number), bo tibia.com używa ID > Number.MAX_SAFE_INTEGER.
 */
export const AuctionSourceSchema = z.object({
  kind: z.literal("auction"),
  auctionId: z.bigint(),
});
export type AuctionSource = z.infer<typeof AuctionSourceSchema>;

/** Postać wpisana ręcznie przez gracza (własna, nie na sprzedaż). */
export const ManualSourceSchema = z.object({
  kind: z.literal("manual"),
});
export type ManualSource = z.infer<typeof ManualSourceSchema>;

/** Import z URL tibia.com/community/?subtopic=characters&name=X. */
export const ImportedSourceSchema = z.object({
  kind: z.literal("imported"),
  from: z.literal("tibia-com"),
});
export type ImportedSource = z.infer<typeof ImportedSourceSchema>;

/**
 * Źródło danych — discriminator `kind` pozwala TS-owi na poprawne
 * zawężanie typu per przypadek (np. auctionId istnieje tylko dla 'auction').
 * Konsumenci powinni używać helperów `isAuctionSource` itd. (source.ts).
 */
export const SourceSchema = z.discriminatedUnion("kind", [
  AuctionSourceSchema,
  ManualSourceSchema,
  ImportedSourceSchema,
]);
export type Source = z.infer<typeof SourceSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Identity — arch. §13.1 identity
// ──────────────────────────────────────────────────────────────────────────

export const SexSchema = z.enum(["M", "F"]);
export type Sex = z.infer<typeof SexSchema>;

export const IdentitySchema = z.object({
  name: z.string().min(1),
  level: z
    .number()
    .int()
    .min(8, "Minimalny level w Tibii to 8")
    .max(2500, "Poziom wyższy niż 2500 jest niemożliwy w grze"),
  vocation: VocationBaseSchema,
  vocationPromoted: VocationPromotedSchema,
  sex: SexSchema,
  world: z.string().min(1).optional(),
});
export type Identity = z.infer<typeof IdentitySchema>;

// ──────────────────────────────────────────────────────────────────────────
// Skills — 8 skilli zagnieżdżonych (arch. §13.1 skills)
// ──────────────────────────────────────────────────────────────────────────

const SkillEntrySchema = z.object({
  /** Bazowy skill (bez bonusu lojalności — tak raportuje Bazaar). */
  base: z.number().int().min(0),
  /** Procentowy bonus lojalności — jeden z predefiniowanych progów. */
  loyaltyPct: LoyaltyPctSchema.optional(),
  /** Procent do następnego poziomu (0-100) — Tibia pokazuje %, nie punkty. */
  percentToNext: z.number().min(0).max(100).optional(),
});
export type SkillEntry = z.infer<typeof SkillEntrySchema>;

/**
 * Wymuszenie 8 kluczy (a nie dowolnego stringa). Używamy strict(),
 * żeby Zod odrzucał nadmiarowe pola w skills.
 */
export const SkillsSchema = z
  .object({
    magic: SkillEntrySchema,
    club: SkillEntrySchema,
    fist: SkillEntrySchema,
    sword: SkillEntrySchema,
    axe: SkillEntrySchema,
    distance: SkillEntrySchema,
    shielding: SkillEntrySchema,
    fishing: SkillEntrySchema,
  })
  .strict();
export type Skills = z.infer<typeof SkillsSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Progression — arch. §13.1 progression
// ──────────────────────────────────────────────────────────────────────────

export const ProgressionSchema = z
  .object({
    charmPoints: z.number().int().min(0),
    charmPointsUnused: z.number().int().min(0),
    minorCharmEchoes: z.number().int().min(0),
    bossPoints: z.number().int().min(0),
    questsCompleted: z.number().int().min(0),
    questsTotal: z.number().int().min(0),
    imbuementsUnlocked: z.number().int().min(0),
    imbuementsTotal: z.number().int().min(0),
    achievementPoints: z.number().int().min(0),
    animusMasteries: z.number().int().min(0),
  })
  .strict();
export type Progression = z.infer<typeof ProgressionSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Assets — arch. §13.1 assets
// ──────────────────────────────────────────────────────────────────────────

/** Tier imbuementu / itemu (0=base, 1=basic, 2=intricate, 3=powerful). */
export const TierSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type Tier = z.infer<typeof TierSchema>;

export const InventoryItemSchema = z
  .object({
    itemId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    tier: TierSchema.optional(),
  })
  .strict();
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const OwnedOutfitSchema = z
  .object({
    outfitId: z.number().int().positive(),
    /** Maska addons: bit 0 = addon 1, bit 1 = addon 2, bit 2 = addon 3. */
    addons: z.number().int().min(0).max(7),
  })
  .strict();
export type OwnedOutfit = z.infer<typeof OwnedOutfitSchema>;

export const StoreCountsSchema = z
  .object({
    outfits: z.number().int().min(0),
    mounts: z.number().int().min(0),
    items: z.number().int().min(0),
  })
  .strict();
export type StoreCounts = z.infer<typeof StoreCountsSchema>;

export const GemsSchema = z
  .object({
    lesser: z.number().int().min(0),
    regular: z.number().int().min(0),
    greater: z.number().int().min(0),
  })
  .strict();
export type Gems = z.infer<typeof GemsSchema>;

export const AssetsSchema = z
  .object({
    items: z.array(InventoryItemSchema),
    outfits: z.array(OwnedOutfitSchema),
    mounts: z.array(z.number().int().positive()),
    gems: GemsSchema,
    goldTotal: z.number().int().min(0),
    /** Zainwestowane Tibia Coins — widoczne w UI tylko dla premium. */
    tcInvested: z.number().int().min(0).optional(),
    storeCounts: StoreCountsSchema,
    hirelings: z.number().int().min(0),
  })
  .strict();
export type Assets = z.infer<typeof AssetsSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Flags — arch. §13.1 flags (mające_bool + blessingsActive)
// ──────────────────────────────────────────────────────────────────────────

export const FlagsSchema = z
  .object({
    soulWar: z.boolean(),
    primalOrdeal: z.boolean(),
    worldTransfer: z.boolean(),
    preySlot: z.boolean(),
    charmExpansion: z.boolean(),
    weeklyTaskExpansion: z.boolean(),
    twistOfFate: z.boolean(),
    blessingsActive: z.number().int().min(0).max(7),
  })
  .strict();
export type Flags = z.infer<typeof FlagsSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Auction — arch. §13.1 auction (obecny tylko przy source.kind='auction')
// ──────────────────────────────────────────────────────────────────────────

export const BidTypeSchema = z.enum(["current", "minimum"]);
export type BidType = z.infer<typeof BidTypeSchema>;

export const AuctionStatusSchema = z.enum([
  "active",
  "finished",
  "cancelled",
  "sold",
]);
export type AuctionStatus = z.infer<typeof AuctionStatusSchema>;

export const AuctionContextSchema = z
  .object({
    bid: z.number().int().min(0),
    bidType: BidTypeSchema,
    /** ISO-8601 timestamp (string dla bezpiecznej serializacji w JSON). */
    auctionStart: z.string().min(1),
    auctionEnd: z.string().min(1),
    status: AuctionStatusSchema,
  })
  .strict();
export type AuctionContext = z.infer<typeof AuctionContextSchema>;

// ──────────────────────────────────────────────────────────────────────────
// CharacterSnapshot — rdzeń architektury
// ──────────────────────────────────────────────────────────────────────────

/**
 * Główny kontrakt. Reguły (arch. §13.1):
 *   - Jeden typ = jeden schema (zero rozbieżności schema↔TS).
 *   - Kalkulatory (packages/calc) przyjmują wyłącznie CharacterSnapshot.
 *   - Walidacja działa dla: payload scrapera, formularza ręcznego, URL.
 */
export const CharacterSnapshotSchema = z
  .object({
    source: SourceSchema,
    identity: IdentitySchema,
    skills: SkillsSchema,
    progression: ProgressionSchema,
    assets: AssetsSchema,
    flags: FlagsSchema,
    auction: AuctionContextSchema.optional(),
  })
  .strict()
  /**
   * Spójność source ↔ auction: jeśli auction jest obecny, to źródło musi
   * być aukcją. Jeśli źródło NIE jest aukcją, pole auction nie może istnieć
   * (bo nie ma sensu — nie ma numeru aukcji).
   */
  .refine(
    (snap) =>
      snap.auction === undefined || snap.source.kind === "auction",
    {
      message:
        "Pole 'auction' może istnieć tylko gdy source.kind === 'auction'",
      path: ["auction"],
    },
  )
  /** Promowana klasa musi odpowiadać bazowej. */
  .refine(
    (snap) => {
      const map: Record<VocationBase, VocationPromoted> = {
        Knight: "Elite Knight",
        Paladin: "Royal Paladin",
        Druid: "Elder Druid",
        Sorcerer: "Master Sorcerer",
        Monk: "Exalted Monk",
      };
      return map[snap.identity.vocation] === snap.identity.vocationPromoted;
    },
    {
      message:
        "vocationPromoted musi odpowiadać vocation (Knight→Elite Knight itd.)",
      path: ["identity", "vocationPromoted"],
    },
  )
  /** questsCompleted ≤ questsTotal i imbuementsUnlocked ≤ imbuementsTotal. */
  .refine(
    (snap) =>
      snap.progression.questsCompleted <= snap.progression.questsTotal &&
      snap.progression.imbuementsUnlocked <= snap.progression.imbuementsTotal,
    {
      message: "Wartość completed/unlocked nie może przekraczać total",
      path: ["progression"],
    },
  );

/**
 * Wnioskowany typ TS — jedyne źródło prawdy dla CharacterSnapshot.
 * Interfejs w arch. §13.1 jest traktowany jako dokumentacja, ten typ
 * jest implementacją.
 */
export type CharacterSnapshot = z.infer<typeof CharacterSnapshotSchema>;
