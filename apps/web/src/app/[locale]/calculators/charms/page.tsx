import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CalculatorLayout } from "@/components/calculators";
import { routing, type Locale } from "@/i18n/routing";

import { CharmsCalculator, CharmsResult } from "./charms-calculator";

/**
 * `/[locale]/calculators/charms` — Charms damage calculator
 * (T21, TibiaPal benchmark + TibiaWiki Major_Charms, arch §2.1).
 *
 * Computes the damage percent per proc for a given charm, vocation, skill,
 * and monster sensitivity. TibiaPal benchmark: elemental charms = 5%
 * of monster max HP per proc (modified by sensitivity); Overpower/Overflux
 * = self-scaling (5%/2.5% of char HP/MP). Vocation/skill modifiers are
 * heuristics documented in `packages/calc/src/formulas/charms.ts`.
 *
 * Server responsibilities:
 *   - Localized SEO (title, description, OG, canonical, hreflang).
 *   - Render the shared `<CalculatorLayout>` shell.
 *   - Hand the form off to the client compound `<CharmsCalculator>`.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const SLUG = "charms";

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
    namespace: "Calculators.charms",
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

export default async function CharmsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Calculators.charms",
  });

  const title = t("title");
  const description = t("description");

  return (
    <CalculatorLayout
      title={title}
      description={description}
      slug={SLUG}
      form={<CharmsCalculator />}
      result={<CharmsResult />}
    />
  );
}
