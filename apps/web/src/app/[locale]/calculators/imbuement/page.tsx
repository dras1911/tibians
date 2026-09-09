import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CalculatorLayout } from "@/components/calculators";
import { loadImbuementConfig } from "@/lib/imbuement-config";
import { routing, type Locale } from "@/i18n/routing";

import { ImbuementCalculator } from "./imbuement-calculator";

/**
 * `/[locale]/calculators/imbuement` — Imbuement cost calculator
 * (T20, arch §2.3, TibiaWiki Imbuing). Static page overrides
 * `/calculators/[slug]/page.tsx`.
 *
 * Inputs:
 *   - `imbuementType` (basic/intricate/powerful) — select
 *   - `level` (integer, domyślnie 100, informacyjny)
 *   - `hours` (integer, domyślnie 20, informacyjny o czasie trwania)
 *
 * Output:
 *   - Slot cost TC (Basic: 25, Intricate: 0, Powerful: 150)
 *   - Fee gp (Basic: 7 500, Intricate: 60 000, Powerful: 250 000)
 *   - Total TC
 *   - Czas trwania (20h)
 *
 * **Source of truth for thresholds** (`loadImbuementConfig()`):
 *   - `imbuement.basic_slot_cost_tc`     (25)
 *   - `imbuement.powerful_slot_cost_tc`  (150)
 *   - `imbuement.fee_basic_gp`           ( 7 500)
 *   - `imbuement.fee_intricate_gp`       (60 000)
 *   - `imbuement.fee_powerful_gp`        (250 000)
 *   - `imbuement.duration_hours`         (20)
 *
 * Marked `force-dynamic` because `loadImbuementConfig()` reads from
 * `getConfig()` (DB). The seed fallback (T16) ensures the page still
 * renders when DB is unavailable (build, dev without Postgres).
 *
 * Server responsibilities:
 *   - Localized SEO (title, description, OG, canonical, hreflang).
 *   - Resolve `ImbuementConfig` once per request (cached 60s in T16 loader).
 *   - Render the shared `<CalculatorLayout>` shell.
 *   - Hand the form off to the client compound `<ImbuementCalculator>`.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const SLUG = "imbuement";

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
    namespace: "Calculators.imbuement",
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

export default async function ImbuementPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const [t, config] = await Promise.all([
    getTranslations({
      locale: locale as Locale,
      namespace: "Calculators.imbuement",
    }),
    loadImbuementConfig(),
  ]);

  const title = t("title");
  const description = t("description");

  return (
    <CalculatorLayout
      title={title}
      description={description}
      slug={SLUG}
      form={<ImbuementCalculator config={config} />}
      result={<ImbuementCalculator.Result config={config} />}
    />
  );
}