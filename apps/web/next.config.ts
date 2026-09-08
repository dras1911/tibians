import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@tibians/ui",
    "@tibians/shared",
    "@tibians/calc",
    "@tibians/character-context",
    "@tibians/db",
  ],
};

export default nextConfig;
