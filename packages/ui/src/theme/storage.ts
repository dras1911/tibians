/**
 * SSR-safe theme storage + DOM helpers. No React. No JSX. Pure TypeScript so
 * it can also run in non-React contexts (scripts, server components, tests).
 *
 * All functions gracefully no-op when `window`/`document`/`localStorage` are
 * unavailable (e.g. SSR), so the same module can be imported anywhere.
 */

import {
  DARK_CLASS,
  DEFAULT_RESOLVED,
  DEFAULT_THEME,
  STORAGE_KEY,
  SYSTEM_QUERY,
  THEME_ATTR,
  type ResolvedTheme,
  type Theme,
} from './types';

/** Type guard for Theme — used to validate localStorage values. */
export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Read the stored theme preference, or `null` if absent / invalid. */
export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    // Private mode, quota, or storage disabled — fall through.
    return null;
  }
}

/** Persist the theme preference. No-op during SSR. */
export function setStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable — ignore.
  }
}

/**
 * Resolve a theme to the actual mode that should be rendered. When the theme
 * is `'system'`, falls back to the OS preference (defaulting to `'light'` if
 * `matchMedia` is unavailable, e.g. SSR).
 */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'light') return 'light';
  if (theme === 'dark') return 'dark';
  // 'system'
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return DEFAULT_RESOLVED;
  }
  return window.matchMedia(SYSTEM_QUERY).matches ? 'dark' : 'light';
}

/** Apply the resolved theme to `<html>` by toggling the `.dark` class. */
export function applyThemeToDocument(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add(DARK_CLASS);
  } else {
    root.classList.remove(DARK_CLASS);
  }
  root.setAttribute(THEME_ATTR, resolved);
}

/**
 * Subscribe to changes in the OS `prefers-color-scheme`. Returns an
 * unsubscribe function. No-op during SSR (returns a noop unsubscribe).
 */
export function subscribeSystemChange(handler: () => void): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => {};
  }
  const mq = window.matchMedia(SYSTEM_QUERY);
  // `addEventListener` is the modern API; older Safari used `addListener`.
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }
  // Fallback for ancient browsers (kept for completeness, not in our QA matrix).
  type LegacyMediaQueryList = {
    addListener: (cb: () => void) => void;
    removeListener: (cb: () => void) => void;
  };
  const legacy = mq as unknown as LegacyMediaQueryList;
  legacy.addListener(handler);
  return () => legacy.removeListener(handler);
}

/** Convenience: read theme from storage, or fall back to DEFAULT_THEME. */
export function readInitialTheme(): Theme {
  return getStoredTheme() ?? DEFAULT_THEME;
}
