/**
 * @tibians/character-context — limity zapisanych postaci (task 12).
 *
 * Arch. §15.1 (D4 Freemium tier list):
 *   - **Free (anonymous):** limit 3 zapisanych postaci.
 *   - **Zalogowany (Faza 6, Discord OAuth):** bez limitu (Infinity).
 *
 * Faza 6 (T79) migruje "Moje postacie" z localStorage do DB per user —
 * ta sama logika, inna warstwa persystencji (arch. §16).
 */

/** Limit dla niezalogowanych (free) — arch. §15.1. */
export const FREE_CHARACTER_LIMIT = 3;

/**
 * Zwraca limit zapisanych postaci.
 *
 * @param isAuthenticated czy użytkownik jest zalogowany (Faza 6+).
 * @returns `3` dla anonymous, `Infinity` dla zalogowanych.
 */
export function getLimit(isAuthenticated: boolean): number {
  return isAuthenticated ? Infinity : FREE_CHARACTER_LIMIT;
}

/**
 * Czy można zapisać kolejną postać przy obecnej liczbie.
 *
 * @param isAuthenticated czy użytkownik jest zalogowany.
 * @param current aktualna liczba zapisanych postaci.
 * @returns `true` gdy `current < getLimit(isAuthenticated)`.
 */
export function canSaveMore(
  isAuthenticated: boolean,
  current: number,
): boolean {
  return current < getLimit(isAuthenticated);
}