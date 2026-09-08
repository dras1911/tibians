/**
 * @tibians/character-context — niskopoziomowe kodowanie/dekodowanie
 * payloadu URL (kompresja + base64url + bigint-aware JSON).
 *
 * Cel (task 10 / arch. §13.4):
 *   - snapshot → ciąg znaków bezpieczny dla query string (?s=…)
 *   - dekompresja + walidacja po stronie parsera (urlToSnapshot)
 *   - **zero `btoa`/`atob`** — nie obsługują Unicode poprawnie
 *     (polskie znaki tracone, U+00A0 non-breaking space → ?)
 *   - zgodnie z arch. §3.1: Intl dla Unicode w URL — czyli
 *     kodowanie przez TextEncoder (UTF-8) → Buffer → base64url
 *
 * Schemat payloadu:
 *   ┌─────────────┬──────────────────────────────┐
 *   │ bajty UTF-8 │ "z" (compressed gzip)│ dane │
 *   └─────────────┴──────────────────────────────┘
 *   Pierwszy bajt to flaga ('p' plain JSON / 'z' gzip+JSON),
 *   pozostałe bajty to binarnie zakodowana treść (base64url).
 *
 *   Uwaga: litera 'z' jest zakodowana w nagłówku jako pierwszy
 *   znak payloadu PRZED konwersją do base64url, więc po dekodowaniu
 *   base64url od razu widzimy tryb.
 */
import { gunzipSync, gzipSync } from "node:zlib";
import { CharacterSnapshotSchema, type CharacterSnapshot } from "../schema.js";

// ──────────────────────────────────────────────────────────────────────────
// Stałe formatu — wersjonowanie pozwala na przyszłe migracje
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pierwszy bajt payloadu oznacza wersję kodowania:
 *   'p' — plain JSON (UTF-8) → base64url
 *   'z' — gzip(JSON(UTF-8)) → base64url
 *
 * Trzymamy 1 literę ASCII zamiast bit-flagi, żeby payload był
 * czytelny w devtools (np. "p<…>" / "z<…>").
 */
const FLAG_PLAIN = "p" as const;
const FLAG_GZIP = "z" as const;

/**
 * Próg (w bajtach surowego UTF-8 JSON) powyżej którego włączamy gzip.
 *
 *   Dlaczego 1 KB?
 *   - Minimalny snapshot (ręczny, pusty formularz): JSON ~ 350 B → plain
 *   - Typowy manual z itemami: JSON ~ 1.2-2 KB → gzip (~ 30-50% mniejszy)
 *   - Pełna aukcja (pełen detal): JSON ~ 1.5-3 KB → gzip (spore oszczędności)
 *
 *   gzip ma overhead ~20 B dla małych payloadów, więc poniżej 1 KB
 *   plain base64url jest bardziej opłacalny (mniej narzutu + szybsze
 *   dekodowanie w przeglądarce).
 *
 *   Po zakodowaniu base64url payload rośnie o ~33% vs bajty binarne,
 *   więc dla docelowego limitu URL 8 KB surowe dane do ~5.5 KB
 *   (gzipowane) mieszczą się z zapasem.
 */
const COMPRESSION_THRESHOLD_BYTES = 1024;

/** Prefix bazy URL — `?s=…` w query stringu Workspace. */
export const URL_QUERY_PARAM = "s" as const;

// ──────────────────────────────────────────────────────────────────────────
// Custom error class
// ──────────────────────────────────────────────────────────────────────────

/**
 * Rzucany przez `urlToSnapshot` gdy payload jest uszkodzony
 * (nieprawidłowy base64, JSON.parse fail, walidacja Zod fail).
 *
 * `cause` zachowuje oryginalny błąd (Node ≥16.9 / TS lib ES2022),
 * dzięki czemu devtools widzi pełen stack, a UI dostaje tylko `message`.
 */
export class CorruptedSnapshotUrlError extends Error {
  public override readonly name = "CorruptedSnapshotUrlError";
  public override readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    // `cause` jest już ustawiony przez `super(message, options)` jeśli options.cause
    // istnieje — tu tylko jawnie go przypisujemy, żeby TS widział pole.
    this.cause = options?.cause;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// JSON helpers — z obsługą bigint (auctionId)
// ──────────────────────────────────────────────────────────────────────────

/**
 * JSON.stringify z `replacer` dla bigint.
 *
 * Zod schema używa bigint dla `auctionId` (tibia.com ID > Number.MAX_SAFE_INTEGER).
 * Domyślny JSON.stringify rzuca `TypeError: Do not know how to serialize a BigInt`,
 * więc musimy podać własny replacer. Zwracamy **string** "12345n" — łatwy
 * do rozpoznania przy deserializacji i niezależny od kodowania.
 *
 * Format: Auction ID 12345 → "12345n" (z sufiksem 'n').
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    // Sufiks 'n' rozróżnia bigint-as-string od zwykłego stringa
    // w payloadzie (stringi nigdy nie mają 'n' na końcu).
    return `${value.toString()}n`;
  }
  return value;
}

/**
 * JSON.parse z `reviver` dla bigint.
 *
 * Parsuje string z sufiksem 'n' z powrotem do BigInt.
 * Pozostałe wartości (number, boolean, string) przechodzą nietknięte.
 */
function jsonReviver(_key: string, value: unknown): unknown {
  if (typeof value === "string" && /^-?\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  return value;
}

// ──────────────────────────────────────────────────────────────────────────
// Tekst ↔ bajty (UTF-8) — używamy TextEncoder/Decoder (W3C standard)
// ──────────────────────────────────────────────────────────────────────────

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

// ──────────────────────────────────────────────────────────────────────────
// base64url — NIE używamy btoa/atob (Unicode corruption, patrz wyżej)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Koduje bajty (Uint8Array) do base64url.
 *
 * Dlaczego NIE `btoa(String.fromCharCode(...bytes))`:
 *   - działa tylko dla bajtów 0-255 (UTF-8 polskich znaków ≥ 0xC0 → działa,
 *     ale `btoa(unescape(encodeURIComponent(str)))` jest deprecated API
 *     i pomija niektóre znaki poza BMP)
 *   - `btoa` zgłasza wyjątek na bajtach > 0xFF
 *
 * Dlaczego NIE `Buffer.from(...).toString('base64url')` (Node-only):
 *   - pakiet character-context jest obecnie server-only, ale w przyszłości
 *     może trafić do przeglądarki (Workspace jest client component).
 *     Dlatego używamy **uniwersalnego** algorytmu opartego o Uint8Array,
 *     który działa identycznie w Node i w przeglądarce.
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  // Wspólny krok: bajty → standardowy base64 (Node 16+ ma globalThis.btoa
  // wbudowane w runtime; w przeglądarce też).
  let binary = "";
  const CHUNK = 0x8000; // 32 KB — unikamy "Maximum call stack size exceeded"
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  // Wbudowany `btoa` jest dostępny globalnie (Node 16+ i przeglądarki).
  // Nie używamy go do **wejścia** (polskie znaki), ale do konwersji
  // **bajtów ASCII** (base64 to tylko [A-Za-z0-9+/=]) — w pełni bezpieczne.
  const standard = btoa(binary);
  // base64url: zamień '+' na '-', '/' na '_', wytnij '=' (padding).
  return standard.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

/**
 * Dekoduje base64url do bajtów (Uint8Array).
 *
 * Odwrotność `bytesToBase64Url`. Przyjmuje *tylko* poprawny base64url
 * (bez padding, z URL-safe znakami). Rzuca `CorruptedSnapshotUrlError`
 * jeśli payload ma niedozwolone znaki — UI dostaje czytelny komunikat.
 */
function base64UrlToBytes(payload: string): Uint8Array {
  // Przywróć standardowy base64: padding do wielokrotności 4, URL-safe → standard.
  let standard = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padding = standard.length % 4;
  if (padding === 2) standard += "==";
  else if (padding === 3) standard += "=";
  else if (padding !== 0) {
    throw new CorruptedSnapshotUrlError(
      `Nieprawidłowa długość base64url (${payload.length} znaków)`,
    );
  }
  // Walidacja znaków PRZED wywołaniem atob — bezpieczny komunikat błędu.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(standard)) {
    throw new CorruptedSnapshotUrlError(
      "Payload zawiera niedozwolone znaki (nie jest base64url)",
    );
  }
  let binary: string;
  try {
    binary = atob(standard);
  } catch (cause) {
    throw new CorruptedSnapshotUrlError(
      "Nie udało się zdekodować base64url",
      { cause },
    );
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ──────────────────────────────────────────────────────────────────────────
// Kompresja — wbudowany node:zlib (zero dodatkowych zależności)
// ──────────────────────────────────────────────────────────────────────────

/** Kompresuje bajty gzipem. Zwraca nowy Uint8Array (gzipSync mutuje wejście). */
function compressGzip(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(gzipSync(bytes));
}

/** Dekompresuje bajty gzipem. Rzuca na uszkodzony gzip. */
function decompressGzip(bytes: Uint8Array): Uint8Array {
  try {
    return new Uint8Array(gunzipSync(bytes));
  } catch (cause) {
    throw new CorruptedSnapshotUrlError(
      "Nie udało się zdekompresować gzip",
      { cause },
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// encodeSnapshot / decodeSnapshot — rdzeń tasku 10
// ──────────────────────────────────────────────────────────────────────────

/**
 * Wynik kodowania: `payload` to gotowy ciąg do wstawienia w `?s=payload`
 * (bez prefiksu `?s=` ani patha — to dodaje dopiero `snapshotToUrl`).
 *
 * `compressed: true` oznacza, że payload był gzipowany — przydatne
 * dla UI, który może pokazać "(skompresowany)" w devtools.
 */
export interface EncodedSnapshot {
  /** Tekst do wstawienia w URL (bez `?s=`). Tylko znaki base64url. */
  readonly payload: string;
  /** Czy payload był gzipowany (dla diagnostyki / devtools). */
  readonly compressed: boolean;
  /** Rozmiar surowego JSON (UTF-8) przed kompresją. */
  readonly rawBytes: number;
  /** Rozmiar payloadu base64url (≈ znaków w URL). */
  readonly encodedBytes: number;
}

/**
 * Koduje `CharacterSnapshot` do postaci gotowej do wstawienia w URL.
 *
 * Pipeline:
 *   snapshot → JSON (z bigint jako "123n") → UTF-8 bytes
 *     → [opcjonalnie gzip] → flaga 'p'/'z' + base64url
 *
 * **Dlaczego flaga jako pierwszy znak:**
 *   - szybka walidacja prefixu (`isValidSnapshotUrl`),
 *   - 1 bajt ASCII nie zmienia payloadu znacząco,
 *   - czytelny format w devtools.
 *
 * **Dlaczego UTF-8 + TextEncoder:**
 *   - polskie znaki (ąćłńśźż, U+00A0, emoji) → wiele bajtów UTF-8
 *     → **wymaga** kodowania na bajty PRZED base64url, bo base64
 *     operuje na bajtach, nie na znakach (patrz opis `bytesToBase64Url`).
 */
export function encodeSnapshot(snapshot: CharacterSnapshot): EncodedSnapshot {
  // 1) JSON (z własnym replacerem dla bigint)
  const json = JSON.stringify(snapshot, jsonReplacer);
  const bytes = TEXT_ENCODER.encode(json);
  const rawBytes = bytes.length;

  // 2) Decyzja: kompresować czy nie (próg 1 KB surowego JSON)
  if (rawBytes >= COMPRESSION_THRESHOLD_BYTES) {
    const compressed = compressGzip(bytes);
    // Flaga 'z' (gzip) + bajty
    const withFlag = new Uint8Array(compressed.length + 1);
    withFlag[0] = FLAG_GZIP.charCodeAt(0);
    withFlag.set(compressed, 1);
    const payload = bytesToBase64Url(withFlag);
    return {
      payload,
      compressed: true,
      rawBytes,
      encodedBytes: payload.length,
    };
  }

  // Plain: flaga 'p' + bajty
  const withFlag = new Uint8Array(bytes.length + 1);
  withFlag[0] = FLAG_PLAIN.charCodeAt(0);
  withFlag.set(bytes, 1);
  const payload = bytesToBase64Url(withFlag);
  return {
    payload,
    compressed: false,
    rawBytes,
    encodedBytes: payload.length,
  };
}

/**
 * Dekoduje payload z URL na `CharacterSnapshot`.
 *
 * Pipeline (odwrotny do `encodeSnapshot`):
 *   base64url → bajty → [sprawdź flagę] → [opcjonalnie gunzip]
 *     → UTF-8 text → JSON.parse (z reviver dla "123n" → bigint)
 *     → `CharacterSnapshotSchema.parse` (ostateczna walidacja Zod)
 *
 * **Co jeśli cokolwiek się nie uda** → rzuca `CorruptedSnapshotUrlError`
 * z komunikatem dla UI ("Nie udało się wczytać postaci z linku").
 * NIE silent-fail (arch. §13.4 mówi: "throw + fallback do pustego workspace
 * z komunikatem").
 *
 * @throws {CorruptedSnapshotUrlError} gdy payload jest uszkodzony
 *   na którymkolwiek etapie dekodowania.
 */
export function decodeSnapshot(payload: string): CharacterSnapshot {
  // 1) Payload do bajtów
  const withFlag = base64UrlToBytes(payload);
  if (withFlag.length < 1) {
    throw new CorruptedSnapshotUrlError("Pusty payload");
  }

  // 2) Flaga kompresji (noUncheckedIndexedAccess: TS wymaga `??` dla Uint8Array[])
  const flag = withFlag[0] ?? -1;
  const data = withFlag.subarray(1);
  let jsonBytes: Uint8Array;

  if (flag === FLAG_PLAIN.charCodeAt(0)) {
    jsonBytes = data;
  } else if (flag === FLAG_GZIP.charCodeAt(0)) {
    jsonBytes = decompressGzip(data);
  } else {
    throw new CorruptedSnapshotUrlError(
      `Nieznana flaga payloadu: 0x${flag.toString(16)}`,
    );
  }

  // 3) UTF-8 → JSON text. fatal:true → rzuca jeśli bajty niepoprawne.
  let jsonText: string;
  try {
    jsonText = TEXT_DECODER.decode(jsonBytes);
  } catch (cause) {
    throw new CorruptedSnapshotUrlError(
      "Payload nie jest poprawnym UTF-8",
      { cause },
    );
  }

  // 4) JSON.parse z reviverem dla bigint
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText, jsonReviver);
  } catch (cause) {
    throw new CorruptedSnapshotUrlError(
      "Payload nie jest poprawnym JSON-em",
      { cause },
    );
  }

  // 5) Zod — ostateczna walidacja (odrzuca obce pola, sprawdza refinements)
  const result = CharacterSnapshotSchema.safeParse(parsed);
  if (!result.success) {
    throw new CorruptedSnapshotUrlError(
      `Snapshot nie przechodzi walidacji: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

// ──────────────────────────────────────────────────────────────────────────
// Type guard — szybka walidacja prefixu
// ──────────────────────────────────────────────────────────────────────────

/**
 * Szybka walidacja: czy string wygląda jak nasz payload URL?
 *
 * Sprawdza **prefix** ('p' lub 'z') po dekodowaniu pierwszego bloku base64url.
 * Nie dekompresuje i nie parsuje JSON — służy do odrzucenia śmieci
 * (np. user wkleił losowy tekst) PRZED kosztownym dekodowaniem.
 *
 * Reguły:
 *   - długość ≥ 4 (minimalny sensowny payload)
 *   - tylko znaki base64url: [A-Za-z0-9_-]
 *   - po dekodowaniu pierwszego bajtu: 'p' (plain) lub 'z' (gzip)
 *
 * NIE sprawdza Zod (to robi `decodeSnapshot`) — szybki filtr.
 */
export function isValidSnapshotUrl(payload: string): boolean {
  if (typeof payload !== "string" || payload.length < 4) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) return false;
  // Spróbuj odczytać pierwszy bajt (flagę).
  const first = base64UrlToBytes(payload.slice(0, 4));
  if (first.length < 1) return false;
  const flag = first[0] ?? -1;
  return (
    flag === FLAG_PLAIN.charCodeAt(0) || flag === FLAG_GZIP.charCodeAt(0)
  );
}

/**
 * Wyciąga payload z pełnego URL (np. z `window.location.search` lub
 * `new URL(href).searchParams.get('s')`). Zwraca `null` gdy brak
 * lub gdy `?s` nie istnieje (lub gdy wartość jest pusta). NIE dekoduje
 * — użyj `decodeSnapshot`.
 *
 * Akceptowane formaty wejścia:
 *   - pełny URL:        `'https://rathleton.tools/pl/workspace?s=abc'`
 *   - search string:    `'?s=abc'` / `'?s=abc&auction=123'`
 *   - sam payload:      `'abc'` (dopasowanie regexem base64url)
 */
export function extractPayloadFromUrl(hrefOrSearch: string): string | null {
  if (typeof hrefOrSearch !== "string" || hrefOrSearch.length === 0) {
    return null;
  }
  try {
    let search: string;
    if (hrefOrSearch.startsWith("?")) {
      // Już search string — przytnij wszystko przed pierwszym '?'.
      const idx = hrefOrSearch.indexOf("?");
      search = hrefOrSearch.slice(idx);
    } else if (hrefOrSearch.includes("=") && !/^[A-Za-z0-9_-]+$/.test(hrefOrSearch)) {
      // Zawiera '=' ale nie jest gołym payloadem → traktuj jak search string
      // (np. `'s=abc&auction=123'` bez wiodącego '?').
      const idx = hrefOrSearch.indexOf("?");
      search = idx >= 0 ? hrefOrSearch.slice(idx) : `?${hrefOrSearch}`;
    } else if (/^[A-Za-z0-9_-]+$/.test(hrefOrSearch)) {
      // Goły payload base64url (bez `?s=` i bez scheme) — zwróć bezpośrednio.
      return hrefOrSearch.length > 0 ? hrefOrSearch : null;
    } else {
      // Pełny URL (lub cokolwiek z scheme/protokol) → parsuj przez URL.
      const url = new URL(hrefOrSearch);
      search = url.search;
    }
    const params = new URLSearchParams(search);
    const value = params.get(URL_QUERY_PARAM);
    // Traktuj pusty string tak samo jak brak — UI powinien dostać `null`.
    return value !== null && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
