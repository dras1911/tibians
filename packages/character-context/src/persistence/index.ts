/**
 * @tibians/character-context — persistence barrel (task 12).
 *
 * Publiczne API warstwy localStorage "Moje postacie".
 * Konsumenci (apps/web) importują z tego pliku, żeby nie zależeć od
 * wewnętrznej struktury katalogów.
 */

// ──────────────────────────────────────────────────────────────────────────
// localStorage CRUD
// ──────────────────────────────────────────────────────────────────────────

export {
  SAVED_CHARACTERS_KEY,
  SAVED_CHARACTERS_VERSION,
  SavedCharacterSchema,
  SavedCharactersArraySchema,
  CharacterLimitReachedError,
  listSavedCharacters,
  getSavedCharacter,
  saveCharacter,
  deleteSavedCharacter,
  countSavedCharacters,
  type SavedCharacter,
  type SaveCharacterInput,
} from "./local-storage-characters.js";

// ──────────────────────────────────────────────────────────────────────────
// Limity (arch. §15.1)
// ──────────────────────────────────────────────────────────────────────────

export {
  FREE_CHARACTER_LIMIT,
  getLimit,
  canSaveMore,
} from "./limits.js";

// ──────────────────────────────────────────────────────────────────────────
// React hook — subskrypcja localStorage 'storage' event (multi-tab sync)
// ──────────────────────────────────────────────────────────────────────────

export { useSavedCharacters } from "./use-saved-characters.js";