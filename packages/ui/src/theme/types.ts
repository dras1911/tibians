/**
 * Theme types and constants shared by `useTheme`, the no-fouc script, and
 * any consumer that needs to talk about the active theme.
 *
 * Storage key: `'tt-theme'` (Tibians Tools). Single source of truth — both
 * the no-fouc inline script and the React hook MUST use this constant.
 */

export type Theme = 'light' | 'dark' | 'system';

/** Resolved theme — what the UI actually renders. Always one of `'light' | 'dark'`. */
export type ResolvedTheme = 'light' | 'dark';

/** localStorage key. Must match the no-fouc script string. */
export const STORAGE_KEY = 'tt-theme';

/** `prefers-color-scheme` media query used by matchMedia listener. */
export const SYSTEM_QUERY = '(prefers-color-scheme: dark)';

/** Default when no preference is stored and the media query cannot be evaluated. */
export const DEFAULT_THEME: Theme = 'system';
export const DEFAULT_RESOLVED: ResolvedTheme = 'light';

/** HTML class toggled on `<html>` for dark mode. Single source of truth. */
export const DARK_CLASS = 'dark';

/** `data-theme` attribute on `<html>` for non-CSS consumers (JS, tests). */
export const THEME_ATTR = 'data-theme';
