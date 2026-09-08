/**
 * @tibians/character-context — `snapshotToUrl`.
 *
 * Produkuje **kompletny, shareable URL** z całym `CharacterSnapshot`
 * zakodowanym w query stringu `?s=…`.
 *
 * Architektura (arch. §13.4):
 *   /workspace?s=<shareToken>
 *
 *   gdzie `<shareToken>` to:
 *     base64url(JSON(snapshot))           ← mały snapshot (< 1 KB JSON)
 *     base64url(gzip(JSON(snapshot)))    ← duży snapshot (≥ 1 KB JSON)
 *
 * Użycie:
 *   - "Kopiuj link" w Workspace (task 11)
 *   - cross-link z aukcji do Workspace z pre-filled state (task 49)
 *   - "Moje postacie" → "Otwórz w nowej karcie" (task 12)
 *
 * Cele (task 10):
 *   - **kompletny URL** — każde pole snapshotu (poza source-specific:
 *     auctionId, bid, auctionEnd, ...) jest odtwarzalne
 *   - **URL < 2 KB** dla typowego manual snapshot; **< 500 B** dla minimalnego
 *   - **Unicode-safe** (polskie znaki, U+00A0 non-breaking space, emoji)
 *   - **bez `btoa`/`atob`** na surowym stringu (Unicode corruption)
 *
 * Format: `<basePath>?s=<base64url payload>`
 *   - `<basePath>` to `/workspace` (domyślny) lub ścieżka z URL wejściowego
 *   - payload jest zawsze base64url (A-Za-z0-9_-) — bezpieczny dla URL
 */
import type { CharacterSnapshot } from "../schema.js";
import {
  URL_QUERY_PARAM,
  encodeSnapshot,
  type EncodedSnapshot,
} from "./encoding.js";

// ──────────────────────────────────────────────────────────────────────────
// Domyślna ścieżka bazowa
// ──────────────────────────────────────────────────────────────────────────

/**
 * Arch. §13.4: Workspace jest hostowane pod `/workspace`.
 * Prefix locale (`/pl/workspace`) jest dodawany przez middleware next-intl,
 * więc ten URL jest **locale-agnostic** — `<origin>/pl/workspace?s=…`.
 */
export const DEFAULT_WORKSPACE_PATH = "/workspace";

// ──────────────────────────────────────────────────────────────────────────
// snapshotToUrl — główna funkcja
// ──────────────────────────────────────────────────────────────────────────

export interface SnapshotUrlOptions {
  /**
   * Bazowy URL lub ścieżka. Może być:
   *   - pełny URL: `'https://rathleton.tools/workspace'`
   *   - ścieżka absolutna: `'/workspace'` (domyślna)
   *   - ścieżka z locale: `'/pl/workspace'`
   *
   * Gdy podany URL już ma query string, nowy parametr `s` jest dodawany
   * (lub zastępuje istniejący). Inne parametry (np. `?auction=123`) są
   * zachowane — przydatne dla cross-linków z Bazaara.
   */
  baseUrl?: string;
}

/**
 * Wynik `snapshotToUrl`. Zwraca pełny URL + diagnostykę.
 *
 * `diagnostics` pozwala UI/devtools wyświetlić "skompresowany, 850 B"
 * w razie potrzeby. NIE jest częścią URL (nie zaśmiecamy query stringa).
 */
export interface SnapshotUrl {
  /** Pełny URL gotowy do wstawienia w `<a href>` lub skopiowania. */
  readonly url: string;
  /** Payload base64url (po `?s=`). Przydatne do testów diagnostycznych. */
  readonly payload: string;
  /** Czy payload był gzipowany (dla devtools / diagnostyki). */
  readonly compressed: boolean;
  /** Rozmiar surowego JSON (UTF-8) przed kompresją/kodowaniem. */
  readonly rawBytes: number;
  /** Rozmiar payloadu base64url (znaki w URL). */
  readonly encodedBytes: number;
  /** Rozmiar całego URL (pełny href). */
  readonly urlBytes: number;
}

/**
 * Snapshot → kompletny shareable URL.
 *
 * Algorytm:
 *   1. `encodeSnapshot(snapshot)` → `{ payload, compressed, rawBytes, encodedBytes }`
 *   2. resolveBaseHref(baseUrl?) → `<href bez query>` (lub default `/workspace`)
 *   3. złóż: `<href>?s=<payload>` (zachowując inne query params)
 *
 * **Gwarancje:**
 *   - URL zawsze zaczyna się od `http(s)://` LUB `path/?s=` (zależnie od baseUrl)
 *   - payload ma **zawsze** prefix 'p' (plain) lub 'z' (gzip) — weryfikowalny
 *     przez `isValidSnapshotUrl`
 *   - żadne inne parametry URL nie są niszczone (oprócz ewentualnego `s=`)
 *
 * @example
 * ```ts
 * const url = snapshotToUrl(snap);
 * // → "/workspace?s=zH4sIAAAAAAAAA…"
 *
 * const full = snapshotToUrl(snap, { baseUrl: "https://rathleton.tools" });
 * // → "https://rathleton.tools/workspace?s=zH4sIAAAAAAAAA…"
 * ```
 */
export function snapshotToUrl(
  snapshot: CharacterSnapshot,
  options: SnapshotUrlOptions = {},
): SnapshotUrl {
  // 1) Rdzeń: snapshot → base64url payload
  const encoded: EncodedSnapshot = encodeSnapshot(snapshot);

  // 2) Złóż URL
  const base = options.baseUrl ?? DEFAULT_WORKSPACE_PATH;
  const url = buildUrlWithPayload(base, encoded.payload);

  return {
    url,
    payload: encoded.payload,
    compressed: encoded.compressed,
    rawBytes: encoded.rawBytes,
    encodedBytes: encoded.encodedBytes,
    urlBytes: url.length,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Helper — budowanie URL
// ──────────────────────────────────────────────────────────────────────────

/**
 * Łączy `<base>?s=<payload>`, zachowując inne parametry query stringa.
 *
 * Przykłady:
 *   buildUrlWithPayload('/workspace', 'abc') → '/workspace?s=abc'
 *   buildUrlWithPayload('/workspace?auction=123', 'abc')
 *     → '/workspace?auction=123&s=abc'
 *   buildUrlWithPayload('https://x.com/pl/workspace?foo=bar', 'abc')
 *     → 'https://x.com/pl/workspace?foo=bar&s=abc'
 *
 * **Czemu ręcznie, a nie `new URL()` + searchParams:**
 *   - `new URL('/workspace')` wymaga absolutnego origin (Node rzuca wyjątek
 *     na względnych ścieżkach). Chcemy wspierać oba: `'https://…'` i
 *     `'/workspace'` — stąd własna logika parsowania.
 */
function buildUrlWithPayload(base: string, payload: string): string {
  // Rozdziel na część "przed ?" i "query string".
  const queryIdx = base.indexOf("?");
  const href = queryIdx >= 0 ? base.slice(0, queryIdx) : base;
  const existingQuery = queryIdx >= 0 ? base.slice(queryIdx + 1) : "";

  // Złóż nowy query string z zachowaniem istniejących parametrów
  // (ale nadpisz `s`, jeśli już było).
  const params = new URLSearchParams(existingQuery);
  params.set(URL_QUERY_PARAM, payload);

  return `${href}?${params.toString()}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Eksportowane helpers dla UI
// ──────────────────────────────────────────────────────────────────────────

/**
 * Rozmiar URL (w bajtach/znakach) jako string do wyświetlenia w UI.
 *
 * Np. `"1.4 KB"`, `"342 B"`. Przydatne dla "Kopiuj link" tooltip
 * lub dla diagnostyki "URL za duży — wybierz token (T12)".
 */
export function formatUrlSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
