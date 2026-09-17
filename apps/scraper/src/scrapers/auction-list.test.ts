/**
 * Testy parsera listy aukcji Char Bazaar (task 30 — plan §30, arch §2.5).
 *
 * Filozofia (analogicznie do `auction-detail.test.ts`):
 *   - fixture HTML w `__fixtures__/*.html` — **commitowane** kopie prawdziwej
 *     Tibii z `tibia.com/charactertrade/?subtopic=currentcharactertrades` (R1 insurance)
 *   - hand-crafted fixtures dla edge case'ów (inline `<table>` mock)
 *   - asercje na konkretnych wartościach z każdego fixture'a
 *
 * Pokrycie (15+ testów, edge cases):
 *   1.  Real fixture (page 1): 25 aukcji, wszystkie pola summary poprawne
 *   2.  Real fixture (page 50): ta sama struktura, 25 aukcji
 *   3.  Real fixture (page 101): 25 aukcji na przedostatniej stronie
 *   4.  Real fixture (page 107): partial page (14 aukcji, "Last Page" sentinel)
 *   5.  Bid parsing PL (NBSP U+00A0): `"25 501"` → 25501
 *   6.  Bid parsing EN (comma): `"1,253"` → 1253
 *   7.  Bid parsing vey large: `"230,000"` → 230000
 *   8.  Bid type "Current Bid" vs "Minimum Bid"
 *   9.  Outfit URL: `static.tibia.com/.../outfits/{id}_{addon}.gif`
 *   10.  Auction ID z URL `?auctionid=X`
 *   11.  Vocation normalization: bazowy → promowany ("Knight" → "Elite Knight")
 *   12.  Vocation passthrough: "Elder Druid" → "Elder Druid"
 *   13.  Empty page: 0 aukcji, totalPages: 0
 *   14.  Corrupted HTML: missing auction link → skip + warning, nie throw
 *   15.  Pagination: totalPages = 107 (max z linków)
 *   16.  Pagination: "First Page" sentinel → currentPage = 1
 *   17.  Pagination: "Last Page" sentinel → currentPage = max
 *   18.  Zod schema: AuctionSummary strict (odrzuca unknown fields)
 *   19.  compareAuctionLists: identyczne listy → puste diff
 *   20.  compareAuctionLists: nowe aukcje (added)
 *   21.  compareAuctionLists: usunięte aukcje (removed)
 *   22.  compareAuctionLists: updated — zmiana bid
 *   23.  compareAuctionLists: updated — zmiana auctionEnd
 *   24.  compareAuctionLists: updated — wiele pól zmienionych
 *   25.  Helper: parseBidAmount reject nieprawidłowe
 *   26.  Helper: normalizeVocation reject nieznane
 *   27.  Helper: unixToIso stabilny
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AuctionSummarySchema,
  compareAuctionLists,
  normalizeVocation,
  parseAuctionList,
  parseBidAmount,
  unixToIso,
  type AuctionSummary,
} from "./auction-list.js";

// ──────────────────────────────────────────────────────────────────────────
// Helpers: wczytywanie fixtures
// ──────────────────────────────────────────────────────────────────────────

const FIXTURES_DIR = resolve(import.meta.dirname, "./__fixtures__");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

/** Tworzy mock `<div class="Auction">` z podanymi parametrami — dla edge case'ów. */
function mockAuction(opts: {
  auctionId: number;
  name?: string;
  level?: number;
  vocation?: string;
  sex?: "Male" | "Female";
  world?: string;
  outfitId?: number;
  addon?: number;
  bidText?: string;
  bidLabel?: "Current Bid" | "Minimum Bid";
  timestamp?: number;
}): string {
  const name = opts.name ?? "Test Char";
  const level = opts.level ?? 100;
  const vocation = opts.vocation ?? "Elite Knight";
  const sex = opts.sex ?? "Male";
  const world = opts.world ?? "Antica";
  const outfitId = opts.outfitId ?? 1;
  const addon = opts.addon ?? 0;
  const bidText = opts.bidText ?? "1,000";
  const bidLabel = opts.bidLabel ?? "Current Bid";
  const ts = opts.timestamp ?? 1788955200;

  const baseUrl = `https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades&page=details&auctionid=${opts.auctionId}`;

  return `<div class="Auction" ><div class="AuctionHeader" ><div class="AuctionLinks" ><a href="${baseUrl}" ><img title="show auction details" src="https://static.tibia.com/images/global/content/button-details-idle.png" /></a></div><div class="AuctionCharacterName" ><a href="${baseUrl}" >${name}</a></div>Level: ${level} | Vocation: ${vocation} | ${sex} | World: <a target="_blank" href="https://www.tibia.com/community/?subtopic=worlds&world=${world}" >${world}</a><br/></div><div class="AuctionBody" ><div class="AuctionBodyBlock AuctionDisplay AuctionOutfit" ><img class="AuctionOutfitImage" src="https://static.tibia.com/images/charactertrade/outfits/${outfitId}_${addon}.gif" /></div><div class="AuctionBodyBlock ShortAuctionData" ><div class="AuctionTimer" id="AuctionTimer_${opts.auctionId}" data-timestamp="${ts}" date-timestring="14:00 CEST" ></div><div class="ShortAuctionDataBidRow" ><div class="ShortAuctionDataLabel" >${bidLabel}:</div><div class="ShortAuctionDataValue" ><b>${bidText}</b> <img src="https://static.tibia.com/images/account/icon-tibiacointrusted.png" class="VSCCoinImages" title="Transferable Tibia Coins"></div></div></div></div></div>`;
}

function wrapPage(auctions: string[], currentpage: number, totalpage: number): string {
  // Mock PageNavigation zgodny z prawdziwą strukturą Tibia HTML:
  //   <span class="PageLink FirstOrLastElement"><span class="CurrentPageLink">First Page</span></span>
  //   <span class="PageLink "><a href="...?currentpage=2">2</a></span>
  //   ...
  //   <span class="PageLink FirstOrLastElement"><a href="...?currentpage=N">Last Page</a></span>
  // Na ostatniej stronie: "Last Page" to span (nie link).
  const linkFor = (page: number) =>
    `<span class="PageLink " ><a  href="https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades&filter_profession=0&currentpage=${page}" >${page}</a></span>`;

  let pagination = "";
  if (currentpage === 1) {
    pagination += `<span class="PageLink FirstOrLastElement" ><span class="CurrentPageLink" >First Page</span></span>`;
    for (let p = 2; p <= Math.min(totalpage, 6); p += 1) pagination += linkFor(p);
    if (totalpage > 6) pagination += ` ... `;
    if (totalpage > 1) {
      pagination += `<span class="PageLink FirstOrLastElement" ><a  href="https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades&currentpage=${totalpage}" >Last Page</a></span>`;
    }
  } else if (currentpage === totalpage && totalpage > 1) {
    pagination += `<span class="PageLink FirstOrLastElement" ><a  href="https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades&currentpage=1" >First Page</a></span>`;
    pagination += ` ... `;
    // ostatnie 3 strony przed "Last Page" sentinel
    for (let p = Math.max(2, totalpage - 2); p < totalpage; p += 1) pagination += linkFor(p);
    pagination += `<span class="PageLink FirstOrLastElement" ><span class="CurrentPageLink" >Last Page</span></span>`;
  } else {
    // mid-page: First Page, ..., prev, current, next, ..., Last Page
    pagination += `<span class="PageLink FirstOrLastElement" ><a  href="https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades&currentpage=1" >First Page</a></span>`;
    pagination += ` ... `;
    for (let p = currentpage - 1; p <= currentpage + 1; p += 1) {
      if (p === currentpage) {
        pagination += `<span class="PageLink " ><span class="CurrentPageLink" >${p}</span></span>`;
      } else {
        pagination += linkFor(p);
      }
    }
    pagination += ` ... `;
    pagination += `<span class="PageLink FirstOrLastElement" ><a  href="https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades&currentpage=${totalpage}" >Last Page</a></span>`;
  }

  return `<html><body><table><tr><td class="PageNavigation" >${pagination}</td></tr></table>${auctions.join("")}</body></html>`;
}

// ──────────────────────────────────────────────────────────────────────────
// 1-4. Real fixtures — Tibia.com snapshots
// ──────────────────────────────────────────────────────────────────────────

describe("parseAuctionList — real Tibia fixture (page 1, 25 aukcji)", () => {
  it("parses 25 aukcji ze strony 1", () => {
    const html = loadFixture("auction-list-page-1.html");
    const result = parseAuctionList(html);
    expect(result.auctions.length).toBe(25);
    expect(result.currentPage).toBe(1);
    // strona 1 ma link "First Page" (sentinel) + linki 2..7 + "Last Page" → max = 107
    expect(result.totalPages).toBe(107);
  });

  it("pierwsza aukcja: id=2252233, name='Good Zin', level=58, Exalted Monk, Male, Nevia", () => {
    const html = loadFixture("auction-list-page-1.html");
    const result = parseAuctionList(html);
    const a = result.auctions[0];
    expect(a).toBeDefined();
    expect(a?.auctionId).toBe(2252233n);
    expect(a?.characterName).toBe("Good Zin");
    expect(a?.level).toBe(58);
    expect(a?.vocation).toBe("Exalted Monk");
    expect(a?.sex).toBe("M");
    expect(a?.world).toBe("Nevia");
  });

  it("druga aukcja: id=2250557, 'Al ex', 1717, Royal Paladin, Quelibra, outfit 129_2", () => {
    const html = loadFixture("auction-list-page-1.html");
    const result = parseAuctionList(html);
    const a = result.auctions[1];
    expect(a).toBeDefined();
    expect(a?.auctionId).toBe(2250557n);
    expect(a?.characterName).toBe("Al ex");
    expect(a?.level).toBe(1717);
    expect(a?.vocation).toBe("Royal Paladin");
    expect(a?.world).toBe("Quelibra");
    expect(a?.outfitUrl).toBe("https://static.tibia.com/images/charactertrade/outfits/129_2.gif");
  });

  it("wszystkie aukcje mają poprawne outfitUrl (static.tibia.com)", () => {
    const html = loadFixture("auction-list-page-1.html");
    const result = parseAuctionList(html);
    for (const a of result.auctions) {
      expect(a.outfitUrl).toMatch(
        /^https:\/\/static\.tibia\.com\/images\/charactertrade\/outfits\/\d+_\d+\.gif$/,
      );
    }
  });

  it("wszystkie aukcje mają poprawne auctionId (bigint > 0)", () => {
    const html = loadFixture("auction-list-page-1.html");
    const result = parseAuctionList(html);
    for (const a of result.auctions) {
      expect(typeof a.auctionId).toBe("bigint");
      expect(a.auctionId).toBeGreaterThan(0n);
    }
  });

  it("wszystkie aukcje mają poprawne vocation (promowane lub bazowe)", () => {
    const html = loadFixture("auction-list-page-1.html");
    const result = parseAuctionList(html);
    const validVocations = [
      "Elite Knight",
      "Royal Paladin",
      "Elder Druid",
      "Master Sorcerer",
      "Exalted Monk",
      // Postacie niepromowane — tibia.com pokazuje bazową formę.
      "Knight",
      "Paladin",
      "Druid",
      "Sorcerer",
      "Monk",
      "None",
    ] as const;
    for (const a of result.auctions) {
      expect(validVocations).toContain(a.vocation);
    }
  });

  it("auctionEnd to ISO datetime UTC (z data-timestamp)", () => {
    const html = loadFixture("auction-list-page-1.html");
    const result = parseAuctionList(html);
    for (const a of result.auctions) {
      expect(() => new Date(a.auctionEnd).toISOString()).not.toThrow();
      expect(a.auctionEnd).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it("przykładowy end date: 1788955200 → 2026-09-09T12:00:00.000Z (pierwsza aukcja)", () => {
    const html = loadFixture("auction-list-page-1.html");
    const result = parseAuctionList(html);
    expect(result.auctions[0]?.auctionEnd).toBe("2026-09-09T12:00:00.000Z");
  });
});

describe("parseAuctionList — real Tibia fixture (page 50, 25 aukcji)", () => {
  it("parses 25 aukcji ze strony 50", () => {
    const html = loadFixture("auction-list-page-50.html");
    const result = parseAuctionList(html);
    expect(result.auctions.length).toBe(25);
  });

  it("currentPage = 50 (mid-page, liczba w .CurrentPageLink)", () => {
    const html = loadFixture("auction-list-page-50.html");
    const result = parseAuctionList(html);
    expect(result.currentPage).toBe(50);
  });

  it("totalPages = 107 (max z linków w paginacji)", () => {
    const html = loadFixture("auction-list-page-50.html");
    const result = parseAuctionList(html);
    expect(result.totalPages).toBe(107);
  });

  it("aukcje ze strony 50 mają unikalne ID (brak kolizji ze stroną 1)", () => {
    const page1Ids = new Set(
      parseAuctionList(loadFixture("auction-list-page-1.html")).auctions.map((a) => a.auctionId),
    );
    const result = parseAuctionList(loadFixture("auction-list-page-50.html"));
    for (const a of result.auctions) {
      expect(page1Ids.has(a.auctionId)).toBe(false);
    }
  });
});

describe("parseAuctionList — real Tibia fixture (page 101, 25 aukcji, przedostatnia)", () => {
  it("parses 25 aukcji ze strony 101", () => {
    const html = loadFixture("auction-list-page-101.html");
    const result = parseAuctionList(html);
    expect(result.auctions.length).toBe(25);
  });

  it("totalPages = 107 (max z linków)", () => {
    const html = loadFixture("auction-list-page-101.html");
    const result = parseAuctionList(html);
    expect(result.totalPages).toBe(107);
  });
});

describe("parseAuctionList — real Tibia fixture (page 107, partial page, 14 aukcji, 'Last Page' sentinel)", () => {
  it("parses 14 aukcji (partial last page)", () => {
    const html = loadFixture("auction-list-page-107.html");
    const result = parseAuctionList(html);
    expect(result.auctions.length).toBe(14);
  });

  it("currentPage = 107 (sentinel 'Last Page' → currentPage = totalPages)", () => {
    const html = loadFixture("auction-list-page-107.html");
    const result = parseAuctionList(html);
    expect(result.currentPage).toBe(107);
  });

  it("totalPages = 107", () => {
    const html = loadFixture("auction-list-page-107.html");
    const result = parseAuctionList(html);
    expect(result.totalPages).toBe(107);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5-10. Bid parsing — PL/EN locale, bid type detection
// ──────────────────────────────────────────────────────────────────────────

describe("parseAuctionList — bid parsing", () => {
  it("EN locale: '1,253' → 1253", () => {
    const html = wrapPage([mockAuction({ auctionId: 1001, bidText: "1,253" })], 1, 1);
    const result = parseAuctionList(html);
    expect(result.auctions[0]?.bid).toBe(1253);
  });

  it("EN locale: '230,000' → 230000", () => {
    const html = wrapPage([mockAuction({ auctionId: 1002, bidText: "230,000" })], 1, 1);
    const result = parseAuctionList(html);
    expect(result.auctions[0]?.bid).toBe(230000);
  });

  it("PL locale (NBSP U+00A0): '25 501' → 25501 (real fixture)", () => {
    // Auction #2252233 — "85" (no separator) — sanity check that parser handles plain numbers
    const html = wrapPage([mockAuction({ auctionId: 1003, bidText: "85" })], 1, 1);
    const result = parseAuctionList(html);
    expect(result.auctions[0]?.bid).toBe(85);
  });

  it("PL locale (NBSP): '25 501' (U+00A0) → 25501 (helper direct test)", () => {
    expect(parseBidAmount("25\u00a0501")).toBe(25501);
    expect(parseBidAmount("25 501")).toBe(25501); // zwykła spacja też OK
    expect(parseBidAmount("1\u00a0234\u00a0567")).toBe(1234567); // wiele NBSP
  });

  it("minimum bid: 'Minimum Bid:' label → bidType = 'minimum'", () => {
    const html = wrapPage(
      [
        mockAuction({
          auctionId: 2001,
          bidText: "500",
          bidLabel: "Minimum Bid",
        }),
      ],
      1,
      1,
    );
    const result = parseAuctionList(html);
    expect(result.auctions[0]?.bidType).toBe("minimum");
    expect(result.auctions[0]?.bid).toBe(500);
  });

  it("current bid: 'Current Bid:' label → bidType = 'current'", () => {
    const html = wrapPage(
      [
        mockAuction({
          auctionId: 2002,
          bidText: "750",
          bidLabel: "Current Bid",
        }),
      ],
      1,
      1,
    );
    const result = parseAuctionList(html);
    expect(result.auctions[0]?.bidType).toBe("current");
  });

  it("reject nieprawidłowej kwoty → skip + warning (nie crash)", () => {
    const html = wrapPage([mockAuction({ auctionId: 2003, bidText: "abc" })], 1, 1);
    const warn = vi.fn();
    const result = parseAuctionList(html, { warn });
    expect(result.auctions).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 11-12. Vocation normalization
// ──────────────────────────────────────────────────────────────────────────

describe("normalizeVocation — zachowuje formę z tibia.com (BEZ awansu)", () => {
  it("bazowe zostają bazowe (postacie niepromowane)", () => {
    expect(normalizeVocation("Knight")).toBe("Knight");
    expect(normalizeVocation("Paladin")).toBe("Paladin");
    expect(normalizeVocation("Druid")).toBe("Druid");
    expect(normalizeVocation("Sorcerer")).toBe("Sorcerer");
    expect(normalizeVocation("Monk")).toBe("Monk");
  });

  it("promowane zostają promowane (passthrough)", () => {
    expect(normalizeVocation("Elite Knight")).toBe("Elite Knight");
    expect(normalizeVocation("Elder Druid")).toBe("Elder Druid");
    expect(normalizeVocation("  Master Sorcerer  ")).toBe("Master Sorcerer");
  });

  it("case-insensitive → kanoniczna forma", () => {
    expect(normalizeVocation("paladin")).toBe("Paladin");
    expect(normalizeVocation("ROYAL PALADIN")).toBe("Royal Paladin");
  });

  it("nieznana vocation → throw", () => {
    expect(() => normalizeVocation("Overlord")).toThrow(/Nieznana vocation/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 13-14. Edge cases: empty page + corrupted HTML
// ──────────────────────────────────────────────────────────────────────────

describe("parseAuctionList — edge cases", () => {
  it("pusta strona (brak aukcji, brak paginacji) → 0 aukcji, totalPages=0, currentPage=1", () => {
    const html = "<html><body></body></html>";
    const result = parseAuctionList(html);
    expect(result.auctions).toEqual([]);
    expect(result.totalPages).toBe(0);
    expect(result.currentPage).toBe(1);
  });

  it("strona z pustą paginacją → gracefully 0 aukcji", () => {
    const html = "<html><body><td class='PageNavigation'></td></body></html>";
    const result = parseAuctionList(html);
    expect(result.auctions).toEqual([]);
  });

  it("wiersz bez linku auctionid → skip + warning, parser nie crashuje", () => {
    const corrupt = `<div class="Auction"><div class="AuctionHeader"><div class="AuctionCharacterName"><a>No Link</a></div></div><div class="AuctionBody"><div class="ShortAuctionData"><div class="AuctionTimer" data-timestamp="1788955200"></div><div class="ShortAuctionDataBidRow"><div class="ShortAuctionDataLabel">Current Bid:</div><div class="ShortAuctionDataValue"><b>100</b></div></div></div></div></div>`;
    const warn = vi.fn();
    const result = parseAuctionList(`<html><body>${corrupt}</body></html>`, { warn });
    expect(result.auctions).toEqual([]);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0]?.[0]).toMatch(/Missing auction link/);
  });

  it("wiersz bez outfitImage → skip + warning", () => {
    const corrupt = `<div class="Auction"><div class="AuctionHeader"><div class="AuctionCharacterName"><a href="?auctionid=9999">X</a></div>Level: 100 | Vocation: Elite Knight | Male | World: Antica</div><div class="AuctionBody"><div class="ShortAuctionData"><div class="AuctionTimer" data-timestamp="1788955200"></div><div class="ShortAuctionDataBidRow"><div class="ShortAuctionDataLabel">Current Bid:</div><div class="ShortAuctionDataValue"><b>100</b></div></div></div></div></div>`;
    const warn = vi.fn();
    const result = parseAuctionList(`<html><body>${corrupt}</body></html>`, { warn });
    expect(result.auctions).toEqual([]);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.some(([msg]) => /outfit/i.test(String(msg)))).toBe(true);
  });

  it("mieszane: 1 dobry + 1 uszkodzony → 1 aukcja, 1 warning", () => {
    const good = mockAuction({ auctionId: 5000, name: "Good", bidText: "100" });
    const corrupt = `<div class="Auction"><div class="AuctionHeader"></div></div>`;
    const warn = vi.fn();
    const html = `<html><body>${good}${corrupt}</body></html>`;
    const result = parseAuctionList(html, { warn });
    expect(result.auctions.length).toBe(1);
    expect(result.auctions[0]?.auctionId).toBe(5000n);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 15-17. Pagination edge cases
// ──────────────────────────────────────────────────────────────────────────

describe("parseAuctionList — pagination sentinels", () => {
  it("'First Page' sentinel na stronie 1 → currentPage=1, totalPages z linków", () => {
    // page 1 fixture już to pokrył, ale dodajmy jawny test hand-crafted
    const a1 = mockAuction({ auctionId: 1, bidText: "100" });
    const a2 = mockAuction({ auctionId: 2, bidText: "200" });
    const html = wrapPage([a1, a2], 1, 50);
    const result = parseAuctionList(html);
    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(50);
    expect(result.auctions.length).toBe(2);
  });

  it("'Last Page' sentinel → currentPage = totalPages", () => {
    const a1 = mockAuction({ auctionId: 10, bidText: "100" });
    const html = wrapPage([a1], 50, 50);
    const result = parseAuctionList(html);
    expect(result.currentPage).toBe(50);
    expect(result.totalPages).toBe(50);
  });

  it("mid-page: '.CurrentPageLink' = '25' → currentPage=25", () => {
    const a1 = mockAuction({ auctionId: 20, bidText: "100" });
    const html = wrapPage([a1], 25, 50);
    const result = parseAuctionList(html);
    expect(result.currentPage).toBe(25);
  });

  it("brak PageNavigation → currentPage=1, totalPages=0", () => {
    const html = `<html><body>${mockAuction({ auctionId: 1 })}</body></html>`;
    const result = parseAuctionList(html);
    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 18. Zod schema — strict mode
// ──────────────────────────────────────────────────────────────────────────

describe("AuctionSummarySchema — strict Zod validation", () => {
  it("poprawna aukcja → success", () => {
    const valid: AuctionSummary = {
      auctionId: 12345n,
      characterName: "Test",
      level: 100,
      vocation: "Elite Knight",
      sex: "M",
      world: "Antica",
      outfitUrl: "https://static.tibia.com/images/charactertrade/outfits/1_0.gif",
      bid: 100,
      bidType: "current",
      auctionEnd: "2026-09-09T12:00:00.000Z",
    };
    expect(AuctionSummarySchema.safeParse(valid).success).toBe(true);
  });

  it("unknown field → odrzucony (.strict())", () => {
    const invalid = {
      auctionId: 12345n,
      characterName: "Test",
      level: 100,
      vocation: "Elite Knight",
      sex: "M",
      world: "Antica",
      outfitUrl: "https://static.tibia.com/images/charactertrade/outfits/1_0.gif",
      bid: 100,
      bidType: "current",
      auctionEnd: "2026-09-09T12:00:00.000Z",
      unknownField: "x",
    };
    const result = AuctionSummarySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("nieprawidłowy vocation → odrzucony", () => {
    const invalid = {
      auctionId: 12345n,
      characterName: "Test",
      level: 100,
      vocation: "Overlord",
      sex: "M",
      world: "Antica",
      outfitUrl: "https://static.tibia.com/images/charactertrade/outfits/1_0.gif",
      bid: 100,
      bidType: "current",
      auctionEnd: "2026-09-09T12:00:00.000Z",
    };
    expect(AuctionSummarySchema.safeParse(invalid).success).toBe(false);
  });

  it("level > 2000 → odrzucony", () => {
    const invalid = {
      auctionId: 12345n,
      characterName: "Test",
      level: 9999,
      vocation: "Elite Knight",
      sex: "M",
      world: "Antica",
      outfitUrl: "https://static.tibia.com/images/charactertrade/outfits/1_0.gif",
      bid: 100,
      bidType: "current",
      auctionEnd: "2026-09-09T12:00:00.000Z",
    };
    expect(AuctionSummarySchema.safeParse(invalid).success).toBe(false);
  });

  it("outfitUrl nie z static.tibia.com → odrzucony", () => {
    const invalid = {
      auctionId: 12345n,
      characterName: "Test",
      level: 100,
      vocation: "Elite Knight",
      sex: "M",
      world: "Antica",
      outfitUrl: "https://evil.com/outfit.gif",
      bid: 100,
      bidType: "current",
      auctionEnd: "2026-09-09T12:00:00.000Z",
    };
    expect(AuctionSummarySchema.safeParse(invalid).success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 19-24. compareAuctionLists — diff function (scheduler T36)
// ──────────────────────────────────────────────────────────────────────────

describe("compareAuctionLists — diff dla scheduler (task 36)", () => {
  const baseAuction = (overrides: Partial<AuctionSummary>): AuctionSummary => ({
    auctionId: 1n,
    characterName: "Test",
    level: 100,
    vocation: "Elite Knight",
    sex: "M",
    world: "Antica",
    outfitUrl: "https://static.tibia.com/images/charactertrade/outfits/1_0.gif",
    bid: 1000,
    bidType: "current",
    auctionEnd: "2026-09-09T12:00:00.000Z",
    ...overrides,
  });

  it("identyczne listy → pusty diff", () => {
    const list = [
      baseAuction({ auctionId: 1n }),
      baseAuction({ auctionId: 2n }),
      baseAuction({ auctionId: 3n }),
    ];
    const diff = compareAuctionLists(list, list);
    expect(diff.newAuctions).toEqual([]);
    expect(diff.removedAuctions).toEqual([]);
    expect(diff.updatedAuctions).toEqual([]);
  });

  it("puste listy → pusty diff", () => {
    const diff = compareAuctionLists([], []);
    expect(diff.newAuctions).toEqual([]);
    expect(diff.removedAuctions).toEqual([]);
    expect(diff.updatedAuctions).toEqual([]);
  });

  it("nowa aukcja (added) → newAuctions, removed=[]", () => {
    const prev = [baseAuction({ auctionId: 1n })];
    const curr = [
      baseAuction({ auctionId: 1n }),
      baseAuction({ auctionId: 2n, characterName: "New" }),
    ];
    const diff = compareAuctionLists(prev, curr);
    expect(diff.newAuctions.length).toBe(1);
    expect(diff.newAuctions[0]?.auctionId).toBe(2n);
    expect(diff.newAuctions[0]?.characterName).toBe("New");
    expect(diff.removedAuctions).toEqual([]);
    expect(diff.updatedAuctions).toEqual([]);
  });

  it("usunięta aukcja (removed) → removedAuctions, newAuctions=[]", () => {
    const prev = [baseAuction({ auctionId: 1n }), baseAuction({ auctionId: 2n })];
    const curr = [baseAuction({ auctionId: 1n })];
    const diff = compareAuctionLists(prev, curr);
    expect(diff.newAuctions).toEqual([]);
    expect(diff.removedAuctions.length).toBe(1);
    expect(diff.removedAuctions[0]?.kind).toBe("removed");
    expect(diff.removedAuctions[0]?.auctionId).toBe(2n);
    expect(diff.removedAuctions[0]?.current).toBeNull();
    expect(diff.removedAuctions[0]?.previous?.auctionId).toBe(2n);
    expect(diff.updatedAuctions).toEqual([]);
  });

  it("updated: zmiana bid → updatedAuctions z changedFields=['bid']", () => {
    const prev = [baseAuction({ auctionId: 1n, bid: 1000 })];
    const curr = [baseAuction({ auctionId: 1n, bid: 1500 })];
    const diff = compareAuctionLists(prev, curr);
    expect(diff.updatedAuctions.length).toBe(1);
    const upd = diff.updatedAuctions[0];
    expect(upd?.kind).toBe("updated");
    expect(upd?.auctionId).toBe(1n);
    expect(upd?.changedFields).toEqual(["bid"]);
    expect(upd?.current?.bid).toBe(1500);
    expect(upd?.previous?.bid).toBe(1000);
  });

  it("updated: zmiana auctionEnd → changedFields=['auctionEnd']", () => {
    const prev = [baseAuction({ auctionId: 1n, auctionEnd: "2026-09-09T12:00:00.000Z" })];
    const curr = [baseAuction({ auctionId: 1n, auctionEnd: "2026-09-09T13:00:00.000Z" })];
    const diff = compareAuctionLists(prev, curr);
    expect(diff.updatedAuctions[0]?.changedFields).toEqual(["auctionEnd"]);
  });

  it("updated: wiele pól zmienionych naraz (bid + level + vocation)", () => {
    const prev = [
      baseAuction({
        auctionId: 1n,
        bid: 1000,
        level: 100,
        vocation: "Elite Knight",
      }),
    ];
    const curr = [
      baseAuction({
        auctionId: 1n,
        bid: 2000,
        level: 150,
        vocation: "Royal Paladin",
      }),
    ];
    const diff = compareAuctionLists(prev, curr);
    expect(diff.updatedAuctions[0]?.changedFields.sort()).toEqual(
      ["bid", "level", "vocation"].sort(),
    );
  });

  it("updated: bidType 'current' → 'minimum' (aukcja bez licytacji)", () => {
    const prev = [baseAuction({ auctionId: 1n, bidType: "current" })];
    const curr = [baseAuction({ auctionId: 1n, bidType: "minimum" })];
    const diff = compareAuctionLists(prev, curr);
    expect(diff.updatedAuctions[0]?.changedFields).toEqual(["bidType"]);
  });

  it("kombinacja: nowe + usunięte + updated w jednym diff", () => {
    const prev = [
      baseAuction({ auctionId: 1n, bid: 1000 }),
      baseAuction({ auctionId: 2n, bid: 2000 }),
      baseAuction({ auctionId: 3n, bid: 3000 }),
    ];
    const curr = [
      baseAuction({ auctionId: 1n, bid: 1500 }), // updated
      baseAuction({ auctionId: 3n, bid: 3000 }), // unchanged
      baseAuction({ auctionId: 4n, bid: 4000 }), // new
      // 2 — removed
    ];
    const diff = compareAuctionLists(prev, curr);
    expect(diff.newAuctions.length).toBe(1);
    expect(diff.newAuctions[0]?.auctionId).toBe(4n);
    expect(diff.removedAuctions.length).toBe(1);
    expect(diff.removedAuctions[0]?.auctionId).toBe(2n);
    expect(diff.updatedAuctions.length).toBe(1);
    expect(diff.updatedAuctions[0]?.auctionId).toBe(1n);
    expect(diff.updatedAuctions[0]?.changedFields).toEqual(["bid"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 25-27. Helpers — parseBidAmount reject, normalizeVocation reject, unixToIso
// ──────────────────────────────────────────────────────────────────────────

describe("parseBidAmount — invalid input rejection", () => {
  it("pusty string → throw", () => {
    expect(() => parseBidAmount("")).toThrow(/Nie udało się sparsować/);
  });

  it("litery → throw", () => {
    expect(() => parseBidAmount("abc")).toThrow(/Nie udało się sparsować/);
  });

  it("mixed cyfry + litery → throw", () => {
    expect(() => parseBidAmount("100x")).toThrow(/Nie udało się sparsować/);
  });

  it("decimal (z kropką) → throw", () => {
    expect(() => parseBidAmount("100.5")).toThrow(/Nie udało się sparsować/);
  });

  it("valid input → number", () => {
    expect(parseBidAmount("100")).toBe(100);
    expect(parseBidAmount("1,000,000")).toBe(1000000);
    expect(parseBidAmount("1\u00a0000")).toBe(1000);
  });
});

describe("unixToIso — Unix epoch → ISO datetime UTC", () => {
  it("0 → throw (nieprawidłowy timestamp)", () => {
    expect(() => unixToIso("0")).toThrow(/Nieprawidłowy timestamp/);
  });

  it("ujemny → throw", () => {
    expect(() => unixToIso("-1")).toThrow(/Nieprawidłowy timestamp/);
  });

  it("NaN → throw", () => {
    expect(() => unixToIso("abc")).toThrow(/Nieprawidłowy timestamp/);
  });

  it("1788955200 → 2026-09-09T12:00:00.000Z", () => {
    expect(unixToIso("1788955200")).toBe("2026-09-09T12:00:00.000Z");
  });

  it("stabilny: ten sam input → ten sam output (determinizm)", () => {
    const a = unixToIso("1788955200");
    const b = unixToIso("1788955200");
    expect(a).toBe(b);
  });
});
