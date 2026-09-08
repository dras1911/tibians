/**
 * Public API of the `theme` module.
 *
 * Consumers should import from the package root (`@tibians/ui`), not from this
 * submodule. This file exists to keep the theme-related surface area in one
 * place for maintenance and tests.
 */

export type { ResolvedTheme, Theme, UseThemeResult } from './use-theme';
export { useTheme } from './use-theme';

// Storage / types — re-exported so SSR scripts and tests can use them.
export {
  DARK_CLASS,
  DEFAULT_RESOLVED,
  DEFAULT_THEME,
  STORAGE_KEY,
  SYSTEM_QUERY,
  THEME_ATTR,
} from './types';

export {
  applyThemeToDocument,
  getStoredTheme,
  isTheme,
  readInitialTheme,
  resolveTheme,
  setStoredTheme,
  subscribeSystemChange,
} from './storage';

// Anti-FOUC inline script generator.
export { NO_FOUC_SCRIPT_ID, noFoucScript } from './no-fouc';
