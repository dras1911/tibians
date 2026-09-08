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
};

export default withNextIntl(nextConfig);