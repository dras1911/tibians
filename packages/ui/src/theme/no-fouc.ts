/**
 * Anti-FOUC inline script generator.
 *
 * MUST be injected as the FIRST element of `<head>`, BEFORE any stylesheet or
 * content renders. Reads the stored preference (or falls back to
 * `prefers-color-scheme`) and toggles the `.dark` class on `<html>` so the
 * first paint is already in the correct theme.
 *
 * Why this exists (§6.5): the React hydration that calls `useTheme()` happens
 * AFTER the initial paint. Without this script, the first frame would render
 * with the default (`:root` = light) tokens, then flip to dark on hydration —
 * the user sees a white flash. Inline + sync = no flash, ever.
 *
 * Output is a single synchronous IIFE — zero allocations on the hot path,
 * no external dependencies, no `await`. Safe to use in any HTML template.
 *
 * Usage (e.g. Next.js app/layout.tsx):
 *
 *   import { noFoucScript } from '@tibians/ui'
 *
 *   <head>
 *     <script dangerouslySetInnerHTML={{ __html: noFoucScript() }} />
 *     ...
 *   </head>
 *
 * The script mirrors the logic in `theme/storage.ts` exactly. The two MUST
 * stay in sync; if you change one, change the other.
 */

export const NO_FOUC_SCRIPT_ID = 'tt-no-fouc';

/**
 * Returns the inline script source. Stored in a constant so it can be unit
 * tested and audited without depending on React or Next.js.
 */
export function noFoucScript(): string {
  // Kept as a template literal so the string is fully minified by tsc/swc.
  // No comments, no whitespace, single expression — runtime cost ≈ 0.
  return `(function(){try{var t=localStorage.getItem('tt-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;
}
