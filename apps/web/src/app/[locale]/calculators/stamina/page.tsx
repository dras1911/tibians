import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CalculatorLayout } from "@/components/calculators";
import { loadStaminaConfig } from "@/lib/stamina-config";
import { routing, type Locale } from "@/i18n/routing";

import { StaminaCalculator } from "./stamina-calculator";

/**
 * `/[locale]/calculators/stamina` — Stamina regeneration calculator (T18,
 * arch §2.1). Static page overrides `/calculators/[slug]/page.tsx`.
 *
 * Inputs: current stamina (h), target stamina (h), account status (Premium
 * / Free toggle). Output: time offline required to reach the target,
 * broken down by regen zone (normal 0-39h, green 39-42h Premium-only).
 *
 * **Source of truth for thresholds** (`loadStaminaConfig()`):
 *   - `stamina.regen_minutes_per_hour`     → 3 min/h (normal zone)
 *   - `stamina.regen_minutes_per_hour_free`→ 6 min/h (green zone, Premium-only)
 *   - `stamina.hours_per_day_full`         → 42 (Premium max)
 *   - `stamina.hours_per_day_full_free`    → 40 (Free max)
 *   - `stamina.green_zone_start_hours`     → 39
 *
 * Marked `force-dynamic` because `loadStaminaConfig()` reads from
 * `getConfig()` (DB). The seed fallback (T16) ensures the page still
 * renders when DB is unavailable (build, dev without Postgres).
 *
 * Server responsibilities:
 *   - Localized SEO (title, description, OG, canonical, hreflang).
 *   - Resolve `StaminaConfig` once per request (cached 60s in T16 loader).
 *   - Render the shared `<CalculatorLayout>` shell.
 *   - Hand the form off to the client compound `<StaminaCalculator>`.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const SLUG = "stamina";

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
    namespace: "Calculators.stamina",
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

export default async function StaminaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const [t, config] = await Promise.all([
    getTranslations({
      locale: locale as Locale,
      namespace: "Calculators.stamina",
    }),
    loadStaminaConfig(),
  ]);

  const title = t("title");
  const description = t("description");

  return (
    <CalculatorLayout
      title={title}
      description={description}
      slug={SLUG}
      form={<StaminaCalculator config={config} />}
      result={<StaminaCalculator.Result config={config} />}
    />
  );
}