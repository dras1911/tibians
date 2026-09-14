/**
 * `/[locale]/bazaar/compare` — strona porównania 2 aukcji (plan T51,
 * arch §5 krok 6 + §15.1 limit 2 w MVP).
 *
 * **Search params:**
 *   - `?a={id}` — ID pierwszej aukcji (lewa kolumna)
 *   - `?b={id}` — ID drugiej aukcji (prawa kolumna)
 *   - Brak któregoś → wyświetlamy `<ComparePicker>` (gdy jest tylko A)
 *     albo pusty stan "Wybierz 2 aukcje" (gdy brak obu).
 *
 * **Fetch:**
 *   - Dla obu aukcji wywołujemy `getAuctionById(db, id)` (T38) równolegle
 *     `Promise.all` — łączny czas ≈ 5-10 ms (Index Scan PK).
 *   - Top 10 najnowszych (`getRecentAuctions(10)`) do dropdownu pickera.
 *
 * **Renderowanie:**
 *   - Gdy obie istnieją → `<CompareTable>` (sticky header + Przewaga)
 *   - Gdy jedna → `<ComparePicker>` z pierwszą jako primary + recent
 *   - Gdy żadna → pusty stan z CTA do `/bazaar`
 *   - Gdy któraś nie istnieje → not-found variant z listą brakujących ID
 *
 * **SEO (arch §4.3):**
 *   - `generateMetadata` zwraca locale-aware title/description
 *   - JSON-LD `WebPage` + `BreadcrumbList`
 *
 * **i18n:** namespace `Bazaar.compare.*` (PL + EN).
 */

import * as React from "react";
import type { Metadata } from "next";
import { ArrowRight, Scale } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ComparePicker } from "@/components/bazaar/compare-picker";
import { CompareTable } from "@/components/bazaar/compare-table";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Link } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import {
  getAuctionById,
  getRecentAuctions,
} from "@/lib/server/auctions";
import {
  toAuctionSummaries,
  toAuctionSummary,
} from "@/components/bazaar/auction-summary";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

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
    namespace: "Bazaar.compare",
  });

  const title = t("pageTitle");
  const description = t("pageDescription");
  const path = "/bazaar/compare";

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
      card: "summary",
      title,
      description,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function parseId(raw: string | string[] | undefined): bigint | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  if (!/^\d{1,20}$/u.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const aId = parseId(sp.a);
  const bId = parseId(sp.b);

  const t = await getTranslations({
    locale,
    namespace: "Bazaar.compare",
  });
  const tBazaar = await getTranslations({
    locale,
    namespace: "Bazaar",
  });

  // Fetch: obie aukcje (jeśli podane) + top 10 najnowszych do pickera
  const [aRow, bRow, recentRows] = await Promise.all([
    aId !== null ? getAuctionById(aId) : Promise.resolve(null),
    bId !== null ? getAuctionById(bId) : Promise.resolve(null),
    getRecentAuctions(10),
  ]);

  // Walidacja — jeśli ID podane ale aukcja nie istnieje, traktujemy jak null.
  const aSummary = aRow !== null ? toAuctionSummary(aRow) : null;
  const bSummary = bRow !== null ? toAuctionSummary(bRow) : null;
  const recentSummaries = toAuctionSummaries(recentRows);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tBazaar("title"), href: "/bazaar" },
    { label: t("pageTitle"), href: "/bazaar/compare" },
  ];

  // ── Scenariusz 1: obie aukcje istnieją → CompareTable ──────────────
  if (aSummary !== null && bSummary !== null) {
    return (
      <div className="container py-6 md:py-8">
        <Breadcrumbs items={breadcrumbItems} />

        <header className="mt-4 max-w-3xl">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <Scale className="h-6 w-6 text-primary" aria-hidden="true" />
            {t("pageTitle")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {t("pageDescription")}
          </p>
        </header>

        <div className="mt-6">
          <CompareTable left={aSummary} right={bSummary} />
        </div>
      </div>
    );
  }

  // ── Scenariusz 2: tylko pierwsza aukcja → ComparePicker ────────────
  if (aSummary !== null && bSummary === null) {
    return (
      <div className="container py-6 md:py-8">
        <Breadcrumbs items={breadcrumbItems} />

        <header className="mt-4 max-w-3xl">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <Scale className="h-6 w-6 text-primary" aria-hidden="true" />
            {t("singleTitle")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {t("singleDescription")}
          </p>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="space-y-6">
            <EmptyState
              title={t("singleTitle")}
              description={t("singleDescription")}
              ctaLabel={t("pageTitle")}
              ctaHref={`/bazaar/${aSummary.id}`}
            />
          </div>
          <ComparePicker
            primaryAuction={aSummary}
            recentAuctions={recentSummaries}
          />
        </div>
      </div>
    );
  }

  // ── Scenariusz 3: żadna → pusty stan ────────────────────────────────
  return (
    <div className="container py-6 md:py-8">
      <Breadcrumbs items={breadcrumbItems} />

      <div className="mt-6">
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          ctaLabel={t("emptyCta")}
          ctaHref="/bazaar"
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// EmptyState — reużywane w scenariuszach 2 i 3
// ───────────────────────────────────────────────────────────────────────

async function EmptyState({
  title,
  description,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  const tBazaar = await getTranslations("Bazaar");
  return (
    <Card className="mx-auto max-w-xl border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-center text-xl">
          <Scale className="h-5 w-5 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription className="text-center">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button asChild size="lg">
          <Link href={ctaHref as Parameters<typeof Link>[0]["href"]}>
            <ArrowRight className="mr-2 h-4 w-4" aria-hidden="true" />
            {ctaLabel}
            {ctaHref.startsWith("/bazaar/") ? null : (
              <span className="sr-only"> ({tBazaar("title")})</span>
            )}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
