/**
 * `/[locale]/bazaar/statistics` — statystyki rynkowe Char Bazaar
 * (plan task 58, arch §5 "Statystyki rynkowe z wykresami Recharts").
 *
 * Server Component (RSC) renderujący dashboard analityczny:
 *   - Karty KPI (top of fold): total active / finished, avg level,
 *     avg bid, median bid.
 *   - 4 wykresy Recharts (client island `<StatsCharts>`):
 *     1. Top vocations (count + avgBid) — BarChart grouped
 *     2. Top worlds (count) — BarChart horizontal
 *     3. Price distribution (histogram 6 bucketów) — BarChart
 *     4. Level distribution (5 bucketów) — PieChart
 *   - Lista "Recent sales" (10 ostatnich sprzedanych aukcji)
 *
 * Źródła danych (T58):
 *   - `getMarketStats()` — agregaty z `auctions` + `mv_facet_counts`.
 *     Zwraca: totalActive, totalFinished, avgLevel,
 *     recentFinishedCount, avgLevelFinished, medianLevel, avgBidFinished,
 *     medianBidFinished, topVocations, topWorlds, priceDistribution,
 *     levelDistribution, recentSales.
 *   - `getRecentSales(10)` — top 10 ostatnich sprzedanych z finalPrice.
 *
 * ISR (arch §8.2):
 *   - `revalidate = 900` (15 min) — statystyki zmieniają się wolno
 *     (zakończenia aukcji co 30-60 min).
 *
 * SEO (arch §4.3):
 *   - `generateMetadata` — locale-aware title/description
 *   - JSON-LD `WebPage` + `Dataset` schema
 *
 * i18n: namespace `Bazaar.statistics.*` (PL + EN).
 */

import * as React from "react";
import type { Metadata } from "next";
import { TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import {
  TopVocationsChart,
  TopWorldsChart,
  PriceDistributionChart,
  LevelDistributionChart,
} from "@/components/bazaar/stats-charts";
import { RecentSalesList } from "./recent-sales-list";
import {
  getMarketStats,
  getRecentSales,
} from "@/lib/server/auctions";
import { routing, type Locale } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const PATH = "/bazaar/statistics";

/**
 * ISR cache (arch §8.2): 15 min fallback. Statystyki rynkowe zmieniają
 * się z częstotliwością zakończeń aukcji (co 30-60 min) — 15 min
 * fallback jest komfortowy i nie obciąża DB.
 */
export const revalidate = 900;

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
    namespace: "Bazaar.statistics",
  });
  const tBazaar = await getTranslations({
    locale: locale as Locale,
    namespace: "Bazaar",
  });

  const title = t("pageTitle");
  const localizedTitle = `${title} · Tibians`;
  const finalTitle =
    localizedTitle.length <= 60 ? localizedTitle : title;

  const description = t("pageDescription");
  const finalDescription =
    description.length <= 155
      ? description
      : `${description.slice(0, 152)}…`;

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
          url: `${SITE_URL}/og/bazaar-statistics.png`,
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
    other: {
      "x-bazaar-cache-tag": "auctions",
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function StatisticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale as Locale;

  const [t, tBazaar] = await Promise.all([
    getTranslations({ locale, namespace: "Bazaar.statistics" }),
    getTranslations({ locale, namespace: "Bazaar" }),
  ]);

  // ── Równoległe zapytania (T58) ───────────────────────────────────
  // `getMarketStats()` ma już wewnętrznie `Promise.all` dla 6 zapytań.
  // `getRecentSales(10)` to 7. zapytanie — równolegle z market stats.
  const [stats, recentSales] = await Promise.all([
    getMarketStats(),
    getRecentSales(10),
  ]);

  // Wzbogacenie `recentSales` w `getMarketStats` wynikiem z `getRecentSales`
  // (split dla czytelności query plan). `stats.recentSales` jest puste
  // (deklarowane w typie, ale wypełniamy tutaj z osobnego query).
  stats.recentSales = recentSales.map((r: {
    auctionId: bigint;
    characterName: string;
    level: number;
    vocation: string;
    worldName: string;
    finalPrice: number | null;
    auctionEnd: Date;
  }) => ({
    auctionId: r.auctionId.toString(),
    characterName: r.characterName,
    level: r.level,
    vocation: r.vocation,
    worldName: r.worldName,
    finalPrice: r.finalPrice,
    auctionEnd: r.auctionEnd.toISOString(),
  }));

  // ── JSON-LD WebPage + Dataset schema (SEO §4.3 + arch §4.3) ──────
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t("pageTitle"),
    description: t("pageDescription"),
    url: `${SITE_URL}/${locale}${PATH}`,
    isPartOf: {
      "@type": "WebSite",
      name: "Tibians",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Tibians",
      url: SITE_URL,
    },
  };

  // ── Breadcrumbs ───────────────────────────────────────────────────
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tBazaar("title"), href: "/bazaar" },
    { label: t("pageTitle"), href: "/bazaar/statistics" },
  ];

  return (
    <div className="container py-6 md:py-8">
      {/* Breadcrumbs (z JSON-LD BreadcrumbList) */}
      <Breadcrumbs items={breadcrumbItems} />

      {/* Page heading */}
      <header className="mt-6 max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <TrendingUp className="h-6 w-6 text-primary" aria-hidden="true" />
          {t("pageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {t("pageDescription")}
        </p>
      </header>

      {/* ── KPI cards (top of fold) ──────────────────────────────────── */}
      <section
        aria-labelledby="stats-kpi-heading"
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <h2 id="stats-kpi-heading" className="sr-only">
          {t("kpiHeading")}
        </h2>
        <KpiCard
          label={t("kpi.totalActive")}
          value={stats.totalActive}
          locale={locale}
        />
        <KpiCard
          label={t("kpi.recentFinished")}
          value={stats.recentFinishedCount}
          hint={t("kpi.last30Days")}
          locale={locale}
        />
        <KpiCard
          label={t("kpi.avgLevelFinished")}
          value={stats.avgLevelFinished}
          format="number"
          locale={locale}
        />
        <KpiCard
          label={t("kpi.medianBidFinished")}
          value={stats.medianBidFinished}
          format="currency"
          locale={locale}
        />
      </section>

      {/* ── Wykresy (Recharts — client island) ────────────────────────── */}
      <section
        aria-labelledby="stats-charts-heading"
        className="mt-8 grid gap-4 lg:grid-cols-2"
      >
        <h2 id="stats-charts-heading" className="sr-only">
          {t("chartsHeading")}
        </h2>
        <TopVocationsChart data={stats.topVocations} />
        <TopWorldsChart data={stats.topWorlds} />
        <PriceDistributionChart data={stats.priceDistribution} />
        <LevelDistributionChart data={stats.levelDistribution} />
      </section>

      {/* ── Recent sales (10 ostatnich sprzedanych) ─────────────────── */}
      <section
        aria-labelledby="stats-recent-sales-heading"
        className="mt-8"
      >
        <h2
          id="stats-recent-sales-heading"
          className="mb-3 text-lg font-semibold tracking-tight text-foreground sm:text-xl"
        >
          {t("recentSalesHeading")}
        </h2>
        <RecentSalesList sales={stats.recentSales} />
      </section>

      {/* JSON-LD WebPage schema (SEO §4.3 + arch §4.3). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// KpiCard — top-of-fold KPI tile (arch §6.4 — duże liczby, jasna hierarchia)
// ───────────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: number | null;
  /** Format wyświetlania. */
  format?: "number" | "currency";
  hint?: string;
  /** Locale dla `Intl.NumberFormat` (arch §6.2 — locale-aware grouping). */
  locale: Locale;
}

function KpiCard({ label, value, format = "number", hint, locale }: KpiCardProps) {
  // Pre-format na serwerze — `Intl.NumberFormat` z locale, `useGrouping`
  // zapewnia separator tysięcy (PL: spacja niełamliwa, EN: przecinek).
  const formatted = React.useMemo(() => {
    if (value === null) return null;
    return new Intl.NumberFormat(locale, { useGrouping: true }).format(value);
  }, [value, locale]);

  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="numeric font-mono text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
          {formatted === null ? (
            <span className="text-muted-foreground">—</span>
          ) : format === "currency" ? (
            <>
              {formatted}
              <span className="ml-1 text-sm font-medium text-muted-foreground">
                TC
              </span>
            </>
          ) : (
            formatted
          )}
        </p>
        {hint !== undefined ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}