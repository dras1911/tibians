import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CalculatorLayout } from "@/components/calculators";
import { loadValuationConfig } from "@/lib/character-value-config";
import { routing, type Locale } from "@/i18n/routing";

import {
  CharacterValueCalculator,
  CharacterValueResult,
} from "./character-value-calculator";

/**
 * `/[locale]/calculators/character-value` — ★ KILLER FEATURE portalu (T22,
 * arch §8.4). Waloryzacja postaci w TC z rozwijalnym breakdownem.
 *
 * Transparentność > precyzja (arch §8.4):
 *   - Free tier: estimatedValue + wskaźnik okazji (delta %)
 *   - Premium tier: + pełny breakdown per komponent (T84/85 gating)
 *
 * Algorytm z `packages/calc/src/formulas/character-value.ts` (czysta funkcja)
 * + `loadValuationConfig()` z `apps/web/src/lib/character-value-config.ts`
 * (wagi z T16 `valuation_rules` seed).
 *
 * Marked `force-dynamic` bo `loadValuationConfig()` może w przyszłości
 * czytać z DB (Faza 2+); na T22 commit czyta statycznie z seed.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const SLUG = "character-value";

export const dynamic = "force-dynamic";

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
    namespace: "Calculators.characterValue",
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

export default async function CharacterValuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const [t, config] = await Promise.all([
    getTranslations({
      locale: locale as Locale,
      namespace: "Calculators.characterValue",
    }),
    loadValuationConfig(),
  ]);

  const title = t("title");
  const description = t("description");

  return (
    <CalculatorLayout
      title={title}
      description={description}
      slug={SLUG}
      form={<CharacterValueCalculator config={config} />}
      result={<CharacterValueResult config={config} />}
    />
  );
}