/**
 * Public API of `@tibians/ui`.
 *
 * Currently exposes:
 *   - The theme system (hook, no-fouc script, storage helpers, types).
 *   - CSS subpath exports (see package.json):
 *       '@tibians/ui/styles.css'        — combined tokens + typography
 *       '@tibians/ui/tokens.css'        — OKLCH palette only
 *       '@tibians/ui/typography.css'    — fonts + scale + .numeric
 *
 * Components (Button, Card, …) will land in Task 3 (shadcn mapping).
 */

export * from './theme/index';
