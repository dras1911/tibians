/**
 * Parser detalu pojedynczej aukcji Bazaara Tibii (tibia.com) — **v2**.
 *
 * Architektura (`.omo/plans/tibia-tools-portal-architecture.md`):
 *   - §2.4 — Exevo Pan (referencyjny układ karty: 8 skillów, USP, charms, …)
 *   - §2.5 — Tibia.com (źródło prawdy; USP categories 0-13 jako PNG ikonki)
 *   - §7.2 — schemat `auctions` (60+ kolumn + 5 relacji 1:N)
 *
 * ══════════════════════════════════════════════════════════════════════════
 * HISTORIA WERSJI (DLACZEGO v2):
 *
 * v1 (T31) był pisany pod HTML, którego nie dało się pobrać (Cloudflare) —
 * fixture'y v1 okazały się „mirrorami strukturalnymi" (fikcyjnymi!), a parser
 * szukał klas (`SkillsContainer`, `<b>Name:</b>`), których prawdziwy
 * tibia.com NIE ZAWIERA. Efekt: na żywym HTML parser zwracał puste dane.
 *
 * v2 przepisany pod REALNY layout (kopie 1:1 w `__fixtures__/*-live-*.html`):
 *   - `.AuctionHeader` / `.AuctionCharacterName` / `.AuctionOutfitImage`
 *   - `.ShortAuctionData*` — „Auction Start/End", „Minimum|Current|Winning Bid"
 *   - `.AuctionTimer[data-timestamp]` — Unix epoch końca aukcji
 *   - `.CharacterDetailsBlock` — sekcje (General / Item Summary / … / Proficiencies)
 *   - `span.LabelV` — wartości liczbowe (charm points, gold, hirelings, …)
 *   - `.SpecialCharacterFeatures .Entry` + `usp-category-N.png` — linijki USP
 *   - `#ajax-target-type-{0..6}` — items / store items / mounts / outfits / familiars
 *
 * NOWE DANE STRUKTURALNE v2:
 *   - `reference` w wyniku — świat + słownikowe dane (nazwy/obrazki) itemów,
 *     outfitów i mountów, do „harvestu" tabel referencyjnych przy upsercie
 *     aukcji (`ensureReferenceData` w `@tibians/db`). Bez tego FK
 *     `auction_items.item_id → items.id` blokowałby wstawianie relacji.
 *   - Addony outfitów z nazwy pliku obrazka (`outfits/{id}_{addon}.gif`).
 *
 * ROZPOZNANE OGRANICZENIA (świadome, udokumentowane):
 *   - Loyalty % per skill nie jest prezentowany w nowym layoutcie
 *     (tylko adnotacja USP „(Loyalty bonus not included)") → `skillLoyalties`
 *     jest puste do czasu znalezienia źródła.
 *   - Item summary ma paginację (np. „» Results: 399", 6 stron) — v2 czyta
 *     stronę 1 (do ~76 pozycji); kolejne strony do dociągnięcia w iteracji.
 *   - Tier foringu itemów nie występuje w HTML → `tier: 0` (konwencja:
 *     0 = base/nieznany; kolumna `tier` jest NOT NULL przez PK).
 *
 * Error handling (bez zmian):
 *   - Brak selektora / parsowalnej wartości → `null` + `warnings`
 *   - Parser **nie rzuca wyjątków** — Zod fail → `auction: null` + `parseError`
 */

import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

import {
  AuctionSchema,
  VOCATION_BASE_TO_PROMOTED,
  type Auction,
  type AuctionItem,
  type AuctionMount,
  type AuctionOutfit,
  type AuctionSkillLoyalty,
  type AuctionUsp,
} from "@tibians/shared/auction";

import { unixToIso } from "./auction-list.js";

// ──────────────────────────────────────────────────────────────────────────
// Publiczny kontrakt
// ──────────────────────────────────────────────────────────────────────────

/** Słownikowy item (harvest) — do upsertu tabeli `items`. */
export interface ReferenceItem {
  readonly id: number;
  readonly name: string;
  readonly imageUrl: string;
  readonly isStoreItem: boolean;
}

/** Słownikowy outfit (harvest) — do upsertu tabeli `outfits`. */
export interface ReferenceOutfit {
  readonly id: number;
  readonly name: string;
  readonly imageUrl: string;
  readonly isStore: boolean;
}

/** Słownikowy mount (harvest) — do upsertu tabeli `mounts`. */
export interface ReferenceMount {
  readonly id: number;
  readonly name: string;
  readonly imageUrl: string;
  readonly isStore: boolean;
}

/**
 * Dane słownikowe zebrane z detalu aukcji (harvest).
 *
 * Użycie: scheduler przekazuje je do `db.upsertAuction({ reference })`,
 * a warstwa DB przed wstawieniem relacji robi `ensure` wierszy
 * referencyjnych (`ON CONFLICT DO NOTHING`), żeby FK nie blokowały.
 */
export interface AuctionDetailReference {
  /** Świat postaci: `{ id (stabilny hash), name }`. */
  readonly world: { readonly id: number; readonly name: string } | null;
  readonly items: readonly ReferenceItem[];
  readonly outfits: readonly ReferenceOutfit[];
  readonly mounts: readonly ReferenceMount[];
}

/** Pełny wynik parsowania detalu aukcji. */
export interface AuctionDetailResult {
  /** Główna encja (60+ kolumn z arch §7.2 auctions) lub null (parseError). */
  auction: Auction | null;
  /** Relacja 1:N `auction_items` — itemy (strona 1 sekcji Item Summary). */
  items: AuctionItem[];
  /** Relacja 1:N `auction_outfits` — outfit + maska addonów (0-3). */
  outfits: AuctionOutfit[];
  /** Relacja 1:N `auction_mounts`. */
  mounts: AuctionMount[];
  /** Relacja 1:N `auction_usps` (kategorie 0-13 + tekst + sortOrder). */
  usps: AuctionUsp[];
  /** Relacja 1:N `auction_skill_loyalty` — puste w v2 (patrz nagłówek). */
  skillLoyalties: AuctionSkillLoyalty[];
  /** Harvest słowników — świat + items/outfits/mounts z nazwami i obrazkami. */
  reference: AuctionDetailReference;
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
 * Tibia.com NIE publikuje numerycznych ID światów — nadajemy je sami.
 * Rdzeń światów z historyczną numeracją sceniczną (Antica=1 itd.) trzymamy
 * stabilnie; dla pozostałych nazw generujemy stabilny hash → smallint
 * (100..32766). Ten sam algorytm używa warstwa DB przy `ensure` wiersza
 * świata (`worlds.id` = ten wynik), więc FK jest zawsze spójne z parserem.
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
  return hash >>> 0;
}

/** Mały zakres (100..32766) dla unknown worlds — nigdy nie koliduje z KNOWN. */
function hashToSmallint(name: string): number {
  return 100 + (fnv1a(name.toLowerCase()) % (32766 - 100));
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

// ──────────────────────────────────────────────────────────────────────────
// Vocation mapping (promowana ↔ bazowa)
// ──────────────────────────────────────────────────────────────────────────

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
  if (raw in VOCATION_BASE_TO_PROMOTED) return raw;
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
  for (const [promoted] of VOCATION_PROMOTED_TO_BASE) {
    if (promoted === raw) return raw;
  }
  const lower = raw.toLowerCase();
  for (const [promoted, base] of VOCATION_PROMOTED_TO_BASE) {
    if (base.toLowerCase() === lower) return promoted;
    if (promoted.toLowerCase() === lower) return promoted;
  }
  return vocationToBase(raw);
}

// ──────────────────────────────────────────────────────────────────────────
// Locale-aware helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Parsuj liczbę całkowitą z locale-aware stringa Tibii.
 *
 * Przykłady: „25 501" (PL NBSP), „25,501" (EN), „25501", „1,073,009,429".
 * Zwraca `null` dla pustych / nie-liczbowych wejść.
 */
export function parseLocaleNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw
    .replace(/\u00A0/g, "") // PL non-breaking space
    .replace(/[^\S\n]+/g, "") // horizontal whitespace tylko
    .replace(/,/g, "") // EN thousands separator
    .trim();
  if (cleaned === "") return null;
  if (!/^-?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || !Number.isSafeInteger(n)) return null;
  return n;
}

/** Miesiące EN tibia.com: „Sep 17 2026, 19:00 CEST". */
const TIBIA_MONTHS: Readonly<Record<string, number>> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/** Regex daty tibia.com: „Sep 17 2026, 19:00 CEST" / „Nov 13 2019, 19:37:33 CET". */
const TIBIA_DATE_REGEX =
  /([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(CEST|CET)\b/;

/**
 * Parsuj datę tibia.com → ISO-8601 UTC (poprawna konwersja CET/CEST).
 *
 * „Sep 17 2026, 19:00 CEST" → „2026-09-17T17:00:00.000Z"
 * (CEST = UTC+2, CET = UTC+1 — strefa podana jawnie w treści).
 */
export function parseTibiaDateTime(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const m = TIBIA_DATE_REGEX.exec(norm(raw));
  if (!m) return null;
  const [, mmm, dd, yyyy, hh, mi, ss, tz] = m;
  const month = mmm !== undefined ? TIBIA_MONTHS[mmm] : undefined;
  if (month === undefined) return null;
  if (!dd || !yyyy || !hh || !mi) return null;
  const offsetMinutes = tz === "CEST" ? 120 : 60;
  const utcMs =
    Date.UTC(Number(yyyy), month, Number(dd), Number(hh), Number(mi), ss ? Number(ss) : 0) -
    offsetMinutes * 60_000;
  const d = new Date(utcMs);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * (Legacy v1) Parsuj „08.09.2026, 22:15:33" → ISO. Zostawione dla zgodności
 * z konsumentami v1; nowy layout używa `parseTibiaDateTime`.
 */
export function parsePlDate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const m = /(\d{2})\.(\d{2})\.(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  if (!dd || !mm || !yyyy || !hh || !mi || !ss) return null;
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.000Z`;
}

/** Trim + normalizacja whitespace (w tym NBSP). */
function norm(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deduplikacja z zachowaniem kolejności. */
function uniqueBy<T, K>(items: readonly T[], key: (item: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: identity
// ──────────────────────────────────────────────────────────────────────────

interface Identity {
  name: string | null;
  level: number | null;
  vocation: string | null; // bazowa: „Knight" | „Monk" | …
  vocationPromoted: string | null;
  sex: "M" | "F" | null;
  worldName: string | null;
  worldId: number | null;
  outfitId: number | null;
}

/**
 * Nagłówek aukcji:
 *   `<div class="AuctionCharacterName">Lancelot royal archer</div>` oraz
 *   inline tekst `Level: 402 | Vocation: Royal Paladin | Male | World: Antica`.
 * Outfit: `<img class="AuctionOutfitImage" src="…/outfits/972_0.gif">`.
 */
function extractIdentity($: CheerioAPI, warnings: string[]): Identity {
  const name = norm($(".AuctionCharacterName").first().text()) || null;

  const headerText = norm($(".AuctionHeader").first().text());
  const m =
    /Level:\s*(\d+)\s*\|\s*Vocation:\s*([^|]+?)\s*\|\s*(Male|Female)\s*\|\s*World:\s*([A-Za-z'\- ]+?)(?:\s*$|\s*\||\s{2})/.exec(
      headerText,
    );

  const levelRaw = m?.[1] ?? null;
  const vocationRaw = m?.[2] != null ? m[2].trim() : null;
  const sexRaw = m?.[3] ?? null;
  const worldRaw = m?.[4] != null ? m[4].trim() : null;

  const level = levelRaw != null ? parseLocaleNumber(levelRaw) : null;
  const vocation = vocationRaw != null ? vocationToBase(vocationRaw) : null;
  const vocationPromoted = vocationRaw != null ? vocationToPromoted(vocationRaw) : null;
  const sex = sexRaw != null ? (sexRaw === "Female" ? "F" : "M") : null;
  const worldName = worldRaw !== "" ? worldRaw : null;
  const worldId = worldName != null ? resolveWorldId(worldName) : null;

  let outfitId: number | null = null;
  const outfitSrc = $(".AuctionOutfitImage").first().attr("src") ?? "";
  const outfitMatch = /\/outfits\/(\d+)(?:_(\d+))?\.gif/i.exec(outfitSrc);
  if (outfitMatch?.[1]) outfitId = Number(outfitMatch[1]);
  if (outfitId == null) {
    $("img[src*='/outfits/']").each((_, el) => {
      if (outfitId !== null) return;
      const src = $(el).attr("src") ?? "";
      const mm = /\/outfits\/(\d+)(?:_(\d+))?\.gif/i.exec(src);
      if (mm?.[1]) outfitId = Number(mm[1]);
    });
  }

  if (name == null) warnings.push("identity.name: not found");
  if (level == null) warnings.push("identity.level: not found");
  if (vocation == null) warnings.push("identity.vocation: not found");
  if (worldName == null) warnings.push("identity.world: not found");

  return { name, level, vocation, vocationPromoted, sex, worldName, worldId, outfitId };
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: bid + bid type + status
// ──────────────────────────────────────────────────────────────────────────

interface BidResult {
  bid: number;
  bidType: "current" | "minimum";
  status: "active" | "finished";
}

/**
 * `.ShortAuctionDataBidRow`: label „Minimum Bid:" | „Current Bid:" |
 * „Winning Bid:" + wartość w `.ShortAuctionDataValue`.
 *
 * „Winning Bid" + blok `.AuctionInfo` = „currently processed" oznaczają
 * aukcję zakończoną (status `finished`).
 */
function extractBid($: CheerioAPI, warnings: string[]): BidResult {
  const row = $(".ShortAuctionDataBidRow").first();
  const label = norm(row.find(".ShortAuctionDataLabel").first().text()).toLowerCase();
  const valueText = norm(row.find(".ShortAuctionDataValue").first().text());
  const bid = parseLocaleNumber(valueText) ?? 0;
  if (bid === 0) warnings.push("bid: not found or zero");

  const bidType: "current" | "minimum" = label.startsWith("minimum") ? "minimum" : "current";

  const bodyText = norm($("body").text());
  const finished = label.startsWith("winning") || /currently\s+processed/i.test(bodyText);

  return { bid, bidType, status: finished ? "finished" : "active" };
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: dates
// ──────────────────────────────────────────────────────────────────────────

interface DatesResult {
  auctionStart: string | null;
  auctionEnd: string | null;
}

/**
 * Daty aukcji:
 *   1. `.AuctionTimer[data-timestamp]` — Unix epoch końca (authoritative,
 *      spójny z parserem listy, który też używa data-timestamp),
 *   2. fallback: teksty „Auction Start:" / „Auction End:"
 *      („Sep 17 2026, 19:00 CEST" → konwersja CET/CEST → UTC).
 */
function extractDates($: CheerioAPI, warnings: string[]): DatesResult {
  const readDateValue = (label: string): string | null => {
    let out: string | null = null;
    $(".ShortAuctionDataLabel").each((_, el) => {
      if (out !== null) return;
      if (norm($(el).text()).toLowerCase() !== label.toLowerCase()) return;
      const value = norm($(el).next(".ShortAuctionDataValue").text());
      if (value !== "") out = value;
    });
    return out;
  };

  const startText = readDateValue("Auction Start:");
  const endText = readDateValue("Auction End:");

  const auctionStart = parseTibiaDateTime(startText);
  let auctionEnd: string | null = null;

  const timerRaw = $(".AuctionTimer").first().attr("data-timestamp");
  if (timerRaw != null) {
    try {
      auctionEnd = unixToIso(timerRaw);
    } catch {
      auctionEnd = null;
    }
  }
  auctionEnd ??= parseTibiaDateTime(endText);

  if (auctionStart == null) warnings.push("dates.auctionStart: not parsed");
  if (auctionEnd == null) warnings.push("dates.auctionEnd: not parsed");
  return { auctionStart, auctionEnd };
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: skills (8 × td.LabelColumn / td.LevelColumn)
// ──────────────────────────────────────────────────────────────────────────

const SKILL_NAME_TO_KEY: Readonly<Record<string, string>> = {
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

/**
 * Tabela skilli w bloku „General": każdy wiersz to
 * `<td class="LabelColumn"><b>Axe Fighting</b></td><td class="LevelColumn">25</td>`.
 */
function extractSkills($: CheerioAPI, warnings: string[]): Map<string, number> {
  const result = new Map<string, number>();

  $("td.LevelColumn").each((_, el) => {
    const $el = $(el);
    const $label = $el.prevAll("td.LabelColumn").first();
    const labelText = norm($label.find("b").text() || $label.text()).toLowerCase();
    const key = SKILL_NAME_TO_KEY[labelText];
    if (!key || result.has(key)) return;
    const value = parseLocaleNumber(norm($el.text()));
    if (value !== null) result.set(key, value);
  });

  if (result.size === 0) warnings.push("skills: none extracted");
  return result;
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: LabelV (General / progression / resources)
// ──────────────────────────────────────────────────────────────────────────

/** Zbierz wszystkie `<span class="LabelV">Label:</span><div>value</div>` w mapę. */
function collectLabels($: CheerioAPI): Map<string, string> {
  const out = new Map<string, string>();
  $("span.LabelV").each((_, el) => {
    const $el = $(el);
    const key = norm($el.text()).replace(/:$/, "");
    if (key === "" || out.has(key)) return;
    // Wartość: pierwszy div PO labelu w tej samej komórce.
    const value = norm($el.parent().find("div").first().text());
    out.set(key, value);
  });
  return out;
}

/** Odczytaj liczbę z mapy labeli (locale-aware). */
function labelNumber(labels: Map<string, string>, key: string): number | null {
  const raw = labels.get(key);
  if (raw == null) return null;
  return parseLocaleNumber(raw);
}

/** Odczytaj yes/no z mapy labeli (wartość tekstowa lub png `icon_yes/no`). */
function labelYesNo($: CheerioAPI, labels: Map<string, string>, key: string): boolean | null {
  const raw = (labels.get(key) ?? "").toLowerCase();
  if (raw === "yes") return true;
  if (raw === "no") return false;
  // Fallback: ikona przy labelu.
  let found: boolean | null = null;
  $("span.LabelV").each((_, el) => {
    if (found !== null) return;
    const $el = $(el);
    if (norm($el.text()).replace(/:$/, "") !== key) return;
    const src = $el.parent().find("img").first().attr("src") ?? "";
    if (/icon_yes\.png/i.test(src)) found = true;
    else if (/icon_no\.png/i.test(src)) found = false;
  });
  return found;
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: sekcje CharacterDetailsBlock (liczniki + tabelki)
// ──────────────────────────────────────────────────────────────────────────

/** Znajdź CharacterDetailsBlock po captionie (np. „Imbuements"). */
function findBlockByCaption($: CheerioAPI, caption: string): Cheerio<AnyNode> | null {
  let found: Cheerio<AnyNode> | null = null;
  $(".CharacterDetailsBlock").each((_, el) => {
    if (found !== null) return;
    const $el = $(el);
    const c = norm($el.find(".CaptionInnerContainer .Text").first().text());
    if (c === caption) found = $el;
  });
  return found;
}

/** Policz wiersze danych w tabeli bloku (bez wiersza-nagłówka). */
function countBlockRows($: CheerioAPI, $block: Cheerio<AnyNode>): number {
  const rows = $block.find("table.TableContent").first().find("tr");
  let count = 0;
  rows.each((i, el) => {
    if (i === 0) return; // header (np. „Imbuement Name")
    const text = norm($(el).text());
    if (text !== "") count += 1;
  });
  return count;
}

/** Odczytaj „» Results: N" z nagłówka paginacji bloku. */
function readResultsCount($block: Cheerio<AnyNode>): number | null {
  const text = norm($block.find(".BlockPageNavigationRow").first().text());
  const m = /Results:\s*([\d.,\u00A0]+)/i.exec(text);
  if (!m?.[1]) return null;
  return parseLocaleNumber(m[1]);
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: progression
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

const DEFAULT_IMBUEMENTS_TOTAL = 23;
const DEFAULT_QUESTS_TOTAL = 42;

function extractProgression(
  $: CheerioAPI,
  labels: Map<string, string>,
  warnings: string[],
): ProgressionResult {
  // Charm points: dostępne + wydane = total; „unused" = dostępne.
  const charmAvail = labelNumber(labels, "Available Charm Points") ?? 0;
  const charmSpent = labelNumber(labels, "Spent Charm Points") ?? 0;
  const minorAvail = labelNumber(labels, "Available Minor Charm Echoes") ?? 0;
  const minorSpent = labelNumber(labels, "Spent Minor Charm Echoes") ?? 0;

  const bossPoints = labelNumber(labels, "Boss Points") ?? 0;
  const achievementPoints = labelNumber(labels, "Achievement Points") ?? 0;
  const animusMasteries = labelNumber(labels, "Animus Masteries unlocked") ?? 0;

  // Blessings: „5/7" → 5.
  let blessingsActive = 0;
  const blessRaw = labels.get("Blessings") ?? "";
  const blessMatch = /(\d+)\s*\/\s*7/.exec(blessRaw);
  if (blessMatch?.[1]) blessingsActive = Number(blessMatch[1]);
  if (!blessMatch) warnings.push("progression.blessings: not parsed");

  // Liczniki z sekcji.
  const imbBlock = findBlockByCaption($, "Imbuements");
  const imbuementsUnlocked = imbBlock ? countBlockRows($, imbBlock) : 0;
  const questBlock = findBlockByCaption($, "Completed Quest Lines");
  const questsCompleted = questBlock ? countBlockRows($, questBlock) : 0;
  if (!imbBlock) warnings.push("progression.imbuements: not parsed");
  if (!questBlock) warnings.push("progression.quests: not parsed");

  return {
    charmPoints: charmAvail + charmSpent,
    charmPointsUnused: charmAvail,
    minorCharmEchoes: minorAvail + minorSpent,
    bossPoints,
    imbuementsUnlocked,
    imbuementsTotal: Math.max(DEFAULT_IMBUEMENTS_TOTAL, imbuementsUnlocked),
    questsCompleted,
    questsTotal: Math.max(DEFAULT_QUESTS_TOTAL, questsCompleted),
    achievementPoints,
    animusMasteries,
    blessingsActive,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: resources (gold/gems/store/hirelings)
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

/**
 * Gemy z bloku „Revealed Gems": każdy wiersz ma `<div class="Gem" title="X Gem">`:
 *   - „Lesser …"   → gemsLesser
 *   - „Greater …" / „Supreme …" → gemsGreater
 *   - pozostałe (np. „Marksman Gem") → gemsRegular
 */
function extractGems($: CheerioAPI): { lesser: number; regular: number; greater: number } {
  let lesser = 0;
  let regular = 0;
  let greater = 0;
  const block = findBlockByCaption($, "Revealed Gems");
  if (block) {
    block.find("div.Gem").each((_, el) => {
      const title = norm($(el).attr("title") ?? "");
      if (title === "") return;
      if (/^lesser\b/i.test(title)) lesser += 1;
      else if (/^(greater|supreme)\b/i.test(title)) greater += 1;
      else regular += 1;
    });
  }
  return { lesser, regular, greater };
}

function extractResources(
  $: CheerioAPI,
  labels: Map<string, string>,
  warnings: string[],
): ResourcesResult {
  const goldTotalRaw = labelNumber(labels, "Gold");
  if (goldTotalRaw == null) warnings.push("resources.gold: not parsed");
  const goldTotal = BigInt(Math.min(Math.max(goldTotalRaw ?? 0, 0), Number.MAX_SAFE_INTEGER));

  const hirelingsCount = labelNumber(labels, "Hirelings") ?? 0;

  const storeItemsBlock = findBlockByCaption($, "Store Item Summary");
  const storeMountsBlock = findBlockByCaption($, "Store Mounts");
  const storeOutfitsBlock = findBlockByCaption($, "Store Outfits");
  const storeItemsCount = (storeItemsBlock && readResultsCount(storeItemsBlock)) ?? 0;
  const storeMountsCount = (storeMountsBlock && readResultsCount(storeMountsBlock)) ?? 0;
  const storeOutfitsCount = (storeOutfitsBlock && readResultsCount(storeOutfitsBlock)) ?? 0;

  const gems = extractGems($);

  return {
    gemsLesser: gems.lesser,
    gemsRegular: gems.regular,
    gemsGreater: gems.greater,
    storeOutfitsCount,
    storeMountsCount,
    storeItemsCount,
    hirelingsCount,
    goldTotal,
    tcInvested: null, // nowy layout nie publikuje tej wartości
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: flags
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

/**
 * Flagi z sekcji detalu:
 *   - hasSoulWar / hasPrimalOrdeal — obecność linii questa („Soul War",
 *     „Primal Ordeal") w „Completed Quest Lines",
 *   - hasWorldTransfer — obecność wiersza „Regular World Transfer:" (pole
 *     zawsze widoczne dla aukcji kwalifikujących się do transferu),
 *   - hasPreySlot — „Permanent Prey Slots:" > 0,
 *   - hasCharmExpansion — „Charm Expansion:" = yes,
 *   - hasWeeklyTaskExpansion — „Permanent Weekly Task Expansion:" = yes,
 *   - hasTwistOfFate — wiersz „Twist of Fate" w tabeli Blessings z ilością > 0.
 */
function extractFlags($: CheerioAPI, labels: Map<string, string>): FlagsResult {
  const questBlock = findBlockByCaption($, "Completed Quest Lines");
  let hasSoulWar = false;
  let hasPrimalOrdeal = false;
  if (questBlock) {
    questBlock.find("table.TableContent tr td").each((_, el) => {
      const t = norm($(el).text());
      if (/^soul war$/i.test(t)) hasSoulWar = true;
      if (/^primal ordeal$/i.test(t)) hasPrimalOrdeal = true;
    });
  }

  const hasWorldTransfer = labels.has("Regular World Transfer");
  const preySlots = labelNumber(labels, "Permanent Prey Slots") ?? 0;

  let hasTwistOfFate = false;
  const blessBlock = findBlockByCaption($, "Blessings");
  if (blessBlock) {
    blessBlock.find("table.TableContent tr").each((_, el) => {
      const $tr = $(el);
      const cells = $tr.find("td");
      if (cells.length < 2) return;
      const name = norm(cells.eq(1).text());
      if (name.toLowerCase() !== "twist of fate") return;
      const amount = parseLocaleNumber(norm(cells.eq(0).text()).replace(/\s*x$/i, ""));
      if ((amount ?? 0) > 0) hasTwistOfFate = true;
    });
  }

  return {
    hasSoulWar,
    hasPrimalOrdeal,
    hasWorldTransfer,
    hasPreySlot: preySlots > 0,
    hasCharmExpansion: labelYesNo($, labels, "Charm Expansion") === true,
    hasWeeklyTaskExpansion: labelYesNo($, labels, "Permanent Weekly Task Expansion") === true,
    hasTwistOfFate,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: USP lines (.SpecialCharacterFeatures .Entry + usp-category-N.png)
// ──────────────────────────────────────────────────────────────────────────

/** Rozpoznaj kategorię USP z URL ikony (np. `usp-category-7.png` → 7). */
function categoryFromUspIconSrc(src: string): number | null {
  const m = /usp-category-(\d+)\.png/i.exec(src);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (n < 0 || n > 13 || !Number.isInteger(n)) return null;
  return n;
}

function extractUsps($: CheerioAPI, auctionId: bigint, warnings: string[]): AuctionUsp[] {
  const out: AuctionUsp[] = [];
  $(".SpecialCharacterFeatures .Entry").each((i, el) => {
    const $el = $(el);
    const src = $el.find("img").first().attr("src") ?? "";
    const category = categoryFromUspIconSrc(src) ?? 0;
    const text = norm($el.text());
    if (text === "") return;
    out.push({ auctionId, category, text, sortOrder: i });
  });
  if (out.length === 0) warnings.push("usps: none extracted");
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Extractor: items / outfits / mounts / familiars (#ajax-target-type-N)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Container `#ajax-target-type-{n}` z listą `.CVIcon` (items mają dodatkowo
 * klasę `CVIconObject`; mounts/outfits/familiars tylko `CVIcon`).
 * Wpis: `<div class="CVIcon …" title="5x big table"><img src="…/objects/2314.gif">
 *        <div class="ObjectAmount">5</div></div>`.
 */
function readCvIcons(
  $: CheerioAPI,
  containerType: number,
): Array<{ src: string; title: string; amount: number | null }> {
  const $c = $(`#ajax-target-type-${containerType}`).first();
  if ($c.length === 0) return [];
  const out: Array<{ src: string; title: string; amount: number | null }> = [];
  $c.find(".CVIcon").each((_, el) => {
    const $el = $(el);
    const src = $el.find("img").first().attr("src") ?? "";
    if (src === "") return;
    const title = norm($el.attr("title") ?? "");
    const amountRaw = norm($el.find(".ObjectAmount").first().text());
    const amount = parseLocaleNumber(amountRaw);
    out.push({ src, title, amount });
  });
  return out;
}

/** Wyciągnij ilość z prefiksu tytułu („5x big table" → 5, „2,921x potion" → 2921). */
function quantityFromTitle(title: string): number | null {
  const m = /^([\d,]+)\s*x\s+/i.exec(title);
  if (!m?.[1]) return null;
  const n = parseLocaleNumber(m[1]);
  return n !== null && n > 0 ? n : null;
}

/**
 * Nazwa itemu z tytułu CVIcon:
 *   „5x big table" → „big table"
 *   „2,921x ultimate mana potion" → „ultimate mana potion"
 *   „2x bitter-smack leaf A full grown bitter-smack leaf" → „bitter-smack leaf"
 *   (opis zaczyna się od spacji + wielkiej litery; nazwy itemów są lowercase)
 */
function itemNameFromTitle(title: string): string {
  let t = norm(title).replace(/^[\d,]+\s*x\s+/i, "");
  const m = / [A-Z]/.exec(t);
  if (m && m.index > 1) t = t.slice(0, m.index);
  return t.trim();
}

/** Nazwa outfitu z tytułu: „Citizen (base & addon 1)" → „Citizen". */
function outfitNameFromTitle(title: string): string {
  const t = norm(title);
  const idx = t.indexOf(" (");
  return (idx > 0 ? t.slice(0, idx) : t).trim();
}

interface RelationsResult {
  items: AuctionItem[];
  outfits: AuctionOutfit[];
  mounts: AuctionMount[];
  refItems: ReferenceItem[];
  refOutfits: ReferenceOutfit[];
  refMounts: ReferenceMount[];
  familiars: Array<{ id: number; name: string; imageUrl: string }>;
}

/**
 * Relacje + harvest słowników z kontenerów:
 *   - type-0 — Item Summary (items), type-1 — Store Item Summary (store items),
 *   - type-2 — Mounts, type-3 — Store Mounts,
 *   - type-4 — Outfits, type-5 — Store Outfits,
 *   - type-6 — Familiars (tylko do rawJson — brak tabeli w schemacie).
 */
function extractRelations($: CheerioAPI, auctionId: bigint, warnings: string[]): RelationsResult {
  const items: AuctionItem[] = [];
  const refItems: ReferenceItem[] = [];
  const outfits: AuctionOutfit[] = [];
  const refOutfits: ReferenceOutfit[] = [];
  const mounts: AuctionMount[] = [];
  const refMounts: ReferenceMount[] = [];
  const familiars: Array<{ id: number; name: string; imageUrl: string }> = [];

  // Dedupe GLOBALNY (nie per-kontener!): ten sam item/outfit/mount może
  // wystąpić i w sekcji regularnej, i w „Store …" — klucz (auction_id,
  // item_id, tier) musi być unikalny w auction_items, więc scalamy wiersze
  // (quantity sumujemy; isStore podnosimy do true, jeśli występuje w store).
  const itemById = new Map<number, AuctionItem>();
  const refItemById = new Map<number, ReferenceItem>();

  const addItems = (containerType: number, isStoreItem: boolean): void => {
    for (const { src, title, amount } of readCvIcons($, containerType)) {
      const m = /\/objects\/(\d+)\.gif/i.exec(src);
      if (!m?.[1]) continue;
      const itemId = Number(m[1]);
      if (!Number.isInteger(itemId) || itemId <= 0) continue;
      const quantity = amount ?? quantityFromTitle(title) ?? 1;
      const existing = itemById.get(itemId);
      if (existing) {
        itemById.set(itemId, { ...existing, quantity: existing.quantity + quantity });
        const ref = refItemById.get(itemId);
        if (ref && isStoreItem && !ref.isStoreItem) {
          refItemById.set(itemId, { ...ref, isStoreItem: true });
        }
        continue;
      }
      itemById.set(itemId, { auctionId, itemId, quantity, tier: 0 });
      refItemById.set(itemId, {
        id: itemId,
        name: itemNameFromTitle(title) || `item ${itemId}`,
        imageUrl: src,
        isStoreItem,
      });
    }
  };

  addItems(0, false);
  addItems(1, true);
  items.push(...itemById.values());
  refItems.push(...refItemById.values());

  const outfitById = new Map<number, AuctionOutfit>();
  const refOutfitById = new Map<number, ReferenceOutfit>();

  const addOutfits = (containerType: number, isStore: boolean): void => {
    for (const { src, title } of readCvIcons($, containerType)) {
      const m = /\/outfits\/(\d+)(?:_(\d+))?\.gif/i.exec(src);
      if (!m?.[1]) continue;
      const outfitId = Number(m[1]);
      if (!Number.isInteger(outfitId) || outfitId <= 0) continue;
      if (outfitById.has(outfitId)) {
        const ref = refOutfitById.get(outfitId);
        if (ref && isStore && !ref.isStore) {
          refOutfitById.set(outfitId, { ...ref, isStore: true });
        }
        continue;
      }
      const addonStr = m[2];
      const addons = addonStr ? Number(addonStr) : 0;
      outfitById.set(outfitId, {
        auctionId,
        outfitId,
        addons: Number.isInteger(addons) && addons >= 0 && addons <= 3 ? addons : 0,
      });
      refOutfitById.set(outfitId, {
        id: outfitId,
        name: outfitNameFromTitle(title) || `outfit ${outfitId}`,
        imageUrl: src,
        isStore,
      });
    }
  };

  addOutfits(4, false);
  addOutfits(5, true);
  outfits.push(...outfitById.values());
  refOutfits.push(...refOutfitById.values());

  const mountById = new Map<number, AuctionMount>();
  const refMountById = new Map<number, ReferenceMount>();

  const addMounts = (containerType: number, isStore: boolean): void => {
    for (const { src, title } of readCvIcons($, containerType)) {
      const m = /\/mounts\/(\d+)\.gif/i.exec(src);
      if (!m?.[1]) continue;
      const mountId = Number(m[1]);
      if (!Number.isInteger(mountId) || mountId <= 0) continue;
      if (mountById.has(mountId)) {
        const ref = refMountById.get(mountId);
        if (ref && isStore && !ref.isStore) {
          refMountById.set(mountId, { ...ref, isStore: true });
        }
        continue;
      }
      mountById.set(mountId, { auctionId, mountId });
      refMountById.set(mountId, {
        id: mountId,
        name: norm(title) || `mount ${mountId}`,
        imageUrl: src,
        isStore,
      });
    }
  };

  addMounts(2, false);
  addMounts(3, true);
  mounts.push(...mountById.values());
  refMounts.push(...refMountById.values());

  for (const { src, title } of readCvIcons($, 6)) {
    const m = /\/summons\/(\d+)\.gif/i.exec(src);
    if (!m?.[1]) continue;
    const id = Number(m[1]);
    if (!Number.isInteger(id) || id <= 0) continue;
    familiars.push({ id, name: norm(title), imageUrl: src });
  }

  if (items.length === 0) warnings.push("items: none extracted");
  if (outfits.length === 0) warnings.push("outfits: none extracted");
  if (mounts.length === 0) warnings.push("mounts: none extracted");

  return {
    items,
    outfits,
    mounts,
    refItems: uniqueBy(refItems, (i) => i.id),
    refOutfits: uniqueBy(refOutfits, (o) => o.id),
    refMounts: uniqueBy(refMounts, (m) => m.id),
    familiars,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Główna funkcja: parseAuctionDetail
// ──────────────────────────────────────────────────────────────────────────

/**
 * Parsuj stronę `/charactertrade/?page=details&auctionid={id}` na pełny
 * `Auction` + relacje 1:N + harvest słowników (`reference`).
 *
 * Kontrakt:
 *   - **Nie rzuca** — w najgorszym wypadku `auction: null` + `parseError`
 *   - Walidacja Zod na `AuctionSchema` (R1 future-proof)
 *
 * @param html       — surowy HTML strony detalu
 * @param auctionId  — ID aukcji (bigint, z query stringu)
 * @param scrapedAt  — moment scrape'a (default: now())
 */
export function parseAuctionDetail(
  html: string,
  auctionId: bigint,
  scrapedAt: Date = new Date(),
): AuctionDetailResult {
  const warnings: string[] = [];
  const $ = load(html);

  // ── 1. Ekstrakcja wszystkich sekcji ──────────────────────────────────
  const identity = extractIdentity($, warnings);
  const bid = extractBid($, warnings);
  const dates = extractDates($, warnings);
  const skills = extractSkills($, warnings);
  const labels = collectLabels($);
  const progression = extractProgression($, labels, warnings);
  const resources = extractResources($, labels, warnings);
  const flags = extractFlags($, labels);
  const usps = extractUsps($, auctionId, warnings);
  const relations = extractRelations($, auctionId, warnings);

  const reference: AuctionDetailReference = {
    world:
      identity.worldName != null && identity.worldId != null
        ? { id: identity.worldId, name: identity.worldName }
        : null,
    items: relations.refItems,
    outfits: relations.refOutfits,
    mounts: relations.refMounts,
  };

  /**
   * GUARD: strona NIE wygląda na detal aukcji. Detal tibia.com zawsze ma:
   *   - `.AuctionCharacterName` + pola nagłówka (Level/Vocation/Sex/World),
   *   - ≥1 `.CharacterDetailsBlock` (General / Item Summary / …; strona
   *     listy ma 0 — dzięki temu odsiewamy też pomyłkowe URL-e).
   * Bez tego Zod przeszedłby dzięki syntetycznym fallbackom (name „Auction N",
   * level 8, …) i do bazy trafiłyby śmieciowe wiersze. Lepiej jawnie zgłosić
   * błąd — scheduler zapisze go w `scrape_errors`.
   */
  if (identity.name == null || identity.level == null || $(".CharacterDetailsBlock").length === 0) {
    const errMsg =
      "not an auction detail page (missing .AuctionCharacterName / header fields / CharacterDetailsBlock)";
    warnings.push(`Zod validation skipped: ${errMsg}`);
    return {
      auction: null,
      items: relations.items,
      outfits: relations.outfits,
      mounts: relations.mounts,
      usps,
      skillLoyalties: [],
      reference,
      parseError: errMsg,
      warnings,
    };
  }

  // ── 2. Złóż obiekt Auction (wymaga pól obowiązkowych) ────────────────
  const scrapedAtIso = scrapedAt.toISOString();
  const safeVocation = (identity.vocation ?? "Knight") as
    "Knight" | "Paladin" | "Druid" | "Sorcerer" | "Monk";
  const safeVocationPromoted = (identity.vocationPromoted ?? "Elite Knight") as
    "Elite Knight" | "Royal Paladin" | "Elder Druid" | "Master Sorcerer" | "Exalted Monk";
  const safeSex: "M" | "F" = identity.sex ?? "M";
  const safeWorldId = identity.worldId ?? 1;

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
    status: bid.status,
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
    firstSeenAt: scrapedAtIso,
    lastSeenAt: scrapedAtIso,
    scrapedAt: scrapedAtIso,
  };

  // ── 3. Walidacja Zod (R1 future-proof + wymuszenie kontraktu) ────────
  const parseResult = AuctionSchema.safeParse(auctionCandidate);
  if (!parseResult.success) {
    const errMsg = parseResult.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    warnings.push(`Zod validation failed: ${errMsg}`);
    return {
      auction: null,
      items: relations.items,
      outfits: relations.outfits,
      mounts: relations.mounts,
      usps,
      skillLoyalties: [],
      reference,
      parseError: errMsg,
      warnings,
    };
  }

  return {
    auction: parseResult.data,
    items: relations.items,
    outfits: relations.outfits,
    mounts: relations.mounts,
    usps,
    skillLoyalties: [],
    reference,
    parseError: null,
    warnings,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Diff helper (T30 integration): nowe/zmienione aukcje po rawJsonHash
// ──────────────────────────────────────────────────────────────────────────

/**
 * Stabilny hash 64-bit (FNV-1a 64) z HTML (arch §8.3: skip gdy identyczne).
 * Używany przez scheduler (task 36) do pominięcia detail fetch gdy
 * rawJson się nie zmienił od ostatniego scrape'a.
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
export type { Auction, AuctionItem, AuctionOutfit, AuctionMount, AuctionUsp, AuctionSkillLoyalty };
