/**
 * Parser archiwum Char Bazaar — `pastcharactertrades` (W18, 2026-09-18).
 *
 * PO CO: tibia.com trzyma archiwum ZAKOŃCZONYCH aukcji (~23 000 pozycji,
 * ~919 stron × 25) z **Winning Bid** (ceną końcową) i statusem
 * (`finished`/`cancelled`). To jest pole badawcze dla wyceny postaci
 * (mediany cena/level/vocation) i uzupełnienie `final_price` w bazie
 * (dotychczas 0/818 wypełnionych!).
 *
 * STRUKTURA HTML: identyczna jak bieżąca lista (`currentcharactertrades`) —
 * bloki `.Auction` z `.AuctionHeader`, `.ShortAuctionData*`,
 * `.SpecialCharacterFeatures`. RÓŻNICE:
 *   - brak `.AuctionTimer` (data-timestamp) — daty są TEKSTEM
 *     (`Aug 14 2026, 10:06 CEST`) → `parseTibiaDate()`,
 *   - label oferty: `Winning Bid:` (finished) / `Minimum Bid:` (cancelled),
 *   - status w `.CurrentBid .AuctionInfo span` (`finished`/`cancelled`),
 *   - `.SpecialCharacterFeatures .Entry` zawiera skille
 *     (`89 Sword Fighting (Loyalty bonus not included)`) i blessings
 *     (`Blessings active: 5/7`) — zapisywane do denormalizowanych kolumn
 *     (skill_*, blessings_active) — cenny sygnał dla wyceny.
 *
 * Paginacja: `&currentpage=N` (1..lastPage; `Last Page` w `.PageNavigation`).
 */

import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { z } from "zod";

import { SexSchema, VocationPromotedSchema } from "@tibians/shared/auction";

import { HEADER_FIELD_REGEX, normalizeVocation, parseBidAmount } from "./auction-list.js";

// ──────────────────────────────────────────────────────────────────────────
// Zod schema — wiersz archiwum
// ──────────────────────────────────────────────────────────────────────────

/** Klucze skilli w denormalizowanych kolumnach `auctions.skill_*`. */
export const HISTORY_SKILL_KEYS = [
  "magic",
  "club",
  "fist",
  "sword",
  "axe",
  "distance",
  "shielding",
  "fishing",
] as const;

export type HistorySkillKey = (typeof HISTORY_SKILL_KEYS)[number];

/** Mapowanie nazw skilli z tibia.com → klucze kolumn. */
const SKILL_NAME_TO_KEY: Record<string, HistorySkillKey> = {
  "Magic Level": "magic",
  "Club Fighting": "club",
  "Fist Fighting": "fist",
  "Sword Fighting": "sword",
  "Axe Fighting": "axe",
  "Distance Fighting": "distance",
  Shielding: "shielding",
  Fishing: "fishing",
};

export const HistoryAuctionSchema = z.object({
  auctionId: z.bigint(),
  characterName: z.string().min(1),
  level: z.number().int().min(0),
  vocation: VocationPromotedSchema,
  sex: SexSchema,
  world: z.string().min(1),
  outfitUrl: z.string().url(),
  /** ISO-8601 UTC (skonwertowane z tekstu `Aug 14 2026, 10:06 CEST`). */
  auctionStart: z.string(),
  /** ISO-8601 UTC. */
  auctionEnd: z.string(),
  /** `Winning Bid` dla finished; `Minimum Bid` dla cancelled (może być null). */
  finalPrice: z.number().int().nonnegative().nullable(),
  /** Wartość z `ShortAuctionDataBidRow` (Winning/Minimum Bid) — kolumna `bid`. */
  bid: z.number().int().nonnegative(),
  status: z.enum(["finished", "cancelled"]),
  /** Skille z `.SpecialCharacterFeatures` (tylko te podane przez Tibię). */
  skills: z.record(z.enum(HISTORY_SKILL_KEYS), z.number().int().nonnegative()),
  /** `Blessings active: 5/7` → 5; null gdy wiersz nie podaje. */
  blessingsActive: z.number().int().min(0).max(7).nullable(),
});

export type HistoryAuction = z.infer<typeof HistoryAuctionSchema>;

export interface HistoryListResult {
  readonly rows: readonly HistoryAuction[];
  /** `» Results: 22,960` — łączna liczba wierszy archiwum (null gdy brak). */
  readonly resultsTotal: number | null;
  /** Najwyższy `currentpage` z nawigacji (null gdy brak — pojedyncza strona). */
  readonly lastPage: number | null;
}

// ──────────────────────────────────────────────────────────────────────────
// Daty — `Aug 14 2026, 10:06 CEST` → ISO UTC
// ──────────────────────────────────────────────────────────────────────────

const MONTH_TO_INDEX: Record<string, number> = {
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

const TIBIA_DATE_REGEX = /^([A-Z][a-z]{2}) (\d{1,2}) (\d{4}), (\d{1,2}):(\d{2}) (CEST|CET)$/;

/**
 * Parsuje datę z tibia.com (`Aug 14 2026, 10:06 CEST`) → ISO-8601 UTC.
 *
 * Tibia podaje czas w czasie środkowoeuropejskim (CEST = UTC+2 latem,
 * CET = UTC+1 zimą) — konwertujemy do UTC, żeby `timestamptz` w bazie
 * trzymał poprawny moment.
 *
 * @throws Error gdy format nieznany (wołający loguje i pomija wiersz).
 */
export function parseTibiaDate(raw: string): string {
  const normalized = raw.replace(/\u00a0/g, " ").trim();
  const match = TIBIA_DATE_REGEX.exec(normalized);
  if (match === null) {
    throw new Error(`Nieznany format daty Tibii: "${raw}"`);
  }
  const [, monthName, day, year, hour, minute, zone] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const monthIndex = MONTH_TO_INDEX[monthName];
  if (monthIndex === undefined) {
    throw new Error(`Nieznany miesiąc: "${monthName}"`);
  }
  const utcOffsetHours = zone === "CEST" ? 2 : 1;
  const date = new Date(
    Date.UTC(
      Number.parseInt(year, 10),
      monthIndex,
      Number.parseInt(day, 10),
      Number.parseInt(hour, 10) - utcOffsetHours,
      Number.parseInt(minute, 10),
    ),
  );
  return date.toISOString();
}

// ──────────────────────────────────────────────────────────────────────────
// Parser listy
// ──────────────────────────────────────────────────────────────────────────

type WarnFn = (msg: string, ctx?: Record<string, unknown>) => void;

const defaultWarn: WarnFn = (msg, ctx) => {
  console.warn(`[auction-history] ${msg}`, ctx ?? {});
};

const AUCTION_ID_REGEX = /[?&]auctionid=(\d+)/;

/** Normalizuje tekst: NBSP → spacja, trim. */
function normalizeText(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParseHistoryListOptions {
  readonly warn?: WarnFn;
}

/**
 * Parsuje stronę archiwum (`pastcharactertrades`) → wiersze + metadane.
 *
 * Wiersz uszkodzony (brak ID/poziomu/daty) → `warn` + pominięcie;
 * cała strona nigdy nie rzuca wyjątkiem.
 */
export function parseHistoryList(
  html: string,
  options: ParseHistoryListOptions = {},
): HistoryListResult {
  const warn = options.warn ?? defaultWarn;
  const $ = cheerio.load(html);

  // ── Metadane paginacji ────────────────────────────────────────────
  const navText = normalizeText($(".PageNavigation").text());
  const resultsMatch = /Results:\s*([\d,]+)/.exec(navText);
  const resultsTotal =
    resultsMatch?.[1] !== undefined ? Number.parseInt(resultsMatch[1].replace(/,/g, ""), 10) : null;

  let lastPage: number | null = null;
  $(".PageNavigation a").each((_i, el) => {
    const href = $(el).attr("href");
    if (href === undefined) return;
    const pageMatch = /currentpage=(\d+)/.exec(href);
    if (pageMatch?.[1] !== undefined) {
      const page = Number.parseInt(pageMatch[1], 10);
      if (lastPage === null || page > lastPage) lastPage = page;
    }
  });

  // ── Wiersze ───────────────────────────────────────────────────────
  const rows: HistoryAuction[] = [];

  $(".Auction").each((index, el) => {
    const row = parseHistoryBlock($, $(el), warn, index);
    if (row !== null) rows.push(row);
  });

  return { rows, resultsTotal, lastPage };
}

/**
 * Parsuje jeden blok `.Auction` z archiwum → `HistoryAuction` (albo null
 * + warning, gdy wiersz uszkodzony).
 */
function parseHistoryBlock(
  $: CheerioAPI,
  $auction: Cheerio<AnyNode>,
  warn: WarnFn,
  index: number,
): HistoryAuction | null {
  // 1. Auction ID
  const idSource = $auction.find(".AuctionCharacterName a").attr("href");
  if (idSource === undefined) {
    warn("Missing auction link", { index });
    return null;
  }
  const idMatch = AUCTION_ID_REGEX.exec(idSource);
  if (idMatch?.[1] === undefined) {
    warn("Auction link missing auctionid param", { index, idSource });
    return null;
  }
  const auctionId = BigInt(idMatch[1]);

  // 2. Character name
  const characterName = normalizeText($auction.find(".AuctionCharacterName a").text());
  if (characterName === "") {
    warn("Empty character name", { index, auctionId: auctionId.toString() });
    return null;
  }

  // 3. Level / Vocation / Sex / World — identyczny nagłówek jak lista
  const headerText = normalizeText($auction.find(".AuctionHeader").text());

  const levelMatch = HEADER_FIELD_REGEX.level.exec(headerText);
  if (levelMatch?.[1] === undefined) {
    warn("Missing level", { index, auctionId: auctionId.toString() });
    return null;
  }
  const level = Number.parseInt(levelMatch[1], 10);

  const vocationMatch = HEADER_FIELD_REGEX.vocation.exec(headerText);
  if (vocationMatch?.[1] === undefined) {
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
  if (sexMatch?.[1] === undefined) {
    warn("Missing sex", { index, auctionId: auctionId.toString() });
    return null;
  }
  const sex: z.infer<typeof SexSchema> = sexMatch[1] === "Male" ? "M" : "F";

  const worldMatch = HEADER_FIELD_REGEX.world.exec(headerText);
  if (worldMatch?.[1] === undefined) {
    warn("Missing world", { index, auctionId: auctionId.toString() });
    return null;
  }
  const world = worldMatch[1];

  // 4. Outfit URL
  const outfitUrl = $auction.find("img.AuctionOutfitImage").attr("src");
  if (outfitUrl === undefined || outfitUrl === "") {
    warn("Missing outfit image", { index, auctionId: auctionId.toString() });
    return null;
  }

  // 5-7. ShortAuctionData: pary label → value
  const dataPairs = new Map<string, string>();
  $auction.find(".ShortAuctionDataLabel").each((_i, el) => {
    const label = normalizeText($(el).text());
    const value = normalizeText($(el).next(".ShortAuctionDataValue").text());
    dataPairs.set(label, value);
  });

  const startRaw = dataPairs.get("Auction Start:");
  const endRaw = dataPairs.get("Auction End:");
  if (startRaw === undefined || endRaw === undefined) {
    warn("Missing auction dates", { index, auctionId: auctionId.toString() });
    return null;
  }
  let auctionStart: string;
  let auctionEnd: string;
  try {
    auctionStart = parseTibiaDate(startRaw);
    auctionEnd = parseTibiaDate(endRaw);
  } catch (err) {
    warn(`Invalid date: ${err instanceof Error ? err.message : String(err)}`, {
      index,
      auctionId: auctionId.toString(),
    });
    return null;
  }

  // 8. Winning Bid / Minimum Bid — wartość oferty (dla cancelled może być
  //    "Winning Bid" mimo anulowania — cenę końcową zapisujemy TYLKO dla
  //    finished; dla cancelled `final_price` zostaje NULL, a `bid` niesie
  //    wartość pokazywaną przez Tibię).
  const bidRow = $auction.find(".ShortAuctionDataBidRow");
  const bidRaw = normalizeText(bidRow.find(".ShortAuctionDataValue b").text());
  let bidValue: number | null = null;
  if (bidRaw !== "") {
    try {
      bidValue = parseBidAmount(bidRaw);
    } catch (err) {
      warn(`Invalid bid amount: ${err instanceof Error ? err.message : String(err)}`, {
        index,
        auctionId: auctionId.toString(),
        bidRaw,
      });
      return null;
    }
  }

  // 9. Status — `.CurrentBid .AuctionInfo` (`finished` / `cancelled`; uwaga:
  //    cancelled nie ma <span>, finished ma <span class="ColorGreen">).
  const statusRaw = normalizeText($auction.find(".CurrentBid .AuctionInfo").text()).toLowerCase();
  let status: "finished" | "cancelled";
  if (statusRaw.includes("finished")) {
    status = "finished";
  } else if (statusRaw.includes("cancelled") || statusRaw.includes("canceled")) {
    status = "cancelled";
  } else {
    warn(`Unknown status: "${statusRaw}"`, { index, auctionId: auctionId.toString() });
    return null;
  }

  const finalPrice = status === "finished" ? bidValue : null;

  // 10. SpecialCharacterFeatures — skille + blessings
  const skills: Partial<Record<HistorySkillKey, number>> = {};
  let blessingsActive: number | null = null;
  $auction.find(".SpecialCharacterFeatures .Entry").each((_i, el) => {
    const text = normalizeText($(el).text());
    const blessingMatch = /Blessings active:\s*(\d+)\s*\/\s*7/.exec(text);
    if (blessingMatch?.[1] !== undefined) {
      blessingsActive = Number.parseInt(blessingMatch[1], 10);
      return;
    }
    const skillMatch = /^(\d+)\s+(.+?)\s*\(Loyalty bonus not included\)/.exec(text);
    if (skillMatch?.[1] !== undefined && skillMatch[2] !== undefined) {
      const key = SKILL_NAME_TO_KEY[skillMatch[2].trim()];
      if (key !== undefined) {
        skills[key] = Number.parseInt(skillMatch[1], 10);
      }
    }
  });

  // Złożenie + Zod walidacja
  const candidate = {
    auctionId,
    characterName,
    level,
    vocation,
    sex,
    world,
    outfitUrl,
    auctionStart,
    auctionEnd,
    finalPrice,
    bid: bidValue ?? 0,
    status,
    skills,
    blessingsActive,
  };

  const parsed = HistoryAuctionSchema.safeParse(candidate);
  if (!parsed.success) {
    warn(`Schema validation failed: ${parsed.error.message}`, {
      index,
      auctionId: auctionId.toString(),
    });
    return null;
  }
  return parsed.data;
}
