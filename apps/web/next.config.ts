import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl plugin wires up the message loader from `src/i18n/request.ts`.
// `transpilePackages` lets us import workspace packages directly from
// source (TypeScript) without a separate build step.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: [
    "@tibians/ui",
    "@tibians/shared",
    "@tibians/calc",
    "@tibians/character-context",
    "@tibians/db",
  ],
  // The workspace packages (`@tibians/calc`, `@tibians/character-context`)
  // emit `.js` import specifiers inside their TS source files — required
  // for ESM compatibility under `"moduleResolution": "Bundler"`. Next.js'
  // webpack resolver does not automatically map `.js` → `.ts`, so we teach
  // it to do so for any source file inside a transpiled workspace package.
  // Without this rule, builds fail with "Module not found: Can't resolve
  // './types.js'" for files like `packages/calc/src/index.ts`.
  webpack(config) {
    config.resolve = config.resolve ?? {};
    const existingExtensionAlias = (config.resolve.extensionAlias ??
      {}) as Record<string, string[]>;
    const tsExtensions = [".ts", ".tsx", ".js", ".jsx", ".json"];
    config.resolve.extensionAlias = {
      ...existingExtensionAlias,
      ".js": [...tsExtensions],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);