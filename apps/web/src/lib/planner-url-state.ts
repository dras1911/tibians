/**
 * Lekki helper do kodowania stanu planera do URL.
 *
 * Wzorzec mirrorowany z `@tibians/character-context` (T10, arch §13.4):
 *   - `JSON` → `base64url` → `?snapshot=<payload>`
 *   - **Zod** do walidacji po odkodowaniu (corrupted URL → throw, nie silent fail)
 *   - **Bez `btoa`/`atob`** na surowych stringach (Unicode corruption — patrz
 *     `packages/character-context/src/transforms/encoding.ts`)
 *   - payload jest **kompletny** — każde pole odtwarzalne z URL
 *
 * Dlaczego NIE używamy `snapshotToUrl` z character-context:
 *   - Charm / Wheel of Destiny planery mają **własny, lekki** stan (kilka
 *     sliderów + vocation). Wrzucanie tego w `CharacterSnapshot`
 *     (8 skillów + 10 fields + flagi + bids + ...) byłoby 500× większego
 *     payloadu i 100× większej walidacji Zod.
 *   - Pattern jest ten sam (base64url + JSON + Zod) — ale `encode<T>` jest
 *     generyczny, więc dowolna strona może go użyć do swojego typu.
 *
 * Użycie (w `apps/web/src/app/[locale]/planners/*`):
 *   ```ts
 *   const url = buildPlannerUrl("/planners/charms", state, CharmPlannerStateSchema);
 *   const next = parsePlannerState(searchParams.get("snapshot"), CharmPlannerStateSchema);
 *   ```
 */

import { z, type ZodTypeAny } from "zod";

// ──────────────────────────────────────────────────────────────────────────
// Stałe formatu — wersjonowanie pozwala na przyszłe migracje
// ──────────────────────────────────────────────────────────────────────────

/**
 * Prefix bazy URL — `?snapshot=…` w query stringu planerów.
 *
 * Rozróżnienie od T10 (`?s=…` dla CharacterSnapshot) — plannery NIE
 * używają `CharacterSnapshot`, więc inny parametr (czytelniejsze w devtools
 * i niweluje pomyłki typu "klik w share link z workspace → planner").
 */
export const PLANNER_QUERY_PARAM = "snapshot" as const;

// ──────────────────────────────────────────────────────────────────────────
// Custom error class
// ──────────────────────────────────────────────────────────────────────────

/**
 * Rzucany przez `parsePlannerState` gdy payload jest uszkodzony.
 * `cause` zachowuje oryginalny błąd (Node ≥ 16.9 / TS lib ES2022).
 */
export class CorruptedPlannerUrlError extends Error {
  public override readonly name = "CorruptedPlannerUrlError";
  public override readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.cause = options?.cause;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Tekst ↔ bajty (UTF-8) — TextEncoder/Decoder (W3C standard, działa w Node i browser)
// ──────────────────────────────────────────────────────────────────────────

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

// ──────────────────────────────────────────────────────────────────────────
// base64url — bez btoa/atob na surowym stringu
// ──────────────────────────────────────────────────────────────────────────

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  const standard = btoa(binary);
  return standard.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(payload: string): Uint8Array {
  let standard = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padding = standard.length % 4;
  if (padding === 2) standard += "==";
  else if (padding === 3) standard += "=";
  else if (padding !== 0) {
    throw new CorruptedPlannerUrlError(
      `Nieprawidłowa długość base64url (${payload.length} znaków)`,
    );
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(standard)) {
    throw new CorruptedPlannerUrlError(
      "Payload zawiera niedozwolone znaki (nie jest base64url)",
    );
  }
  let binary: string;
  try {
    binary = atob(standard);
  } catch (cause) {
    throw new CorruptedPlannerUrlError("Nie udało się zdekodować base64url", {
      cause,
    });
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export interface PlannerUrlOptions {
  /**
   * Bazowy URL lub ścieżka. Może być:
   *   - `'https://rathleton.tools/planners/charms'`
   *   - `'/planners/charms'`
   *   - `'/pl/planners/charms'`
   *
   * Gdy podany URL już ma query string, nowy parametr `snapshot` jest dodawany
   * (lub zastępuje istniejący).
   */
  baseUrl?: string;
}

export interface PlannerUrl {
  /** Pełny URL gotowy do skopiowania. */
  readonly url: string;
  /** Payload base64url (po `?snapshot=`). Przydatne do testów diagnostycznych. */
  readonly payload: string;
  /** Rozmiar surowego JSON (UTF-8) przed kodowaniem. */
  readonly rawBytes: number;
  /** Rozmiar payloadu base64url (znaki w URL). */
  readonly encodedBytes: number;
  /** Rozmiar całego URL (pełny href). */
  readonly urlBytes: number;
}

/**
 * Generyczna funkcja: `T → { url, payload, ... }`.
 *
 * @param state — obiekt do zakodowania (musi być zgodny ze schemą)
 * @param schema — Zod schema używana do sanityzacji + ewentualnej migracji
 * @param options — `{ baseUrl? }` — domyślnie `"/planners"` (kompatybilne z `pathname`)
 *
 * @example
 *   ```ts
 *   const url = buildPlannerUrl(state, CharmPlannerStateSchema, {
 *     baseUrl: "/planners/charms",
 *   });
 *   ```
 */
export function buildPlannerUrl<T>(
  state: T,
  schema: z.ZodType<T>,
  options: PlannerUrlOptions = {},
): PlannerUrl {
  // 1) Sanityzacja — schema.parse odrzuca nadmiarowe pola i rzuca jeśli
  //    dane nie są poprawne. To chroni przed wysłaniem corrupted state do URL.
  const clean = schema.parse(state);

  // 2) JSON → UTF-8 bytes → base64url
  const json = JSON.stringify(clean);
  const bytes = TEXT_ENCODER.encode(json);
  const payload = bytesToBase64Url(bytes);

  // 3) Złóż URL
  const base = options.baseUrl ?? "/planners";
  const url = buildUrlWithPayload(base, payload);

  return {
    url,
    payload,
    rawBytes: bytes.length,
    encodedBytes: payload.length,
    urlBytes: url.length,
  };
}

/**
 * Parsuje URL (lub search string / goły payload) → `T` walidowane Zodem.
 *
 * @returns `null` gdy URL nie zawiera `?snapshot=…`
 * @throws {CorruptedPlannerUrlError} gdy payload jest obecny ale uszkodzony
 *   (base64 niepoprawny, JSON.parse fail, lub Zod walidacja fail)
 *
 * @example
 *   ```ts
 *   const next = parsePlannerState(window.location.search, CharmPlannerStateSchema);
 *   if (next) setState(next);
 *   ```
 */
export function parsePlannerState<T>(
  hrefOrSearch: string | null | undefined,
  schema: z.ZodType<T>,
): T | null {
  if (!hrefOrSearch) return null;

  const payload = extractPayload(hrefOrSearch);
  if (!payload) return null;

  // 1) base64url → bajty
  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(payload);
  } catch (error) {
    if (error instanceof CorruptedPlannerUrlError) throw error;
    throw new CorruptedPlannerUrlError(
      "Nie udało się zdekodować base64url",
      { cause: error },
    );
  }

  // 2) UTF-8 → JSON text
  let jsonText: string;
  try {
    jsonText = TEXT_DECODER.decode(bytes);
  } catch (cause) {
    throw new CorruptedPlannerUrlError("Payload nie jest poprawnym UTF-8", {
      cause,
    });
  }

  // 3) JSON.parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (cause) {
    throw new CorruptedPlannerUrlError("Payload nie jest poprawnym JSON-em", {
      cause,
    });
  }

  // 4) Zod — ostateczna walidacja
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new CorruptedPlannerUrlError(
      `Stan nie przechodzi walidacji: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers — budowanie URL + wyciąganie payload
// ──────────────────────────────────────────────────────────────────────────

function buildUrlWithPayload(base: string, payload: string): string {
  const queryIdx = base.indexOf("?");
  const href = queryIdx >= 0 ? base.slice(0, queryIdx) : base;
  const existingQuery = queryIdx >= 0 ? base.slice(queryIdx + 1) : "";
  const params = new URLSearchParams(existingQuery);
  params.set(PLANNER_QUERY_PARAM, payload);
  return `${href}?${params.toString()}`;
}

function extractPayload(hrefOrSearch: string): string | null {
  if (typeof hrefOrSearch !== "string" || hrefOrSearch.length === 0) {
    return null;
  }
  try {
    let search: string;
    if (hrefOrSearch.startsWith("?")) {
      search = hrefOrSearch;
    } else if (
      hrefOrSearch.includes("=") &&
      !/^[A-Za-z0-9_-]+$/.test(hrefOrSearch)
    ) {
      const idx = hrefOrSearch.indexOf("?");
      search = idx >= 0 ? hrefOrSearch.slice(idx) : `?${hrefOrSearch}`;
    } else if (/^[A-Za-z0-9_-]+$/.test(hrefOrSearch)) {
      return hrefOrSearch.length > 0 ? hrefOrSearch : null;
    } else {
      const url = new URL(hrefOrSearch);
      search = url.search;
    }
    const params = new URLSearchParams(search);
    const value = params.get(PLANNER_QUERY_PARAM);
    return value !== null && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Rozmiar URL jako string (`"1.4 KB"` / `"342 B"`).
 * Przydatne dla tooltipów "Kopiuj link" lub diagnostyki.
 */
export function formatPlannerUrlSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Re-eksport typu Zod dla wygody konsumentów.
 * (unikamy `import type { ZodTypeAny }` w plikach konsumentów)
 */
export type { ZodTypeAny };
