/**
 * Reference scraper: items / outfits / mounts.
 *
 * Źródła (architektura `.omo/plans/tibia-tools-portal-architecture.md`):
 *   - §2.4 — ikony przedmiotów/outfitów/mountów z `static.tibia.com/images/charactertrade`
 *   - §7.2 — schema DB `items` / `outfits` / `mounts` (kolumny odwzorowane w Zod poniżej)
 *   - §18.1 — TibiaData NIE pokrywa items/outfits/mounts (zweryfikowane w swagger v4.10.0:
 *     brak endpointu `/v4/items`) → własny scraper jest źródłem prawdy; TibiaData probe
 *     zostaje jako best-effort na przyszłość (gdyby endpoint się pojawił).
 *   - §8.3 / R2 — rate limiting: max 2 concurrent, 500 ms delay (szacunek dla tibia.com/wiki)
 *
 * Pipeline `scrapeReferenceData()`:
 *   1. (best-effort) TibiaData `/v4/items` — probe; błąd/404 → null → fallback
 *   2. Items: HEAD na `objects/{id}.gif` dla katalogu popularnych itemów (hardcoded)
 *   3. Outfits: HEAD na `outfits/{id}_{addon}.gif` dla zakresu id × addon 0-3
 *   4. Mounts: HEAD na `mounts/{id}.gif` dla zakresu id
 *   5. TibiaWiki fallback: nazwy PL/EN z infoboxu (`tibia.fandom.com/{lang}/wiki/{Name}`)
 *   6. Walidacja Zod (ItemSchema / OutfitSchema / MountSchema) — kontrakt z DB §7.2
 *
 * Wszystkie funkcje przyjmują wstrzykiwalny `fetchImpl` (testy mockują HTTP;
 * produkcja używa globalnego `fetch` = undici, zgodnie z §3.1).
 */

import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────
// URL-e statyczne (arch §2.4 — ikony z CDN CipSoft)
// ──────────────────────────────────────────────────────────────────────────

export const STATIC_TIBIA_CDN = "https://static.tibia.com/images/charactertrade";

/** URL ikony przedmiotu: `objects/{id}.gif`. */
export function itemImageUrl(id: number): string {
  return `${STATIC_TIBIA_CDN}/objects/${id}.gif`;
}

/** URL ikony outfitu: `outfits/{id}_{addon}.gif` (addon 0-3). */
export function outfitImageUrl(id: number, addon = 0): string {
  return `${STATIC_TIBIA_CDN}/outfits/${id}_${addon}.gif`;
}

/** URL ikony mounta: `mounts/{id}.gif`. */
export function mountImageUrl(id: number): string {
  return `${STATIC_TIBIA_CDN}/mounts/${id}.gif`;
}

// ──────────────────────────────────────────────────────────────────────────
// Abstrakcja HTTP (wstrzykiwalna — testy mockują, produkcja = globalny fetch)
// ──────────────────────────────────────────────────────────────────────────

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal | undefined;
  },
) => Promise<FetchLikeResponse>;

/** Domyślny User-Agent dla requestów do CDN / wiki. */
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36";

// ──────────────────────────────────────────────────────────────────────────
// Zod schemas — odwzorowanie kolumn z arch §7.2 (items/outfits/mounts)
// ──────────────────────────────────────────────────────────────────────────

export const itemCategorySchema = z.enum([
  "weapon",
  "armor",
  "store",
  "quest",
  "rune",
  "consumable",
  "container",
  "decoration",
  "valuable",
  "other",
]);
export type ItemCategory = z.infer<typeof itemCategorySchema>;

/** `items` z §7.2: id = client_id, name/name_pl, category, market_price, tc_value, flagi, image_url. */
export const ItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  namePl: z.string().min(1).nullable(),
  category: itemCategorySchema,
  marketPrice: z.number().int().nonnegative().nullable(),
  tcValue: z.number().int().nonnegative().nullable(),
  isStoreItem: z.boolean(),
  isRare: z.boolean(),
  imageUrl: z.string().url(),
});
export type Item = z.infer<typeof ItemSchema>;

/** `outfits` z §7.2: id = outfit_id, name/name_pl, flagi, image_url. */
export const OutfitSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  namePl: z.string().min(1).nullable(),
  isStore: z.boolean(),
  isRare: z.boolean(),
  imageUrl: z.string().url(),
});
export type Outfit = z.infer<typeof OutfitSchema>;

/** `mounts` z §7.2: id = mount_id, name/name_pl, flagi, image_url. */
export const MountSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  namePl: z.string().min(1).nullable(),
  isStore: z.boolean(),
  isRare: z.boolean(),
  imageUrl: z.string().url(),
});
export type Mount = z.infer<typeof MountSchema>;

/** Kontrakt wyjściowy scrapera — walidowany przed zwróceniem. */
export const ReferenceDataResultSchema = z.object({
  items: z.array(ItemSchema),
  outfits: z.array(OutfitSchema),
  mounts: z.array(MountSchema),
});
export type ReferenceDataResult = z.infer<typeof ReferenceDataResultSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Katalog popularnych itemów (hardcoded seed)
// ──────────────────────────────────────────────────────────────────────────
//
// UWAGA: to katalog STARTOWY — rozszerzany przez:
//   - TibiaWiki fallback (nazwy PL/EN),
//   - dane z aukcji Bazaar (task 31 — parser detalu zna id+name itemów z ekwipunku),
//   - ręczne uzupełnienia w przyszłych seedach.
// Id = client_id z Tibii (stabilne między wersjami klienta, §7.2).
// Wpisy z nieistniejącym id są odsiewane przez HEAD validation (nie produkują wierszy).

export interface ItemSeed {
  id: number;
  name: string;
  namePl?: string | null;
  category: ItemCategory;
  marketPrice?: number | null;
  tcValue?: number | null;
  isStoreItem?: boolean;
  isRare?: boolean;
}

export const POPULAR_ITEMS: readonly ItemSeed[] = [
  // Waluta (valuable) — fundament wyceny
  { id: 3031, name: "Gold Coin", namePl: "Złota Moneta", category: "valuable" },
  { id: 3035, name: "Platinum Coin", namePl: "Platynowa Moneta", category: "valuable" },
  { id: 3043, name: "Crystal Coin", namePl: "Kryształowa Moneta", category: "valuable" },
  // Pancerze (armor)
  { id: 3049, name: "Plate Armor", namePl: "Płytowa Zbroja", category: "armor" },
  { id: 3052, name: "Chain Armor", namePl: "Kolczuga", category: "armor" },
  { id: 3053, name: "Steel Helmet", namePl: "Stalowy Hełm", category: "armor" },
];

// ──────────────────────────────────────────────────────────────────────────
// Rate-limited pool (R2: max 2 concurrent, 500 ms delay między startami)
// ──────────────────────────────────────────────────────────────────────────

export interface PoolOptions {
  maxConcurrent: number;
  delayMs: number;
  signal?: AbortSignal | undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wykonaj `worker` dla każdego elementu z ograniczeniem concurrency i
 * minimalnym odstępem między startami requestów (semantyka jak w T29
 * `http-client.ts` — per-host limiter). Wyniki w kolejności wejściowej.
 */
async function mapPool<T, R>(
  items: readonly T[],
  opts: PoolOptions,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let lastStart = 0;

  const run = async (): Promise<void> => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      const item = items[idx];
      if (item === undefined) return;
      // Minimalny odstęp między startami (delayMs) — globalny dla całego poolu.
      const now = Date.now();
      const wait = Math.max(0, opts.delayMs - (now - lastStart));
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();
      results[idx] = await worker(item);
    }
  };

  const workers = Math.min(opts.maxConcurrent, items.length);
  await Promise.all(Array.from({ length: workers }, () => run()));
  return results;
}

// ──────────────────────────────────────────────────────────────────────────
// HEAD validation na static.tibia.com
// ──────────────────────────────────────────────────────────────────────────

/**
 * Sprawdź czy zasób istnieje: HEAD → 2xx = istnieje.
 * Fallback na GET z `Range: bytes=0-0` gdy CDN nie wspiera HEAD (403/405/501) —
 * akceptujemy 200/206 (nie pobieramy całego GIF-a).
 */
export async function headExists(
  url: string,
  opts: { fetchImpl: FetchLike; signal?: AbortSignal | undefined },
): Promise<boolean> {
  const res = await opts.fetchImpl(url, {
    method: "HEAD",
    signal: opts.signal,
    headers: { "User-Agent": DEFAULT_UA },
  });
  if (res.ok) return true;
  if (res.status === 403 || res.status === 405 || res.status === 501) {
    const get = await opts.fetchImpl(url, {
      method: "GET",
      signal: opts.signal,
      headers: { "User-Agent": DEFAULT_UA, Range: "bytes=0-0" },
    });
    return get.ok;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────
// Scan: items / outfits / mounts
// ──────────────────────────────────────────────────────────────────────────

export interface ReferenceScanOptions {
  /** Wstrzykiwalny fetch (testy). Domyślnie: globalny `fetch`. */
  fetchImpl?: FetchLike;
  /** Max równoległych requestów (R2: 2). */
  maxConcurrent?: number;
  /** Minimalny odstęp między startami w ms (R2: 500). */
  delayMs?: number;
  signal?: AbortSignal | undefined;
}

function resolveScanOptions(opts: ReferenceScanOptions): {
  fetchImpl: FetchLike;
  pool: PoolOptions;
} {
  return {
    fetchImpl: opts.fetchImpl ?? ((url, init) => fetch(url, init as RequestInit)),
    pool: {
      maxConcurrent: opts.maxConcurrent ?? 2,
      delayMs: opts.delayMs ?? 500,
      signal: opts.signal,
    },
  };
}

/**
 * Skanuj itemy z katalogu: HEAD na `objects/{id}.gif` dla każdego seeda.
 * Zwraca tylko te, których obraz istnieje (2xx) — walidowane Zod.
 */
export async function scanItems(
  seeds: readonly ItemSeed[],
  opts: ReferenceScanOptions = {},
): Promise<Item[]> {
  const { fetchImpl, pool } = resolveScanOptions(opts);
  const urls = seeds.map((s) => itemImageUrl(s.id));
  const ok = await mapPool(urls, pool, (url) =>
    headExists(url, { fetchImpl, signal: opts.signal }),
  );

  const items: Item[] = [];
  for (let i = 0; i < seeds.length; i += 1) {
    const seed = seeds[i];
    if (seed === undefined) continue;
    if (!ok[i]) continue;
    items.push(
      ItemSchema.parse({
        id: seed.id,
        name: seed.name,
        namePl: seed.namePl ?? null,
        category: seed.category,
        marketPrice: seed.marketPrice ?? null,
        tcValue: seed.tcValue ?? null,
        isStoreItem: seed.isStoreItem ?? false,
        isRare: seed.isRare ?? false,
        imageUrl: itemImageUrl(seed.id),
      }),
    );
  }
  return items;
}

export interface OutfitScanOptions extends ReferenceScanOptions {
  /** Addony do sprawdzenia per outfit id (domyślnie 0-3). */
  addons?: readonly number[] | undefined;
}

/**
 * Skanuj outfity: dla każdego id z zakresu sprawdź addony 0-3
 * (`outfits/{id}_{addon}.gif`). Outfit istnieje, gdy istnieje addon 0 (baza).
 */
export async function scanOutfits(
  range: { start: number; end: number },
  opts: OutfitScanOptions = {},
): Promise<Outfit[]> {
  const { fetchImpl, pool } = resolveScanOptions(opts);
  const addons = opts.addons ?? [0, 1, 2, 3];

  const pairs: Array<{ id: number; addon: number }> = [];
  for (let id = range.start; id <= range.end; id += 1) {
    for (const addon of addons) pairs.push({ id, addon });
  }

  const ok = await mapPool(pairs, pool, ({ id, addon }) =>
    headExists(outfitImageUrl(id, addon), { fetchImpl, signal: opts.signal }),
  );

  const outfits: Outfit[] = [];
  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    if (pair === undefined) continue;
    if (pair.addon !== 0) continue; // baza decyduje o istnieniu outfitu
    if (!ok[i]) continue;
    outfits.push(
      OutfitSchema.parse({
        id: pair.id,
        name: `Outfit ${pair.id}`,
        namePl: null,
        isStore: false,
        isRare: false,
        imageUrl: outfitImageUrl(pair.id, 0),
      }),
    );
  }
  return outfits;
}

/**
 * Skanuj mounty: HEAD na `mounts/{id}.gif` dla zakresu id.
 */
export async function scanMounts(
  range: { start: number; end: number },
  opts: ReferenceScanOptions = {},
): Promise<Mount[]> {
  const { fetchImpl, pool } = resolveScanOptions(opts);

  const ids: number[] = [];
  for (let id = range.start; id <= range.end; id += 1) ids.push(id);

  const ok = await mapPool(ids, pool, (id) =>
    headExists(mountImageUrl(id), { fetchImpl, signal: opts.signal }),
  );

  const mounts: Mount[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    if (id === undefined) continue;
    if (!ok[i]) continue;
    mounts.push(
      MountSchema.parse({
        id,
        name: `Mount ${id}`,
        namePl: null,
        isStore: false,
        isRare: false,
        imageUrl: mountImageUrl(id),
      }),
    );
  }
  return mounts;
}

// ──────────────────────────────────────────────────────────────────────────
// TibiaWiki fallback — nazwy PL/EN z infoboxu
// ──────────────────────────────────────────────────────────────────────────

export const TIBIA_WIKI_BASE = "https://tibia.fandom.com";

/** URL strony wiki: `tibia.fandom.com/{lang}/wiki/{Name}` (EN bez prefiksu). */
export function wikiPageUrl(name: string, lang: "en" | "pl" = "en"): string {
  const slug = name.trim().replace(/\s+/g, "_");
  const encoded = encodeURIComponent(slug);
  return lang === "pl"
    ? `${TIBIA_WIKI_BASE}/pl/wiki/${encoded}`
    : `${TIBIA_WIKI_BASE}/wiki/${encoded}`;
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
  "&#160;": " ",
};

/** Zdekoduj podstawowe encje HTML (wystarczające dla nagłówków wiki). */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(amp|lt|gt|quot|#39|nbsp|#160);/g, (m) => HTML_ENTITIES[m] ?? m);
}

/** Usuń tagi HTML z fragmentu (np. `<span>` wewnątrz nagłówka). */
function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

/**
 * Wyciągnij nazwę strony z `<h1 id="firstHeading">` — to nazwa itemu
 * w danym języku (EN lub PL). Regex-based (bez cheerio — wystarczy dla infoboxu).
 */
export function parseWikiHeading(html: string): string | null {
  const match = /<h1[^>]*id=["']firstHeading["'][^>]*>(.*?)<\/h1>/i.exec(html);
  if (!match) return null;
  const heading = decodeHtmlEntities(stripTags(match[1] ?? "")).trim();
  return heading.length > 0 ? heading : null;
}

async function fetchText(
  url: string,
  opts: { fetchImpl: FetchLike; signal?: AbortSignal | undefined },
): Promise<string | null> {
  try {
    const res = await opts.fetchImpl(url, {
      method: "GET",
      signal: opts.signal,
      headers: { "User-Agent": DEFAULT_UA, Accept: "text/html" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null; // best-effort: brak wiki nie psuje scrapera
  }
}

/**
 * Uzupełnij nazwy itemu z TibiaWiki:
 *   - brak `name`   → EN wiki (`/wiki/{Name}`)
 *   - brak `namePl` → PL wiki (`/pl/wiki/{Name}`)
 * Zwraca nowy obiekt Item (walidowany Zod); niezmienione pola kopiowane.
 */
export async function enrichItemNames(
  item: Item,
  opts: { fetchImpl: FetchLike; signal?: AbortSignal | undefined },
): Promise<Item> {
  const needEn = item.name.length === 0;
  const needPl = item.namePl === null;

  const [enName, plName] = await Promise.all([
    needEn
      ? fetchText(wikiPageUrl(item.name, "en"), opts).then((html) =>
          html === null ? null : parseWikiHeading(html),
        )
      : Promise.resolve(null),
    needPl
      ? fetchText(wikiPageUrl(item.name, "pl"), opts).then((html) =>
          html === null ? null : parseWikiHeading(html),
        )
      : Promise.resolve(null),
  ]);

  return ItemSchema.parse({
    ...item,
    name: enName ?? item.name,
    namePl: plName ?? item.namePl,
  });
}

// ──────────────────────────────────────────────────────────────────────────
// TibiaData primary probe (best-effort)
// ──────────────────────────────────────────────────────────────────────────
//
// §18.1: TibiaData v4 NIE ma endpointu `/v4/items` (swagger v4.10.0) — probe
// zawsze zwróci null w praktyce i scraper przejdzie do własnego skanu.
// Kod zostaje, bo gdyby endpoint się pojawił, oszczędzamy requesty (R11).

const TibiaDataItemsResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
    }),
  ),
});

async function tryFetchTibiaDataItems(
  fetchImpl: FetchLike,
  baseUrl: string | undefined,
  signal?: AbortSignal | undefined,
): Promise<Item[] | null> {
  const base = (baseUrl ?? process.env.TIBIADATA_BASE_URL ?? "http://localhost:8080").replace(
    /\/$/,
    "",
  );
  try {
    const res = await fetchImpl(`${base}/v4/items`, {
      method: "GET",
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const parsed = TibiaDataItemsResponseSchema.safeParse(await res.json());
    if (!parsed.success) return null;
    return parsed.data.items.map((entry) =>
      ItemSchema.parse({
        id: entry.id,
        name: entry.name,
        namePl: null,
        category: "other",
        marketPrice: null,
        tcValue: null,
        isStoreItem: false,
        isRare: false,
        imageUrl: itemImageUrl(entry.id),
      }),
    );
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Orchestration
// ──────────────────────────────────────────────────────────────────────────

export interface ReferenceDataOptions extends ReferenceScanOptions {
  /** Katalog itemów do skanu (domyślnie POPULAR_ITEMS). */
  itemSeeds?: readonly ItemSeed[];
  /** Zakres id outfitów (domyślnie 1-500). */
  outfitRange?: { start: number; end: number };
  /** Zakres id mountów (domyślnie 1-300). */
  mountRange?: { start: number; end: number };
  /** Addony outfitów do sprawdzenia (domyślnie 0-3). */
  outfitAddons?: readonly number[];
  /** Uzupełniaj nazwy PL/EN z TibiaWiki (fallback). */
  enrichNames?: boolean;
  /** Base URL TibiaData (probe primary). Domyślnie env TIBIADATA_BASE_URL. */
  tibiaDataBaseUrl?: string;
}

export interface ReferenceScrapeStats {
  itemsScanned: number;
  itemsFound: number;
  outfitsScanned: number;
  outfitsFound: number;
  mountsScanned: number;
  mountsFound: number;
  wikiFetches: number;
  tibiaDataUsed: boolean;
}

/**
 * Główny scraper reference data (items/outfits/mounts).
 * Zwraca zwalidowany `ReferenceDataResult` + statystyki (do `scrape_runs`).
 */
export async function scrapeReferenceData(
  opts: ReferenceDataOptions = {},
): Promise<{ result: ReferenceDataResult; stats: ReferenceScrapeStats }> {
  const { fetchImpl, pool } = resolveScanOptions(opts);
  const scanOpts: ReferenceScanOptions = {
    fetchImpl,
    maxConcurrent: pool.maxConcurrent,
    delayMs: pool.delayMs,
    signal: opts.signal,
  };

  // 1. TibiaData primary probe (best-effort; §18.1 — v4 nie ma /v4/items).
  const tibiaDataItems = await tryFetchTibiaDataItems(
    fetchImpl,
    opts.tibiaDataBaseUrl,
    opts.signal,
  );

  let items: Item[];
  let wikiFetches = 0;

  if (tibiaDataItems !== null && tibiaDataItems.length > 0) {
    items = tibiaDataItems;
  } else {
    // 2. Items: HEAD validation na katalogu popularnych itemów.
    items = await scanItems(opts.itemSeeds ?? POPULAR_ITEMS, scanOpts);

    // 5. TibiaWiki fallback: nazwy PL/EN dla itemów bez namePl.
    if (opts.enrichNames) {
      const needEnrich = items.filter((item) => item.namePl === null);
      const enriched = await mapPool(needEnrich, pool, (item) =>
        enrichItemNames(item, { fetchImpl, signal: opts.signal }),
      );
      wikiFetches = enriched.length;
      const byId = new Map(enriched.map((item) => [item.id, item]));
      items = items.map((item) => byId.get(item.id) ?? item);
    }
  }

  // 3. Outfits: HEAD na `outfits/{id}_{addon}.gif` (addon 0-3).
  const outfitRange = opts.outfitRange ?? { start: 1, end: 500 };
  const outfits = await scanOutfits(outfitRange, {
    ...scanOpts,
    addons: opts.outfitAddons,
  });

  // 4. Mounts: HEAD na `mounts/{id}.gif`.
  const mountRange = opts.mountRange ?? { start: 1, end: 300 };
  const mounts = await scanMounts(mountRange, scanOpts);

  const result = ReferenceDataResultSchema.parse({ items, outfits, mounts });

  const stats: ReferenceScrapeStats = {
    itemsScanned: (opts.itemSeeds ?? POPULAR_ITEMS).length,
    itemsFound: result.items.length,
    outfitsScanned: (outfitRange.end - outfitRange.start + 1) * (opts.outfitAddons?.length ?? 4),
    outfitsFound: result.outfits.length,
    mountsScanned: mountRange.end - mountRange.start + 1,
    mountsFound: result.mounts.length,
    wikiFetches,
    tibiaDataUsed: tibiaDataItems !== null && tibiaDataItems.length > 0,
  };

  return { result, stats };
}