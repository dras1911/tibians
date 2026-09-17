/**
 * Parser listy aukcji Char Bazaar (task 30 — plan §30, arch §2.5).
 *
 * Cel: z HTML strony `?subtopic=currentcharactertrades&currentpage=N`
 * wyciągnąć tablicę `AuctionSummary[]` (kluczowe pola dla diff w task 36)
 * + numer ostatniej strony.
 *
 * Strategia (arch §3.1 — undici + cheerio, bez Playwright):
 *   1. załaduj HTML przez cheerio (parser server-rendered HTML)
 *   2. dla każdego `<div class="Auction">` wyciągnij 10 pól summary
 *   3. sparsuj paginację (`<span class="CurrentPageLink">` + ostatni link)
 *   4. zwaliduj całość przez `AuctionListResultSchema` (Zod)
 *      — corrupted HTML → empty array + warning, NIE throw
 *
 * Obsługiwane edge case'y:
 *   - pusta strona → `{ auctions: [], totalPages: 0, currentPage: 1 }`
 *   - ostatnia strona (< 25 aukcji) → tablica krótsza niż 25
 *   - brak selektora w wierszu → skip + warning, NIE cały parser fail
 *   - bid `"25 501"` (PL U+00A0) i `"25,501"` (EN) → normalizacja do 25501
 *   - vocation w wariancie bazowym ("Knight") LUB promowanym ("Elite Knight")
 *
 * MUST NOT (plan §30):
 *   - NIE używaj Playwright/Puppeteer (server-rendered HTML)
 *   - NIE parsuj detali (task 31) — tylko summary z listy
 *   - NIE commituj (ten plik jest nowy)
 *   - NIE zapisuj do bazy (task 33)
 *
 * Exports:
 *   - `parseAuctionList(html: string): AuctionListResult`
 *   - `compareAuctionLists(old, new) → { newAuctions, removedAuctions, updatedAuctions }`
 *     (używane przez scheduler w task 36 do wyboru aukcji wymagających detail fetch)
 *   - `parseBidAmount`, `normalizeVocation`, `unixToIso` — helpery (testowane osobno)
 *   - `AuctionSummary`, `AuctionListResult`, `AuctionDiff`, `AuctionDiffResult` — typy
 *   - `AuctionSummarySchema`, `AuctionListResultSchema`, `AuctionDiffSchema`,
 *     `AuctionDiffResultSchema` — Zod schemas
 */

import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { z } from "zod";

import { BidTypeSchema, SexSchema, VocationPromotedSchema } from "@tibians/shared/auction";

// ──────────────────────────────────────────────────────────────────────────
// Typy + Zod schema (kanoniczne dla listy)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pojedyncza aukcja z listy — 10 kluczowych pól dla diff (plan §30).
 *
 * Reguły (arch §7.2):
 *   - `auctionId: bigint` — bigint, bo Tibia.com ma już >2^31 aktywnych aukcji
 *   - `level: number`     — int 0..2000 (Tibia max level cap)
 *   - `bid: number`       — w TC (Tibia Coins), nigdy ujemny
 *   - `auctionEnd: string` — ISO-8601 UTC (z `data-timestamp` Unix epoch s)
 *
 * Pola których tu NIE MA (idą do detail page w task 31):
 *   - skills, charms, imbuements, blessings, store items, outfits list,
 *     mounts list, achievement points, boss points, charm points, USP, itd.
 */
export const AuctionSummarySchema = z
  .object({
    auctionId: z.bigint().positive("auctionId musi być dodatni (bigint z `?auctionid=`)"),
    characterName: z
      .string()
      .min(1, "Nazwa postaci nie może być pusta")
      .max(60, "Tibia ogranicza nick do 29 znaków, ale zostawiamy margines"),
    level: z
      .number()
      .int()
      .min(1, "Level < 1 jest niemożliwy w Tibii")
      .max(2000, "Level > 2000 jest niemożliwy"),
    vocation: VocationPromotedSchema,
    sex: SexSchema,
    world: z.string().min(1).max(40),
    outfitUrl: z
      .string()
      .url("outfitUrl musi być pełnym URL-em do static.tibia.com")
      .startsWith("https://static.tibia.com/", {
        message: "Outfit URL musi być hostowany na static.tibia.com",
      }),
    bid: z.number().int("Bid w TC musi być integerem").min(0, "Bid nie może być ujemny"),
    bidType: BidTypeSchema,
    auctionEnd: z
      .string()
      .min(1)
      .refine((s) => !Number.isNaN(Date.parse(s)), {
        message: "auctionEnd musi być poprawnym ISO-8601 datetime",
      }),
  })
  .strict();
export type AuctionSummary = z.infer<typeof AuctionSummarySchema>;

/** Wrapper dla `parseAuditList` — tablica + meta paginacji. */
export const AuctionListResultSchema = z
  .object({
    auctions: z.array(AuctionSummarySchema),
    totalPages: z
      .number()
      .int("totalPages musi być integerem")
      .min(0, "totalPages nie może być ujemny"),
    currentPage: z
      .number()
      .int("currentPage musi być integerem")
      .min(1, "currentPage jest 1-indexed"),
  })
  .strict();
export type AuctionListResult = z.infer<typeof AuctionListResultSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Diff (scheduler w task 36)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pojedyncza zmiana w aukcji między dwoma snapshotami listy.
 * `kind` wskazuje typ zmiany; reszta pól to zaktualizowany stan.
 */
export const AuctionDiffSchema = z
  .object({
    auctionId: z.bigint().positive(),
    kind: z.enum(["new", "removed", "updated"]),
    /** Nowy stan aukcji (dla kind="new"|"updated"). `null` dla kind="removed". */
    current: AuctionSummarySchema.nullable(),
    /** Poprzedni stan aukcji (dla kind="removed"|"updated"). `null` dla kind="new". */
    previous: AuctionSummarySchema.nullable(),
    /**
     * Lista pól które się zmieniły (kind="updated"). Np. ["bid", "auctionEnd"].
     * Używane przez scheduler (task 36) do decyzji: detail re-fetch czy skip.
     */
    changedFields: z.array(z.string()),
  })
  .strict();
export type AuctionDiff = z.infer<typeof AuctionDiffSchema>;

/** Wynik `compareAuctionLists`. */
export const AuctionDiffResultSchema = z
  .object({
    newAuctions: z.array(AuctionSummarySchema),
    removedAuctions: z.array(AuctionDiffSchema),
    updatedAuctions: z.array(AuctionDiffSchema),
  })
  .strict();
export type AuctionDiffResult = z.infer<typeof AuctionDiffResultSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Parsowanie per-aukcja
// ──────────────────────────────────────────────────────────────────────────

/** Fallback dla ostrzeżeń o złym wierszu — log przez `console.warn`. */
type WarnFn = (msg: string, ctx?: Record<string, unknown>) => void;

const defaultWarn: WarnFn = (msg, ctx) => {
  console.warn(`[auction-list] ${msg}`, ctx ?? {});
};

/**
 * Regex do wyciągania ID z URL: `?auctionid=12345` lub `&auctionid=12345&...`.
 * Anchored na granice, akceptuje TYLKO cyfry (zero `D+` z kropką itp.).
 */
const AUCTION_ID_REGEX = /[?&]auctionid=(\d+)/;

/**
 * Regex dla headera: `Level: 619 | Vocation: Elite Knight | Male | World: Jadebra`.
 * Toleruje NBSP (U+00A0) i zwykłe spacje między polami (Tibia czasem wstawia NBSP).
 */
const HEADER_FIELD_REGEX = {
  level: /Level:\s*(\d+)/,
  vocation: /Vocation:\s*([^|]+?)\s*\|/,
  sex: /(Male|Female)/,
  world: /World:\s*(?:<[^>]*>)?\s*([A-Za-z]+)/,
};

/** Normalizuje tekst Tibii: NBSP → spacja, trim, decode encji. */
function normalizeText(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Parsuje kwotę: `"25 501"` (PL NBSP) lub `"25,501"` (EN) → 25501. */
export function parseBidAmount(raw: string): number {
  const cleaned = raw
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(/,/g, "")
    .trim();
  if (cleaned === "" || !/^\d+$/.test(cleaned)) {
    throw new Error(`Nie udało się sparsować kwoty: "${raw}"`);
  }
  return Number.parseInt(cleaned, 10);
}

/** Mapowanie vocation: akceptuje promowane LUB bazowe (knight → Elite Knight). */
export function normalizeVocation(raw: string): z.infer<typeof VocationPromotedSchema> {
  const v = raw.trim();
  // Akceptuj wariant promowany bezpośrednio
  const promoted = VocationPromotedSchema.safeParse(v);
  if (promoted.success) return promoted.data;
  // Fallback: bazowy → promowany (arch §13.1 + character-context)
  const baseToPromoted: Record<string, z.infer<typeof VocationPromotedSchema>> = {
    Knight: "Elite Knight",
    Paladin: "Royal Paladin",
    Druid: "Elder Druid",
    Sorcerer: "Master Sorcerer",
    Monk: "Exalted Monk",
    // Postacie bez profesji — tibia.com renderuje dosłownie „None".
    None: "None",
  };
  const mapped = baseToPromoted[v];
  if (mapped !== undefined) return mapped;
  throw new Error(`Nieznana vocation: "${raw}"`);
}

/** Konwertuje Unix epoch seconds (z `data-timestamp`) na ISO datetime UTC. */
export function unixToIso(timestampSeconds: string): string {
  const seconds = Number.parseInt(timestampSeconds, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Nieprawidłowy timestamp: ${timestampSeconds}`);
  }
  return new Date(seconds * 1000).toISOString();
}

/**
 * Parsuje jeden blok `<div class="Auction">` → `AuctionSummary` (lub null
 * gdy wiersz uszkodzony — loguje warning i zwraca null).
 */
function parseAuctionBlock(
  $auction: Cheerio<AnyNode>,
  warn: WarnFn,
  index: number,
): AuctionSummary | null {
  // 1. Auction ID — z `<a href="...?auctionid=X">` w AuctionCharacterName lub AuctionLinks
  const detailsLink = $auction.find(".AuctionCharacterName a").attr("href");
  const fallbackLink = $auction.find(".AuctionLinks a").attr("href");
  const idSource = detailsLink ?? fallbackLink;
  if (idSource === undefined) {
    warn("Missing auction link", { index });
    return null;
  }
  const idMatch = AUCTION_ID_REGEX.exec(idSource);
  if (idMatch === null || idMatch[1] === undefined) {
    warn("Auction link missing auctionid param", { index, idSource });
    return null;
  }
  const auctionId = BigInt(idMatch[1]);

  // 2. Character name — tekst linku w `.AuctionCharacterName`
  const rawName = $auction.find(".AuctionCharacterName a").text();
  const characterName = normalizeText(rawName);
  if (characterName === "") {
    warn("Empty character name", { index, auctionId: auctionId.toString() });
    return null;
  }

  // 3-6. Level / Vocation / Sex / World — z tekstu w `.AuctionHeader`
  // Tekst to `Shaman Aragon\nLevel: 126 | Vocation: Elder Druid | Male | World: Nefera<br/>`
  const headerText = normalizeText($auction.find(".AuctionHeader").text().replace(/\s+/g, " "));

  const levelMatch = HEADER_FIELD_REGEX.level.exec(headerText);
  if (levelMatch === null || levelMatch[1] === undefined) {
    warn("Missing level", { index, auctionId: auctionId.toString() });
    return null;
  }
  const level = Number.parseInt(levelMatch[1], 10);

  const vocationMatch = HEADER_FIELD_REGEX.vocation.exec(headerText);
  if (vocationMatch === null || vocationMatch[1] === undefined) {
    warn("Missing vocation", { index, auctionId: auctionId.toString() });
    return null;
  }
  let vocation: z.infer<typeof VocationPromotedSchema>;
  try {
    vocation = normalizeVocation(vocationMatch[1]);
  } catch (err) {
    warn(`Invalid vocation: ${err instanceof Error ? err.message : String(err)}`, {
      index,
      auctionId: auctionId.toString(),
    });
    return null;
  }

  const sexMatch = HEADER_FIELD_REGEX.sex.exec(headerText);
  if (sexMatch === null || sexMatch[1] === undefined) {
    warn("Missing sex", { index, auctionId: auctionId.toString() });
    return null;
  }
  const sex: z.infer<typeof SexSchema> = sexMatch[1] === "Male" ? "M" : "F";

  const worldMatch = HEADER_FIELD_REGEX.world.exec(headerText);
  if (worldMatch === null || worldMatch[1] === undefined) {
    warn("Missing world", { index, auctionId: auctionId.toString() });
    return null;
  }
  const world = worldMatch[1];

  // 7. Outfit URL — `<img class="AuctionOutfitImage" src="...">`
  const outfitUrl = $auction.find("img.AuctionOutfitImage").attr("src");
  if (outfitUrl === undefined || outfitUrl === "") {
    warn("Missing outfit image", { index, auctionId: auctionId.toString() });
    return null;
  }

  // 8-9. Bid + Bid type — `<div class="ShortAuctionDataBidRow">`
  const bidRow = $auction.find(".ShortAuctionDataBidRow");
  const bidLabelRaw = bidRow.find(".ShortAuctionDataLabel").text().trim();
  const bidType: z.infer<typeof BidTypeSchema> = bidLabelRaw.startsWith("Current Bid")
    ? "current"
    : "minimum";

  const bidBoldRaw = bidRow.find(".ShortAuctionDataValue b").text();
  let bid: number;
  try {
    bid = parseBidAmount(bidBoldRaw);
  } catch (err) {
    warn(`Invalid bid amount: ${err instanceof Error ? err.message : String(err)}`, {
      index,
      auctionId: auctionId.toString(),
      bidBoldRaw,
    });
    return null;
  }

  // 10. Auction end — `<div class="AuctionTimer" data-timestamp="...">`
  const timerTimestamp = $auction.find(".AuctionTimer").attr("data-timestamp");
  if (timerTimestamp === undefined) {
    warn("Missing auction timer", { index, auctionId: auctionId.toString() });
    return null;
  }
  let auctionEnd: string;
  try {
    auctionEnd = unixToIso(timerTimestamp);
  } catch (err) {
    warn(`Invalid auction timestamp: ${err instanceof Error ? err.message : String(err)}`, {
      index,
      auctionId: auctionId.toString(),
    });
    return null;
  }

  // Złożenie + Zod walidacja
  const candidate = {
    auctionId,
    characterName,
    level,
    vocation,
    sex,
    world,
    outfitUrl,
    bid,
    bidType,
    auctionEnd,
  };
  const parsed = AuctionSummarySchema.safeParse(candidate);
  if (!parsed.success) {
    warn(`Zod validation failed for auction`, {
      index,
      auctionId: auctionId.toString(),
      issues: parsed.error.issues,
    });
    return null;
  }
  return parsed.data;
}

// ──────────────────────────────────────────────────────────────────────────
// Paginacja
// ──────────────────────────────────────────────────────────────────────────

/**
 * Parsuje paginację z `<td class="PageNavigation">`:
 *   - `currentPage`: `<span class="CurrentPageLink">N</span>`
 *   - `totalPages`: najwyższy `currentpage=N` w linkach PageLink
 *
 * Zwraca `{ currentPage: 1, totalPages: 0 }` gdy paginacja jest pusta
 * (np. brak aukcji / strona błędu).
 */
function parsePagination($: CheerioAPI): {
  currentPage: number;
  totalPages: number;
} {
  const $pagination = $(".PageNavigation");
  if ($pagination.length === 0) {
    return { currentPage: 1, totalPages: 0 };
  }

  // ── totalPages ─────────────────────────────────────────────────────────
  // Strategia: zbierz wszystkie numery stron z DWÓCH źródeł:
  //   1. href `<a>` zawierający `currentpage=N` (najczęstsze, w tym "Last Page")
  //   2. tekst `<span>` (z `<span class="CurrentPageLink">`) — dla edge case gdy
  //      strona bieżąca jest ostatnia i nie ma linku z jej numerem (bo jesteśmy
  //      już na "Last Page").
  //
  // Edge case: na ostatniej stronie pagination wygląda tak:
  //   "First Page" (link) | ... | 104 | 105 | 106 | "Last Page" (span, BEZ linku)
  // Wtedy max(currentpage=N) = 106, ale totalPages = 107. Korygujemy poniżej.
  let maxPageFromHrefs = 0;
  let maxNumericText = 0;
  let hasLastPageLink = false;
  let hasLastPageSpan = false;

  $pagination.find(".PageLink").each((_, el) => {
    const $el = $(el);
    const $a = $el.find("a").first();
    const $span = $el.find("span.CurrentPageLink").first();
    if ($a.length > 0) {
      // Link: wyciągnij numer z href
      const href = $a.attr("href");
      if (href !== undefined) {
        const m = /currentpage=(\d+)/.exec(href);
        if (m !== null && m[1] !== undefined) {
          const n = Number.parseInt(m[1], 10);
          if (Number.isFinite(n) && n > maxPageFromHrefs) maxPageFromHrefs = n;
        }
      }
      // Tekst linka — może być "First Page"/"Last Page"
      const linkText = $a.text().trim();
      if (linkText === "Last Page") hasLastPageLink = true;
    }
    if ($span.length > 0) {
      // Span: sentinel — bieżąca strona
      const spanText = $span.text().trim();
      if (spanText === "Last Page") hasLastPageSpan = true;
      // Tekst może być też numerem (gdy jesteśmy na środkowej stronie)
      const parsed = Number.parseInt(spanText, 10);
      if (Number.isFinite(parsed) && parsed > maxNumericText) {
        maxNumericText = parsed;
      }
    }
  });

  // Korekta totalPages: jeśli "Last Page" jest spanem (jesteśmy na ostatniej),
  // to totalPages = maxPageFromHrefs + 1 (bo ostatnia widoczna strona w linkach
  // jest jedną przed ostatnią — sentinel reprezentuje +1).
  // Edge case: brak linków do ostatniej strony ale istnieje sentinel "Last Page" span.
  let totalPages: number;
  if (hasLastPageSpan && !hasLastPageLink) {
    totalPages = Math.max(maxPageFromHrefs, maxNumericText) + 1;
  } else if (maxPageFromHrefs > 0) {
    totalPages = maxPageFromHrefs;
  } else {
    totalPages = Math.max(maxNumericText, 1);
  }

  // ── currentPage ────────────────────────────────────────────────────────
  // 4 warianty tekstu w `.CurrentPageLink`:
  //   - "N"               → bieżąca strona (typowa)
  //   - "First Page"      → bieżąca = 1
  //   - "Last Page"       → bieżąca = totalPages
  //   - "" (pusty)        → fallback 1
  const currentText = $pagination.find(".CurrentPageLink").first().text().trim();
  let currentPage: number;
  if (currentText === "" || currentText === "First Page") {
    currentPage = 1;
  } else if (currentText === "Last Page") {
    currentPage = totalPages;
  } else {
    const parsed = Number.parseInt(currentText, 10);
    currentPage = Number.isFinite(parsed) ? parsed : 1;
  }

  return {
    currentPage,
    totalPages,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/** Opcje `parseAuctionList`. */
export interface ParseAuctionListOptions {
  /** Logger warningów. Domyślnie: `console.warn`. */
  warn?: WarnFn;
}

/**
 * Parsuje HTML strony `?subtopic=currentcharactertrades&currentpage=N`
 * i zwraca listę `AuctionSummary` + meta paginacji.
 *
 * Reguły (plan §30, MUST DO):
 *   - corrupted HTML → `auctions: []` + warning, NIE throw
 *   - brak selektora w wierszu → skip + warning, NIE cały parser fail
 *   - walidacja Zod (`AuctionListResultSchema`) na output
 *
 * Przykład:
 *   const html = await httpClient.fetchHtml(url);
 *   const { auctions, totalPages, currentPage } = parseAuctionList(html);
 */
export function parseAuctionList(
  html: string,
  options: ParseAuctionListOptions = {},
): AuctionListResult {
  const warn = options.warn ?? defaultWarn;
  const $ = cheerio.load(html);

  const auctions: AuctionSummary[] = [];
  $(".Auction").each((index, el) => {
    const $auction = $(el);
    const parsed = parseAuctionBlock($auction, warn, index);
    if (parsed !== null) auctions.push(parsed);
  });

  const { currentPage, totalPages } = parsePagination($);

  const result: AuctionListResult = {
    auctions,
    totalPages,
    currentPage,
  };

  // Walidacja Zod całości (defensive — gdyby schema evolve'owała)
  const validation = AuctionListResultSchema.safeParse(result);
  if (!validation.success) {
    warn("Result validation failed (should never happen)", {
      issues: validation.error.issues,
    });
    return { auctions: [], totalPages: 0, currentPage: 1 };
  }
  return validation.data;
}

// ──────────────────────────────────────────────────────────────────────────
// Diff — porównanie dwóch snapshotów listy
// ──────────────────────────────────────────────────────────────────────────

/** Zbiór pól `AuctionSummary` branych pod uwagę przy "updated" diff. */
const TRACKED_FIELDS = [
  "characterName",
  "level",
  "vocation",
  "sex",
  "world",
  "outfitUrl",
  "bid",
  "bidType",
  "auctionEnd",
] as const satisfies ReadonlyArray<keyof AuctionSummary>;

/**
 * Porównuje dwa snapshoty listy aukcji i zwraca:
 *   - `newAuctions` — pełne `AuctionSummary` dla ID nowych (łatwy dostęp dla scheduler)
 *   - `removedAuctions` — `AuctionDiff` z `kind="removed"`, `current=null`
 *   - `updatedAuctions` — `AuctionDiff` z `kind="updated"` + lista `changedFields`
 *
 * Algorytm: O(n+m) z dwiema Map<id, AuctionSummary>. Używane przez scheduler
 * (task 36) do decyzji: aukcje z `updated`/`new` wymagają detail re-fetch
 * (task 31), usunięte zamykamy lokalnie.
 *
 * Semantyka "updated":
 *   - każde pole z `TRACKED_FIELDS` porównywane ściśle (=== / .localeCompare)
 *   - `auctionId` jest kluczem, NIE jest polem "updated"
 *   - `bigint` porównywany przez `===`, stringi przez `===`, numerki przez `!==`
 */
export function compareAuctionLists(
  previous: readonly AuctionSummary[],
  current: readonly AuctionSummary[],
): AuctionDiffResult {
  const prevMap = new Map<bigint, AuctionSummary>();
  for (const a of previous) prevMap.set(a.auctionId, a);
  const currMap = new Map<bigint, AuctionSummary>();
  for (const a of current) currMap.set(a.auctionId, a);

  const newAuctions: AuctionSummary[] = [];
  const removedAuctions: AuctionDiff[] = [];
  const updatedAuctions: AuctionDiff[] = [];

  // Iterate over current — detect new + updated
  for (const [id, curr] of currMap) {
    const prev = prevMap.get(id);
    if (prev === undefined) {
      // Nowa aukcja — scheduler MUSI wykonać detail fetch
      newAuctions.push(curr);
      continue;
    }
    const changedFields: string[] = [];
    for (const field of TRACKED_FIELDS) {
      const a = prev[field];
      const b = curr[field];
      // bigint porównanie przez ===, reszta też (=== działa dla string/number/bigint literal)
      const equal =
        typeof a === "bigint" && typeof b === "bigint"
          ? a === b
          : typeof a === "string" && typeof b === "string"
            ? a === b
            : typeof a === "number" && typeof b === "number"
              ? a === b
              : false;
      if (!equal) changedFields.push(field);
    }
    if (changedFields.length > 0) {
      updatedAuctions.push({
        auctionId: id,
        kind: "updated",
        current: curr,
        previous: prev,
        changedFields,
      });
    }
  }

  // Iterate over previous, szukamy ID nieobecnych w current
  for (const [id, prev] of prevMap) {
    if (currMap.has(id)) continue;
    removedAuctions.push({
      auctionId: id,
      kind: "removed",
      current: null,
      previous: prev,
      changedFields: [],
    });
  }

  return {
    newAuctions,
    removedAuctions,
    updatedAuctions,
  };
}
