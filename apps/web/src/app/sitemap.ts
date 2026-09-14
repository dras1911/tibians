import type { MetadataRoute } from "next";

/**
 * Sitemap (T65, arch §9.2) — native Next.js App Router sitemap.
 *
 * Generuje wpisy dla wszystkich statycznych tras + kalkulatorów w obu locale.
 * Dynamiczne trasy (aukcje, blog posty) pomijamy w MVP (sitemap rośnie wraz z
 * liczbą aukcji → osobna trasa w Fazie 5/6 gdy będzie stabilny URL pattern).
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tibians.tools";
const LOCALES = ["pl", "en"] as const;

interface StaticRoute {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}

const STATIC_ROUTES: readonly StaticRoute[] = [
  { path: "", changeFrequency: "daily", priority: 1.0 },
  { path: "/bazaar", changeFrequency: "hourly", priority: 0.9 },
  { path: "/bazaar/ending-soon", changeFrequency: "hourly", priority: 0.8 },
  { path: "/bazaar/history", changeFrequency: "daily", priority: 0.6 },
  { path: "/bazaar/statistics", changeFrequency: "daily", priority: 0.6 },
  { path: "/calculators", changeFrequency: "weekly", priority: 0.8 },
  { path: "/bosses", changeFrequency: "daily", priority: 0.6 },
  { path: "/reference", changeFrequency: "weekly", priority: 0.5 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.6 },
];

const CALCULATOR_SLUGS = [
  "exercise-weapons",
  "skills",
  "true-skill",
  "stamina",
  "experience",
  "leech",
  "exp-share",
  "imbuement",
  "blessings",
  "weekly-tasks",
  "charms",
  "character-value",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of LOCALES) {
    for (const route of STATIC_ROUTES) {
      entries.push({
        url: `${BASE_URL}/${locale}${route.path}`,
        lastModified: new Date(),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        alternates: {
          languages: {
            pl: `${BASE_URL}/pl${route.path}`,
            en: `${BASE_URL}/en${route.path}`,
          },
        },
      });
    }

    for (const slug of CALCULATOR_SLUGS) {
      entries.push({
        url: `${BASE_URL}/${locale}/calculators/${slug}`,
        lastModified: new Date(),
        changeFrequency: "monthly",
        priority: 0.8,
        alternates: {
          languages: {
            pl: `${BASE_URL}/pl/calculators/${slug}`,
            en: `${BASE_URL}/en/calculators/${slug}`,
          },
        },
      });
    }
  }

  return entries;
}
