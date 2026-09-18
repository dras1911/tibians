/**
 * `/[locale]/bazaar/[id]` — detal aukcji Char Bazaar (plan task 48, arch
 * §5 krok 7 + §13.3 / §13.4).
 *
 * **Sekcje renderowane (RSC):**
 *   1. Breadcrumbs + JSON-LD Product (schema.org z price + availability)
 *   2. `<AuctionHero>` (sticky mobile, client) — outfit, name, level,
 *      vocation, world, PvP, BattlEye, bid, countdown, CTAs.
 *   3. `<EstimatedValue>` (client) — szacowana wartość + wskaźnik okazji.
 *   4. `<BidHistoryChart>` (client) — Recharts line chart z `auction_price_history`.
 *   5. `<AuctionDetailTabs>` (client) — Skills / Items / Outfits & Mounts /
 *      Charms & Blessings / Gems z cross-linkami do kalkulatorów (T49).
 *
 * **ISR cache (arch §8.2):**
 *   - tag `auction-{id}` (granularna inwalidacja)
 *   - `revalidate = 60` (1 min fallback; webhook T38 ma `revalidateTag`)
 *
 * **404 / not-found:**
 *   - `getAuctionDetail()` zwraca `null` → render `<NotFound>` z CTA
 *     "Wróć do listy". Brak throw — przyjazny UX.
 *
 * **JSON-LD (SEO §4.3):**
 *   - `Product` schema z `offers.price` (bid) + `availability` (status).
 *   - `BreadcrumbList` dla nawigacji w SERP.
 *
 * **i18n:**
 *   - Wszystkie labels w `useTranslations("Bazaar.detail.*")`.
 *   - Title w `generateMetadata` z prefixem "{name} · {vocation} lvl {level}"
 */

import * as React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuctionHero } from "@/components/bazaar/auction-hero";
import { AuctionDetailTabs } from "@/components/bazaar/auction-detail-tabs";
import { BidHistoryChart } from "@/components/bazaar/bid-history-chart";
import { EstimatedValue } from "@/components/bazaar/estimated-value";
import { SimilarAuctions } from "@/components/bazaar/similar-auctions";
import { Link } from "@/i18n/routing";
import { outfitImageUrl } from "@/lib/tibia";
import { getAuctionDetail } from "@/lib/server/auction-detail";
import { getAuctionById, getSimilarAuctions } from "@/lib/server/auctions";
import { toAuctionSummary } from "@/components/bazaar/auction-summary";
import { routing, type Locale } from "@/i18n/routing";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

/**
 * ISR cache tag + 1 min fallback (arch §8.2). Webhook T38 może wymusić
 * revalidację po każdym scrape.
 */
export const revalidate = 60;
export const dynamicParams = true;

// ───────────────────────────────────────────────────────────────────────
// generateMetadata — per-auction SEO
// ───────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;

  // Próba pobrania aukcji w celu dynamicznego title/description.
  // Błędy (404, DB outage) → fallback na generyczny title.
  let detail = null;
  try {
    detail = await getAuctionDetail(BigInt(id));
  } catch {
    detail = null;
  }

  const tBazaar = await getTranslations({
    locale: locale as Locale,
    namespace: "Bazaar",
  });
  void tBazaar; // referenced in nested helpers below

  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Bazaar.detail",
  });

  const a = detail?.auction;

  // Title (≤ 60 znaków SEO best practice):
  //   PL: "Migzen · Exalted Monk lvl 619 · Jadebra"
  //   EN: "Migzen · Exalted Monk lvl 619 · Jadebra"
  const rawTitle = a
    ? t("pageTitle", {
        name: a.name,
        vocation: a.vocationPromoted,
        level: a.level,
        world: a.world,
      })
    : `Auction #${id}`;

  const localizedTitle = `${rawTitle} · Tibians`;
  const finalTitle = localizedTitle.length <= 60 ? localizedTitle : rawTitle.slice(0, 60);

  const rawDescription = a
    ? t("pageDescription", {
        id: a.id,
        name: a.name,
        vocation: a.vocationPromoted,
        level: a.level,
        world: a.world,
      })
    : `Auction #${id} details.`;
  const finalDescription =
    rawDescription.length <= 155 ? rawDescription : `${rawDescription.slice(0, 152)}…`;

  const canonical = `${SITE_URL}/${locale}/bazaar/${id}`;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}/bazaar/${id}`;
  }

  return {
    title: finalTitle,
    description: finalDescription,
    alternates: { canonical, languages },
    openGraph: a
      ? {
          title: finalTitle,
          description: finalDescription,
          url: canonical,
          siteName: "Tibians",
          locale: locale === "pl" ? "pl_PL" : "en_US",
          type: "website",
          images:
            a.outfitId !== null
              ? [
                  {
                    url: outfitImageUrl(a.outfitId),
                    width: 96,
                    height: 96,
                    alt: a.name,
                  },
                ]
              : undefined,
        }
      : undefined,
    twitter: a
      ? {
          card: "summary_large_image",
          title: finalTitle,
          description: finalDescription,
        }
      : undefined,
    other: {
      "x-bazaar-cache-tag": `auction-${id}`,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;

  // Walidacja ID — nieujemna liczba całkowita (Tibia ID > Number.MAX_SAFE_INTEGER).
  if (!/^\d+$/u.test(id)) {
    notFound();
  }

  let detail;
  try {
    detail = await getAuctionDetail(BigInt(id));
  } catch {
    detail = null;
  }

  if (detail === null) {
    // renderujemy własny 404 w obrębie layoutu — bez `notFound()` żeby
    // zachować nawigację PL/EN.
    return <AuctionNotFound locale={locale as Locale} id={id} />;
  }

  const a = detail.auction;
  const canonical = `${SITE_URL}/${locale}/bazaar/${id}`;

  // Sekcja "Podobne aukcje" (T52) — fetch AuctionRow do getSimilarAuctions
  // oraz 4 kart AuctionSummary do renderingu.
  const currentRow = await getAuctionById(BigInt(id));
  const similarRows = currentRow !== null ? await getSimilarAuctions(currentRow, { limit: 4 }) : [];
  const similarSummaries = similarRows.map(toAuctionSummary);
  const currentSummary = currentRow !== null ? toAuctionSummary(currentRow) : null;

  // i18n — BreadcrumbList używa tytułu sekcji "Bazaar" (np. "Bazaar" / "Bazaar").
  // `Bazaar.detail` namespace zostawiamy klientowi (AuctionDetailTabs + inne
  // client komponenty), tu tylko pobieramy root namespace dla breadcrumbów.
  const tBazaar = await getTranslations({
    locale: locale as Locale,
    namespace: "Bazaar",
  });

  // ── JSON-LD: Product + BreadcrumbList ────────────────────────────
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: a.name,
    description: `${a.vocationPromoted} level ${a.level} on ${a.world}`,
    image: a.outfitId !== null ? outfitImageUrl(a.outfitId) : undefined,
    url: canonical,
    offers: {
      "@type": "Offer",
      price: a.bid,
      priceCurrency: "TC",
      availability:
        a.status === "active" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      validThrough: a.auctionEnd,
      url: `https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades&page=details&auctionid=${a.id}`,
    },
    brand: { "@type": "Brand", name: "Tibia" },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: tBazaar("title"),
        item: `${SITE_URL}/${locale}/bazaar`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: a.name,
        item: canonical,
      },
    ],
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tBazaar("title"), href: "/bazaar" },
    { label: a.name, href: `/bazaar/${a.id}` },
  ];

  return (
    <div className="container py-6 md:py-8">
      {/* Breadcrumbs (z JSON-LD BreadcrumbList) */}
      <Breadcrumbs items={breadcrumbItems} />

      {/* Hero — sticky mobile, identyfikacja + bid + countdown + CTA */}
      <div className="mt-4">
        <AuctionHero detail={detail} locale={locale} />
      </div>

      {/* Główna zawartość — 2 kolumny (md+): wycena + wykres / taby */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <EstimatedValue estimatedValue={a.estimatedValue} marketBid={a.bid} />
        <BidHistoryChart points={detail.priceHistory} />
      </div>

      {/* Sekcja tabów: Skills / Items / Outfits / Charms / Gems */}
      <div className="mt-8">
        <AuctionDetailTabs detail={detail} locale={locale} auctionId={a.id} />
      </div>

      {/* Sekcja "Podobne aukcje" (T52) — arch §5 krok 7 stopka */}
      {currentSummary !== null ? (
        <div className="mt-10">
          <SimilarAuctions currentAuction={currentSummary} similar={similarSummaries} />
        </div>
      ) : null}

      {/* JSON-LD Product + BreadcrumbList (SEO §4.3) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([jsonLd, breadcrumbJsonLd]),
        }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// AuctionNotFound — fallback gdy aukcja nie istnieje / DB error
// ───────────────────────────────────────────────────────────────────────

async function AuctionNotFound({ locale, id }: { locale: Locale; id: string }) {
  const t = await getTranslations({
    locale,
    namespace: "Bazaar.detail",
  });
  const tBazaar = await getTranslations({
    locale,
    namespace: "Bazaar",
  });

  return (
    <div className="container py-12 md:py-16">
      <Card className="mx-auto max-w-xl border-dashed">
        <CardHeader>
          <CardTitle className="text-center text-xl">{t("notFoundTitle")}</CardTitle>
          <CardDescription className="text-center">
            {t("notFoundDescription", { id })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild size="lg">
            <Link href="/bazaar">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("notFoundCta")}
              <span className="sr-only"> ({tBazaar("title")})</span>
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
