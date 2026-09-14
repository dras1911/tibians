/**
 * `/[locale]` — strona główna Tibians (plan T53, arch §5 krok 1).
 *
 * Zastępuje poprzedni placeholder (W9 batch 2 — wcześniej tylko `<h1>`
 * i link do `/dev/ui`).
 *
 * **Sekcje (arch §5 krok 1):**
 *   1. **Hero** — licznik aktywnych aukcji + freshness ("aktualizowane
 *      X min temu") + CTA do `/bazaar`
 *   2. **Kończące się w ciągu godziny** — 4 karty AuctionCard
 *      (live countdown — client side przez AuctionCard)
 *   3. **Ostatnio zaktualizowane** — 6 kart AuctionCard (last_seen_at DESC)
 *   4. **Najpopularniejsze kalkulatory** — 3 karty cross-sell
 *
 * **Fetch (arch §8.2):**
 *   - `Promise.all`: `getMarketStats()` + `getHomeFreshness()` +
 *     `listEndingSoon(1)` + `getRecentlyUpdated(6)`
 *   - Każda z 4 zapytań jest indeksowana (Partial Index `status='active'`).
 *
 * **ISR (arch §8.2):**
 *   - `revalidate = 300` (5 min fallback; webhook T38 invaliduje
 *     cache przez tag `home` gdy scrape zakończy się)
 *
 * **SEO (arch §4.3):**
 *   - `generateMetadata` — locale-aware title/description
 *   - JSON-LD `WebSite` + `Organization` schema
 *
 * **i18n:** namespace `Home.*` (PL + EN).
 *
 * **Brak breadcrumbs** (jesteśmy na root `/`, nie podstroną — arch §4.2).
 */

import * as React from "react";
import type { Metadata } from "next";
import { RefreshCcw, Sparkles } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  AuctionSection,
} from "@/components/home/auction-section";
import { CrossSellSection } from "@/components/home/cross-sell-section";
import { EndingSoonSectionLive } from "@/components/home/ending-soon-section-live";
import { HeroSection } from "@/components/home/hero-section";
import { toAuctionSummaries } from "@/components/bazaar/auction-summary";
import {
  getHomeFreshness,
  getMarketStats,
  getRecentlyUpdated,
  listEndingSoon,
} from "@/lib/server/auctions";
import { routing } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

// ───────────────────────────────────────────────────────────────────────
// ISR cache tag + 5 min fallback (arch §8.2)
// ───────────────────────────────────────────────────────────────────────

export const revalidate = 300;

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
    locale,
    namespace: "Home",
  });

  const title = t("title");
  const description = t("subtitle");
  const path = "/";

  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}${path}`;
  }

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}${path}`,
      languages,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}${path}`,
      siteName: "Tibians",
      locale: locale === "pl" ? "pl_PL" : "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    other: {
      "x-home-cache-tag": "home",
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Równoległy fetch wszystkich danych home (arch §8.2).
  const [stats, freshness, endingSoonRows, recentlyUpdatedRows] =
    await Promise.all([
      getMarketStats(),
      getHomeFreshness(),
      listEndingSoon(1), // < 1h
      getRecentlyUpdated(6),
    ]);

  // Konwersja AuctionRow → AuctionSummary (client-safe).
  const endingSoon = toAuctionSummaries(endingSoonRows);
  const recentlyUpdated = toAuctionSummaries(recentlyUpdatedRows);

  // i18n dla sekcji.
  const tHome = await getTranslations({
    locale,
    namespace: "Home",
  });

  // ── JSON-LD: WebSite + SearchAction (SEO §4.3) ─────────────────────
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Tibians",
    url: `${SITE_URL}/${locale}`,
    description: tHome("subtitle"),
    inLanguage: locale === "pl" ? "pl-PL" : "en-US",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/${locale}/bazaar?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <div className="container py-8 md:py-12">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <HeroSection
        totalActive={stats.totalActive}
        freshness={freshness}
      />

      {/* ── Sekcja "Kończące się w ciągu godziny" — LIVE SSE (T59) ────── */}
      <div className="mt-12">
        <EndingSoonSectionLive
          initialAuctions={endingSoon}
          title={tHome("sections.endingSoon.title")}
          description={tHome("sections.endingSoon.description")}
          viewAllLabel={tHome("sections.endingSoon.viewAll")}
          emptyTitle={tHome("empty.endingSoonTitle")}
          emptyDescription={tHome("empty.endingSoonDescription")}
        />
      </div>

      {/* ── Sekcja "Ostatnio zaktualizowane" (6 kart) ─────────────────── */}
      <div className="mt-12">
        <AuctionSection
          sectionId="recently-updated"
          title={tHome("sections.recentlyUpdated.title")}
          description={tHome("sections.recentlyUpdated.description")}
          icon={RefreshCcw}
          auctions={recentlyUpdated}
          viewAllHref="/bazaar?sort=newest"
          viewAllLabel={tHome("sections.recentlyUpdated.viewAll")}
          emptyTitle={tHome("empty.recentTitle")}
          emptyDescription={tHome("empty.recentDescription")}
          maxItems={6}
        />
      </div>

      {/* ── Cross-sell: 3 kalkulatory ─────────────────────────────────── */}
      <div className="mt-12">
        <CrossSellSection
          title={tHome("sections.crossSell.title")}
          description={tHome("sections.crossSell.description")}
          viewAllLabel={tHome("sections.crossSell.viewAll")}
          viewAllHref="/calculators"
        />
      </div>

      {/* ── JSON-LD WebSite schema (SEO §4.3) ────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

// Suppress unused-import warning dla Sparkles (zarezerwowane do przyszłych wariacji)
void Sparkles;
