/**
 * @tibians/shared — filtry aukcji Bazaar i paginacja dla HTTP API (task 38).
 *
 * Pojedyncze źródło prawdy dla walidacji query params przychodzących do
 * `/api/auctions`, `/api/auctions/[id]`, `/api/auctions/ending` oraz UI
 * (Faza 8 — Bazaar sidebar). Wcześniej T28 dostarczył główne schemy
 * encji, ale **filtry** dopiero tutaj lądują — są częścią kontraktu
 * API dopiero od task 38 (HTTP endpoint dopiero wtedy powstaje).
 *
 * Decyzje projektowe (arch. §7.2 + §8.2 + task 38):
 *   1. Wszystkie query params są opcjonalne — brak filtra == brak
 *      ograniczenia (UI pozwala wybrać zero filtrów).
 *   2. `z.coerce.number()` — Next.js 15 zwraca query params jako `string`
 *      (URLSearchParams). Wymuszamy konwersję liczb.
 *   3. `world` jako string (nazwa świata) — NIE `worldId`. UI pokazuje
 *      nazwy ("Antica"), a nie FK; filtrujemy po `worlds.name`.
 *      Zadanie UI/API: rozwiązanie nazwy → id po stronie DB.
 *   4. `sortBy` ograniczone do `AuctionOrderColumnSchema` (gorące filtry)
 *      — wydajność: tylko kolumny z partial indexes (arch §7.2).
 *   5. `paginationSchema` jest osojbnym bytem (reużywalny w innych
 *      endpointach, np. `/api/stats/history`).
 *
 * Walidacja po stronie TS (z.infer) = zero ręcznych interfejsów.
 */
import { z } from "zod";

import {
  AuctionOrderColumnSchema,
  AuctionOrderDirectionSchema,
  AuctionStatusSchema,
  VocationSchema,
} from "./enums.js";
import { AuctionSkillKeySchema } from "./schema.js";

// ───────────────────────────────────────────────────────────────────────
// Filtry (arch. §7.2 + task 38 — query params /api/auctions)
// ───────────────────────────────────────────────────────────────────────

/**
 * Zakres poziomu (levelMin/levelMax) — wymuszamy integer,
 * 8..2500 (zakres z gry, arch. §7.2).
 */
const LevelBoundSchema = z.coerce
  .number()
  .int("Level musi być liczbą całkowitą")
  .min(8, "Minimalny level w Tibii to 8")
  .max(2500, "Maksymalny level w Tibii to 2500");

/**
 * Zakres skilla — 0..250 (arch. §7.2 — w Tibii nie da się przekroczyć 250).
 */
const SkillBoundSchema = z.coerce
  .number()
  .int("Skill musi być liczbą całkowitą")
  .min(0, "Skill nie może być ujemny")
  .max(250, "Skill powyżej 250 jest niemożliwy w Tibii");

/**
 * Zakres oferty (bidMin/bidMax) — integer TC, ≥ 0.
 */
const BidBoundSchema = z.coerce
  .number()
  .int("Oferta musi być liczbą całkowitą")
  .min(0, "Oferta nie może być ujemna");

// ───────────────────────────────────────────────────────────────────────
// Store items — kuratorowana lista (jak ExevoPan)
// ───────────────────────────────────────────────────────────────────────

/**
 * Klucze store itemów oferowane w filtrze (`?storeItems=a,b`).
 *
 * Aukcja musi mieć WSZYSTKIE wybrane (AND). Mapowanie klucz → wzorzec nazwy
 * itemu w DB: `apps/web/src/lib/server/auctions.ts` (`STORE_ITEM_NAME_PATTERNS`)
 * — łączy warianty tego samego itemu (np. „mailbox" i „ornate mailbox").
 */
export const STORE_ITEM_KEYS = [
  "trainingDummy",
  "goldPouch",
  "goldConverter",
  "hirelings",
  "imbuementShrine",
  "rewardShrine",
  "mailbox",
] as const;

export type StoreItemKey = (typeof STORE_ITEM_KEYS)[number];

// ───────────────────────────────────────────────────────────────────────
// Wyróżnienia (highlights — wzór: Exiva.pro „Wyróżnienia")
// ───────────────────────────────────────────────────────────────────────

/**
 * Klucze wyróżnień oferowanych w filtrze (`?highlights=goldenOutfit`).
 * Mapowanie klucz → wzorzec nazwy itemu/outfitu/mounta:
 * `apps/web/src/lib/server/auctions.ts` (`HIGHLIGHT_FILTERS`).
 */
/**
 * Wyróżnienia (highlights — wzór: Exiva.pro „Wyróżnienia", rozszerzone W18).
 *
 * Kuratorowana lista UNIKALNYCH, rzadkich pozycji — celowo NIE ma tu
 * outfity/mountów ze Store (kupisz je za TC — zero wartości jako
 * wyróżnienie). Kryterium: nie-store + rzadkie (liczniki w setkach aukcji
 * są OK dla ikonicznych; tu bierzemy te z pojedynczymi sztukami).
 *
 * Liczniki liczy `getStoreItemFacetCounts`; pozycje z zerem (brak danych
 * w słownikach) są UKRYWANE w UI — lista może być szersza niż to, co
 * aktualnie widać.
 *
 * Mapowanie klucz → tabela/wzorzec: `apps/web/src/lib/server/auctions.ts`
 * (`HIGHLIGHT_FILTERS`).
 */
export const HIGHLIGHT_KEYS = [
  // outfity (unikalne/questowe — is_store = false)
  "goldenOutfit",
  "dragonSlayer",
  "rootwalker",
  "feralTrapper",
  "falconer",
  // mounty (unikalne/questowe — is_store = false)
  "radiantNimbus",
  "crimsonBayPredator",
  "ashenCoastPredator",
  "vortexion",
  "riftRunner",
  // itemy
  "ferumbrasHat",
] as const;

export type HighlightKey = (typeof HIGHLIGHT_KEYS)[number];

/**
 * Schemat filtrów listy aukcji. Wszystkie pola opcjonalne.
 *
 * Mapowanie query params → pole (arch. §7.2):
 *   world       → worlds.name (string)
 *   vocation    → auctions.vocation_base (Vocation)
 *   levelMin    → auctions.level >=
 *   levelMax    → auctions.level <=
 *   skillType   → auctions.skill_{skillType}
 *   skillMin    → auctions.skill_{skillType} >=
 *   skillMax    → auctions.skill_{skillType} <=
 *   bidMin      → auctions.bid >=
 *   bidMax      → auctions.bid <=
 *   status      → auctions.status (default: 'active')
 *   search      → searchVector @@ plainto_tsquery
 *   hasSoulWar  → auctions.has_soul_war (bool)
 *   hasPrimalOrdeal → auctions.has_primal_ordeal (bool)
 *   pvpType     → worlds.pvp_type
 *   region      → worlds.region
 *   sortBy      → AuctionOrderColumn
 *   sortDir     → asc|desc
 */
/**
 * Bazowy obiekt schematu filtrów (BEZ refine'ów).
 *
 * `.shape` tego obiektu służy do rozdzielania searchParams od paginacji
 * (patrz `apps/web/src/lib/server/bazaar-params.ts`) — refine'y opakowują
 * obiekt w `ZodEffects`, które nie eksponują `shape`. Kontrakt zewnętrzny
 * to `auctionFiltersSchema` (obiekt + refine'y).
 */
export const auctionFiltersObject = z
  .object({
    /** Nazwa świata (rozwiązywana do worldId po stronie DB). */
    world: z
      .string()
      .trim()
      .min(1, "Nazwa świata nie może być pusta")
      .max(30, "Nazwa świata jest za długa")
      .optional(),

    /** Bazowa klasa postaci (5 opcji). */
    vocation: VocationSchema.optional(),

    /** Zakres level. */
    levelMin: LevelBoundSchema.optional(),
    levelMax: LevelBoundSchema.optional(),

    /** Skill — klucz + zakres (muszą występować razem). */
    skillType: AuctionSkillKeySchema.optional(),
    skillMin: SkillBoundSchema.optional(),
    skillMax: SkillBoundSchema.optional(),

    /** Zakres oferty. */
    bidMin: BidBoundSchema.optional(),
    bidMax: BidBoundSchema.optional(),

    /** Status — domyślnie 'active'. */
    status: AuctionStatusSchema.default("active"),

    /** Full-text search po nazwie postaci (searchVector @@ plainto_tsquery). */
    search: z
      .string()
      .trim()
      .min(2, "Fraza wyszukiwania musi mieć co najmniej 2 znaki")
      .max(50, "Fraza wyszukiwania jest za długa")
      .optional(),

    /** Boolean flagi „must-have" (arch §5 krok 4 — T42 advanced filters). */
    hasSoulWar: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .transform((v) => v === "true" || v === "1")
      .optional(),
    hasPrimalOrdeal: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .transform((v) => v === "true" || v === "1")
      .optional(),
    hasWorldTransfer: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .transform((v) => v === "true" || v === "1")
      .optional(),
    /** Prey Slot — rozszerzenie T42 + T45 (sugestie 0-wyników). */
    hasPreySlot: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .transform((v) => v === "true" || v === "1")
      .optional(),
    /** Charm Expansion — rozszerzenie T42 + T45. */
    hasCharmExpansion: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .transform((v) => v === "true" || v === "1")
      .optional(),
    /** Weekly Task Expansion — rozszerzenie T42 + T45. */
    hasWeeklyTaskExpansion: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .transform((v) => v === "true" || v === "1")
      .optional(),
    /** Twist of Fate — rozszerzenie T42 + T45. */
    hasTwistOfFate: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .transform((v) => v === "true" || v === "1")
      .optional(),
    /** `true` = wymaga `imbuementsUnlocked = imbuementsTotal` (23/23). */
    imbuesFull: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .transform((v) => v === "true" || v === "1")
      .optional(),
    /**
     * Store items (kuratorowana lista jak ExevoPan) — CSV kluczy,
     * np. `?storeItems=goldPouch,mailbox`. Aukcja musi mieć WSZYSTKIE
     * wybrane itemy (AND).
     */
    storeItems: z
      .string()
      .transform((s) => s.split(",").filter(Boolean))
      .pipe(z.array(z.enum(STORE_ITEM_KEYS)).max(STORE_ITEM_KEYS.length))
      .optional(),

    /** Tylko aukcje z aktualnie złożoną ofertą (`bid_type = current`). */
    biddedOnly: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .transform((v) => v === "true" || v === "1")
      .optional(),

    /** Min/max charm points. */
    charmPointsMin: z.coerce.number().int().min(0).optional(),
    charmPointsMax: z.coerce.number().int().min(0).optional(),

    /** Min/max zainwestowane Tibia Coins (`tc_invested`; brak danych = odpada). */
    tcInvestedMin: z.coerce.number().int().min(0).optional(),
    tcInvestedMax: z.coerce.number().int().min(0).optional(),

    /**
     * Ocena ceny vs wycena (wzór: Exiva.pro „Cena") — W18.
     *   - `good`      → bid < 90% wyceny (potencjalna okazja),
     *   - `fair`      → bid w ±10% wyceny,
     *   - `expensive` → bid > 110% wyceny.
     * Wymaga `estimated_value` (aukcje bez wyceny odpadają).
     */
    priceRating: z.enum(["good", "fair", "expensive"]).optional(),

    /** Gemy (minimum) — `gems_lesser/regular/greater` z detalu. */
    gemsMinLesser: z.coerce.number().int().min(0).optional(),
    gemsMinRegular: z.coerce.number().int().min(0).optional(),
    gemsMinGreater: z.coerce.number().int().min(0).optional(),

    /** Store counts (minimum) — `store_outfits/mounts/items_count` z detalu. */
    storeMinOutfits: z.coerce.number().int().min(0).optional(),
    storeMinMounts: z.coerce.number().int().min(0).optional(),
    storeMinItems: z.coerce.number().int().min(0).optional(),

    /** Minimum ukończonych questów (`quests_completed`). */
    questsMin: z.coerce.number().int().min(0).optional(),

    /** Boss points — zakres (wzór: Exiva.pro). */
    bossPointsMin: z.coerce.number().int().min(0).optional(),
    bossPointsMax: z.coerce.number().int().min(0).optional(),

    /** Achievement points — zakres (wzór: Exiva.pro). */
    achievementPointsMin: z.coerce.number().int().min(0).optional(),
    achievementPointsMax: z.coerce.number().int().min(0).optional(),

    /** Tylko aukcje wystawione w ostatnich 24 h (`first_seen_at`). */
    new24h: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .transform((v) => v === "true" || v === "1")
      .optional(),

    /**
     * Wyróżnienia (wzór: Exiva.pro) — CSV kluczy, np. `?highlights=goldenOutfit`.
     * Mapowanie klucz → item/outfit/mount: `HIGHLIGHT_FILTERS` w web.
     */
    highlights: z
      .string()
      .transform((s) => s.split(",").filter(Boolean))
      .pipe(z.array(z.enum(HIGHLIGHT_KEYS)).max(HIGHLIGHT_KEYS.length))
      .optional(),

    /**
     * Rzadkie nazwy postaci — znaki specjalne (äëïöüÿ…), ≤3 znaki albo same
     * duże litery (definicja jak ExevoPan).
     */
    rareNicknames: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .transform((v) => v === "true" || v === "1")
      .optional(),

    /** BattlEye (wymuszenie na świecie — wcześniej dostępne tylko w UI). */
    battleye: z.enum(["protected", "initially protected", "not protected"]).optional(),

    /** Filtry dziedziczone z `worlds`. */
    pvpType: z
      .enum(["Open PvP", "Optional PvP", "Hardcore PvP", "Retro Open PvP", "Retro Hardcore PvP"])
      .optional(),
    region: z.enum(["EU", "NA", "BR", "OCE"]).optional(),

    /** Sortowanie — domyślnie auctionEnd asc (pilność, arch §5). */
    sortBy: AuctionOrderColumnSchema.default("auctionEnd"),
    sortDir: AuctionOrderDirectionSchema.default("asc"),
  })
  .strict();

/** Pełny schemat filtrów = obiekt + cross-validation refine'y. */
export const auctionFiltersSchema = auctionFiltersObject
  /** levelMin ≤ levelMax. */
  .refine((f) => f.levelMin == null || f.levelMax == null || f.levelMin <= f.levelMax, {
    message: "levelMin nie może być większy niż levelMax",
    path: ["levelMin"],
  })
  /** skillMin ≤ skillMax. */
  .refine((f) => f.skillMin == null || f.skillMax == null || f.skillMin <= f.skillMax, {
    message: "skillMin nie może być większy niż skillMax",
    path: ["skillMin"],
  })
  /** bidMin ≤ bidMax. */
  .refine((f) => f.bidMin == null || f.bidMax == null || f.bidMin <= f.bidMax, {
    message: "bidMin nie może być większy niż bidMax",
    path: ["bidMin"],
  })
  /** Jeśli podano skillType, musi być podany też skillMin lub skillMax. */
  .refine(
    (f) => f.skillType === undefined || f.skillMin !== undefined || f.skillMax !== undefined,
    {
      message: "skillType wymaga podania skillMin lub skillMax",
      path: ["skillType"],
    },
  )
  .refine(
    (f) =>
      f.charmPointsMin == null || f.charmPointsMax == null || f.charmPointsMin <= f.charmPointsMax,
    {
      message: "charmPointsMin nie może być większy niż charmPointsMax",
      path: ["charmPointsMin"],
    },
  )
  .refine(
    (f) => f.tcInvestedMin == null || f.tcInvestedMax == null || f.tcInvestedMin <= f.tcInvestedMax,
    {
      message: "tcInvestedMin nie może być większy niż tcInvestedMax",
      path: ["tcInvestedMin"],
    },
  );

export type AuctionFilters = z.infer<typeof auctionFiltersSchema>;

// ───────────────────────────────────────────────────────────────────────
// Paginacja (arch. §7.3 — offset/limit)
// ───────────────────────────────────────────────────────────────────────

/**
 * Schemat paginacji — wydzielony jako osobny moduł, bo reużywany
 * w innych endpointach (np. /api/stats/history, /api/auctions/...).
 *
 * Reguły:
 *   - page >= 1 (1-indeksowana paginacja, wygodniejsza w UI)
 *   - pageSize 1..100 (max 100 per request — zabezpieczenie przed DoS)
 *   - pageSize domyślnie 25 (zgodne z arch §5 krok 4)
 */
export const paginationSchema = z
  .object({
    page: z.coerce
      .number()
      .int("Page musi być liczbą całkowitą")
      .min(1, "Page musi wynosić co najmniej 1")
      .default(1),
    pageSize: z.coerce
      .number()
      .int("PageSize musi być liczbą całkowitą")
      .min(1, "PageSize musi wynosić co najmniej 1")
      .max(100, "PageSize nie może przekraczać 100 (ochrona DoS)")
      .default(25),
  })
  .strict();

export type Pagination = z.infer<typeof paginationSchema>;

/**
 * Pomocnik do wyliczania totalPages z paginacji.
 * Zwraca co najmniej 1 (nawet dla pustej listy), żeby UI nie miał edge case.
 */
export function totalPagesOf(total: number, pageSize: number): number {
  if (total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

// ───────────────────────────────────────────────────────────────────────
// Query dla "Ending Soon" — mniejszy zakres (arch. §8.1: kończące się <1h)
// ───────────────────────────────────────────────────────────────────────

/**
 * Schemat parametrów `/api/auctions/ending` — godziny do końca aukcji.
 * Arch. §8.1: domyślnie 1h (zakres z schedulera EndingSoonScheduler).
 */
export const endingSoonQuerySchema = z
  .object({
    withinHours: z.coerce
      .number()
      .positive("withinHours musi być dodatnie")
      .max(24, "withinHours nie może przekraczać 24h")
      .default(1),
  })
  .strict();

export type EndingSoonQuery = z.infer<typeof endingSoonQuerySchema>;
