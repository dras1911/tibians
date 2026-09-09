import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CalculatorLayout } from "@/components/calculators";
import { routing, type Locale } from "@/i18n/routing";

import { SkillsCalculator } from "./skills-calculator";

/**
 * `/[locale]/calculators/skills` — Training/Skills (T17, arch §2.1).
 *
 * Static page (overrides `/calculators/[slug]/page.tsx` for this exact
 * slug — Next.js App Router prefers literal segments over dynamic ones).
 *
 * Calculates training time + cost from `currentSkill` to `targetSkill`
 * for the chosen vocation/skill pair and weapon tier. TibiaWiki §2.2
 * caveats that only "Regular" weapons give precise results — the page
 * surfaces that warning via the recommendation badge.
 *
 * Server responsibilities:
 *   - Localized SEO (title, description, OG, canonical, hreflang).
 *   - Render the shared `<CalculatorLayout>` shell.
 *   - Hand the form off to the client compound `<SkillsCalculator>`.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const SLUG = "skills";

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
    namespace: "Calculators.skills",
  });

  const title = t("title");
  const description = t("description");

  // Title pattern: "{Calculator} · Tibians" — keep ≤ 60 chars total
  // (Google SERP cap). "Training / Skills · Tibians" = 26 chars — safe.
  const localizedTitle = `${title} · Tibians`;
  const finalTitle = localizedTitle.length <= 60 ? localizedTitle : title;

  // Description cap: 155 chars (Google meta description).
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
    alternates: {
      canonical,
      languages,
    },
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

export default async function SkillsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Calculators.skills",
  });

  const title = t("title");
  const description = t("description");

  return (
    <CalculatorLayout
      title={title}
      description={description}
      slug={SLUG}
      form={<SkillsCalculator />}
      result={<SkillsCalculator.Result />}
    />
  );
}