/**
 * @tibians/character-context — publiczne API transformacji.
 *
 * Eksportuje 4 transformacje (task 10):
 *   - `formDataToSnapshot`  — formularz ręczny → snapshot
 *   - `snapshotToFormData`  — snapshot → formularz ręczny (odwrotność)
 *   - `snapshotToUrl`       — snapshot → shareable URL (?s=…)
 *   - `urlToSnapshot`       — URL → snapshot (z walidacją Zod)
 *
 * Plus helpery i typy pomocnicze (encoding/error/diagnostyka).
 *
 * Reguły (arch. §13.4):
 *   - URL jest **kompletny** (każde pole snapshotu odtwarzalne)
 *   - Unicode-safe (polskie znaki, emoji, U+00A0)
 *   - **Bez `btoa`/`atob`** na surowych stringach (Unicode corruption)
 *   - corrupted URL → throw `CorruptedSnapshotUrlError` (nie silent fail)
 *   - opcjonalna kompresja gzip dla payloadów ≥ 1 KB
 */

// ──────────────────────────────────────────────────────────────────────────
// Rdzeń: 4 transformacje
// ──────────────────────────────────────────────────────────────────────────

export { formDataToSnapshot } from "./form-to-snapshot.js";
export type { ManualFormData } from "./form-to-snapshot.js";
export { VOCATION_BASE_TO_PROMOTED } from "./form-to-snapshot.js";

export { snapshotToFormData } from "./snapshot-to-form.js";

export {
  snapshotToUrl,
  formatUrlSize,
  DEFAULT_WORKSPACE_PATH,
} from "./snapshot-to-url.js";
export type { SnapshotUrl, SnapshotUrlOptions } from "./snapshot-to-url.js";

export { urlToSnapshot, safeUrlToSnapshot } from "./url-to-snapshot.js";
export type { SafeUrlToSnapshotResult } from "./url-to-snapshot.js";

// ──────────────────────────────────────────────────────────────────────────
// Encoding helpers (niskopoziomowe, ale przydatne dla UI/diagnostyki)
// ──────────────────────────────────────────────────────────────────────────

export {
  encodeSnapshot,
  decodeSnapshot,
  isValidSnapshotUrl,
  extractPayloadFromUrl,
  CorruptedSnapshotUrlError,
  URL_QUERY_PARAM,
} from "./encoding.js";
export type { EncodedSnapshot } from "./encoding.js";
