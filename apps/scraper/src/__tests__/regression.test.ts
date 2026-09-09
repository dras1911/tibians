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
 * Uwaga o realnych stronach listy (1/50/101/107): to pełne, żywe kopie
 * tibia.com (~190-250 KB). Strony 2/25/75 i detale to "mirrory strukturalne"
 * (README w __fixtures__ §1-2) — identyczna struktura HTML, syntetyczna treść.
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
function serializeDetailResult(
  result: AuctionDetailResult,
  html: string,
): string {
  const auction =
    result.auction === null
      ? null
      : {
          ...result.auction,
          rawJson:
            result.auction.rawJson === undefined
              ? undefined
              : {
                  source:
                    (result.auction.rawJson as { source?: string }).source ??
                    "unknown",
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
    count: 25, currentPage: 1, totalPages: 107,
    first: { id: 2252233n, name: "Good Zin", level: 58, vocation: "Exalted Monk", bid: 85, bidType: "current", world: "Nevia" },
  },
  2: {
    count: 25, currentPage: 2, totalPages: 107,
    first: { id: 2257000n, name: "Anastriana Whitmore", level: 227, vocation: "Exalted Monk", bid: 8830, bidType: "current", world: "" },
  },
  25: {
    count: 25, currentPage: 25, totalPages: 107,
    first: { id: 2259000n, name: "Eowyn Grimbane", level: 1674, vocation: "Elite Knight", bid: 9020, bidType: "minimum", world: "" },
  },
  50: {
    count: 25, currentPage: 50, totalPages: 107,
    first: { id: 2251961n, name: "Mendigo Sobrio", level: 397, vocation: "Elite Knight", bid: 57, bidType: "minimum", world: "Kalibra" },
  },
  75: {
    count: 25, currentPage: 75, totalPages: 107,
    first: { id: 2261000n, name: "Zephyr Undersong", level: 751, vocation: "Royal Paladin", bid: 13760, bidType: "current", world: "" },
  },
  101: {
    count: 25, currentPage: 101, totalPages: 107,
    first: { id: 2250105n, name: "Solstitium", level: 301, vocation: "Elite Knight", bid: 57, bidType: "minimum", world: "Gentebra" },
  },
  107: {
    count: 14, currentPage: 107, totalPages: 107,
    first: { id: 2253441n, name: "Alfstar", level: 35, vocation: "Master Sorcerer", bid: 57, bidType: "minimum", world: "Pacera" },
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

  it("wszystkie nowe mirrory i detale mają < 50 KB; realne listy (1/50/101/107) są wyjątkiem", () => {
    const realPages = new Set([1, 50, 101, 107]);
    for (const page of KNOWN_LIST_PAGES) {
      const size = readFileSync(resolve(FIXTURES_DIR, listFixtureFile(page)), "utf8").length;
      if (!realPages.has(page)) {
        expect(size, `${listFixtureFile(page)} > 50 KB`).toBeLessThan(50_000);
      }
    }
    for (const file of fixtureNames().filter((f) => f.startsWith("auction-detail-"))) {
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
      expect(first?.outfitUrl).toMatch(/^https:\/\/static\.tibia\.com\/images\/charactertrade\/outfits\/\d+_\d\.gif$/);
    });
  }

  it("strona 2 ma INNE aukcje niż strona 1 (walidacja page variety)", () => {
    const ids1 = new Set(
      parseAuctionList(loadFixture(listFixtureFile(1))).auctions.map((a) => a.auctionId),
    );
    const ids2 = parseAuctionList(loadFixture(listFixtureFile(2))).auctions.map(
      (a) => a.auctionId,
    );
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

describe("T33 — per-fixture: detail aukcji", () => {
  it("auction-detail-2173376: stabilne wartości znanej aukcji (mutation guard)", () => {
    const result = parseAuctionDetail(
      loadFixture(detailFixtureFile(2173376)),
      2173376n,
      new Date("2026-09-08T12:00:00.000Z"),
    );
    expect(result.auction).not.toBeNull();
    const a = result.auction!;
    expect(a.id).toBe(2173376n);
    expect(a.name).toBe("Migzen The Exalted");
    expect(a.level).toBe(619);
    expect(a.vocation).toBe("Monk");
    expect(a.vocationPromoted).toBe("Exalted Monk");
    expect(a.bid).toBe(25501);
    expect(a.bidType).toBe("current");
    expect(a.worldId).toBe(1); // Antica
  });

  it("auction-detail-empty: minimalna aukcja parsuje (bez relacji 1:N)", () => {
    const result = parseAuctionDetail(loadFixture("auction-detail-empty.html"), 99999n);
    expect(result.parseError).toBeNull();
    expect(result.auction?.name).toBe("Min Tester");
    expect(result.auction?.level).toBe(50);
    expect(result.auction?.bidType).toBe("minimum");
    expect(result.items).toEqual([]);
    expect(result.outfits).toEqual([]);
    expect(result.mounts).toEqual([]);
    expect(result.usps).toEqual([]);
  });

  it("auction-detail-en: bid EN z przecinkiem (1,234,567 → 1234567)", () => {
    const result = parseAuctionDetail(loadFixture("auction-detail-en.html"), 11111n);
    expect(result.auction).not.toBeNull();
    expect(result.auction?.bid).toBe(1234567);
    expect(result.auction?.worldId).toBe(11); // Astera
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Nowe fixture'y T33: boundary + completeness + error handling
// ──────────────────────────────────────────────────────────────────────────

describe("T33 — auction-detail-new-player.html (boundary: level 8)", () => {
  const result = parseAuctionDetail(
    loadFixture("auction-detail-new-player.html"),
    7770001n,
    new Date("2026-09-08T12:00:00.000Z"),
  );

  it("parsuje level 8 (minimalny w Bazaar) z poprawną tożsamością", () => {
    expect(result.parseError).toBeNull();
    const a = result.auction;
    expect(a).not.toBeNull();
    expect(a?.level).toBe(8); // boundary — schema pozwala min 8
    expect(a?.name).toBe("Fledgling Rook");
    expect(a?.vocation).toBe("Knight");
    expect(a?.worldId).toBe(1);
  });

  it("świeża postać: 'Minimum bid', brak progresji i premium", () => {
    const a = result.auction;
    expect(a?.bidType).toBe("minimum");
    expect(a?.bid).toBe(50);
    expect(a?.charmPoints).toBe(0);
    expect(a?.imbuementsUnlocked).toBe(0);
    expect(a?.questsCompleted).toBe(0);
    expect(a?.bossPoints).toBe(0);
    expect(a?.blessingsActive).toBe(0);
    expect(a?.hasSoulWar).toBe(false);
    expect(a?.hasPreySlot).toBe(false);
    expect(a?.hasTwistOfFate).toBe(false);
    expect(a?.goldTotal).toBe(100n);
  });

  it("puste relacje 1:N (items/mounts/usps) przy świeżej postaci", () => {
    expect(result.items).toEqual([]);
    expect(result.mounts).toEqual([]);
    expect(result.usps).toEqual([]);
  });
});

describe("T33 — auction-detail-vip.html (completeness: wszystkie flagi premium)", () => {
  const result = parseAuctionDetail(
    loadFixture("auction-detail-vip.html"),
    7770002n,
    new Date("2026-09-08T12:00:00.000Z"),
  );

  it("parsuje pełną aukcję VIP bez warningów", () => {
    expect(result.parseError).toBeNull();
    expect(result.auction).not.toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("wszystkie flagi premium = true (Prey/Charm/Weekly/Twist/SoulWar/Primal/Transfer)", () => {
    const a = result.auction!;
    expect(a.hasSoulWar).toBe(true);
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
    expect(a.level).toBe(640);
    expect(a.vocation).toBe("Sorcerer");
    expect(a.vocationPromoted).toBe("Master Sorcerer");
    expect(a.bid).toBe(48000);
    expect(a.skillMagic).toBe(128);
    expect(a.charmPoints).toBe(9500);
    expect(a.imbuementsUnlocked).toBe(19);
    expect(a.imbuementsTotal).toBe(23);
    expect(a.questsCompleted).toBe(35);
    expect(a.gemsLesser).toBe(30);
    expect(a.gemsRegular).toBe(5);
    expect(a.gemsGreater).toBe(2);
    expect(a.goldTotal).toBe(12500000n);
    expect(a.tcInvested).toBe(15000);
    expect(a.storeOutfitsCount).toBe(8);
    expect(a.storeMountsCount).toBe(5);
    expect(a.storeItemsCount).toBe(42);
    expect(a.hirelingsCount).toBe(2);
  });
});

describe("T33 — auction-detail-malformed.html (error handling)", () => {
  it("parser NIE rzuca na uszkodzonym HTML — zwraca parseError + warnings", () => {
    const html = loadFixture("auction-detail-malformed.html");
    expect(() => parseAuctionDetail(html, 7770003n)).not.toThrow();
    const result = parseAuctionDetail(html, 7770003n);
    // Uszkodzony: nieznana vocation → Zod odrzuca całość (auction=null).
    expect(result.auction).toBeNull();
    expect(result.parseError).not.toBeNull();
    expect(result.parseError).toMatch(/vocation/i);
    expect(result.warnings.length).toBeGreaterThan(5);
  });

  it("warnings informują o konkretnych brakujących polach", () => {
    const result = parseAuctionDetail(loadFixture("auction-detail-malformed.html"), 7770003n);
    expect(result.warnings.some((w) => w.includes("identity.name"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("identity.level"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("Zod validation failed"))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. Snapshot JSON — pełny wynik dla kluczowej aukcji 2173376
// ──────────────────────────────────────────────────────────────────────────

describe("T33 — snapshot AuctionDetailResult (auction-detail-2173376)", () => {
  it("serializowany wynik parsowania jest stabilny (JSON snapshot)", () => {
    const html = loadFixture(detailFixtureFile(2173376));
    const result = parseAuctionDetail(
      html,
      2173376n,
      new Date("2026-09-08T12:00:00.000Z"),
    );
    expect(result.parseError).toBeNull();
    // Determinizm: dwa parsowania tego samego fixture dają identyczny JSON.
    const r2 = parseAuctionDetail(html, 2173376n, new Date("2026-09-08T12:00:00.000Z"));
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

  it("detail: zmiana bidu w kopii fixture 2173376 → parsowany bid się zmienia", () => {
    const html = loadFixture(detailFixtureFile(2173376));
    expect(countOccurrences(html, "25 501")).toBe(1);

    const mutated = html.replace("25 501", "33 000");
    const result = parseAuctionDetail(mutated, 2173376n);
    expect(result.auction).not.toBeNull();
    expect(result.auction?.bid).toBe(33000); // nie 25501 → brak hardcode
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

  it("detail: zmiana klasy skilli (symulacja redesignu) → skille wracają do domyślnych", () => {
    const vipHtml = loadFixture("auction-detail-vip.html");
    const baseline = parseAuctionDetail(vipHtml, 7770002n);
    expect(baseline.auction?.skillMagic).toBe(128);

    const mutated = vipHtml.replaceAll('<span class="Skill">', '<span class="SkillRenamed">');
    const result = parseAuctionDetail(mutated, 7770002n);
    expect(result.auction).not.toBeNull();
    expect(result.auction?.skillMagic).toBe(0); // default — ekstrakcja skilli padła
    expect(result.warnings.some((w) => w.includes("skills"))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 7. Matryca fixture × parser — każda kombinacja przechodzi
// ──────────────────────────────────────────────────────────────────────────

describe("T33 — matryca fixture × parser", () => {
  /** Oczekiwany rezultat per fixture detalu (R1: żaden nie crashuje). */
  const DETAIL_OUTCOMES: Readonly<Record<string, boolean>> = {
    "auction-detail-2173376.html": true,
    "auction-detail-empty.html": true,
    "auction-detail-en.html": true,
    "auction-detail-malformed.html": false, // oczekiwany parseError (auction=null)
    "auction-detail-new-player.html": true,
    "auction-detail-vip.html": true,
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
    expect(detailFiles.length).toBeGreaterThanOrEqual(6);

    for (const file of detailFiles) {
      const html = loadFixture(file);
      // ID: z nazwy pliku (auction-detail-2173376 → 2173376) lub deterministyczny.
      const idMatch = /auction-detail-(\d+)\.html/.exec(file);
      const parsedId = idMatch?.[1];
      const auctionId =
        parsedId !== undefined && parsedId !== "" ? BigInt(parsedId) : 999999999n;

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
    /https?:\/\/[^\s"']*(?:password|secret|token|cookie)[^\s"']*/i,
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
    const realNames = parseAuctionList(loadFixture(listFixtureFile(1)))
      .auctions.map((a) => a.characterName);
    const mirrorHtml = loadFixture(listFixtureFile(2));
    for (const name of realNames) {
      expect(mirrorHtml.includes(name), `mirror strony 2 nie może zawierać imienia '${name}' ze strony 1`).toBe(false);
    }
  });
});
