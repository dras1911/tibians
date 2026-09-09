/**
 * Parser detalu pojedynczej aukcji Bazaara Tibii (tibia.com).
 *
 * Architektura (`.omo/plans/tibia-tools-portal-architecture.md`):
 *   - §2.4 — Exevo Pan (referencyjny układ karty: 8 skillów, USP, charms, …)
 *   - §2.5 — Tibia.com (źródło prawdy; USP categories 0-13 jako PNG ikonki)
 *   - §7.2 — schemat `auctions` (60+ kolumn + 5 relacji 1:N)
 *   - §7.1 — denormalizacja gorących filtrów jako kolumny (nie join)
 *
 * Źródło: `?subtopic=currentcharactertrades&page=details&auctionid={id}`
 *
 * Pipeline (per arch §2.4 + §2.5):
 *   1. cheerio.load(html)                          — DOM
 *   2. extractIdentity($)                          — name/level/vocation/sex/world
 *   3. extractBid($) + bidType                     — rozróżnienie current/minimum
 *   4. extractDates($)                             — PL/EU dd.mm.yyyy, hh:mm:ss
 *   5. extractSkills($) → 8 × {skill, value}      — `<div class="SkillsContainer">`
 *   6. extractItems($) → AuctionItem[]             — `<img .../objects/{id}.gif>`
 *   7. extractOutfits($) → AuctionOutfit[]         — `<img .../outfits/{id}_{addon}.gif>`
 *   8. extractMounts($) → AuctionMount[]           — `<img .../mounts/{id}.gif>`
 *   9. extractUsps($) → AuctionUsp[] (0..13)       — `<img .../usp-category-N.png>`
 *  10. extractSkillLoyalty($) → AuctionSkillLoyalty — `style="width: N%"`
 *  11. extractFlags($)                              — soul_war/primal/world_transfer/…
 *  12. extractProgression($)                        — charms/imbues/quests/…
 *  13. extractResources($)                          — gold/gems/store/hirelings
 *  14. buildAuction($)                              — AuctionSchema + transform
 *  15. AuctionSchema.safeParse(...)                 — Zod walidacja (R1)
 *
 * Error handling:
 *   - Brak selektora / parsowalnej wartości → `null` dla tego pola + console.warn
 *   - Cały parser **nie rzuca wyjątków** — zwraca pusty rezultat z ostrzeżeniem
 *     gdyby Zod odrzucił całość (R1 future-proof).
 *
 * Locale awareness:
 *   - PL bid: `"25 501"` (U+00A0 non-breaking space) → 25501
 *   - EN bid: `"25,501"` (comma) → 25501
 *   - PL data: `"08.09.2026, 22:15:33"` → ISO datetime (Europe/Warsaw)
 *
 * raw_json:
 *   - Pełen HTML przekazany do `AuctionSchema.rawJson` (arch §7.1 pkt 2)
 *   - Pozwala backfill przy zmianie HTML Tibii (R1)
 */

import { load, type CheerioAPI } from "cheerio";

import {
  AuctionSchema,
  AUCTION_SKILL_KEYS,
  VOCATION_BASE_TO_PROMOTED,
  type Auction,
  type AuctionItem,
  type AuctionMount,
  type AuctionOutfit,
  type AuctionSkillLoyalty,
  type AuctionUsp,
} from "@tibians/shared/auction";

// ──────────────────────────────────────────────────────────────────────────
// Publiczny kontrakt
// ──────────────────────────────────────────────────────────────────────────

/** Pełny wynik parsowania detalu aukcji. */
export interface AuctionDetailResult {
  /**
   * Główna encja (60+ kolumn z arch §7.2 auctions).
   * Jeśli Zod walidacja odrzuci → `null` + `parseError`.
   */
  auction: Auction | null;
  /** Relacja 1:N `auction_items` — itemy z obrazka + opcjonalny tier (forging). */
  items: AuctionItem[];
  /** Relacja 1:N `auction_outfits` — outfit + maska addonów (0-3). */
  outfits: AuctionOutfit[];
  /** Relacja 1:N `auction_mounts`. */
  mounts: AuctionMount[];
  /** Relacja 1:N `auction_usps` (kategorie 0-13 + tekst + sortOrder). */
  usps: AuctionUsp[];
  /** Relacja 1:N `auction_skill_loyalty` — base + loyaltyPct per skill. */
  skillLoyalties: AuctionSkillLoyalty[];
  /** Błędy krytyczne (Zod parse failed). Jeśli ustawione, `auction === null`. */
  parseError: string | null;
  /** Ostrzeżenia per pole (brak selektora, pusty regex itp.). */
  warnings: string[];
}

// ──────────────────────────────────────────────────────────────────────────
// World lookup (arch §7.2: world_id FK do worlds.id)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Deterministyczny mapping nazw światów Tibii → smallint id.
 *
 * Dane są statyczne — Tibia.com od lat utrzymuje te same ID dla rdzenia
 * światów (Antica=1, Astera=11, …). Źródło: scraper referencji (task 32)
 * wzbogaci tę listę o nowe światy. Dla nieznanych nazw generujemy
 * stabilny hash → smallint (100..32767), żeby spełnić `worldId: positive()`.
 */
const KNOWN_WORLDS: ReadonlyMap<string, number> = new Map<string, number>([
  ["Antica", 1],
  ["Astera", 11],
  ["Belobra", 17],
  ["Bona", 21],
  ["Calmera", 25],
  ["Carnera", 28],
  ["Celesta", 31],
  ["Danera", 36],
  ["Dolera", 39],
  ["Fabra", 43],
  ["Ferobra", 47],
  ["Furera", 51],
  ["Garnera", 55],
  ["Genova", 58],
  ["Gladera", 61],
  ["Harmonia", 65],
  ["Hiberna", 67],
  ["Inferna", 71],
  ["Issobra", 74],
  ["Kaldra", 77],
  ["Kalibra", 78],
  ["Kamelia", 81],
  ["Kandura", 82],
  ["Kenora", 86],
  ["Libera", 91],
  ["Lobera", 94],
  ["Luminera", 97],
  ["Menera", 101],
  ["Mitigora", 105],
  ["Monza", 109],
  ["Nefera", 112],
  ["Nika", 115],
  ["Obscubra", 119],
  ["Ombra", 122],
  ["Pacera", 125],
  ["Peloria", 128],
  ["Premia", 131],
  ["Pythera", 134],
  ["Quebra", 137],
  ["Quintera", 139],
  ["Refugia", 142],
  ["Relembra", 145],
  ["Robetra", 149],
  ["Rookgaard", 150],
  ["Roshamuul", 153],
  ["Secura", 157],
  ["Serdebra", 161],
  ["Solera", 165],
  ["Syrena", 169],
  ["Talera", 173],
  ["Thyria", 177],
  ["Tornera", 181],
  ["Trimera", 184],
  ["Umera", 188],
  ["Unitera", 191],
  ["Venepera", 195],
  ["Vibora", 199],
  ["Wildera", 203],
  ["Xantera", 207],
  ["Xylana", 211],
  ["Yara", 215],
  ["Ymobora", 217],
  ["Zenobra", 221],
  ["Zuna", 225],
  ["Zunera", 226],
]);

/** FNV-1a hash (32-bit, deterministyczny, szybki). */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Unsigned 32-bit
  return hash >>> 0;
}

/** Mały zakres (100..32767) dla unknown worlds — nigdy nie koliduje z KNOWN. */
function hashToSmallint(name: string): number {
  return 100 + (fnv1a(name.toLowerCase()) % (32767 - 100));
}

/** Rozwiąż nazwę świata Tibii → worldId (smallint). Case-insensitive. */
export function resolveWorldId(name: string): number {
  const known = KNOWN_WORLDS.get(name);
  if (known !== undefined) return known;
  const lower = name.toLowerCase();
  for (const [k, v] of KNOWN_WORLDS) {
    if (k.toLowerCase() === lower) return v;
  }
  return hashToSmallint(name);
}

/** Odwrotność VOCATION_BASE_TO_PROMOTED: promowana → bazowa. */
const VOCATION_PROMOTED_TO_BASE: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [base, promoted] of Object.entries(VOCATION_BASE_TO_PROMOTED)) {
    m.set(promoted, base);
  }
  return m;
})();

/** Rozwiąż promowaną nazwę vocation → bazową (lub zwróć wejście jeśli już bazowa). */
function vocationToBase(raw: string): string {
  const direct = VOCATION_PROMOTED_TO_BASE.get(raw);
  if (direct) return direct;
  // Jeśli już jest bazowa — zwróć jak jest.
  if (raw in VOCATION_BASE_TO_PROMOTED) return raw;
  // Fallback: case-insensitive lookup.
  const lower = raw.toLowerCase();
  for (const [promoted, base] of VOCATION_PROMOTED_TO_BASE) {
    if (promoted.toLowerCase() === lower) return base;
  }
  for (const base of Object.keys(VOCATION_BASE_TO_PROMOTED)) {
    if (base.toLowerCase() === lower) return base;
  }
  return raw;
}

/** Rozwiąż nazwę vocation (bazową lub promowaną) → promowaną. */
function vocationToPromoted(raw: string): string {
  // Jeśli to już promowana — zwróć jak jest.
  for (const [promoted] of VOCATION_PROMOTED_TO_BASE) {
    if (promoted === raw) return raw;
  }
  // Jeśli to bazowa — zmapuj.
  const lower = raw.toLowerCase();
  for (const [promoted, base] of VOCATION_PROMOTED_TO_BASE) {
    if (base.toLowerCase() === lower) return promoted;
    if (promoted.toLowerCase() === lower) return promoted;
  }
  // Ostateczny fallback: weź bazową (zostaw validation do Zod).
  return vocationToBase(raw);
}

// ──────────────────────────────────────────────────────────────────────────
// Locale-aware number parsing
// ──────────────────────────────────────────────────────────────────────────

/**
 * Parsuj liczbę całkowitą z locale-aware stringa Tibii.
 *
 * Przykłady (Tibia.com PL/EN):
 *   "25 501"        — PL: separator U+00A0 (non-breaking space)
 *   "25\u00A0501"   — j.w. z explicit U+00A0
 *   "25,501"        — EN: separator przecinek
 *   "25501"         — bez separatora
 *   "1 234 567"     — PL: wiele grup
 *
 * WAŻNE: `\s+` w czyszczeniu NIE obejmuje nowej linii — w innym wypadku
 *   regex typu `\d[\d\s]* gold` łapałby poprzednie cyfry z poprzedniej
 *   linii (np. skill=20, gold=50000 → 2050000). Stąd `[^\S\n]` zamiast `\s`.
 *
 * Zwraca `null` dla pustych lub nie-liczbowych wejść.
 */
export function parseLocaleNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw
    .replace(/\u00A0/g, "") // PL non-breaking space
    .replace(/[^\S\n]+/g, "") // horizontal whitespace tylko (nie nowe linie)
    .replace(/,/g, "")      // EN thousands separator
    .trim();
  if (cleaned === "") return null;
  if (!/^-?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || !Number.isSafeInteger(n)) return null;
  return n;
}

/** Parsuj PL/EU datę Tibii na ISO 8601 UTC. */
const PL_DATE_REGEX = /(\d{2})\.(\d{2})\.(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})/;

/**
 * Parsuj "08.09.2026, 22:15:33" → "2026-09-08T22:15:33.000Z" (assume UTC).
 *
 * Tibia.com serwuje daty w formacie PL/EU z czasem lokalnym serwera
 * (typowo CET/CEST). Dla spójności zapisujemy jako UTC (bez konwersji
 * strefy — to robi warstwa prezentacji w UI). Parser zwraca ISO bez 'Z'
 * (lokalny datetime traktowany jako nominalny UTC).
 */
export function parsePlDate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const m = PL_DATE_REGEX.exec(raw);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  if (!dd || !mm || !yyyy || !hh || !mi || !ss) return null;
  // Walidacja podstawowa (zakresy).
  const day = Number(dd);
  const month = Number(mm);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.000Z`;
}

/** Trim + normalizacja whitespace (w tym NBSP). */
function norm(s: string | null | undefined): string {
  if (s == null) return "";
  return s.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

// ──────────────────────────────────────────────────────────────────────────
// USP category mapping (arch §2.5)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Mapowanie nazw USP z tekstu Tibii → kategoria (0-13).
 *
 * `usp-category-N.png` z arch §2.5:
 *   0=skill, 1=gold, 2=achievements, 3=blessings, 4=store items,
 *   5=mounts/outfits/slots, 6=imbuements, 7=charms, 11=world transfer, 13=boss points
 *
 * Rozszerzamy heurystycznie na podstawie tekstu USP (kolorowe linijki):
 *   - "Soul War available"         → soul_war (12)
 *   - "Primal Ordeal available"    → soul_war variant / primal (12)
 *   - "Twist of Fate"              → twist_of_fate (premium, 8)
 *
 * Dla pewności mapujemy PO tekście — jeśli ikona PNG zgadza się z regexem.
 */
const USP_TEXT_PATTERNS: ReadonlyArray<{ pattern: RegExp; category: number }> = [
  // Skills (0) — "113 Sword Fighting", "47 Magic", "(Loyalty bonus not included)"
  { pattern: /\b(Magic|Club|Fist|Sword|Axe|Distance|Shielding|Fishing)\b.*\d/i, category: 0 },
  // Gold (1) — "100 000 gold", "12345 gold"
  { pattern: /\d[\d\s\u00A0,]*\s*gold/i, category: 1 },
  // Achievements (2) — "X achievement points"
  { pattern: /\d+\s*achievement\s*points?/i, category: 2 },
  // Charms (3) — "Charm points: 7611", "Minor Charm Echoes: 12"
  { pattern: /charm\s*points?/i, category: 3 },
  { pattern: /minor\s*charm\s*echoes?/i, category: 3 },
  // Imbuements (4) — "Imbuements: 11/23"
  { pattern: /imbuements?:\s*\d+\/\d+/i, category: 4 },
  // Outfits (5) — "Outfit: ..." lub count store outfits
  { pattern: /\boutfits?\b.*\d+|store\s*outfits?:?\s*\d+/i, category: 5 },
  // Mounts (6) — "Mount: ..." lub count store mounts
  { pattern: /\bmounts?\b.*\d+|store\s*mounts?:?\s*\d+/i, category: 6 },
  // Store items (7) — "Store items: N"
  { pattern: /store\s*items?:?\s*\d+/i, category: 7 },
  // Premium / Twist of Fate (8)
  { pattern: /twist\s*of\s*fate/i, category: 8 },
  { pattern: /prey\s*slot/i, category: 8 },
  { pattern: /charm\s*expansion/i, category: 8 },
  { pattern: /weekly\s*task/i, category: 8 },
  // Blessings (9) — "Blessings: 5/7", "X blessings active"
  { pattern: /blessings?:\s*\d+\/\d+|\d+\s*blessings?\s*active/i, category: 9 },
  // Quests (10) — "Quests: 28/42"
  { pattern: /quests?:\s*\d+\/\d+/i, category: 10 },
  // World transfer (11) — "World Transfer available"
  { pattern: /world\s*transfer/i, category: 11 },
  // Soul War (12) — "Soul War available"
  { pattern: /soul\s*war/i, category: 12 },
  { pattern: /primal\s*ordeal/i, category: 12 },
  { pattern: /hirelings?:?\s*\d+/i, category: 12 },
  // Boss (13) — "Boss points: 2340"
  { pattern: /boss\s*points?:\s*\d+/i, category: 13 },
  { pattern: /animus\s*masteries?:?\s*\d+/i, category: 13 },
];

/** Kategoryzuj tekst USP na 0-13, fallback: szukaj ikony PNG. */
function categorizeUsp(text: string, pngCategoryFromIcon: number | null): number {
  for (const { pattern, category } of USP_TEXT_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return pngCategoryFromIcon ?? 0;
}

/** Rozpoznaj kategorię USP z URL ikony (np. `usp-category-7.png` → 7). */
function categoryFromUspIconSrc(src: string): number | null {
  const m = /usp-category-(\d+)\.png/i.exec(src);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  if (n < 0 || n > 13 || !Number.isInteger(n)) return null;
  return n;
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: identity
// ──────────────────────────────────────────────────────────────────────────

interface Identity {
  name: string | null;
  level: number | null;
  vocation: string | null;       // bazowa: "Knight" | "Monk" | …
  vocationPromoted: string | null;
  sex: "M" | "F" | null;
  worldName: string | null;
  worldId: number | null;
  outfitId: number | null;
}

/**
 * Szukamy `<b>Name:</b> Foo`, `<b>Level:</b> 619`, `<b>Vocation:</b> Elite Knight`,
 * `<b>Sex:</b> male`, `<b>World:</b> Antica` oraz obrazka outfitu.
 *
 * Fallbacki:
 *   - Tekst po `<b>` może być w `<td>` obok, lub w `<span>` wewnątrz tej samej komórki.
 *   - Outfit ID może być też w URL `<img src=".../outfits/962_3.gif">` w nagłówku.
 */
function extractIdentity(
  $: CheerioAPI,
  warnings: string[],
): Identity {
  // Helper: znajdź <b>label</b> i zwróć tekst sąsiada (next sibling text node
  // lub zawartość następnego elementu).
  const findLabelValue = (
    $: CheerioAPI,
    label: string,
  ): string | null => {
    const labels = $(`b`).filter((_, el) => {
      const t = $(el).text().trim().toLowerCase();
      return t === label.toLowerCase() + ":" || t === label.toLowerCase();
    });
    if (labels.length === 0) return null;

    const first = labels.first();
    // Spróbuj sąsiedni tekst.
    const next = first.next();
    if (next.length > 0) {
      const t = norm(next.text());
      if (t.length > 0) return t;
    }
    // Parent text z odjęciem samej etykiety.
    const parent = first.parent();
    if (parent.length > 0) {
      const fullText = norm(parent.text());
      const stripped = fullText.replace(new RegExp(`^${label}\\s*:?\\s*`, "i"), "").trim();
      if (stripped.length > 0 && stripped !== fullText) return stripped;
    }
    return null;
  };

  const nameRaw = findLabelValue($, "Name");
  const levelRaw = findLabelValue($, "Level");
  const vocationRaw = findLabelValue($, "Vocation");
  const sexRaw = findLabelValue($, "Sex");
  const worldRaw = findLabelValue($, "World");

  // Outfit ID: preferuj URL `<img src=".../outfits/{id}_{addon}.gif">` w nagłówku
  // aukcji (pierwszy obrazek). Fallback: regex z URL outfitu.
  let outfitId: number | null = null;
  $("img[src*='/outfits/']").each((_, el) => {
    if (outfitId !== null) return;
    const src = $(el).attr("src") ?? "";
    const m = /\/outfits\/(\d+)(?:_(\d+))?\.gif/i.exec(src);
    if (m && m[1]) {
      outfitId = Number(m[1]);
    }
  });

  const name = nameRaw;
  const level = levelRaw != null ? parseLocaleNumber(levelRaw) : null;
  // Tibia.com może pokazywać vocation promowany LUB bazowy:
  //   - "Exalted Monk" → vocation: "Monk", promoted: "Exalted Monk"
  //   - "Knight"       → vocation: "Knight", promoted: "Elite Knight"
  // vocationToBase / vocationToPromoted są odwrotnymi mapowaniami.
  const vocation = vocationRaw != null ? vocationToBase(vocationRaw) : null;
  const vocationPromoted =
    vocationRaw != null ? vocationToPromoted(vocationRaw) : null;
  const sex = sexRaw != null ? (norm(sexRaw).toLowerCase().startsWith("f") ? "F" : "M") : null;
  const worldName = worldRaw;
  const worldId = worldName != null ? resolveWorldId(worldName) : null;

  // Warnings — brak kluczowych pól.
  if (name == null) warnings.push("identity.name: not found");
  if (level == null) warnings.push("identity.level: not found");
  if (vocation == null) warnings.push("identity.vocation: not found");
  if (worldName == null) warnings.push("identity.world: not found");

  return {
    name,
    level,
    vocation,
    vocationPromoted,
    sex,
    worldName,
    worldId,
    outfitId,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: bid + bid type
// ──────────────────────────────────────────────────────────────────────────

interface BidResult {
  bid: number;
  bidType: "current" | "minimum";
}

/**
 * Rozróżnienie `Current bid` vs `Minimum bid` — kluczowe (arch §2.4).
 *
 * Szukamy `<b>Current bid</b>` lub `<b>Minimum bid</b>` (lub warianty
 * `Current Bid`/`Minimum Bid`). Tekst po etykiecie zawiera liczbę z
 * separatorem.
 */
function extractBid($: CheerioAPI, warnings: string[]): BidResult {
  const candidates: Array<{ label: string; type: "current" | "minimum" }> = [
    { label: "Current bid", type: "current" },
    { label: "Minimum bid", type: "minimum" },
    { label: "Current Bid", type: "current" },
    { label: "Minimum Bid", type: "minimum" },
    { label: "Current Offer", type: "current" },
    { label: "Minimum Offer", type: "minimum" },
  ];

  for (const { label, type } of candidates) {
    const labelEls = $(`b, strong, td`).filter((_, el) => {
      const t = $(el).text().trim();
      return t.toLowerCase() === label.toLowerCase();
    });
    if (labelEls.length === 0) continue;
    const labelEl = labelEls.first();

    // Szukaj liczby w: następnym elemencie, rodzicu (tekst po etykiecie),
    // lub dowolnym tekście w odległości 2 elementów od etykiety.
    const next = labelEl.next();
    if (next.length > 0) {
      const n = parseLocaleNumber(next.text());
      if (n !== null) return { bid: n, bidType: type };
    }
    const parent = labelEl.parent();
    if (parent.length > 0) {
      const text = parent.text();
      const after = text.replace(new RegExp(label, "i"), "").trim();
      const n = parseLocaleNumber(after);
      if (n !== null) return { bid: n, bidType: type };
    }
  }

  // Fallback: szukaj pierwszej liczby w dedykowanej sekcji "Outfits"/"Bid".
  const tableText = $("table").text();
  const m = /(\d[\d\s\u00A0,]*)/.exec(tableText);
  if (m && m[1]) {
    const n = parseLocaleNumber(m[1]);
    if (n !== null && n > 100) {
      // Heurystyka: bid raczej > 100 TC
      warnings.push("bid: fell back to first big number (no Current/Minimum label found)");
      return { bid: n, bidType: "current" };
    }
  }

  warnings.push("bid: not found, defaulting to 0 (minimum)");
  return { bid: 0, bidType: "minimum" };
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: dates
// ──────────────────────────────────────────────────────────────────────────

interface DatesResult {
  auctionStart: string | null;
  auctionEnd: string | null;
}

/** Szukamy `<b>Auction Start:</b>` i `<b>Auction End:</b>` + wariantów. */
function extractDates($: CheerioAPI, warnings: string[]): DatesResult {
  const findDate = (label: string): string | null => {
    const labels = $(`b`).filter((_, el) => {
      const t = $(el).text().trim().toLowerCase();
      return t.startsWith(label.toLowerCase());
    });
    if (labels.length === 0) return null;
    const labelEl = labels.first();
    const parent = labelEl.parent();
    const parentText = parent.length > 0 ? parent.text() : "";
    return parsePlDate(parentText);
  };

  const start = findDate("Auction Start");
  const end = findDate("Auction End");
  if (start == null) warnings.push("dates.auctionStart: not parsed");
  if (end == null) warnings.push("dates.auctionEnd: not parsed");
  return { auctionStart: start, auctionEnd: end };
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: skills (8 × Skill: value)
// ──────────────────────────────────────────────────────────────────────────

/**
 * W detalu Tibii skille są w `<div class="SkillsContainer">` z parami:
 *   `<span class="Skill">Sword Fighting</span>: <span>113</span>`
 *
 * Zwracamy mapę `skillKey → value` (8 kluczy z AUCTION_SKILL_KEYS).
 */
function extractSkills(
  $: CheerioAPI,
  warnings: string[],
): Map<string, number> {
  const result = new Map<string, number>();

  const skillNameToKey: Record<string, (typeof AUCTION_SKILL_KEYS)[number]> = {
    "magic level": "magic",
    magic: "magic",
    "club fighting": "club",
    club: "club",
    "fist fighting": "fist",
    fist: "fist",
    "sword fighting": "sword",
    sword: "sword",
    "axe fighting": "axe",
    axe: "axe",
    "distance fighting": "distance",
    distance: "distance",
    shielding: "shielding",
    fishing: "fishing",
  };

  // Próba 1: `<div class="SkillsContainer">`.
  const container = $(".SkillsContainer");
  const scope = container.length > 0 ? container : $("body");

  scope.find(".Skill, span.Skill").each((_, el) => {
    const labelEl = $(el);
    const labelText = norm(labelEl.text()).toLowerCase();
    const key = skillNameToKey[labelText];
    if (!key) return;
    // Szukaj wartości: następny span z liczbą, lub parent text.
    const next = labelEl.next();
    if (next.length > 0) {
      const n = parseLocaleNumber(next.text());
      if (n !== null) {
        result.set(key, n);
        return;
      }
    }
    // Fallback: regex w parent text.
    const parent = labelEl.parent();
    if (parent.length > 0) {
      const text = parent.text();
      const after = text.replace(new RegExp(labelText, "i"), "").trim();
      const n = parseLocaleNumber(after);
      if (n !== null) result.set(key, n);
    }
  });

  // Próba 2: ogólne iterowanie wszystkich `<span class="Skill">` (poza container).
  if (result.size === 0) {
    $(".Skill").each((_, el) => {
      const labelEl = $(el);
      const labelText = norm(labelEl.text()).toLowerCase();
      const key = skillNameToKey[labelText];
      if (!key || result.has(key)) return;
      const parent = labelEl.parent();
      if (parent.length > 0) {
        const text = parent.text();
        const m = /(\d[\d\s\u00A0,]*)/.exec(text.replace(labelEl.text(), ""));
        if (m && m[1]) {
          const n = parseLocaleNumber(m[1]);
          if (n !== null) result.set(key, n);
        }
      }
    });
  }

  if (result.size === 0) warnings.push("skills: none extracted");

  return result;
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: skill loyalty (base + loyaltyPct)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Loyalty pasek: `<div class="Loyalty" style="width: 25%"></div>`.
 * Tekst obok mówi "Sword Fighting" / "25%".
 *
 * loyaltyPct: 0..50 (wielokrotność 5).
 */
function extractSkillLoyalty(
  $: CheerioAPI,
  skills: Map<string, number>,
  auctionId: bigint,
  warnings: string[],
): AuctionSkillLoyalty[] {
  const out: AuctionSkillLoyalty[] = [];
  const loyaltyNameToKey: Record<string, (typeof AUCTION_SKILL_KEYS)[number]> = {
    "magic level": "magic",
    magic: "magic",
    "club fighting": "club",
    club: "club",
    "fist fighting": "fist",
    fist: "fist",
    "sword fighting": "sword",
    sword: "sword",
    "axe fighting": "axe",
    axe: "axe",
    "distance fighting": "distance",
    distance: "distance",
    shielding: "shielding",
    fishing: "fishing",
  };

  // Struktura (po reparentowaniu w HTML5):
//   `<div class="LoyaltyRow"><span class="SkillLabel">Skill</span><div class="Loyalty" style="width: N%"></div></div>`
// Lub alternatywnie:
//   `<p>Skill</p><div class="Loyalty" style="width: N%"></div>`
// Parser jest odporny — szukamy tekstu z poprzedniego sibling elementu (lub parent).
  $(".Loyalty, [class*='Loyalty']").each((_, el) => {
    const $el = $(el);
    const style = $el.attr("style") ?? "";
    const widthMatch = /width:\s*(\d+)\s*%/i.exec(style);
    if (!widthMatch || !widthMatch[1]) return;
    const pct = Number(widthMatch[1]);
    if (!Number.isInteger(pct) || pct < 0 || pct > 50) return;

    // Próba 1: tekst z bezpośredniego poprzedniego element-siblinga.
    const prev = $el.prev();
    let labelText = "";
    if (prev.length > 0) {
      labelText += prev.text();
    }

    // Próba 2: tekst z parent (na wypadek gdyby Loyalty był zagnieżdżony).
    const $parent = $el.parent();
    if ($parent.length > 0 && labelText === "") {
      labelText += $parent.text();
    }

    // Próba 3: najbliższy poprzedni label — `.SkillLabel` lub `<span>` z nazwą.
    if (labelText === "") {
      const prevLabel = $parent.find(".SkillLabel").first();
      if (prevLabel.length > 0) labelText += prevLabel.text();
    }

    const parentText = norm(labelText).toLowerCase();
    if (parentText === "") return;

    let matchedKey: (typeof AUCTION_SKILL_KEYS)[number] | null = null;
    // Preferuj dłuższe matche (np. "sword fighting" przed "sword").
    const sortedNames = Object.entries(loyaltyNameToKey).sort(
      (a, b) => b[0].length - a[0].length,
    );
    for (const [name, key] of sortedNames) {
      if (parentText.includes(name)) {
        matchedKey = key;
        break;
      }
    }
    if (!matchedKey) return;

    const baseValue = skills.get(matchedKey) ?? 0;
    // Idempotentność: nie duplikuj per skill.
    if (out.some((sl) => sl.skill === matchedKey)) return;
    out.push({
      auctionId,
      skill: matchedKey,
      baseValue,
      loyaltyPct: pct === 0 ? null : pct,
    });
  });

  if (out.length === 0) warnings.push("skillLoyalty: none extracted");

  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: items (objects/{id}.gif + opcjonalnie tier)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Items w inventory aukcji: `<img src=".../objects/{id}.gif">` + opcjonalnie
 * `<span>{count}x</span>`. Tier (0-3) nie jest wprost w HTML — fallback null.
 */
function extractItems(
  $: CheerioAPI,
  auctionId: bigint,
  warnings: string[],
): AuctionItem[] {
  const seen = new Set<string>();
  const out: AuctionItem[] = [];

  $("img[src*='/objects/']").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    const m = /\/objects\/(\d+)\.gif/i.exec(src);
    if (!m || !m[1]) return;
    const itemId = Number(m[1]);
    if (!Number.isInteger(itemId) || itemId <= 0) return;

    // Quantity: szukaj `<span>Nx</span>` lub `Nx` w sąsiedztwie.
    let quantity = 1;
    const $el = $(el);
    const parent = $el.parent();
    if (parent.length > 0) {
      const siblings = parent.text();
      const qm = /(\d+)\s*x\b/i.exec(siblings);
      if (qm && qm[1]) {
        const q = Number(qm[1]);
        if (Number.isInteger(q) && q > 0) quantity = q;
      }
    }

    const key = `${itemId}:${0}`;
    if (seen.has(key)) return;
    seen.add(key);

    out.push({
      auctionId,
      itemId,
      quantity,
      tier: null, // Tibia.com nie ujawnia tieru w detalu
    });
  });

  if (out.length === 0) warnings.push("items: none extracted");
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: outfits
// ──────────────────────────────────────────────────────────────────────────

/**
 * Outfits: `<img src=".../outfits/{id}_{addon}.gif">` → id + addon.
 * Addon = 0 gdy sam `{id}.gif`, wpp `_1`/`_2`/`_3` (maska bitowa).
 */
function extractOutfits(
  $: CheerioAPI,
  auctionId: bigint,
  warnings: string[],
): AuctionOutfit[] {
  const seen = new Set<number>();
  const out: AuctionOutfit[] = [];

  $("img[src*='/outfits/']").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    const m = /\/outfits\/(\d+)(?:_(\d+))?\.gif/i.exec(src);
    if (!m || !m[1]) return;
    const outfitId = Number(m[1]);
    if (!Number.isInteger(outfitId) || outfitId <= 0) return;
    const addonStr = m[2];
    const addons = addonStr ? Number(addonStr) : 0;
    const safeAddons =
      Number.isInteger(addons) && addons >= 0 && addons <= 3 ? addons : 0;
    if (seen.has(outfitId)) return;
    seen.add(outfitId);
    out.push({ auctionId, outfitId, addons: safeAddons });
  });

  if (out.length === 0) warnings.push("outfits: none extracted");
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: mounts
// ──────────────────────────────────────────────────────────────────────────

function extractMounts(
  $: CheerioAPI,
  auctionId: bigint,
  warnings: string[],
): AuctionMount[] {
  const seen = new Set<number>();
  const out: AuctionMount[] = [];

  $("img[src*='/mounts/']").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    const m = /\/mounts\/(\d+)\.gif/i.exec(src);
    if (!m || !m[1]) return;
    const mountId = Number(m[1]);
    if (!Number.isInteger(mountId) || mountId <= 0) return;
    if (seen.has(mountId)) return;
    seen.add(mountId);
    out.push({ auctionId, mountId });
  });

  if (out.length === 0) warnings.push("mounts: none extracted");
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: USP lines (arch §2.5)
// ──────────────────────────────────────────────────────────────────────────

/**
 * USP = `<img class="UspCategory" src="usp-category-N.png"> + tekst`.
 * Szukamy `<img src*="usp-category">` i bierzemy sąsiedni tekst jako treść USP.
 */
function extractUsps(
  $: CheerioAPI,
  auctionId: bigint,
  warnings: string[],
): AuctionUsp[] {
  const out: AuctionUsp[] = [];
  let sortOrder = 0;

  $("img[src*='usp-category']").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src") ?? "";
    const pngCat = categoryFromUspIconSrc(src);
    // Tekst USP: parent / sibling.
    let text = "";
    const parent = $el.parent();
    if (parent.length > 0) {
      text = norm(parent.text());
    }
    if (text === "") {
      const next = $el.next();
      if (next.length > 0) text = norm(next.text());
    }
    if (text === "") {
      // Szukaj w `.UspText` rodzeństwa.
      const uspText = parent.find(".UspText, .Usp");
      if (uspText.length > 0) text = norm(uspText.text());
    }
    if (text === "") return;

    const category = categorizeUsp(text, pngCat);
    out.push({
      auctionId,
      category,
      text,
      sortOrder: sortOrder++,
    });
  });

  if (out.length === 0) warnings.push("usps: none extracted");
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: flags (regex na całym tekście)
// ──────────────────────────────────────────────────────────────────────────

interface FlagsResult {
  hasSoulWar: boolean;
  hasPrimalOrdeal: boolean;
  hasWorldTransfer: boolean;
  hasPreySlot: boolean;
  hasCharmExpansion: boolean;
  hasWeeklyTaskExpansion: boolean;
  hasTwistOfFate: boolean;
}

function extractFlags($: CheerioAPI): FlagsResult {
  const text = $("body").text();
  return {
    hasSoulWar: /Soul\s*War\s*available/i.test(text),
    hasPrimalOrdeal: /Primal\s*Ordeal/i.test(text),
    hasWorldTransfer: /World\s*Transfer/i.test(text),
    hasPreySlot: /Prey\s*Slot/i.test(text),
    hasCharmExpansion: /Charm\s*Expansion/i.test(text),
    hasWeeklyTaskExpansion: /Weekly\s*Task\s*Expansion/i.test(text),
    hasTwistOfFate: /Twist\s*of\s*Fate/i.test(text),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: progression (charms, imbues, quests, achievements, boss, animus)
// ──────────────────────────────────────────────────────────────────────────

interface ProgressionResult {
  charmPoints: number;
  charmPointsUnused: number;
  minorCharmEchoes: number;
  bossPoints: number;
  imbuementsUnlocked: number;
  imbuementsTotal: number;
  questsCompleted: number;
  questsTotal: number;
  achievementPoints: number;
  animusMasteries: number;
  blessingsActive: number;
}

function extractProgression(
  $: CheerioAPI,
  warnings: string[],
): ProgressionResult {
  const text = $("body").text();

  const extractFrac = (
    re: RegExp,
  ): { done: number; total: number } | null => {
    const m = re.exec(text);
    if (!m) return null;
    const done = parseLocaleNumber(m[1] ?? "");
    const total = m[2] != null ? parseLocaleNumber(m[2]) : null;
    if (done == null || total == null) return null;
    return { done, total };
  };

  const extractSingle = (re: RegExp): number | null => {
    const m = re.exec(text);
    if (!m || !m[1]) return null;
    return parseLocaleNumber(m[1]);
  };

  const imbuements = extractFrac(/Imbuements?:\s*(\d+)\s*\/\s*(\d+)/i);
  const quests = extractFrac(/Quests?:\s*(\d+)\s*\/\s*(\d+)/i);
  const bless = extractFrac(/Blessings?:\s*(\d+)\s*\/\s*(\d+)/i) ??
    extractFrac(/Blessings?\s*active:\s*(\d+)\s*\/\s*(\d+)/i) ??
    ((): { done: number; total: number } | null => {
      const n = extractSingle(/Blessings?\s*active:\s*(\d+)/i);
      if (n == null) return null;
      return { done: n, total: 7 };
    })();
  // Regex po "Achievement points: N" — N musi być PRZED "achievement", więc
  // anchor po lewej stronie do ":" albo granicy wyrazu.
  const achievements = extractSingle(/Achievement\s*points?:\s*(\d+)/i) ??
    extractSingle(/(\d+)\s*achievement\s*points?/i);
  const boss = extractSingle(/Boss\s*points?:\s*(\d+)/i);
  const animus = extractSingle(/Animus\s*Masteries?:\s*(\d+)/i);
  const charmPts = extractSingle(/Charm\s*points?:\s*(\d+)/i);
  const charmUnused = extractSingle(/(\d+)\s*unused\s*charm/i);
  const minorEchoes = extractSingle(/Minor\s*Charm\s*Echoes?:\s*(\d+)/i);

  if (imbuements == null) warnings.push("progression.imbuements: not parsed");
  if (quests == null) warnings.push("progression.quests: not parsed");
  if (bless == null) warnings.push("progression.blessings: not parsed");

  return {
    charmPoints: charmPts ?? 0,
    charmPointsUnused: charmUnused ?? 0,
    minorCharmEchoes: minorEchoes ?? 0,
    bossPoints: boss ?? 0,
    imbuementsUnlocked: imbuements?.done ?? 0,
    imbuementsTotal: imbuements?.total ?? 23,
    questsCompleted: quests?.done ?? 0,
    questsTotal: quests?.total ?? 42,
    achievementPoints: achievements ?? 0,
    animusMasteries: animus ?? 0,
    blessingsActive: bless?.done ?? 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: resources (gold, gems, store counts, hirelings, tcInvested)
// ──────────────────────────────────────────────────────────────────────────

interface ResourcesResult {
  gemsLesser: number;
  gemsRegular: number;
  gemsGreater: number;
  storeOutfitsCount: number;
  storeMountsCount: number;
  storeItemsCount: number;
  hirelingsCount: number;
  goldTotal: bigint;
  tcInvested: number | null;
}

function extractResources(
  $: CheerioAPI,
  warnings: string[],
): ResourcesResult {
  const text = $("body").text();

  const extractSingle = (re: RegExp): number | null => {
    const m = re.exec(text);
    if (!m || !m[1]) return null;
    return parseLocaleNumber(m[1]);
  };

  // Gems: format "44-0-0" lub "(44, 0, 0)"
  let gemsLesser = 0;
  let gemsRegular = 0;
  let gemsGreater = 0;
  const gemsMatch = /Gems?:\s*(\d+)\s*[- ,]\s*(\d+)\s*[- ,]\s*(\d+)/i.exec(text);
  if (gemsMatch && gemsMatch[1] && gemsMatch[2] && gemsMatch[3]) {
    gemsLesser = Number(gemsMatch[1]);
    gemsRegular = Number(gemsMatch[2]);
    gemsGreater = Number(gemsMatch[3]);
  }

  const storeOutfits = extractSingle(/(\d+)\s*store\s*outfits?/i) ?? 0;
  const storeMounts = extractSingle(/(\d+)\s*store\s*mounts?/i) ?? 0;
  const storeItems = extractSingle(/(\d+)\s*store\s*items?/i) ?? 0;
  const hirelings = extractSingle(/(\d+)\s*hirelings?/i) ?? 0;
  // Gold regex: szukamy "<num> gold" w tej samej linii. Aby uniknąć
  // łapania cyfr z poprzednich linii (skill values), używamy `[^\S\n]*`
  // zamiast `\s*` między cyfrą a słowem "gold".
  const goldRaw = extractSingle(/(\d[\d ,]*)[^\S\n]*gold/i);
  const tcRaw = extractSingle(/(\d+)\s*transferabl/i); // "transferable coins"

  if (gemsMatch == null) warnings.push("resources.gems: not parsed");
  if (goldRaw == null) warnings.push("resources.gold: not parsed");

  const goldTotal =
    goldRaw != null ? BigInt(Math.min(goldRaw, Number.MAX_SAFE_INTEGER)) : 0n;

  return {
    gemsLesser,
    gemsRegular,
    gemsGreater,
    storeOutfitsCount: storeOutfits,
    storeMountsCount: storeMounts,
    storeItemsCount: storeItems,
    hirelingsCount: hirelings,
    goldTotal,
    tcInvested: tcRaw,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Główna funkcja: parseAuctionDetail
// ──────────────────────────────────────────────────────────────────────────

/**
 * Parsuj stronę `/charactertrade/?page=details&auctionid={id}` na pełny `Auction`
 * + relacje 1:N.
 *
 * Kontrakt:
 *   - Zwraca pełny `AuctionDetailResult`
 *   - **Nie rzuca** — w najgorszym wypadku `auction: null` + `parseError`
 *   - Walidacja Zod na `AuctionSchema` (R1 future-proof)
 *
 * @param html         — surowy HTML strony detalu
 * @param auctionId    — ID aukcji (bigint, zwykle z query stringu)
 * @param scrapedAt    — moment scrape'a (opcjonalnie, default: now())
 */
export function parseAuctionDetail(
  html: string,
  auctionId: bigint,
  scrapedAt: Date = new Date(),
): AuctionDetailResult {
  const warnings: string[] = [];
  const $ = load(html);

  // ── 1. Ekstrakcja wszystkich sekcji ────────────────────────────────────
  const identity = extractIdentity($, warnings);
  const bid = extractBid($, warnings);
  const dates = extractDates($, warnings);
  const skills = extractSkills($, warnings);
  const skillLoyalties = extractSkillLoyalty($, skills, auctionId, warnings);
  const items = extractItems($, auctionId, warnings);
  const outfits = extractOutfits($, auctionId, warnings);
  const mounts = extractMounts($, auctionId, warnings);
  const usps = extractUsps($, auctionId, warnings);
  const flags = extractFlags($);
  const progression = extractProgression($, warnings);
  const resources = extractResources($, warnings);

  // ── 2. Złóż obiekt Auction (wymaga poprawnych pól obowiązkowych) ────────
  const scrapedAtIso = scrapedAt.toISOString();

  // Schema wymaga poprawnego vocation ↔ vocationPromoted. Jeśli któregoś brak
  // → ustawiamy bezpieczne domyślne (failure mode: parser zwraca dane, ale
  // Zod może je odrzucić, więc `auction` będzie null).
  const safeVocation = (identity.vocation ?? "Knight") as
    | "Knight"
    | "Paladin"
    | "Druid"
    | "Sorcerer"
    | "Monk";
  const safeVocationPromoted = (identity.vocationPromoted ?? "Elite Knight") as
    | "Elite Knight"
    | "Royal Paladin"
    | "Elder Druid"
    | "Master Sorcerer"
    | "Exalted Monk";
  const safeSex: "M" | "F" = identity.sex ?? "M";
  const safeWorldId = identity.worldId ?? 1;

  // Jeśli brak dat → Zod odrzuci; fallback: synthetic (teraz + 1h / + 24h).
  const now = scrapedAtIso;
  const inOneHour = new Date(scrapedAt.getTime() + 60 * 60_000).toISOString();
  const inOneDay = new Date(scrapedAt.getTime() + 24 * 60 * 60_000).toISOString();

  const auctionCandidate: Record<string, unknown> = {
    id: auctionId,
    name: identity.name ?? `Auction ${auctionId}`,
    level: identity.level ?? 8,
    vocation: safeVocation,
    vocationPromoted: safeVocationPromoted,
    sex: safeSex,
    worldId: safeWorldId,
    outfitId: identity.outfitId,
    bid: bid.bid,
    bidType: bid.bidType,
    auctionStart: dates.auctionStart ?? inOneHour,
    auctionEnd: dates.auctionEnd ?? inOneDay,
    status: "active",
    finalPrice: undefined,
    skillMagic: skills.get("magic") ?? 0,
    skillClub: skills.get("club") ?? 0,
    skillFist: skills.get("fist") ?? 0,
    skillSword: skills.get("sword") ?? 0,
    skillAxe: skills.get("axe") ?? 0,
    skillDistance: skills.get("distance") ?? 0,
    skillShielding: skills.get("shielding") ?? 0,
    skillFishing: skills.get("fishing") ?? 0,
    charmPoints: progression.charmPoints,
    charmPointsUnused: progression.charmPointsUnused,
    minorCharmEchoes: progression.minorCharmEchoes,
    bossPoints: progression.bossPoints,
    imbuementsUnlocked: progression.imbuementsUnlocked,
    imbuementsTotal: progression.imbuementsTotal,
    questsCompleted: progression.questsCompleted,
    questsTotal: progression.questsTotal,
    achievementPoints: progression.achievementPoints,
    animusMasteries: progression.animusMasteries,
    gemsLesser: resources.gemsLesser,
    gemsRegular: resources.gemsRegular,
    gemsGreater: resources.gemsGreater,
    storeOutfitsCount: resources.storeOutfitsCount,
    storeMountsCount: resources.storeMountsCount,
    storeItemsCount: resources.storeItemsCount,
    hirelingsCount: resources.hirelingsCount,
    goldTotal: resources.goldTotal,
    tcInvested: resources.tcInvested,
    hasSoulWar: flags.hasSoulWar,
    hasPrimalOrdeal: flags.hasPrimalOrdeal,
    hasWorldTransfer: flags.hasWorldTransfer,
    hasPreySlot: flags.hasPreySlot,
    hasCharmExpansion: flags.hasCharmExpansion,
    hasWeeklyTaskExpansion: flags.hasWeeklyTaskExpansion,
    hasTwistOfFate: flags.hasTwistOfFate,
    blessingsActive: progression.blessingsActive,
    rawJson: { source: "tibia.com", html },
    firstSeenAt: now,
    lastSeenAt: now,
    scrapedAt: now,
  };

  // ── 3. Walidacja Zod (R1 future-proof + wymuszenie kontraktu) ───────────
  const parseResult = AuctionSchema.safeParse(auctionCandidate);
  if (!parseResult.success) {
    const errMsg = parseResult.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    warnings.push(`Zod validation failed: ${errMsg}`);
    return {
      auction: null,
      items,
      outfits,
      mounts,
      usps,
      skillLoyalties,
      parseError: errMsg,
      warnings,
    };
  }

  return {
    auction: parseResult.data,
    items,
    outfits,
    mounts,
    usps,
    skillLoyalties,
    parseError: null,
    warnings,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Diff helper (T30 integration): nowe/zmienione aukcje po rawJsonHash
// ──────────────────────────────────────────────────────────────────────────

/**
 * Stabilny hash 64-bit (FNV-1a 64) z `rawJson` (arch §8.3: skip gdy identyczne).
 *
 * Używany przez scheduler (task 36) do pominięcia detail fetch gdy
 * `rawJson` się nie zmienił od ostatniego scrape'a.
 */
export function rawJsonHash(html: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = (1n << 64n) - 1n;
  for (let i = 0; i < html.length; i++) {
    hash = (hash ^ BigInt(html.charCodeAt(i))) & mask;
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Helper type guard: Auction z niepustym parseError. */
export function isAuctionDetailSuccessful(
  result: AuctionDetailResult,
): result is AuctionDetailResult & { auction: Auction } {
  return result.auction !== null && result.parseError === null;
}

// Re-export typów dla konsumentów.
export type {
  Auction,
  AuctionItem,
  AuctionOutfit,
  AuctionMount,
  AuctionUsp,
  AuctionSkillLoyalty,
};