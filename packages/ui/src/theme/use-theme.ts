'use client';

/**
 * `useTheme()` — React hook for reading and updating the active theme.
 *
 * Lifecycle:
 *   1. SSR/initial render: returns `theme = 'system'`, `resolvedTheme = 'light'`.
 *      The DOM is colored correctly because the no-fouc inline script ran
 *      in `<head>` before paint.
 *   2. Mount: reads `localStorage`; if a stored preference exists, updates
 *      state to match it. The `.dark` class is reapplied (idempotent).
 *   3. `theme === 'system'`: subscribes to `prefers-color-scheme` change so
 *      toggling the OS dark mode live-updates the UI without reload.
 *   4. `setTheme(newTheme)`: writes to localStorage AND updates React state,
 *      so the next render reflects the new theme immediately.
 *
 * SSR safety: `useState` initializer never touches `window` (would crash on
 * server). All `localStorage` / `matchMedia` access is inside `useEffect`,
 * which only runs on the client.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  applyThemeToDocument,
  getStoredTheme,
  resolveTheme,
  setStoredTheme,
  subscribeSystemChange,
} from './storage';
import {
  DEFAULT_RESOLVED,
  DEFAULT_THEME,
  type ResolvedTheme,
  type Theme,
} from './types';

// Re-export so consumers can `import type { Theme } from '@tibians/ui'`
// without reaching into a subpath.
export type { ResolvedTheme, Theme } from './types';

export interface UseThemeResult {
  /** Raw user preference — `'light' | 'dark' | 'system'`. */
  theme: Theme;
  /** Concrete theme currently rendered — `'light' | 'dark'`. */
  resolvedTheme: ResolvedTheme;
  /** Update the preference. Persists to localStorage and re-applies. */
  setTheme: (theme: Theme) => void;
}

export function useTheme(): UseThemeResult {
  // Server-safe defaults. These are also the values the no-fouc script
  // guarantees if storage is empty: theme = system, resolved = light.
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(DEFAULT_RESOLVED);

  // 1. On mount, sync from localStorage and apply to DOM.
  useEffect(() => {
    const stored = getStoredTheme();
    if (stored !== null && stored !== theme) {
      setThemeState(stored);
      const resolved = resolveTheme(stored);
      setResolvedTheme(resolved);
      applyThemeToDocument(resolved);
    } else {
      // Even if storage matches state, ensure DOM reflects the resolved value.
      const resolved = resolveTheme(theme);
      setResolvedTheme(resolved);
      applyThemeToDocument(resolved);
    }
    // Run only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Whenever `theme` changes, re-apply to DOM.
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyThemeToDocument(resolved);
  }, [theme]);

  // 3. When `theme === 'system'`, react to OS-level preference changes.
  useEffect(() => {
    if (theme !== 'system') return undefined;
    return subscribeSystemChange(() => {
      const resolved = resolveTheme('system');
      setResolvedTheme(resolved);
      applyThemeToDocument(resolved);
    });
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setStoredTheme(next);
    setThemeState(next);
  }, []);

  return { theme, resolvedTheme, setTheme };
}
