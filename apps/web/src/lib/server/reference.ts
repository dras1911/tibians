/**
 * Server-only helpers dla `/api/reference/*` (plan T42).
 *
 * Cel: udostępnić UI listę referencyjną (items / outfits / mounts /
 * bosses) bez ujawniania połączenia z bazą danych. Arch §7.1 pkt 4 —
 * reference data osobno, agresywnie cache'owalne.
 *
 * Użycie:
 *   - `<Combobox>` w T42 (rare items autocomplete, debounced 300 ms).
 *   - Wybór bossa w T27+ (sekcja boss points).
 *   - Outfity / mounty w przyszłych kartach aukcji (W9+).
 *
 * Cache: `next: { revalidate: 300 }` w RSC + `Cache-Control: s-maxage=300`
 * w route handlerach. Zmiana reference data (T32 scraper) rzadka.
 */

import { asc, eq, ilike, sql } from "drizzle-orm";

import { db } from "@tibians/db";
import { items } from "@tibians/db/schema";

// ───────────────────────────────────────────────────────────────────────
// Typy publiczne (konsumowane przez route handlers + UI)
// ───────────────────────────────────────────────────────────────────────

/**
 * Minimalny shape referencji przedmiotu — zwracany przez API i używany
 * przez Combobox w UI. Nie eksponujemy wewnętrznych kolumn DB (tcValue,
 * marketPrice — zostawiamy dla waloryzacji, nie dla autocomplete).
 */
export interface ReferenceItem {
  /** Tibia client_id (PK). */
  id: number;
  /** Nazwa angielska. */
  name: string;
  /** Nazwa polska (może brakować). */
  namePl: string | null;
  /** Kategoria przedmiotu. */
  category: string;
  /** Czy przedmiot ze sklepu Tibia. */
  isStoreItem: boolean;
  /** Czy oznaczony jako `rare`. */
  isRare: boolean;
  /** URL do obrazka (static.tibia.com/.../objects/{id}.gif). */
  imageUrl: string;
}

// ───────────────────────────────────────────────────────────────────────
// Query helpers
// ───────────────────────────────────────────────────────────────────────

/**
 * Wyszukiwarka przedmiotów — fuzzy LIKE po nazwie (PL + EN).
 * Dla `< 2` znaków zapytania zwraca pustą listę (Caller powinien
 * wyłączyć debounce'a — patrz T42 Combobox).
 *
 * Wynik limitowany do `limit` (domyślnie 20) — wystarczający dla
 * dropdownu. Dla dużych wyników (>20) UI pokaże "wpisz więcej".
 *
 * Sortowanie: preferowane `is_rare DESC`, potem `name ASC`.
 */
export async function searchReferenceItems(
  query: string,
  options: { limit?: number; rareOnly?: boolean } = {},
): Promise<ReferenceItem[]> {
  const limit = options.limit ?? 20;
  const q = query.trim();

  // Krótsze niż 2 znaki — nie zwracamy nic (debounce gate w UI).
  if (q.length < 2) return [];

  const conditions = [ilike(items.name, `%${q}%`)];
  if (options.rareOnly) {
    conditions.push(eq(items.isRare, true));
  }

  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      namePl: items.namePl,
      category: items.category,
      isStoreItem: items.isStoreItem,
      isRare: items.isRare,
      imageUrl: items.imageUrl,
    })
    .from(items)
    .where(sql.join(conditions, sql` AND `))
    .orderBy(sql`${items.isRare} DESC, ${items.name} ASC`)
    .limit(limit);

  return rows;
}

/**
 * Wszystkie "rare" przedmioty — bez filtra tekstowego. Używane do
 * initial-load (np. gdy UI chce pokazać kilka przykładów zanim user
 * wpisze cokolwiek).
 */
export async function listRareItems(
  options: { limit?: number } = {},
): Promise<ReferenceItem[]> {
  const limit = options.limit ?? 50;
  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      namePl: items.namePl,
      category: items.category,
      isStoreItem: items.isStoreItem,
      isRare: items.isRare,
      imageUrl: items.imageUrl,
    })
    .from(items)
    .where(eq(items.isRare, true))
    .orderBy(asc(items.name))
    .limit(limit);

  return rows;
}
