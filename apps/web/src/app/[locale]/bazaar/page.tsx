/**
 * `/[locale]/bazaar` — lista aukcji Char Bazaar (plan task 39, arch §5).
 *
 * Od W18 (2026-09-18) treść listy (fetch + filtry + render) mieszka we
 * współdzielonym `BazaarPageContent` — ta trasa renderuje go z
 * `variant="bazaar"` (breadcrumbs + pełny nagłówek SEO). Ta sama treść
 * jest na stronie głównej `/[locale]` (`variant="home"`).
 *
 * URL state (filtry/sort/paginacja) — bez zmian: `?levelMin=…&page=2`.
 * ISR cache tag `auctions` (arch §8.2) → revalidowany przez /api/revalidate.
 */

import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BazaarPageContent } from "@/components/bazaar/bazaar-page-content";
import { routing, type Locale } from "@/i18n/routing";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const PATH = "/bazaar";

/**
 * ISR cache tag (arch §8.2): pozwala `revalidateTag('auctions')`
 * z `/api/revalidate` (T38) wymusić natychmiastowy refresh po scrape.
 * `revalidate = 300` (5 min fallback) gdy webhook nie przyjdzie.
 */
export const revalidate = 300;
export const dynamic = "force-dynamic"; // dopóki DB jest tylko w runtime; po W8 → ISR

// ───────────────────────────────────────────────────────────────────────
// generateMetadata — per-locale SEO
// ───────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Bazaar.list",
  });
  const tBazaar = await getTranslations({
    locale: locale as Locale,
    namespace: "Bazaar",
  });

  // Title ≤ 60 znaków (SEO best practice).
  const title = t("pageTitle");
  const localizedTitle = `${title} · Tibians`;
  const finalTitle = localizedTitle.length <= 60 ? localizedTitle : title;

  const description = t("pageDescription");
  const finalDescription =
    description.length <= 155 ? description : `${description.slice(0, 152)}…`;

  const canonical = `${SITE_URL}/${locale}${PATH}`;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}${PATH}`;
  }

  return {
    title: finalTitle,
    description: finalDescription,
    alternates: { canonical, languages },
    openGraph: {
      title: finalTitle,
      description: finalDescription,
      url: canonical,
      siteName: "Tibians",
      locale: locale === "pl" ? "pl_PL" : "en_US",
      type: "website",
      images: [
        {
          url: `${SITE_URL}/og/bazaar.png`,
          width: 1200,
          height: 630,
          alt: tBazaar("title"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: finalTitle,
      description: finalDescription,
    },
    // JSON-LD ItemList schema dla listy aukcji (SEO §4.3).
    other: {
      "x-bazaar-cache-tag": "auctions",
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function BazaarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const rawSearch = await searchParams;

  return (
    <BazaarPageContent locale={locale as Locale} rawSearchParams={rawSearch} variant="bazaar" />
  );
}
