import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CalculatorLayout } from "@/components/calculators";
import { routing, type Locale } from "@/i18n/routing";

import {
  ExerciseWeaponsCalculator,
} from "./exercise-weapons-calculator";

/**
 * `/[locale]/calculators/exercise-weapons` — Exercise Weapons (T17, arch §2.1).
 *
 * Static page (overrides `/calculators/[slug]/page.tsx` for this exact
 * slug — Next.js App Router prefers literal segments over dynamic ones).
 *
 * Implements 2 modes from the TibiaPal benchmark:
 *   - **Target Skill**    → ile broni potrzeba do osiągnięcia X
 *   - **Target Weapons**  → ile skillu zyskasz z N broni danego typu
 *
 * Each mode produces:
 *   - Primary value (regular weapon count, or skill gained)
 *   - Secondary: durable/lasting counts (mode 1) or new level + cost (mode 2)
 *   - Cost in gp + TC + recommendation (buyGold/buyTc/equal) based on the
 *     user-configurable TC price threshold (TibiaWiki default: 13 889 gp)
 *
 * Server responsibilities:
 *   - Localized SEO (title, description, OG, canonical, hreflang).
 *   - Render the shared `<CalculatorLayout>` shell.
 *   - Hands off to the client compound `<ExerciseWeaponsCalculator>` so the
 *     form re-derives the result on every keystroke.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const SLUG = "exercise-weapons";

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
    namespace: "Calculators.exerciseWeapons",
  });

  const title = t("title");
  const description = t("description");

  // Title pattern: "{Calculator} · Tibians" — keep ≤ 60 chars total
  // (Google SERP cap). "Exercise Weapons · Tibians" = 24 chars — safe.
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

export default async function ExerciseWeaponsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Calculators.exerciseWeapons",
  });

  const title = t("title");
  const description = t("description");

  return (
    <CalculatorLayout
      title={title}
      description={description}
      slug={SLUG}
      form={<ExerciseWeaponsCalculator />}
      result={<ExerciseWeaponsCalculator.Result />}
    />
  );
}