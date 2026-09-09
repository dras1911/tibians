import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CalculatorLayout } from "@/components/calculators";
import { routing, type Locale } from "@/i18n/routing";

import {
  ExpShareCalculator,
  ExpShareResult,
} from "./exp-share-calculator";

/**
 * `/[locale]/calculators/exp-share` — Exp Share calculator (T19,
 * Tibia party XP split, arch §13). Static page overrides
 * `/calculators/[slug]/page.tsx`.
 *
 * Inputs: total XP to split (bigint, up to 10¹²), player level (integer
 * ∈ [8, 2500]), player vocation (5 Tibia vocations), dynamic list of
 * party members (each with name, level, vocation — up to 4).
 *
 * Output: player's XP share plus per-member breakdown table, with the
 * Tibia vocation-bonus tier (20/30/60/100%) called out. Validates Tibia
 * legal level range (ratio ≤ 1.5, CipSoft).
 *
 * Server responsibilities:
 *   - Localized SEO (title, description, OG, canonical, hreflang).
 *   - Render the shared `<CalculatorLayout>` shell.
 *   - Hand the form off to the client compound `<ExpShareCalculator>`.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const SLUG = "exp-share";

// ───────────────────────────────────────────────────────────────────────
// generateMetadata — per-locale SEO.
// ───────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Calculators.expShare",
  });

  const title = t("title");
  const description = t("description");

  const localizedTitle = `${title} · Tibians`;
  const finalTitle = localizedTitle.length <= 60 ? localizedTitle : title;

  const finalDescription =
    description.length <= 155 ? description : `${description.slice(0, 152)}…`;

  const canonical = `${SITE_URL}/${locale}/calculators/${SLUG}`;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}/calculators/${SLUG}`;
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
      type: "article",
      images: [
        {
          url: `${SITE_URL}/og/calculators-${SLUG}.png`,
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

export default async function ExpSharePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Calculators.expShare",
  });

  const title = t("title");
  const description = t("description");

  return (
    <CalculatorLayout
      title={title}
      description={description}
      slug={SLUG}
      form={<ExpShareCalculator />}
      result={<ExpShareResult />}
    />
  );
}