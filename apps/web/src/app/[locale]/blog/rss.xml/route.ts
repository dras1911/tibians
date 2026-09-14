/**
 * `/[locale]/blog/rss.xml` — RSS 2.0 feed dla bloga (plan T62, arch §9.2).
 *
 * Route handler Next.js 15 (App Router) — generuje poprawny XML z nagłówkiem
 * `Content-Type: application/rss+xml`. W3C Feed Validator powinien przejść:
  - poprawny `<?xml version="1.0" encoding="UTF-8"?>`
 * - `<rss version="2.0">` z `xmlns:atom`
 * - `<channel>` + `<item>` per post
 * - `<atom:link rel="self" />` (wymóg validatora)
 * - `<language>` per locale
 * - `<dc:creator>` (Dublin Core author extension)
 *
 * ISR: `revalidate = 3600` (1h) — blog rzadko się zmienia.
 *
 * i18n: feed PL (`pl-PL`) vs EN (`en-US`) — osobny URL per locale.
 */

import { getTranslations } from "next-intl/server";

import { getAllPosts, summarizePost, buildRssFeed } from "@/lib/blog";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

/** ISR: 1h (cache per-locale, route handler dedykowany URL). */
export const revalidate = 3600;

const FEED_PATH = "/blog/rss.xml";

export async function GET(): Promise<Response> {
  // Aggregujemy posty PL + EN w jednym feed dla ogólnego kanału bloga.
  // Alternatywnie moglibyśmy ograniczyć do jednego locale — tu zostawiamy
  // global feed (oba locale zmieszane, posortowane po dacie DESC).
  const allPosts = [...getAllPosts("pl"), ...getAllPosts("en")]
    .map(summarizePost)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  // Tytuł feedu używa locale "pl" (główny język portalu).
  const t = await getTranslations({ locale: "pl", namespace: "Blog.list" });
  const title = t("rssTitle");
  const description = t("rssDescription");

  const xml = buildRssFeed(allPosts, {
    locale: "pl",
    siteUrl: SITE_URL,
    title,
    description,
    feedPath: FEED_PATH,
  });

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}