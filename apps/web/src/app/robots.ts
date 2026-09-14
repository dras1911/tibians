import type { MetadataRoute } from "next";

/**
 * Robots.txt (T65, arch §9.2) — native Next.js App Router robots.
 *
 * Blokuje `/api/*`, `/dev/*` i `/_next/*` (infrastruktura). Wskazuje sitemap.
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tibians.tools";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dev/", "/_next/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
