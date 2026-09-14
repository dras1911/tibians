import type { MetadataRoute } from "next";

/**
 * PWA manifest (T69, arch §18.4) — native Next.js App Router manifest.
 *
 * Generuje `/manifest.webmanifest`. Ikony: SVG (`/icons/icon.svg`) —
 * Chrome/Edge akceptują SVG; dla pełnej zgodności (iOS/Safari) warto
 * dodać PNG 192/512 w Fazie 6 (deployment).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tibians — Char Bazaar & Kalkulatory",
    short_name: "Tibians",
    description:
      "Community hub dla graczy Tibii: kalkulatory, wycena postaci i analiza Char Bazaar.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fafafa",
    // Tibian green — ekwiwalent oklch(52% 0.13 155) w sRGB.
    theme_color: "#16a34a",
    lang: "pl",
    dir: "ltr",
    categories: ["games", "utilities", "productivity"],
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
