/**
 * next.config.mjs — ESM-only (potrzebne dla `remark-frontmatter` które jest
 * ESM-only). Następca `next.config.ts` (plan T62 + §9.2).
 *
 * Plugins:
 *   - `remark-frontmatter`        — rozpoznaje blok YAML `---` na początku MDX.
 *   - `remark-mdx-frontmatter`    — eksportuje go jako `export const frontmatter`
 *                                   (named export konsumowany przez
 *                                   `src/lib/blog/index.ts`).
 *
 * Inne wtyczki:
 *   - next-intl — wire message loader z `src/i18n/request.ts`.
 *   - webpack.extensionAlias — `.js` → `.ts|.tsx|.js|.jsx|.json|.mdx`
 *     dla transpilowanych workspace packages.
 */
import createNextIntlPlugin from "next-intl/plugin";
import createMDX from "@next/mdx";

import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const withMDX = createMDX({
  extension: /\.mdx?$/u,
  options: {
    remarkPlugins: [remarkFrontmatter, [remarkMdxFrontmatter, { name: "frontmatter" }]],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker (T70): standalone output = minimalny runtime image (~150MB vs ~1GB).
  // Wymaga `node server.js` w runner stage (patrz Dockerfile.web).
  output: "standalone",
  transpilePackages: [
    "@tibians/ui",
    "@tibians/shared",
    "@tibians/calc",
    "@tibians/character-context",
    "@tibians/db",
  ],
  webpack(config) {
    config.resolve = config.resolve ?? {};
    // Preferuj źródła `.ts`/`.tsx` nad ewentualnymi artefaktami `.js` w
    // workspace packages — skompilowany `.js` leżący obok `.ts` potrafi
    // wygrać rozwiązywanie importów bez rozszerzenia i rozjechać build
    // web (przypadek: stare `packages/db/src/**/*.js`).
    const existingExtensions = config.resolve.extensions ?? [".js", ".jsx", ".json"];
    config.resolve.extensions = [
      ".ts",
      ".tsx",
      ...existingExtensions.filter((ext) => ext !== ".ts" && ext !== ".tsx"),
    ];
    const existingExtensionAlias = config.resolve.extensionAlias ?? {};
    const tsExtensions = [".ts", ".tsx", ".js", ".jsx", ".json", ".mdx"];
    config.resolve.extensionAlias = {
      ...existingExtensionAlias,
      ".js": [...tsExtensions],
    };
    return config;
  },
};

export default withNextIntl(withMDX(nextConfig));
