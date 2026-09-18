/**
 * `/[locale]` — strona główna Tibians (W18, 2026-09-18).
 *
 * Główna = lista aukcji Char Bazaar z pełnymi filtrami (wzór: Exiva.pro),
 * 25 aukcji na stronę — „nasza główna strona to będzie 25 aukcji i tutaj
 * już możemy używać filtrów". Ta sama treść co `/[locale]/bazaar` —
 * współdzielony `BazaarPageContent` (variant="home" → kompaktowy nagłówek
 * z licznikiem; bez breadcrumbs i wielkiego hero).
 *
 * Historia: wcześniej (T53) hero + sekcja „Kończące się w ciągu godziny".
 * Komponenty `hero-section.tsx` / `ending-soon-section-live.tsx` zostają
 * w repo (nieużywane) — łatwo przywrócić, gdy wrócą na główną.
 *
 * ISR (arch §8.2): `revalidate = 300` + tag `auctions` (webhook T38).
 */

import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BazaarPageContent } from "@/components/bazaar/bazaar-page-content";
import { routing, type Locale } from "@/i18n/routing";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

// ───────────────────────────────────────────────────────────────────────
// ISR cache tag + 5 min fallback (arch §8.2)
// ───────────────────────────────────────────────────────────────────────

export const revalidate = 300;
export const dynamic = "force-dynamic"; // dopóki DB jest tylko w runtime

// ───────────────────────────────────────────────────────────────────────
// generateMetadata — locale-aware SEO
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

  const title = t("pageTitle");
  const localizedTitle = `${title} · Tibians`;
  const finalTitle = localizedTitle.length <= 60 ? localizedTitle : title;

  const description = t("pageDescription");
  const finalDescription =
    description.length <= 155 ? description : `${description.slice(0, 152)}…`;

  const canonical = `${SITE_URL}/${locale}`;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}`;
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
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: finalTitle,
      description: finalDescription,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const rawSearch = await searchParams;

  // ── JSON-LD: WebSite + SearchAction (SEO §4.3) ─────────────────────
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Tibians",
    url: `${SITE_URL}/${locale}`,
    inLanguage: locale === "pl" ? "pl-PL" : "en-US",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/${locale}/bazaar?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <BazaarPageContent locale={locale as Locale} rawSearchParams={rawSearch} variant="home" />

      {/* ── JSON-LD WebSite schema (SEO §4.3) ────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
