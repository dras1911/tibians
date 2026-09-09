import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CalculatorLayout } from "@/components/calculators";
import { loadBlessingsConfig } from "@/lib/blessings-config";
import { routing, type Locale } from "@/i18n/routing";

import { BlessingsCalculator } from "./blessings-calculator";

/**
 * `/[locale]/calculators/blessings` — Blessing cost calculator
 * (T20, arch §2.3, TibiaWiki Blessings). Static page overrides
 * `/calculators/[slug]/page.tsx`.
 *
 * Inputs:
 *   - `currentLevel` (integer, domyślnie 100)
 *   - `targetLevel` (integer, domyślnie currentLevel+1 — informational)
 *   - `currentBlessings` (0..7, domyślnie 5)
 *
 * Output (per TibiaWiki R(L) piece-wise formula):
 *   - cost per blessing in gp
 *   - blessings to buy = max(0, target − current)
 *   - total cost gp = cost per blessing × blessings to buy
 *
 * **Source of truth for thresholds** (`loadBlessingsConfig()`):
 *   - blessing.cost_per_blessing_level_1    ( 2 000)
 *   - blessing.cost_per_blessing_level_100  (16 000)
 *   - blessing.cost_per_blessing_level_200  (26 000)
 *
 * Marked `force-dynamic` because `loadBlessingsConfig()` reads from
 * `getConfig()` (DB). The seed fallback (T16) ensures the page still
 * renders when DB is unavailable (build, dev without Postgres).
 *
 * Server responsibilities:
 *   - Localized SEO (title, description, OG, canonical, hreflang).
 *   - Resolve `BlessingsConfig` once per request (cached 60s in T16 loader).
 *   - Render the shared `<CalculatorLayout>` shell.
 *   - Hand the form off to the client compound `<BlessingsCalculator>`.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const SLUG = "blessings";

// We need per-request config resolution (DB read via getConfig). Mark
// dynamic so Next.js does not try to statically prerender with stale
// config from build time.
export const dynamic = "force-dynamic";

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
    namespace: "Calculators.blessings",
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

export default async function BlessingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const [t, config] = await Promise.all([
    getTranslations({
      locale: locale as Locale,
      namespace: "Calculators.blessings",
    }),
    loadBlessingsConfig(),
  ]);

  const title = t("title");
  const description = t("description");

  return (
    <CalculatorLayout
      title={title}
      description={description}
      slug={SLUG}
      form={<BlessingsCalculator config={config} />}
      result={<BlessingsCalculator.Result config={config} />}
    />
  );
}