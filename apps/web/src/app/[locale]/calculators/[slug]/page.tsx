import * as React from "react";
import type { Metadata } from "next";
import { Construction } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  CalculatorLayout,
  CalculatorForm,
  findCalculatorBySlug,
  ResultDisplay,
} from "@/components/calculators";
import { Link } from "@/i18n/routing";
import { routing, type Locale } from "@/i18n/routing";

/**
 * `/[locale]/calculators/[slug]/page.tsx` — placeholder template for
 * calculator pages whose dedicated implementation has not landed yet.
 *
 * Each T17-T23 calculator ships its own static page at
 * `/calculators/{slug}/page.tsx`; Next.js prefers the static route, so
 * this template only fires for slugs without a real implementation
 * (or for any future calculator added to `CALCULATORS`).
 *
 * Goals of this placeholder:
 *   - **Valid SEO surface** for every entry in the catalog so Google
 *     can index the landing without waiting for T17-T23 to merge.
 *   - **Consistent visual frame** (breadcrumb + title + two-column grid)
 *     so a player arriving from Google sees the same chrome as the
 *     real calculators — no "under construction" ugliness.
 *   - **Honest UX**: a clearly worded "coming soon" message + a deep
 *     link back to the index. Players aren't promised functionality
 *     that doesn't exist yet.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

// ───────────────────────────────────────────────────────────────────────
// generateStaticParams — pre-render one page per catalog entry.
// ───────────────────────────────────────────────────────────────────────

export function generateStaticParams() {
  return CALCULATOR_SLUGS.map((slug) => ({ slug }));
}

// Pre-computed list of slugs to avoid re-importing the full catalog
// (which contains icon components and would bloat the manifest entry).
const CALCULATOR_SLUGS: readonly string[] = [
  "exercise-weapons",
  "skills",
  "true-skill",
  "blessings",
  "stamina",
  "character-value",
  "imbuement",
  "weekly-tasks",
  "charms",
  "experience",
  "leech",
  "exp-share",
  "planners-charms",
  "planners-wheel",
] as const;

// ───────────────────────────────────────────────────────────────────────
// generateMetadata — per-calculator SEO.
// ───────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const meta = findCalculatorBySlug(slug);

  if (!meta) {
    // Not in the catalog — let Next.js surface a 404 with noindex.
    return {
      title: "Calculator not found",
      robots: { index: false, follow: false },
    };
  }

  const t = await getTranslations({
    locale,
    namespace: "Calculators.index",
  });

  const title = t(`items.${meta.messageKey}.title`);
  const description = t(`items.${meta.messageKey}.description`);

  // Title pattern: "{Calculator} · Tibians" — set by the locale layout's
  // template. We just provide the bare title here. Trim to ≤ 60 chars
  // (Google SERP cap) — the catalog names are short enough that the
  // template adds ≤ 12 more.
  const localizedTitle = `${title} · Tibians`;
  const finalTitle =
    localizedTitle.length <= 60 ? localizedTitle : title;

  // Description should be ≤ 155 chars. Catalog descriptions are short
  // enough to fit comfortably; we still cap as a safety net.
  const finalDescription =
    description.length <= 155 ? description : `${description.slice(0, 152)}…`;

  const canonical = `${SITE_URL}/${locale}${meta.slug}`;

  // Per-locale alternates for hreflang.
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}${meta.slug}`;
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
          url: `${SITE_URL}/og/calculators-${slug}.png`,
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

export default async function CalculatorSlugPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const meta = findCalculatorBySlug(slug);

  if (!meta) {
    notFound();
  }

  const tIndex = await getTranslations({
    locale: locale as Locale,
    namespace: "Calculators.index",
  });
  const tLayout = await getTranslations({
    locale: locale as Locale,
    namespace: "Calculators.layout",
  });

  const title = tIndex(`items.${meta.messageKey}.title`);
  const description = tIndex(`items.${meta.messageKey}.description`);

  // Placeholder form — minimal shell that real calculators will replace.
  const placeholderForm = (
    <CalculatorForm aria-label={title}>
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning"
          aria-hidden="true"
        >
          <Construction className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {tLayout("calculatorNotFoundDescription")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <Link
              href="/calculators"
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {tLayout("calculatorNotFoundCta")}
            </Link>
          </p>
        </div>
      </div>
    </CalculatorForm>
  );

  // Empty result state — tells the user (and Google) "no calculation yet".
  const placeholderResult = <ResultDisplay empty />;

  return (
    <CalculatorLayout
      title={title}
      description={description}
      slug={slug}
      form={placeholderForm}
      result={placeholderResult}
    />
  );
}