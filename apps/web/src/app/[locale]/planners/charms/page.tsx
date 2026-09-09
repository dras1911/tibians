import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CalculatorLayout } from "@/components/calculators";
import { routing, type Locale } from "@/i18n/routing";

import { CharmsPlannerForm, CharmsPlannerResult } from "./charms-planner";

/**
 * `/[locale]/planners/charms` — Charm Planner (T23, arch §2.1 TibiaPal
 * Charm Planner benchmark + §13.4 URL share).
 *
 * Planer (NIE kalkulator) — wynik to **stan do zapisania/udostępnienia**,
 * nie obliczenie. Różnica:
 *   - Calculator: input → formuła → ResultDisplay
 *   - Planner:    input → stan (suwaki) → ResultDisplay pokazuje statystyki
 *     stanu (total points used, rekomendacje per charm) + URL share button
 *
 * Pattern (T10 + §13.4):
 *   - cały stan kodowany w `?snapshot=<base64url JSON>` (lekki helper
 *     `lib/planner-url-state.ts`, mirroruje wzorzec CharacterSnapshot
 *     transform z `character-context`, ale dla planner-specific stanu)
 *   - reload URL → parse → restore sliders
 *
 * Server responsibilities:
 *   - Localized SEO (title, description, OG, canonical, hreflang).
 *   - Render the shared `<CalculatorLayout>` shell.
 *   - Hand the form off to the client compound `<CharmsPlanner>`.
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
    namespace: "Calculators.plannersCharms",
  });
  const title = t("title");
  const description = t("description");

  const localizedTitle = `${title} · Tibians`;
  const finalTitle = localizedTitle.length <= 60 ? localizedTitle : title;
  const finalDescription =
    description.length <= 155 ? description : `${description.slice(0, 152)}…`;

  const canonical = `${SITE_URL}/${locale}/planners/${SLUG}`;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}/planners/${SLUG}`;
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
          url: `${SITE_URL}/og/planners-${SLUG}.png`,
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

export default async function CharmsPlannerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Calculators.plannersCharms",
  });

  const title = t("title");
  const description = t("description");

  return (
    <CalculatorLayout
      title={title}
      description={description}
      slug={SLUG}
      form={<CharmsPlannerForm />}
      result={<CharmsPlannerResult />}
    />
  );
}
