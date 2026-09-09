/**
 * Testy reference scrapera (items/outfits/mounts) — task 32.
 *
 * Filozofia (jak w `http-client.test.ts`): HTTP jest wstrzykiwane przez
 * `fetchImpl` (mock), więc testy są deterministyczne i nie dotykają sieci.
 *
 * Pokrycie (8 testów):
 *   1. scanItems — katalog ids 1-10, wszystkie HEAD 200 → 10 zwalidowanych itemów
 *   2. scanItems — mieszane 200/404 → tylko istniejące id
 *   3. scanOutfits — zakres 1-5 × addon 0-3 → 4 HEAD per outfit (20 requestów)
 *   4. scanMounts — zakres 1-10 z podzbiorem 200 → zwalidowane mounty
 *   5. parseWikiHeading — infobox EN (nagłówek + encje HTML)
 *   6. enrichItemNames — fallback PL wiki → namePl uzupełnione
 *   7. scrapeReferenceData — TibiaData probe 404 → fallback do skanu static
 *   8. scrapeReferenceData — TibiaData primary zwraca itemy → użyte (R11: oszczędzamy)
 */
import { describe, expect, it } from "vitest";

import {
  ItemSchema,
  OutfitSchema,
  MountSchema,
  ReferenceDataResultSchema,
  enrichItemNames,
  itemImageUrl,
  mountImageUrl,
  outfitImageUrl,
  parseWikiHeading,
  scanItems,
  scanMounts,
  scanOutfits,
  scrapeReferenceData,
  wikiPageUrl,
  type FetchLike,
  type ItemSeed,
} from "./reference-data.js";

// ──────────────────────────────────────────────────────────────────────────
// Pomocnicze: mock fetch + fixture HTML
// ──────────────────────────────────────────────────────────────────────────

interface MockRoute {
  status?: number;
  body?: string;
}

function makeFetchMock(routes: Record<string, MockRoute>): {
  impl: FetchLike;
  calls: Array<{ method: string; url: string }>;
} {
  const calls: Array<{ method: string; url: string }> = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ method: init?.method ?? "GET", url });
    const route = routes[url];
    if (!route) {
      return { ok: false, status: 404, text: async () => "", json: async () => null };
    }
    const status = route.status ?? 200;
    const body = route.body ?? "";
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      json: async () => {
        try {
          return JSON.parse(body);
        } catch {
          return null;
        }
      },
    };
  };
  return { impl, calls };
}

/** Katalog testowy: ids 1-10 z nazwami "Item N". */
function testSeeds(count = 10): ItemSeed[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Item ${i + 1}`,
    category: "other" as const,
  }));
}

const EN_WIKI_HTML =
  '<html><body><h1 id="firstHeading" class="firstHeading">Gold Coin</h1>' +
  '<aside class="portable-infobox"><h2>Gold Coin</h2></aside></body></html>';

const PL_WIKI_HTML =
  '<html><body><h1 id="firstHeading" class="firstHeading">Złota Moneta</h1>' +
  '<aside class="portable-infobox"><h2>Złota Moneta</h2></aside></body></html>';

// ──────────────────────────────────────────────────────────────────────────
// 1. Items: katalog ids 1-10 → wszystkie validated
// ──────────────────────────────────────────────────────────────────────────

describe("scanItems", () => {
  it("waliduje wszystkie itemy z katalogu (HEAD 200 dla ids 1-10)", async () => {
    const seeds = testSeeds(10);
    const routes: Record<string, MockRoute> = {};
    for (const seed of seeds) routes[itemImageUrl(seed.id)] = { status: 200 };
    const { impl, calls } = makeFetchMock(routes);

    const items = await scanItems(seeds, { fetchImpl: impl, maxConcurrent: 10, delayMs: 0 });

    expect(items).toHaveLength(10);
    for (const item of items) {
      expect(ItemSchema.safeParse(item).success).toBe(true);
      expect(item.imageUrl).toBe(itemImageUrl(item.id));
      expect(item.name).toBe(`Item ${item.id}`);
    }
    // 10 HEAD requestów — po jednym na item.
    expect(calls).toHaveLength(10);
    expect(calls.every((c) => c.method === "HEAD")).toBe(true);
  });

  it("pomija itemy, których obraz nie istnieje (404)", async () => {
    const seeds = testSeeds(10);
    const routes: Record<string, MockRoute> = {};
    for (const seed of seeds) {
      // Nieparzyste id istnieją, parzyste nie.
      routes[itemImageUrl(seed.id)] = { status: seed.id % 2 === 1 ? 200 : 404 };
    }
    const { impl } = makeFetchMock(routes);

    const items = await scanItems(seeds, { fetchImpl: impl, maxConcurrent: 10, delayMs: 0 });

    expect(items).toHaveLength(5);
    expect(items.map((i) => i.id)).toEqual([1, 3, 5, 7, 9]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Outfits: zakres 1-5 × addon 0-3 (4 URL per outfit)
// ──────────────────────────────────────────────────────────────────────────

describe("scanOutfits", () => {
  it("probe'uje addony 0-3 dla każdego outfitu z zakresu 1-5", async () => {
    const routes: Record<string, MockRoute> = {};
    for (let id = 1; id <= 5; id += 1) {
      for (let addon = 0; addon <= 3; addon += 1) {
        routes[outfitImageUrl(id, addon)] = { status: 200 };
      }
    }
    const { impl, calls } = makeFetchMock(routes);

    const outfits = await scanOutfits(
      { start: 1, end: 5 },
      { fetchImpl: impl, maxConcurrent: 10, delayMs: 0 },
    );

    // 5 outfitów (baza addon 0 istnieje dla każdego).
    expect(outfits).toHaveLength(5);
    for (const outfit of outfits) {
      expect(OutfitSchema.safeParse(outfit).success).toBe(true);
      expect(outfit.imageUrl).toBe(outfitImageUrl(outfit.id, 0));
    }
    // 4 URL-e per outfit = 20 HEAD requestów.
    expect(calls).toHaveLength(20);
    for (let id = 1; id <= 5; id += 1) {
      for (let addon = 0; addon <= 3; addon += 1) {
        expect(calls.some((c) => c.url === outfitImageUrl(id, addon))).toBe(true);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Mounts: zakres 1-10 → validated
// ──────────────────────────────────────────────────────────────────────────

describe("scanMounts", () => {
  it("waliduje mounty z zakresu 1-10 (podzbiór istniejących)", async () => {
    const routes: Record<string, MockRoute> = {};
    for (let id = 1; id <= 10; id += 1) {
      routes[mountImageUrl(id)] = { status: id % 2 === 1 ? 200 : 404 };
    }
    const { impl } = makeFetchMock(routes);

    const mounts = await scanMounts(
      { start: 1, end: 10 },
      { fetchImpl: impl, maxConcurrent: 10, delayMs: 0 },
    );

    expect(mounts).toHaveLength(5);
    for (const mount of mounts) {
      expect(MountSchema.safeParse(mount).success).toBe(true);
      expect(mount.imageUrl).toBe(mountImageUrl(mount.id));
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5-6. TibiaWiki fallback: nazwy PL/EN
// ──────────────────────────────────────────────────────────────────────────

describe("TibiaWiki fallback", () => {
  it("parseWikiHeading wyciąga nazwę EN z infoboxu (z encjami HTML)", () => {
    const html =
      '<html><body><h1 id="firstHeading" class="firstHeading">Steel &amp; Iron Helmet</h1></body></html>';
    expect(parseWikiHeading(EN_WIKI_HTML)).toBe("Gold Coin");
    expect(parseWikiHeading(html)).toBe("Steel & Iron Helmet");
    expect(parseWikiHeading("<html><body><p>no heading</p></body></html>")).toBeNull();
  });

  it("enrichItemNames uzupełnia namePl z PL wiki", async () => {
    const item = ItemSchema.parse({
      id: 3031,
      name: "Gold Coin",
      namePl: null,
      category: "valuable",
      marketPrice: null,
      tcValue: null,
      isStoreItem: false,
      isRare: false,
      imageUrl: itemImageUrl(3031),
    });
    const { impl, calls } = makeFetchMock({
      [wikiPageUrl("Gold Coin", "pl")]: { status: 200, body: PL_WIKI_HTML },
    });

    const enriched = await enrichItemNames(item, { fetchImpl: impl });

    expect(enriched.namePl).toBe("Złota Moneta");
    expect(enriched.name).toBe("Gold Coin"); // EN niezmienione (już znane)
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(wikiPageUrl("Gold Coin", "pl"));
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 7-8. Orchestration: TibiaData primary → fallback static
// ──────────────────────────────────────────────────────────────────────────

describe("scrapeReferenceData", () => {
  it("przy braku /v4/items (404) przechodzi do skanu static", async () => {
    const seeds = testSeeds(3);
    const routes: Record<string, MockRoute> = {
      "http://localhost:8080/v4/items": { status: 404 },
    };
    for (const seed of seeds) routes[itemImageUrl(seed.id)] = { status: 200 };
    for (let id = 1; id <= 2; id += 1) {
      for (let addon = 0; addon <= 1; addon += 1) {
        routes[outfitImageUrl(id, addon)] = { status: 200 };
      }
    }
    for (let id = 1; id <= 3; id += 1) routes[mountImageUrl(id)] = { status: 200 };
    const { impl } = makeFetchMock(routes);

    const { result, stats } = await scrapeReferenceData({
      fetchImpl: impl,
      maxConcurrent: 10,
      delayMs: 0,
      itemSeeds: seeds,
      outfitRange: { start: 1, end: 2 },
      outfitAddons: [0, 1],
      mountRange: { start: 1, end: 3 },
      tibiaDataBaseUrl: "http://localhost:8080",
    });

    expect(ReferenceDataResultSchema.safeParse(result).success).toBe(true);
    expect(result.items).toHaveLength(3);
    expect(result.outfits).toHaveLength(2);
    expect(result.mounts).toHaveLength(3);
    expect(stats.tibiaDataUsed).toBe(false);
    expect(stats.itemsFound).toBe(3);
    expect(stats.outfitsScanned).toBe(4); // 2 id × 2 addony
    expect(stats.mountsScanned).toBe(3);
  });

  it("gdy TibiaData zwraca itemy — używa ich (R11: zero requestów do static)", async () => {
    const seeds = testSeeds(3);
    const routes: Record<string, MockRoute> = {
      "http://localhost:8080/v4/items": {
        status: 200,
        body: JSON.stringify({ items: [{ id: 3031, name: "Gold Coin" }] }),
      },
    };
    // Brak tras dla static objects → gdyby scraper tam poszedł, dostałby 404.
    const { impl, calls } = makeFetchMock(routes);

    const { result, stats } = await scrapeReferenceData({
      fetchImpl: impl,
      maxConcurrent: 10,
      delayMs: 0,
      itemSeeds: seeds,
      outfitRange: { start: 1, end: 1 },
      outfitAddons: [0],
      mountRange: { start: 1, end: 1 },
      tibiaDataBaseUrl: "http://localhost:8080",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(3031);
    expect(result.items[0]?.name).toBe("Gold Coin");
    expect(stats.tibiaDataUsed).toBe(true);
    // Żaden request do static.tibia.com objects/.
    expect(calls.some((c) => c.url.includes("/objects/"))).toBe(false);
  });
});