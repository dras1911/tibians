/**
 * Globalne rozszerzenia typów dla aplikacji web.
 *
 * `globalThis.__tibiansRateLimit` — store dla in-memory rate limitera
 * (apps/web/src/lib/server/rate-limit.ts). Zachowujemy go przez HMR
 * w dev mode (jak globalForDb w packages/db/src/index.ts).
 */
declare global {
  // eslint-disable-next-line no-var
  var __tibiansRateLimit:
    | Map<string, { timestamps: number[] }>
    | undefined;
}

/**
 * `import.meta.glob` — deklaracja dla bundlerów wspierających ten format
 * (Next.js 15 + Turbopack/webpack z rozszerzeniem). Używane przez
 * `src/lib/blog/index.ts` do statycznego importu postów MDX.
 */
declare module "*.mdx" {
  import type { ComponentType } from "react";

  const component: ComponentType<Record<string, unknown>> & {
    frontmatter?: Record<string, unknown>;
  };
  export default component;
  export const frontmatter: Record<string, unknown>;
}

export {};
