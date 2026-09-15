/**
 * `/[locale]/bazaar/ending-soon` — dedykowany live view aukcji kończących
 * się w ciągu godziny (plan task 56, arch §5 krok 1 + §8.5).
 */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { toAuctionSummaries } from "@/components/bazaar/auction-summary";
import { EndingSoonClient } from "./ending-soon-client";
import { listEndingSoon } from "@/lib/server/auctions";
import { routing, type Locale } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const PATH = "/bazaar/ending-soon";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Bazaar.endingSoon",
  });

  const title = t("pageTitle");
  const localizedTitle = `${title} · Tibians`;
  const finalTitle = localizedTitle.length <= 60 ? localizedTitle : title;

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
    },
    twitter: {
      card: "summary_large_image",
      title: finalTitle,
      description: finalDescription,
    },
  };
}

export default async function EndingSoonPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const localeTyped = locale as Locale;

  const [rows, tBazaar] = await Promise.all([
    listEndingSoon(1),
    getTranslations({ locale: localeTyped, namespace: "Bazaar" }),
  ]);

  const initialAuctions = toAuctionSummaries(rows);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: rows.slice(0, 25).map((row, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${SITE_URL}/${localeTyped}/bazaar/${row.auctionId.toString()}`,
      name: row.characterName,
    })),
    numberOfItems: rows.length,
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tBazaar("title"), href: "/bazaar" },
    { label: tBazaar("endingSoon.pageTitle"), href: "/bazaar/ending-soon" },
  ];

  return (
    <div className="container py-6 md:py-8">
      <Breadcrumbs items={breadcrumbItems} />
      <EndingSoonClient initialAuctions={initialAuctions} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
