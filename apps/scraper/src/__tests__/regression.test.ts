/**
 * Testy regresyjne fixture'ów HTML parserów Bazaar (T33 — ubezpieczenie R1).
 *
 * Filozofia (plan §33 + arch. §10 R1):
 *   - fixture HTML w `scrapers/__fixtures__/*.html` są COMMITOWANE do repo
 *     (nigdy nie generowane w teście) — gdy Tibia zmieni HTML, te testy
 *     failują natychmiast, zamiast cicho psuć produkcję.
 *   - per-fixture asercje na konkretnych wartościach (ID, imiona, levele,
 *     vocation, bidy) — pochodzą z analizy plików, NIE są "dorabiane" do
 *     parsera.
 *   - snapshot JSON pełnego `AuctionDetailResult` dla kluczowej aukcji.
 *   - mutation tests: celowo modyfikujemy KOPIĘ fixture'a i sprawdzamy, że
 *     parser ZAREAGOWAŁ (brak zahardkodowanych wartości).
 *   - matryca fixture × parser: każda kombinacja przechodzi bez crasha.
 *   - higiena: fixture'y nie zawierają wrażliwych danych (tokeny/cookie).
 *
 * Uwaga o fixture'ach:
 *   - listy 1/50/101/107 + WSZYSTKIE detale (od 2026-09-17) to pełne, żywe
 *     kopie tibia.com (`*-live-*`, ~190-550 KB),
 *   - listy 2/25/75 to historyczne mirrory strukturalne (identyczna
 *     struktura HTML, syntetyczna treść) — wystarczające dla parsera listy.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  EXPECTED_LIST_COUNTS,
  KNOWN_AUCTION_IDS,
  KNOWN_LIST_PAGES,
  detailFixtureFile,
  listFixtureFile,
} from "../scrapers/constants.js";
import { parseAuctionList, type AuctionSummary } from "../scrapers/auction-list.js";
import {
  parseAuctionDetail,
  rawJsonHash,
  type AuctionDetailResult,
} from "../scrapers/auction-detail.js";

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const FIXTURES_DIR = resolve(import.meta.dirname, "../scrapers/__fixtures__");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

function fixtureNames(): string[] {
  return readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".html"));
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Serializuje `AuctionDetailResult` do deterministycznego JSON-a (snapshot).
 *  - biginty → string z przyrostkiem "n" (JSON nie zna bigintów),
 *  - `rawJson.html` (pełna kopia HTML) → hash — snapshot nie może mieć 240 KB,
 *  - klucze w kolejności zgodnej ze schemą (deterministycznej).
 */
function serializeDetailResult(result: AuctionDetailResult, html: string): string {
  const auction =
    result.auction === null
      ? null
      : {
          ...result.auction,
          rawJson:
            result.auction.rawJson === undefined
              ? undefined
              : {
                  source: (result.auction.rawJson as { source?: string }).source ?? "unknown",
                  htmlHash: rawJsonHash(html),
                },
        };
  const bigintToSafe = (_key: string, value: unknown): unknown =>
    typeof value === "bigint" ? `${value}n` : value;
  return JSON.stringify(
    {
      auction,
      items: result.items,
      outfits: result.outfits,
      mounts: result.mounts,
      usps: result.usps,
      skillLoyalties: result.skillLoyalties,
      parseError: result.parseError,
      warnings: result.warnings,
    },
    bigintToSafe,
    2,
  );
}

/** Ustalone oczekiwania per fixture listy — kotwice z plików (nie z parsera). */
interface ListAnchor {
  count: number;
  currentPage: number;
  totalPages: number;
  first: {
    id: bigint;
    name: string;
    level: number;
    vocation: string;
    bid: number;
    bidType: "current" | "minimum";
    world: string;
  };
}

const LIST_ANCHORS: Readonly<Record<number, ListAnchor>> = {
  1: {
    count: 25,
    currentPage: 1,
    totalPages: 107,
    first: {
      id: 2252233n,
      name: "Good Zin",
      level: 58,
      vocation: "Exalted Monk",
      bid: 85,
      bidType: "current",
      world: "Nevia",
    },
  },
  2: {
    count: 25,
    currentPage: 2,
    totalPages: 107,
    first: {
      id: 2257000n,
      name: "Anastriana Whitmore",
      level: 227,
      vocation: "Exalted Monk",
      bid: 8830,
      bidType: "current",
      world: "",
    },
  },
  25: {
    count: 25,
    currentPage: 25,
    totalPages: 107,
    first: {
      id: 2259000n,
      name: "Eowyn Grimbane",
      level: 1674,
      vocation: "Elite Knight",
      bid: 9020,
      bidType: "minimum",
      world: "",
    },
  },
  50: {
    count: 25,
    currentPage: 50,
    totalPages: 107,
    first: {
      id: 2251961n,
      name: "Mendigo Sobrio",
      level: 397,
      vocation: "Elite Knight",
      bid: 57,
      bidType: "minimum",
      world: "Kalibra",
    },
  },
  75: {
    count: 25,
    currentPage: 75,
    totalPages: 107,
    first: {
      id: 2261000n,
      name: "Zephyr Undersong",
      level: 751,
      vocation: "Royal Paladin",
      bid: 13760,
      bidType: "current",
      world: "",
    },
  },
  101: {
    count: 25,
    currentPage: 101,
    totalPages: 107,
    first: {
      id: 2250105n,
      name: "Solstitium",
      level: 301,
      // Niepromowany Knight (tibia.com dosłownie: „Level: 301 | Vocation: Knight").
      vocation: "Knight",
      bid: 57,
      bidType: "minimum",
      world: "Gentebra",
    },
  },
  107: {
    count: 14,
    currentPage: 107,
    totalPages: 107,
    first: {
      id: 2253441n,
      name: "Alfstar",
      level: 35,
      vocation: "Master Sorcerer",
      bid: 57,
      bidType: "minimum",
      world: "Pacera",
    },
  },
};

// ──────────────────────────────────────────────────────────────────────────
// 1. Inwentarz fixture'ów (spójność constants.ts ↔ pliki)
// ──────────────────────────────────────────────────────────────────────────

describe("T33 — inwentarz fixture'ów", () => {
  it("każdy KNOWN_LIST_PAGES ma plik w __fixtures__ (constants.ts jest źródłem)", () => {
    const files = new Set(fixtureNames());
    for (const page of KNOWN_LIST_PAGES) {
      expect(files.has(listFixtureFile(page)), `brak ${listFixtureFile(page)}`).toBe(true);
    }
  });

  it("każdy KNOWN_AUCTION_IDS ma plik detalu w __fixtures__", () => {
    const files = new Set(fixtureNames());
    for (const id of KNOWN_AUCTION_IDS) {
      expect(files.has(detailFixtureFile(id)), `brak ${detailFixtureFile(id)}`).toBe(true);
    }
  });

  it("wszystkie mirrory listy mają < 50 KB; realne kopie (listy + detale live) są wyjątkiem", () => {
    const realPages = new Set([1, 50, 101, 107]);
    for (const page of KNOWN_LIST_PAGES) {
      const size = readFileSync(resolve(FIXTURES_DIR, listFixtureFile(page)), "utf8").length;
      if (!realPages.has(page)) {
        expect(size, `${listFixtureFile(page)} > 50 KB`).toBeLessThan(50_000);
      }
    }
    // Detale od 2026-09-17 są ŻYWYMI kopiami (~190-550 KB) — celowo duże.
    // Tylko ewentualne archiwalne mirrory musiałyby być małe; obecnie brak.
    for (const file of fixtureNames().filter(
      (f) => f.startsWith("auction-detail-") && !f.startsWith("auction-detail-live-"),
    )) {
      const size = readFileSync(resolve(FIXTURES_DIR, file), "utf8").length;
      expect(size, `${file} > 50 KB`).toBeLessThan(50_000);
    }
  });

  it("oczekiwane liczby aukcji z constants.ts zgadzają się z liczbą plików listy", () => {
    for (const page of KNOWN_LIST_PAGES) {
      expect(EXPECTED_LIST_COUNTS[page], `EXPECTED_LIST_COUNTS[${page}]`).toBe(
        LIST_ANCHORS[page]?.count,
      );
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Per-fixture asercje: lista aukcji (7 stron)
// ──────────────────────────────────────────────────────────────────────────

describe("T33 — per-fixture: lista aukcji (auction-list-page-N.html)", () => {
  for (const page of KNOWN_LIST_PAGES) {
    const anchor = LIST_ANCHORS[page];
    if (anchor === undefined) continue;

    it(`strona ${page}: liczba aukcji, paginacja i pierwsza aukcja (${anchor.first.name})`, () => {
      const html = loadFixture(listFixtureFile(page));
      const result = parseAuctionList(html);

      // Konkretne asercje — zmiana struktury Tibii = FAIL (R1).
      expect(result.auctions.length).toBe(anchor.count);
      expect(result.currentPage).toBe(anchor.currentPage);
      expect(result.totalPages).toBe(anchor.totalPages);

      const first = result.auctions[0];
      expect(first).toBeDefined();
      expect(first?.auctionId).toBe(anchor.first.id);
      expect(first?.characterName).toBe(anchor.first.name);
      expect(first?.level).toBe(anchor.first.level);
      expect(first?.vocation).toBe(anchor.first.vocation);
      expect(first?.bid).toBe(anchor.first.bid);
      expect(first?.bidType).toBe(anchor.first.bidType);
      if (anchor.first.world !== "") {
        expect(first?.world).toBe(anchor.first.world);
      }
      // Dodatkowo: end date w ISO UTC i outfit z static.tibia.com (struktura).
      expect(first?.auctionEnd).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(first?.outfitUrl).toMatch(
        /^https:\/\/static\.tibia\.com\/images\/charactertrade\/outfits\/\d+_\d\.gif$/,
      );
    });
  }

  it("strona 2 ma INNE aukcje niż strona 1 (walidacja page variety)", () => {
    const ids1 = new Set(
      parseAuctionList(loadFixture(listFixtureFile(1))).auctions.map((a) => a.auctionId),
    );
    const ids2 = parseAuctionList(loadFixture(listFixtureFile(2))).auctions.map((a) => a.auctionId);
    expect(ids2.length).toBe(25);
    for (const id of ids2) {
      expect(ids1.has(id), `strona 2 nie może zawierać aukcji ${id} ze strony 1`).toBe(false);
    }
  });

  it("wszystkie aukcje we wszystkich stronach mają unikalne auctionId (globalnie)", () => {
    const all = new Set<string>();
    for (const page of KNOWN_LIST_PAGES) {
      const result = parseAuctionList(loadFixture(listFixtureFile(page)));
      for (const a of result.auctions) {
        const key = a.auctionId.toString();
        expect(all.has(key), `zduplikowane auctionId ${key}`).toBe(false);
        all.add(key);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Per-fixture asercje: detale aukcji
// ──────────────────────────────────────────────────────────────────────────

describe("T33 — per-fixture: detail aukcji (żywe kopie)", () => {
  it("auction-detail-live-2259395: stabilne wartości znanej aukcji (mutation guard)", () => {
    const result = parseAuctionDetail(
      loadFixture(detailFixtureFile(2259395)),
      2259395n,
      new Date("2026-09-17T12:00:00.000Z"),
    );
    expect(result.auction).not.toBeNull();
    const a = result.auction!;
    expect(a.id).toBe(2259395n);
    expect(a.name).toBe("Lancelot royal archer");
    expect(a.level).toBe(402);
    expect(a.vocation).toBe("Paladin");
    expect(a.vocationPromoted).toBe("Royal Paladin");
    expect(a.bid).toBe(2500);
    expect(a.bidType).toBe("minimum");
    expect(a.worldId).toBe(1); // Antica
    expect(a.auctionEnd).toBe("2026-09-17T17:00:00.000Z"); // data-timestamp
  });

  it("auction-detail-live-2252245: minimalna postać parsuje się poprawnie", () => {
    const result = parseAuctionDetail(loadFixture(detailFixtureFile(2252245)), 2252245n);
    expect(result.parseError).toBeNull();
    expect(result.auction?.name).toBe("Misericuerdia");
    expect(result.auction?.level).toBe(15);
    expect(result.auction?.status).toBe("finished"); // „currently processed"
    expect(result.auction?.bidType).toBe("current"); // „Winning Bid"
    expect(result.items).toHaveLength(22);
    expect(result.mounts).toHaveLength(1);
  });

  it("auction-detail-live-2258274: brak sekcji USP = pusta lista, nie crash", () => {
    const result = parseAuctionDetail(loadFixture(detailFixtureFile(2258274)), 2258274n);
    expect(result.auction).not.toBeNull();
    expect(result.usps).toEqual([]);
    expect(result.warnings).toContain("usps: none extracted");
    expect(result.reference.world).toEqual({ id: 31, name: "Celesta" });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Nowe fixture'y T33: boundary + completeness + error handling
// ──────────────────────────────────────────────────────────────────────────

describe("T33 — live-2252245 (boundary: świeża postać K 15)", () => {
  const result = parseAuctionDetail(
    loadFixture(detailFixtureFile(2252245)),
    2252245n,
    new Date("2026-09-17T12:00:00.000Z"),
  );

  it("parsuje niski level z poprawną tożsamością", () => {
    expect(result.parseError).toBeNull();
    const a = result.auction;
    expect(a).not.toBeNull();
    expect(a?.level).toBe(15);
    expect(a?.name).toBe("Misericuerdia");
    expect(a?.vocation).toBe("Knight");
    expect(a?.worldId).toBe(122); // Ombra
  });

  it("świeża postać: brak progresji premium, minimalne liczby", () => {
    const a = result.auction;
    expect(a?.charmPoints).toBe(0);
    expect(a?.imbuementsUnlocked).toBe(0);
    expect(a?.questsCompleted).toBe(1);
    expect(a?.bossPoints).toBe(0);
    expect(a?.blessingsActive).toBe(0);
    expect(a?.hasSoulWar).toBe(false);
    expect(a?.hasPreySlot).toBe(false);
    expect(a?.hasTwistOfFate).toBe(false);
    expect(a?.goldTotal).toBe(10040n);
  });

  it("relacje 1:N obecne mimo niskiego levelu (22 itemy, 12 outfitów)", () => {
    expect(result.items).toHaveLength(22);
    expect(result.outfits).toHaveLength(12);
    expect(result.mounts).toHaveLength(1);
    expect(result.usps).toHaveLength(2);
  });
});

describe("T33 — live-2258972 (completeness: flagi premium + pełna progresja)", () => {
  const result = parseAuctionDetail(
    loadFixture(detailFixtureFile(2258972)),
    2258972n,
    new Date("2026-09-17T12:00:00.000Z"),
  );

  it("parsuje pełną aukcję premium", () => {
    expect(result.parseError).toBeNull();
    expect(result.auction).not.toBeNull();
  });

  it("flagi premium: Primal/Charm/Weekly/Prey/Twist/Transfer = true; Soul War = false", () => {
    const a = result.auction!;
    expect(a.hasSoulWar).toBe(false); // brak quest-line „Soul War"
    expect(a.hasPrimalOrdeal).toBe(true);
    expect(a.hasWorldTransfer).toBe(true);
    expect(a.hasPreySlot).toBe(true);
    expect(a.hasCharmExpansion).toBe(true);
    expect(a.hasWeeklyTaskExpansion).toBe(true);
    expect(a.hasTwistOfFate).toBe(true);
    expect(a.blessingsActive).toBe(7); // 7/7
  });

  it("pełna progresja i zasoby", () => {
    const a = result.auction!;
    expect(a.level).toBe(865);
    expect(a.vocation).toBe("Knight");
    expect(a.vocationPromoted).toBe("Elite Knight");
    expect(a.bid).toBe(17351);
    expect(a.skillClub).toBe(119);
    expect(a.charmPoints).toBe(7695);
    expect(a.charmPointsUnused).toBe(495);
    expect(a.imbuementsUnlocked).toBe(24);
    expect(a.imbuementsTotal).toBe(24);
    expect(a.questsCompleted).toBe(23);
    expect(a.animusMasteries).toBe(31);
    expect(a.gemsLesser).toBe(0);
    expect(a.gemsRegular).toBe(3);
    expect(a.gemsGreater).toBe(2);
    expect(a.goldTotal).toBe(0n);
    expect(a.tcInvested).toBeNull(); // nowy layout nie publikuje
    expect(a.storeOutfitsCount).toBe(1);
    expect(a.storeMountsCount).toBe(0);
    expect(a.storeItemsCount).toBe(15);
    expect(a.hirelingsCount).toBe(2);
  });
});

describe("T33 — strony nie-detal (error handling)", () => {
  it("parser NIE rzuca na śmieciowym HTML — zwraca parseError + warnings", () => {
    const html = "<html><body><h1>hello</h1></body></html>";
    expect(() => parseAuctionDetail(html, 7770003n)).not.toThrow();
    const result = parseAuctionDetail(html, 7770003n);
    expect(result.auction).toBeNull();
    expect(result.parseError).not.toBeNull();
    expect(result.parseError).toContain("not an auction detail page");
    expect(result.warnings.length).toBeGreaterThan(2);
  });

  it("warnings informują o konkretnych brakujących polach", () => {
    const result = parseAuctionDetail("<html><body></body></html>", 7770003n);
    expect(result.warnings.some((w) => w.includes("identity.name"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("identity.level"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("not an auction detail page"))).toBe(true);
  });

  it("strona listy (nie detal) jest odrzucana przez guard CharacterDetailsBlock", () => {
    const listHtml = loadFixture(listFixtureFile(1));
    const result = parseAuctionDetail(listHtml, 7770004n);
    expect(result.auction).toBeNull();
    expect(result.parseError).toContain("not an auction detail page");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. Snapshot JSON — pełny wynik dla kluczowej aukcji live 2259395
// ──────────────────────────────────────────────────────────────────────────

describe("T33 — snapshot AuctionDetailResult (auction-detail-live-2259395)", () => {
  it("serializowany wynik parsowania jest stabilny (JSON snapshot)", () => {
    const html = loadFixture(detailFixtureFile(2259395));
    const result = parseAuctionDetail(html, 2259395n, new Date("2026-09-17T12:00:00.000Z"));
    expect(result.parseError).toBeNull();
    // Determinizm: dwa parsowania tego samego fixture dają identyczny JSON.
    const r2 = parseAuctionDetail(html, 2259395n, new Date("2026-09-17T12:00:00.000Z"));
    expect(serializeDetailResult(result, html)).toBe(serializeDetailResult(r2, html));
    expect(serializeDetailResult(result, html)).toMatchSnapshot();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. Mutation testing — parser reaguje na zmianę fixture'a (R1)
// ──────────────────────────────────────────────────────────────────────────

describe("T33 — mutation tests (parser reaguje na zmiany, zero hardcode)", () => {
  it("list: zmiana imienia postaci w kopii fixture → parsowane imię się zmienia", () => {
    const original = loadFixture(listFixtureFile(2));
    const originalResult = parseAuctionList(original);
    const origFirst = originalResult.auctions[0];
    expect(origFirst?.characterName).toBe("Anastriana Whitmore");

    // Mutacja treści w kopii (COUNT sprawdza, że marker jest unikalny).
    const needle = "Anastriana Whitmore";
    expect(countOccurrences(original, needle)).toBe(1);
    const mutated = original.replace(needle, "Mutation Target");
    const mutatedResult = parseAuctionList(mutated);

    expect(mutatedResult.auctions.length).toBe(25); // struktura nienaruszona
    const target = mutatedResult.auctions.find(
      (a: AuctionSummary) => a.characterName === "Mutation Target",
    );
    expect(target).toBeDefined(); // ← gdyby parser hardkodował, ten test by failował
    expect(target?.auctionId).toBe(2257000n);
  });

  it("detail: zmiana bidu w kopii fixture live-2259395 → parsowany bid się zmienia", () => {
    const html = loadFixture(detailFixtureFile(2259395));
    // Unikalny needle: „Minimum Bid:" + wartość w tej samej komórce.
    const needle =
      'ShortAuctionDataLabel">Minimum Bid:</div><div class="ShortAuctionDataValue"><b>2,500';
    expect(countOccurrences(html, needle)).toBe(1);

    const mutated = html.replace(
      needle,
      'ShortAuctionDataLabel">Minimum Bid:</div><div class="ShortAuctionDataValue"><b>3,300',
    );
    const result = parseAuctionDetail(mutated, 2259395n);
    expect(result.auction).not.toBeNull();
    expect(result.auction?.bid).toBe(3300); // nie 2500 → brak hardcode
  });

  it("list: zmiana klasy CSS (symulacja redesignu Tibii) → parser wykrywa brak aukcji", () => {
    const mutated = loadFixture(listFixtureFile(2)).replaceAll(
      'class="AuctionCharacterName"',
      'class="AuctionCharacterNameRenamed"',
    );
    // cichy warn — spodziewane ostrzeżenia o pustych imionach to DOKŁADNIE to,
    // co parser ma robić po redesignie (fail, nie crash).
    const result = parseAuctionList(mutated, { warn: () => {} });
    // Redesign klasy = zerwana ekstrakcja imienia → wiersze odrzucone z warningiem.
    expect(result.auctions.length).toBe(0);
  });

  it("detail: zmiana klasy nagłówka (symulacja redesignu) → guard zwraca parseError", () => {
    const html = loadFixture(detailFixtureFile(2259395));
    const baseline = parseAuctionDetail(html, 2259395n);
    expect(baseline.auction?.name).toBe("Lancelot royal archer");

    const mutated = html.replaceAll(
      'class="AuctionCharacterName"',
      'class="AuctionCharacterNameRenamed"',
    );
    const result = parseAuctionDetail(mutated, 2259395n);
    // Redesign nagłówka = nie umiemy zidentyfikować postaci → jawny błąd
    // (lepszy niż cichy wiersz-śmieć w bazie).
    expect(result.auction).toBeNull();
    expect(result.parseError).toContain("not an auction detail page");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 7. Matryca fixture × parser — każda kombinacja przechodzi
// ──────────────────────────────────────────────────────────────────────────

describe("T33 — matryca fixture × parser", () => {
  /** Oczekiwany rezultat per fixture detalu (R1: żaden nie crashuje). */
  const DETAIL_OUTCOMES: Readonly<Record<string, boolean>> = {
    "auction-detail-live-2259395.html": true,
    "auction-detail-live-2252245.html": true,
    "auction-detail-live-2258972.html": true,
    "auction-detail-live-2255748.html": true,
    "auction-detail-live-2258274.html": true,
    "auction-detail-live-2254825.html": true,
  };

  /** Parse z jawnym komunikatem zamiast gołego throw (czytelny FAIL). */
  function parseDetailSafe(html: string, auctionId: bigint, file: string): AuctionDetailResult {
    try {
      return parseAuctionDetail(html, auctionId);
    } catch (err) {
      throw new Error(`parseAuctionDetail rzucił wyjątek na ${file}: ${String(err)}`);
    }
  }

  function parseListSafe(html: string, page: number) {
    try {
      return parseAuctionList(html);
    } catch (err) {
      throw new Error(`parseAuctionList rzucił wyjątek na stronie ${page}: ${String(err)}`);
    }
  }

  it("każdy fixture detalu × parseAuctionDetail: oczekiwany outcome, zero crashy", () => {
    const detailFiles = fixtureNames().filter((f) => f.startsWith("auction-detail-"));
    expect(detailFiles.length).toBeGreaterThanOrEqual(5);

    for (const file of detailFiles) {
      const html = loadFixture(file);
      // ID: z nazwy pliku (auction-detail-live-2259395 → 2259395).
      const idMatch = /auction-detail-(?:live-)?(\d+)\.html/.exec(file);
      const parsedId = idMatch?.[1];
      const auctionId = parsedId !== undefined && parsedId !== "" ? BigInt(parsedId) : 999999999n;

      const result = parseDetailSafe(html, auctionId, file);

      const expectedSuccess = DETAIL_OUTCOMES[file];
      expect(expectedSuccess, `brak wpisu DETAIL_OUTCOMES dla ${file}`).toBeDefined();
      if (expectedSuccess) {
        expect(result.auction, `${file}: spodziewany sukces`).not.toBeNull();
        expect(result.parseError, `${file}: spodziewany brak parseError`).toBeNull();
      } else {
        expect(result.auction, `${file}: spodziewany null`).toBeNull();
        expect(result.parseError, `${file}: spodziewany parseError`).not.toBeNull();
      }
    }
  });

  it("każdy fixture listy × parseAuctionList: liczba aukcji zgodna z EXPECTED_LIST_COUNTS", () => {
    for (const page of KNOWN_LIST_PAGES) {
      const html = loadFixture(listFixtureFile(page));
      const result = parseListSafe(html, page);
      expect(result.auctions.length, `strona ${page}`).toBe(EXPECTED_LIST_COUNTS[page]);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 8. Higiena — fixture'y bez wrażliwych danych
// ──────────────────────────────────────────────────────────────────────────

describe("T33 — higiena fixture'ów (bez secrets)", () => {
  /** Wzorce wrażliwych danych — test failuje, jeśli fixture je zawiera. */
  const SENSITIVE_PATTERNS: ReadonlyArray<RegExp> = [
    /\b(phpsessid|sessionid|jsessionid|connect\.sid)\s*=/i,
    /set-cookie:/i,
    /\b(authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?key|csrf[_-]?token)\b/i,
    /\b(password|secret)\s*[:=]\s*\S+/i,
    // URL z wrażliwym PARAMETREM (nie łapiemy nazw plików typu
    // „achievement-secret-symbol.gif" — stąd wymóg `=` po parametrze).
    /https?:\/\/[^\s"']*(?:password|secret|token|cookie|api[_-]?key)=/i,
  ];

  it("żaden fixture nie zawiera tokenów sesji, cookie ani kluczy API", () => {
    const files = fixtureNames();
    expect(files.length).toBeGreaterThanOrEqual(12);
    for (const file of files) {
      const content = readFileSync(resolve(FIXTURES_DIR, file), "utf8");
      for (const pattern of SENSITIVE_PATTERNS) {
        expect(pattern.test(content), `${file} zawiera wrażliwy wzorzec: ${pattern}`).toBe(false);
      }
    }
  });

  it("imiona postaci w fixture'ach są syntetyczne (znane mirrory) — sanity", () => {
    // Realne kopie list zawierają prawdziwe imiona z tibia.com (publiczne).
    // Sprawdzamy tylko, że mirrory T33 nie zawierają prawdziwych danych
    // z list 1/50 (krzyżowo — treść jest niezależna).
    const realNames = parseAuctionList(loadFixture(listFixtureFile(1))).auctions.map(
      (a) => a.characterName,
    );
    const mirrorHtml = loadFixture(listFixtureFile(2));
    for (const name of realNames) {
      expect(
        mirrorHtml.includes(name),
        `mirror strony 2 nie może zawierać imienia '${name}' ze strony 1`,
      ).toBe(false);
    }
  });
});
