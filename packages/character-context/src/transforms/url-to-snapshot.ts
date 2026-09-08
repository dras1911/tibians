/**
 * @tibians/character-context — `urlToSnapshot`.
 *
 * Dekoduje `CharacterSnapshot` z URL (query string `?s=…`).
 *
 * Odwrotność `snapshotToUrl`. Akceptuje:
 *   - pełny URL: `'https://rathleton.tools/workspace?s=abc'`
 *   - search string: `'?s=abc'`
 *   - sam payload: `'abc'`
 *
 * **Zachowanie przy błędzie:**
 *   - `null` → zwraca `null` (brak `?s=` w URL)
 *   - payload obecny ale uszkodzony → rzuca `CorruptedSnapshotUrlError`
 *     z czytelnym komunikatem dla UI ("Nie udało się wczytać postaci
 *     z linku — link jest uszkodzony lub nieaktualny")
 *
 * Wzorzec użycia (apps/web):
 *   ```ts
 *   try {
 *     const snap = urlToSnapshot(search);
 *     if (snap) loadWorkspace(snap);
 *   } catch (e) {
 *     if (e instanceof CorruptedSnapshotUrlError) {
 *       showError("Link jest uszkodzony");
 *       loadEmptyWorkspace(); // fallback (arch. §13.4)
 *     }
 *   }
 *   ```
 *
 * Arch. §13.4: "throw + fallback do pustego workspace z komunikatem".
 * NIE silent fail (NIE zwracamy `null` na corrupted URL — UI musi wiedzieć).
 */
import type { CharacterSnapshot } from "../schema.js";
import {
  CorruptedSnapshotUrlError,
  decodeSnapshot,
  extractPayloadFromUrl,
  isValidSnapshotUrl,
} from "./encoding.js";

// ──────────────────────────────────────────────────────────────────────────
// Główna funkcja
// ──────────────────────────────────────────────────────────────────────────

/**
 * URL (lub search string / sam payload) → `CharacterSnapshot`.
 *
 * @param hrefOrSearch  URL do sparsowania. Akceptuje:
 *   - `'https://rathleton.tools/workspace?s=abc'` (pełny URL)
 *   - `'?s=abc'` (search string)
 *   - `'abc'` (goły payload z `?s=`)
 *
 * @returns `CharacterSnapshot` lub `null` gdy URL nie zawiera `?s=…`
 *
 * @throws {CorruptedSnapshotUrlError} gdy payload jest obecny, ale:
 *   - nie przechodzi walidacji prefixu (`isValidSnapshotUrl` → false)
 *   - base64url jest uszkodzony (niedozwolone znaki, zła długość)
 *   - dekompresja gzip się nie powiedzie
 *   - JSON.parse się nie powiedzie
 *   - Zod walidacja `CharacterSnapshotSchema.parse` się nie powiedzie
 *
 *   Komunikat jest po polsku (target UI PL — domyślny język portalu).
 *   Devtools pokaże oryginalny błąd w `error.cause`.
 */
export function urlToSnapshot(hrefOrSearch: string): CharacterSnapshot | null {
  // 1) Wyciągnij payload z URL (lub zwróć null gdy brak `?s=`)
  const payload = extractPayloadFromUrl(hrefOrSearch);
  if (payload === null || payload === "") {
    return null;
  }

  // 2) Szybka walidacja prefixu (bez kosztownego dekodowania)
  if (!isValidSnapshotUrl(payload)) {
    throw new CorruptedSnapshotUrlError(
      "Link nie wygląda jak prawidłowy snapshot (zły prefix)",
    );
  }

  // 3) Pełne dekodowanie + walidacja Zod (decodeSnapshot sam rzuca
  //    CorruptedSnapshotUrlError na każdym etapie)
  return decodeSnapshot(payload);
}

// ──────────────────────────────────────────────────────────────────────────
// Wariant "nie rzucaj" — dla UI, który woli sam zdecydować co zrobić
// ──────────────────────────────────────────────────────────────────────────

/**
 * Wariant bezpieczny: zwraca wynik w postaci obiektu (success/error)
 * zamiast rzucać. Przydatne w React, gdzie try/catch w renderze jest
 * niewygodny (a `useEffect` + setState + try/catch bywa verbose).
 *
 * @example
 * ```ts
 * const result = safeUrlToSnapshot(search);
 * if (result.ok) loadWorkspace(result.snapshot);
 * else if (result.error === "missing") loadEmptyWorkspace();
 * else showError(result.message);
 * ```
 */
export type SafeUrlToSnapshotResult =
  | { readonly ok: true; readonly snapshot: CharacterSnapshot }
  | { readonly ok: false; readonly error: "missing" }
  | {
      readonly ok: false;
      readonly error: "corrupted";
      readonly message: string;
    };

export function safeUrlToSnapshot(
  hrefOrSearch: string,
): SafeUrlToSnapshotResult {
  try {
    const snapshot = urlToSnapshot(hrefOrSearch);
    if (snapshot === null) return { ok: false, error: "missing" };
    return { ok: true, snapshot };
  } catch (e) {
    if (e instanceof CorruptedSnapshotUrlError) {
      return { ok: false, error: "corrupted", message: e.message };
    }
    // Nieoczekiwany błąd (np. JSON.parse z poza naszym scope).
    // Zwracamy jako corrupted z genericznym komunikatem.
    return {
      ok: false,
      error: "corrupted",
      message: "Nieoczekiwany błąd dekodowania",
    };
  }
}
