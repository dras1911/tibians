/**
 * Testy endpointów HTTP API Bazaar (task 38).
 *
 * Pokrycie:
 *   1. Walidacja Zod (filtry, paginacja, revalidate body) — bezpośrednio
 *   2. /api/auctions — walidacja query params, struktura odpowiedzi
 *   3. /api/auctions/[id] — walidacja ID (bigint), 400 vs 200
 *   4. /api/revalidate — 401 bez secret, 200 z secret
 *   5. /api/stats — struktura + nagłówki cache
 *   6. /api/auctions/ending — walidacja withinHours
 *   7. BigInt serialization (jsonSafe) — task 38 MUST NOT DO
 *   8. Rate limit — 60 req/min per IP (basic)
 *
 * Mockujemy DB layer (`@/lib/server/auctions`) żeby testy były szybkie
 * i nie wymagały PostgreSQL. Arch §15.2: testy jednostkowe > integracyjne.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ───────────────────────────────────────────────────────────────────────
// Mock DB layer PRZED importem testowanego kodu
// ───────────────────────────────────────────────────────────────────────

const mockListAuctions = vi.fn();
const mockListEndingSoon = vi.fn();
const mockGetAuctionById = vi.fn();
const mockGetMarketStats = vi.fn();
const mockRefreshFacetCounts = vi.fn();

vi.mock("@/lib/server/auctions", () => ({
  listAuctions: (...args: unknown[]) => mockListAuctions(...args),
  listEndingSoon: (...args: unknown[]) => mockListEndingSoon(...args),
  getAuctionById: (...args: unknown[]) => mockGetAuctionById(...args),
  getMarketStats: (...args: unknown[]) => mockGetMarketStats(...args),
  refreshFacetCounts: (...args: unknown[]) => mockRefreshFacetCounts(...args),
}));

// Mock next/cache (revalidatePath/Tag) — używamy spy
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// ───────────────────────────────────────────────────────────────────────
// Importy PO mockach
// ───────────────────────────────────────────────────────────────────────

import { revalidatePath, revalidateTag } from "next/cache";

import {
  auctionFiltersSchema,
  paginationSchema,
  endingSoonQuerySchema,
} from "@tibians/shared/auction";

// Testowane handlery
import { GET as auctionsGet } from "@/app/api/auctions/route";
import { GET as auctionDetailGet } from "@/app/api/auctions/[id]/route";
import { GET as endingSoonGet } from "@/app/api/auctions/ending/route";
import { GET as statsGet } from "@/app/api/stats/route";
import { POST as revalidatePost } from "@/app/api/revalidate/route";

// Helpery
import { jsonResponse, jsonSafe } from "@/lib/server/json";
import {
  checkRateLimit,
  _resetRateLimitStoreForTests,
  RATE_LIMIT_MAX_REQUESTS,
} from "@/lib/server/rate-limit";

// ───────────────────────────────────────────────────────────────────────
// Helpers — budowanie NextRequest
// ───────────────────────────────────────────────────────────────────────

function makeRequest(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
): Request {
  const { method = "GET", headers = {}, body } = options ?? {};
  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json", ...headers },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request(url, init);
}

/**
 * Minimalna fixture AuctionRow do testów listy.
 */
function fixtureAuctionRow(overrides: Record<string, unknown> = {}) {
  return {
    auctionId: 2173376n,
    characterName: "Migzen",
    level: 619,
    vocation: "Exalted Monk",
    vocationBase: "Monk",
    sex: "M" as const,
    worldId: 42,
    outfitId: null,
    bid: 25501,
    bidType: "current" as const,
    auctionStart: new Date("2026-09-08T10:00:00Z"),
    auctionEnd: new Date("2026-09-08T22:00:00Z"),
    status: "active" as const,
    finalPrice: null,
    skillMagic: 0,
    skillClub: 0,
    skillFist: 0,
    skillSword: 0,
    skillAxe: 0,
    skillDistance: 0,
    skillShielding: 0,
    skillFishing: 0,
    charmPoints: 0,
    charmPointsUnused: 0,
    minorCharmEchoes: 0,
    bossPoints: 0,
    imbuementsUnlocked: 0,
    imbuementsTotal: 23,
    questsCompleted: 0,
    questsTotal: 42,
    achievementPoints: 0,
    animusMasteries: 0,
    gemsLesser: 0,
    gemsRegular: 0,
    gemsGreater: 0,
    storeOutfitsCount: 0,
    storeMountsCount: 0,
    storeItemsCount: 0,
    hirelingsCount: 0,
    goldTotal: 0n,
    tcInvested: null,
    hasSoulWar: false,
    hasPrimalOrdeal: false,
    hasWorldTransfer: false,
    hasPreySlot: false,
    hasCharmExpansion: false,
    hasWeeklyTaskExp: false,
    hasTwistOfFate: false,
    blessingsActive: 0,
    estimatedValue: null,
    valueConfidence: null,
    pricePerLevel: null,
    firstSeenAt: new Date("2026-09-08T09:00:00Z"),
    lastSeenAt: new Date("2026-09-08T22:00:00Z"),
    scrapedAt: new Date("2026-09-08T22:01:00Z"),
    archivedAt: null,
    worldName: "Antica",
    worldRegion: "EU" as const,
    worldPvpType: "Optional PvP" as const,
    worldBattleye: "protected" as const,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────
// 1. Walidacja Zod (filtry, paginacja)
// ───────────────────────────────────────────────────────────────────────

describe("auctionFiltersSchema — walidacja Zod", () => {
  it("akceptuje pusty obiekt (same defaults)", () => {
    const result = auctionFiltersSchema.parse({});
    expect(result.status).toBe("active");
    expect(result.sortBy).toBe("auctionEnd");
    expect(result.sortDir).toBe("asc");
  });

  it("akceptuje poprawne vocation (Vocation enum)", () => {
    const result = auctionFiltersSchema.parse({ vocation: "Knight" });
    expect(result.vocation).toBe("Knight");
  });

  it("odrzuca vocation spoza enuma", () => {
    expect(() =>
      auctionFiltersSchema.parse({ vocation: "Wizard" }),
    ).toThrow();
  });

  it("koeruje string na number dla levelMin", () => {
    const result = auctionFiltersSchema.parse({ levelMin: "100" });
    expect(result.levelMin).toBe(100);
    expect(typeof result.levelMin).toBe("number");
  });

  it("odrzuca levelMin < 8", () => {
    expect(() => auctionFiltersSchema.parse({ levelMin: "7" })).toThrow();
  });

  it("odrzuca levelMin > 2500", () => {
    expect(() => auctionFiltersSchema.parse({ levelMin: "2501" })).toThrow();
  });

  it("odrzuca levelMin > levelMax", () => {
    expect(() =>
      auctionFiltersSchema.parse({ levelMin: "500", levelMax: "100" }),
    ).toThrow(/levelMin nie może być większy/);
  });

  it("koeruje i waliduje skillMin (0..250)", () => {
    const r = auctionFiltersSchema.parse({
      skillMin: "100",
      skillType: "sword",
    });
    expect(r.skillMin).toBe(100);
    expect(r.skillType).toBe("sword");
  });

  it("odrzuca skillType bez skillMin/skillMax", () => {
    expect(() =>
      auctionFiltersSchema.parse({ skillType: "sword" }),
    ).toThrow(/wymaga podania skillMin/);
  });

  it("transformuje hasSoulWar string 'true' → boolean", () => {
    const r = auctionFiltersSchema.parse({ hasSoulWar: "true" });
    expect(r.hasSoulWar).toBe(true);
  });

  it("transformuje hasSoulWar 'false' → false", () => {
    const r = auctionFiltersSchema.parse({ hasSoulWar: "false" });
    expect(r.hasSoulWar).toBe(false);
  });

  it("odrzuca nieznane pola (.strict())", () => {
    expect(() =>
      auctionFiltersSchema.parse({ unknownField: "x" }),
    ).toThrow();
  });
});

describe("paginationSchema — walidacja Zod", () => {
  it("akceptuje pusty obiekt (defaults: page=1, pageSize=25)", () => {
    const r = paginationSchema.parse({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(25);
  });

  it("odrzuca page < 1", () => {
    expect(() => paginationSchema.parse({ page: "0" })).toThrow();
  });

  it("odrzuca pageSize > 100 (DoS protection)", () => {
    expect(() => paginationSchema.parse({ pageSize: "101" })).toThrow();
  });

  it("odrzuca pageSize = 0", () => {
    expect(() => paginationSchema.parse({ pageSize: "0" })).toThrow();
  });

  it("koeruje string na number", () => {
    const r = paginationSchema.parse({ page: "3", pageSize: "50" });
    expect(r.page).toBe(3);
    expect(r.pageSize).toBe(50);
  });
});

describe("endingSoonQuerySchema — walidacja Zod", () => {
  it("default withinHours=1", () => {
    const r = endingSoonQuerySchema.parse({});
    expect(r.withinHours).toBe(1);
  });

  it("odrzuca withinHours > 24", () => {
    expect(() =>
      endingSoonQuerySchema.parse({ withinHours: "25" }),
    ).toThrow();
  });

  it("odrzuca withinHours <= 0", () => {
    expect(() => endingSoonQuerySchema.parse({ withinHours: "0" })).toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────
// 2. /api/auctions — lista z filtrami
// ───────────────────────────────────────────────────────────────────────

describe("GET /api/auctions", () => {
  beforeEach(() => {
    _resetRateLimitStoreForTests();
    mockListAuctions.mockReset();
  });

  it("zwraca 200 z poprawną strukturą odpowiedzi", async () => {
    const row = fixtureAuctionRow();
    mockListAuctions.mockResolvedValue({ rows: [row], total: 42 });

    const req = makeRequest("http://localhost:3000/api/auctions?page=1");
    const res = await auctionsGet(req as never);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      auctions: unknown[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
    expect(body.auctions).toHaveLength(1);
    expect(body.total).toBe(42);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(25);
    expect(body.totalPages).toBe(2); // ceil(42/25) = 2
  });

  it("serializuje bigint jako string w response JSON", async () => {
    const row = fixtureAuctionRow({
      auctionId: 2173376n,
      goldTotal: 25_000_000n,
    });
    mockListAuctions.mockResolvedValue({ rows: [row], total: 1 });

    const res = await auctionsGet(
      makeRequest("http://localhost/api/auctions") as never,
    );
    const raw = await res.text();

    // Weryfikujemy że NIE ma `TypeError: Do not know how to serialize a BigInt`
    expect(raw).not.toContain("TypeError");
    // auctionId powinno być zserializowane jako string "2173376"
    expect(raw).toContain('"auctionId":"2173376"');
    // goldTotal też powinno być stringiem
    expect(raw).toContain('"goldTotal":"25000000"');
  });

  it("zwraca 400 dla niepoprawnego query param", async () => {
    const req = makeRequest("http://localhost/api/auctions?levelMin=invalid");
    const res = await auctionsGet(req as never);
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string; issues?: unknown[] };
    expect(body.error).toBe("BadRequest");
    expect(body.issues).toBeDefined();
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("przekazuje sparsowane filtry do DB helpera", async () => {
    mockListAuctions.mockResolvedValue({ rows: [], total: 0 });
    const req = makeRequest(
      "http://localhost/api/auctions?vocation=Knight&levelMin=300&sortBy=bid&sortDir=desc",
    );
    await auctionsGet(req as never);

    expect(mockListAuctions).toHaveBeenCalledTimes(1);
    const [filters, pagination] = mockListAuctions.mock.calls[0]!;
    expect(filters.vocation).toBe("Knight");
    expect(filters.levelMin).toBe(300);
    expect(filters.sortBy).toBe("bid");
    expect(filters.sortDir).toBe("desc");
    expect(pagination.page).toBe(1);
  });

  it("ustawia nagłówki Cache-Tag i Cache-Control", async () => {
    mockListAuctions.mockResolvedValue({ rows: [], total: 0 });
    const res = await auctionsGet(
      makeRequest("http://localhost/api/auctions") as never,
    );
    expect(res.headers.get("Cache-Tag")).toBe("auctions");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage");
  });

  it("ustawia nagłówki X-RateLimit-*", async () => {
    mockListAuctions.mockResolvedValue({ rows: [], total: 0 });
    const res = await auctionsGet(
      makeRequest("http://localhost/api/auctions") as never,
    );
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
  });
});

// ───────────────────────────────────────────────────────────────────────
// 3. /api/auctions/[id] — detail
// ───────────────────────────────────────────────────────────────────────

describe("GET /api/auctions/[id]", () => {
  beforeEach(() => {
    _resetRateLimitStoreForTests();
    mockGetAuctionById.mockReset();
  });

  it("zwraca 200 dla poprawnego bigint ID", async () => {
    mockGetAuctionById.mockResolvedValue(
      fixtureAuctionRow({ auctionId: 2173376n }),
    );
    const req = makeRequest("http://localhost/api/auctions/2173376");
    const res = await auctionDetailGet(req as never, {
      params: Promise.resolve({ id: "2173376" }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { auction: { auctionId: string } };
    expect(body.auction).not.toBeNull();
    expect(body.auction.auctionId).toBe("2173376"); // bigint → string
    expect(res.headers.get("Cache-Tag")).toBe("auction-2173376");
  });

  it("zwraca 200 z auction=null dla nieistniejącego ID", async () => {
    mockGetAuctionById.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/auctions/999999999999999");
    const res = await auctionDetailGet(req as never, {
      params: Promise.resolve({ id: "999999999999999" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { auction: unknown };
    expect(body.auction).toBeNull();
  });

  it("zwraca 400 dla ID = 0 (positive validation)", async () => {
    const req = makeRequest("http://localhost/api/auctions/0");
    const res = await auctionDetailGet(req as never, {
      params: Promise.resolve({ id: "0" }),
    });
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string; path: string };
    expect(body.error).toBe("BadRequest");
    expect(body.path).toBe("id");
  });

  it("zwraca 400 dla ujemnego ID", async () => {
    const req = makeRequest("http://localhost/api/auctions/-1");
    const res = await auctionDetailGet(req as never, {
      params: Promise.resolve({ id: "-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("zwraca 400 dla nie-liczbowego ID", async () => {
    const req = makeRequest("http://localhost/api/auctions/not-a-number");
    const res = await auctionDetailGet(req as never, {
      params: Promise.resolve({ id: "not-a-number" }),
    });
    expect(res.status).toBe(400);
  });

  it("obsługuje bigint > Number.MAX_SAFE_INTEGER", async () => {
    const hugeId = BigInt(Number.MAX_SAFE_INTEGER) + 100n;
    mockGetAuctionById.mockResolvedValue(
      fixtureAuctionRow({ auctionId: hugeId }),
    );
    const idStr = hugeId.toString();
    const req = makeRequest(`http://localhost/api/auctions/${idStr}`);
    const res = await auctionDetailGet(req as never, {
      params: Promise.resolve({ id: idStr }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { auction: { auctionId: string } };
    expect(body.auction.auctionId).toBe(idStr);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 4. /api/revalidate — webhook
// ───────────────────────────────────────────────────────────────────────

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    _resetRateLimitStoreForTests();
    vi.mocked(revalidatePath).mockClear();
    vi.mocked(revalidateTag).mockClear();
    mockRefreshFacetCounts.mockReset();
    process.env.REVALIDATE_SECRET = "test-secret-12345";
  });

  afterEach(() => {
    delete process.env.REVALIDATE_SECRET;
  });

  it("zwraca 401 bez secret header", async () => {
    const req = makeRequest("http://localhost/api/revalidate", {
      method: "POST",
      body: { tags: ["auctions"] },
    });
    const res = await revalidatePost(req as never);
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("zwraca 401 dla błędnego secret", async () => {
    const req = makeRequest("http://localhost/api/revalidate", {
      method: "POST",
      headers: { "x-revalidate-secret": "wrong-secret" },
      body: { tags: ["auctions"] },
    });
    const res = await revalidatePost(req as never);
    expect(res.status).toBe(401);
  });

  it("zwraca 200 + revaliduje tag dla poprawnego secret", async () => {
    mockRefreshFacetCounts.mockResolvedValue(undefined);

    const req = makeRequest("http://localhost/api/revalidate", {
      method: "POST",
      headers: { "x-revalidate-secret": "test-secret-12345" },
      body: { tags: ["auctions"] },
    });
    const res = await revalidatePost(req as never);
    expect(res.status).toBe(200);

    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith("auctions");
    expect(mockRefreshFacetCounts).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as {
      revalidated: number;
      mvRefreshed: boolean;
    };
    expect(body.revalidated).toBe(1);
    expect(body.mvRefreshed).toBe(true);
  });

  it("nie odświeża MV gdy tag nie zawiera 'auctions'", async () => {
    const req = makeRequest("http://localhost/api/revalidate", {
      method: "POST",
      headers: { "x-revalidate-secret": "test-secret-12345" },
      body: { tags: ["stats"] },
    });
    const res = await revalidatePost(req as never);
    expect(res.status).toBe(200);

    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith("stats");
    expect(mockRefreshFacetCounts).not.toHaveBeenCalled();
    const body = (await res.json()) as { mvRefreshed: boolean };
    expect(body.mvRefreshed).toBe(false);
  });

  it("odświeża MV jawnie przez ?refreshMv=true", async () => {
    mockRefreshFacetCounts.mockResolvedValue(undefined);
    const req = makeRequest("http://localhost/api/revalidate?refreshMv=true", {
      method: "POST",
      headers: { "x-revalidate-secret": "test-secret-12345" },
      body: { paths: ["/bazaar"] },
    });
    const res = await revalidatePost(req as never);
    expect(res.status).toBe(200);

    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/bazaar");
    expect(mockRefreshFacetCounts).toHaveBeenCalledTimes(1);
  });

  it("zwraca 400 dla niepoprawnego body (brak paths i tags)", async () => {
    const req = makeRequest("http://localhost/api/revalidate", {
      method: "POST",
      headers: { "x-revalidate-secret": "test-secret-12345" },
      body: {},
    });
    const res = await revalidatePost(req as never);
    expect(res.status).toBe(400);
  });

  it("odrzuca tagi z niedozwolonymi znakami", async () => {
    const req = makeRequest("http://localhost/api/revalidate", {
      method: "POST",
      headers: { "x-revalidate-secret": "test-secret-12345" },
      body: { tags: ["bad tag with spaces!"] },
    });
    const res = await revalidatePost(req as never);
    expect(res.status).toBe(400);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 5. /api/stats
// ───────────────────────────────────────────────────────────────────────

describe("GET /api/stats", () => {
  beforeEach(() => {
    _resetRateLimitStoreForTests();
    mockGetMarketStats.mockReset();
  });

  it("zwraca 200 + pełną strukturę MarketStats", async () => {
    mockGetMarketStats.mockResolvedValue({
      totalActive: 2543,
      totalFinished: 12340,
      avgLevel: 487,
      topVocations: [
        { vocation: "Knight", count: 812 },
        { vocation: "Paladin", count: 543 },
      ],
      topWorlds: [
        { world: "Antica", count: 234 },
        { world: "Secura", count: 198 },
      ],
    });

    const req = makeRequest("http://localhost/api/stats");
    const res = await statsGet(req as never);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      totalActive: number;
      totalFinished: number;
      avgLevel: number;
      topVocations: { vocation: string; count: number }[];
      topWorlds: { world: string; count: number }[];
    };
    expect(body.totalActive).toBe(2543);
    expect(body.avgLevel).toBe(487);
    expect(body.topVocations).toHaveLength(2);
    expect(body.topWorlds).toHaveLength(2);
  });

  it("ustawia Cache-Control z s-maxage=60 (arch §8.2)", async () => {
    mockGetMarketStats.mockResolvedValue({
      totalActive: 0,
      totalFinished: 0,
      avgLevel: null,
      topVocations: [],
      topWorlds: [],
    });
    const res = await statsGet(
      makeRequest("http://localhost/api/stats") as never,
    );
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=60");
    expect(res.headers.get("Cache-Tag")).toBe("stats");
  });
});

// ───────────────────────────────────────────────────────────────────────
// 6. /api/auctions/ending
// ───────────────────────────────────────────────────────────────────────

describe("GET /api/auctions/ending", () => {
  beforeEach(() => {
    _resetRateLimitStoreForTests();
    mockListEndingSoon.mockReset();
  });

  it("zwraca 200 + listę ending soon (default withinHours=1)", async () => {
    mockListEndingSoon.mockResolvedValue([
      fixtureAuctionRow({ auctionId: 1n, characterName: "Auction1" }),
      fixtureAuctionRow({ auctionId: 2n, characterName: "Auction2" }),
    ]);

    const req = makeRequest("http://localhost/api/auctions/ending");
    const res = await endingSoonGet(req as never);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      auctions: unknown[];
      withinHours: number;
      now: string;
    };
    expect(body.auctions).toHaveLength(2);
    expect(body.withinHours).toBe(1);
    expect(typeof body.now).toBe("string");
    expect(mockListEndingSoon).toHaveBeenCalledWith(1);
  });

  it("honoruje withinHours custom", async () => {
    mockListEndingSoon.mockResolvedValue([]);
    const req = makeRequest(
      "http://localhost/api/auctions/ending?withinHours=4",
    );
    await endingSoonGet(req as never);
    expect(mockListEndingSoon).toHaveBeenCalledWith(4);
  });

  it("zwraca 400 dla withinHours > 24", async () => {
    const req = makeRequest(
      "http://localhost/api/auctions/ending?withinHours=999",
    );
    const res = await endingSoonGet(req as never);
    expect(res.status).toBe(400);
  });

  it("ustawia Cache-Control: no-store (SSE klienci)", async () => {
    mockListEndingSoon.mockResolvedValue([]);
    const res = await endingSoonGet(
      makeRequest("http://localhost/api/auctions/ending") as never,
    );
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});

// ───────────────────────────────────────────────────────────────────────
// 7. jsonSafe — BigInt serialization (MUST NOT serialize bigint directly)
// ───────────────────────────────────────────────────────────────────────

describe("jsonSafe — BigInt serialization", () => {
  it("konwertuje BigInt na string decimal", () => {
    expect(jsonSafe(2173376n)).toBe("2173376");
    expect(jsonSafe(BigInt(Number.MAX_SAFE_INTEGER) + 100n)).toBe(
      (BigInt(Number.MAX_SAFE_INTEGER) + 100n).toString(),
    );
  });

  it("konwertuje Date na ISO string", () => {
    const d = new Date("2026-09-08T22:00:00Z");
    expect(jsonSafe(d)).toBe("2026-09-08T22:00:00.000Z");
  });

  it("null → null, undefined → null", () => {
    expect(jsonSafe(null)).toBe(null);
    expect(jsonSafe(undefined)).toBe(null);
  });

  it("rekurencyjnie przetwarza zagnieżdżone obiekty", () => {
    const input = {
      auctionId: 2173376n,
      goldTotal: 25_000_000n,
      items: [{ itemId: 3079, value: 100n }],
    };
    const result = jsonSafe(input) as {
      auctionId: string;
      goldTotal: string;
      items: { value: string }[];
    };
    expect(result.auctionId).toBe("2173376");
    expect(result.goldTotal).toBe("25000000");
    expect(result.items[0]!.value).toBe("100");
  });

  it("chroni przed cyklami (WeakSet)", () => {
    const a: Record<string, unknown> = {};
    a.self = a; // cykl
    expect(() => jsonSafe(a)).not.toThrow();
  });

  it("zamienia NaN/Infinity na null", () => {
    expect(jsonSafe(NaN)).toBe(null);
    expect(jsonSafe(Infinity)).toBe(null);
  });

  it("jsonResponse ustawia application/json", () => {
    const res = jsonResponse({ id: 2173376n });
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Content-Type")).toContain("charset=utf-8");
  });

  it("JSON.stringify(jsonSafe(...)) NIE rzuca TypeError na BigInt", () => {
    expect(() =>
      JSON.stringify(jsonSafe({ auctionId: 2173376n })),
    ).not.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────
// 8. Rate limit — 60 req/min per IP
// ───────────────────────────────────────────────────────────────────────

describe("checkRateLimit — basic rate limit 60/min/IP", () => {
  beforeEach(() => {
    _resetRateLimitStoreForTests();
  });

  it("przepuszcza requesty poniżej limitu", () => {
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit("1.2.3.4", 1000 + i * 100);
      expect(r.allowed).toBe(true);
    }
  });

  it("blokuje requesty powyżej limitu", () => {
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      checkRateLimit("1.2.3.4", 1000 + i * 10);
    }
    const r = checkRateLimit(
      "1.2.3.4",
      1000 + RATE_LIMIT_MAX_REQUESTS * 10 + 100,
    );
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("resetuje się po upływie okna", () => {
    const baseTime = 100_000;
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      checkRateLimit("1.2.3.4", baseTime + i * 10);
    }
    // Po oknie (>60s później) — powinien znowu przepuścić
    const r = checkRateLimit(
      "1.2.3.4",
      baseTime + 60_001 + RATE_LIMIT_MAX_REQUESTS * 10,
    );
    expect(r.allowed).toBe(true);
  });

  it("rozróżnia różne IP", () => {
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      checkRateLimit("1.2.3.4", 1000 + i * 10);
    }
    // Inne IP — niezależne
    const r = checkRateLimit("5.6.7.8", 1000 + 10);
    expect(r.allowed).toBe(true);
  });

  it("zwraca nagłówki rateLimitHeaders", () => {
    const r = checkRateLimit("1.2.3.4", 1000);
    const headers = new Headers();
    Object.entries({
      "X-RateLimit-Limit": String(r.limit),
      "X-RateLimit-Remaining": String(r.remaining),
      "X-RateLimit-Reset": String(Math.floor(r.resetAt / 1000)),
    }).forEach(([k, v]) => headers.set(k, v));
    expect(headers.get("X-RateLimit-Limit")).toBe("60");
    expect(headers.get("X-RateLimit-Remaining")).toBe("59");
  });
});
