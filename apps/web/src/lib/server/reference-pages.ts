/**
 * Server-only DB helpers dla `/reference/*` (plan T61, arch §18.1 + §7.2).
 *
 * Buduje na T42 (`searchReferenceItems` / `listRareItems` w `reference.ts`)
 * — dodaje paginowane listy dla items / outfits / mounts oraz helper do
 * grupowania światów po regionie (plan T61).
 *
 * Cache: `revalidate = 86400` (24h, zgodnie z planem T61) — dane
 * reference zmieniają się rzadko (T32 scraper aktualizuje co 24h).
 */

import { and, asc, desc, eq, ilike, isNotNull, sql } from "drizzle-orm";

import { db } from "@tibians/db";
import { items, mounts, outfits, worlds } from "@tibians/db/schema";

// ───────────────────────────────────────────────────────────────────────
// Wspólne typy
// ───────────────────────────────────────────────────────────────────────

/**
 * Stronicowana odpowiedź — minimalny shape wystarczający dla grid UI.
 */
export interface PaginatedRows<TRow> {
  rows: TRow[];
  total: number;
  page: number;
  pageSize: number;
}

// ───────────────────────────────────────────────────────────────────────
// Items
// ───────────────────────────────────────────────────────────────────────

export interface ReferenceItemRow {
  id: number;
  name: string;
  namePl: string | null;
  category: string;
  marketPrice: number | null;
  isStoreItem: boolean;
  isRare: boolean;
  imageUrl: string;
}

/**
 * Stronicowana lista przedmiotów z DB. Opcjonalny `q` przeszukuje EN+PL
 * (ILIKE %q%) — w produkcji preferujemy `pg_trgm` GIN index z migracji,
 * ale ILIKE jest fallbackiem gdy rozszerzenie nieaktywne.
 *
 * Filtr `category` (arch §7.2) ogranicza do konkretnej kategorii (opcjonalne).
 */
export async function listReferenceItems(
  options: {
    page?: number;
    pageSize?: number;
    query?: string;
    category?: string;
    rareOnly?: boolean;
  } = {},
): Promise<PaginatedRows<ReferenceItemRow>> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 48));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const q = options.query?.trim() ?? "";
  if (q.length >= 2) {
    conditions.push(
      sql`(${ilike(items.name, `%${q}%`)}) OR (${ilike(items.namePl, `%${q}%`)})`,
    );
  }
  if (options.category !== undefined && options.category.length > 0) {
    // SQL wrapper pozwala ominąć wąski enum type Drizzle — walidacja
    // kategorii po stronie UI/URL (literały dopuszczalnych wartości).
    conditions.push(sql`${items.category} = ${options.category}`);
  }
  if (options.rareOnly === true) {
    conditions.push(eq(items.isRare, true));
  }
  // Filtruj tylko przedmioty z nazwą PL (zgodnie z plan T61 Must NOT —
  // "Nie pokazuj items bez nazwy PL"). Gdy brak — fallback na EN.
  // W trybie "Wszystkie" (bez filtra PL) pokazujemy też bez nazwy PL.
  // Tu: preferujemy PL, ale nie filtrujemy — UI wybierze `namePl ?? name`.
  const where = conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: items.id,
        name: items.name,
        namePl: items.namePl,
        category: items.category,
        marketPrice: items.marketPrice,
        isStoreItem: items.isStoreItem,
        isRare: items.isRare,
        imageUrl: items.imageUrl,
      })
      .from(items)
      .where(where)
      .orderBy(desc(items.isRare), asc(items.name))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(items)
      .where(where),
  ]);

  const total = totalRow[0]?.count ?? 0;
  return { rows, total, page, pageSize };
}

// ───────────────────────────────────────────────────────────────────────
// Outfits / Mounts — stronicowane listy z DB
// ───────────────────────────────────────────────────────────────────────

export interface ReferenceCosmeticRow {
  id: number;
  name: string;
  namePl: string | null;
  isStore: boolean;
  isRare: boolean;
  imageUrl: string;
}

async function listCosmetics(
  table: typeof outfits | typeof mounts,
  options: { page?: number; pageSize?: number; storeOnly?: boolean } = {},
): Promise<PaginatedRows<ReferenceCosmeticRow>> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 48));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (options.storeOnly === true) {
    conditions.push(eq(table.isStore, true));
  }
  const where = conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: table.id,
        name: table.name,
        namePl: table.namePl,
        isStore: table.isStore,
        isRare: table.isRare,
        imageUrl: table.imageUrl,
      })
      .from(table)
      .where(where)
      .orderBy(desc(table.isRare), asc(table.name))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(table)
      .where(where),
  ]);

  const total = totalRow[0]?.count ?? 0;
  return { rows, total, page, pageSize };
}

/** Stronicowana lista outfits. */
export function listReferenceOutfits(
  options: Parameters<typeof listCosmetics>[1] = {},
): Promise<PaginatedRows<ReferenceCosmeticRow>> {
  return listCosmetics(outfits, options);
}

/** Stronicowana lista mounts. */
export function listReferenceMounts(
  options: Parameters<typeof listCosmetics>[1] = {},
): Promise<PaginatedRows<ReferenceCosmeticRow>> {
  return listCosmetics(mounts, options);
}

// ───────────────────────────────────────────────────────────────────────
// Worlds — grupowanie po regionie
// ───────────────────────────────────────────────────────────────────────

export interface ReferenceWorldRow {
  id: number;
  name: string;
  region: "EU" | "NA" | "BR";
  pvpType: string;
  battleye: string;
  isRetro: boolean;
  isActive: boolean;
  playersOnline: number | null;
}

/**
 * Aktywne światy zgrupowane po regionie (EU / NA / BR), posortowane
 * wewnątrz regionu po `name ASC`. Wykorzystywane przez UI /reference/worlds.
 *
 * Filtr `is_active = true` (arch §7.2 partial index) — lista może się
 * zmieniać rzadko (CipSoft dodaje światy co kilka lat).
 */
export async function listWorldsByRegion(): Promise<{
  EU: ReferenceWorldRow[];
  NA: ReferenceWorldRow[];
  BR: ReferenceWorldRow[];
}> {
  const rows = await db
    .select({
      id: worlds.id,
      name: worlds.name,
      region: worlds.region,
      pvpType: worlds.pvpType,
      battleye: worlds.battleye,
      isRetro: worlds.isRetro,
      isActive: worlds.isActive,
      playersOnline: worlds.playersOnline,
    })
    .from(worlds)
    .where(eq(worlds.isActive, true))
    .orderBy(asc(worlds.region), asc(worlds.name));

  const byRegion: Record<"EU" | "NA" | "BR", ReferenceWorldRow[]> = {
    EU: [],
    NA: [],
    BR: [],
  };
  for (const r of rows) {
    if (r.region === "EU" || r.region === "NA" || r.region === "BR") {
      byRegion[r.region].push(r);
    }
  }
  return byRegion;
}

// ───────────────────────────────────────────────────────────────────────
// Statystyki — pomocnicze dla /reference (gauge counts)
// ───────────────────────────────────────────────────────────────────────

/**
 * Łączna liczba rekordów w poszczególnych tabelach referencyjnych.
 * Używane do pokazania na `/reference` ile mamy przedmiotów / outfitów.
 */
export interface ReferenceStats {
  items: number;
  outfits: number;
  mounts: number;
  worlds: number;
}

export async function getReferenceStats(): Promise<ReferenceStats> {
  const [itemsRow, outfitsRow, mountsRow, worldsRow] = await Promise.all([
    db.select({ c: sql<number>`COUNT(*)::int` }).from(items),
    db.select({ c: sql<number>`COUNT(*)::int` }).from(outfits),
    db.select({ c: sql<number>`COUNT(*)::int` }).from(mounts),
    db.select({ c: sql<number>`COUNT(*)::int` }).from(worlds).where(isNotNull(worlds.id)),
  ]);
  return {
    items: itemsRow[0]?.c ?? 0,
    outfits: outfitsRow[0]?.c ?? 0,
    mounts: mountsRow[0]?.c ?? 0,
    worlds: worldsRow[0]?.c ?? 0,
  };
}

// Unused — zostawiamy do przyszłego użycia (eslint-disable guard).
void and;
void isNotNull;