import * as React from "react";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  CALCULATORS,
  CATEGORY_ORDER,
  type CalculatorCategory,
  type CalculatorMeta,
} from "@/components/calculators";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * `/[locale]/calculators` — landing page that lists all 14 calculators
 * grouped into 6 intent-based categories (architecture §13.4).
 *
 * This is the canonical "SEO landing" surface for the calculator suite —
 * the page that Google indexes for queries like "tibia exercise weapons
 * calculator" or "tibia stamina calculator". Each card is a deep link to
 * a calculator-specific landing page that further nails the long tail.
 *
 * Server Component (no `"use client"`):
 *   - All `generateMetadata` output is rendered in the initial HTML.
 *   - The card list itself is static (catalog is compile-time constant).
 *   - Hover/focus states on cards are pure CSS — no JS needed.
 */

// ───────────────────────────────────────────────────────────────────────
// generateMetadata — locale-aware SEO (title ≤ 60, description ≤ 155).
// ───────────────────────────────────────────────────────────────────────

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "Calculators.index",
  });

  const title = t("title");
  const description = t("subtitle");
  const path = "/calculators";

  // Localized alternates — every supported locale maps to its own URL.
  // Next.js renders <link rel="alternate" hreflang="…"> tags for each.
  const languages: Record<string, string> = {};
  for (const l of ["pl", "en"] as const) {
    languages[l] = `${SITE_URL}/${l}${path}`;
  }

  return {
    title,
    description,
    keywords: [
      "tibia",
      "tibia calculator",
      "tibia exercise weapons",
      "tibia stamina",
      "tibia character value",
      "tibia experience",
      "tibia planner",
    ],
    alternates: {
      canonical: `${SITE_URL}/${locale}${path}`,
      languages,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}${path}`,
      siteName: "Tibians",
      locale: locale === "pl" ? "pl_PL" : "en_US",
      type: "website",
      images: [
        {
          url: `${SITE_URL}/og/calculators.png`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function CalculatorsIndexPage() {
  const tIndex = await getTranslations("Calculators.index");
  const tNav = await getTranslations("Nav");

  // Group catalog entries by category (preserves CATEGORY_ORDER).
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: CALCULATORS.filter((c) => c.category === cat),
  }));

  return (
    <div className="container py-8 md:py-12">
      {/* Breadcrumbs — Home > Kalkulatory */}
      <nav
        aria-label={tNav("brand")}
        className="text-sm text-muted-foreground"
      >
        <ol className="flex items-center gap-1.5">
          <li className="flex items-center gap-1.5">
            <Link
              href="/"
              className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {tNav("home")}
            </Link>
          </li>
          <li aria-hidden="true" className="text-muted-foreground/60">
            /
          </li>
          <li>
            <span aria-current="page" className="font-medium text-foreground">
              {tIndex("title")}
            </span>
          </li>
        </ol>
      </nav>

      {/* Hero */}
      <header className="mt-6 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {tIndex("title")}
        </h1>
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">
          {tIndex("subtitle")}
        </p>
      </header>

      {/* Category sections */}
      <div className="mt-10 space-y-12">
        {grouped.map(({ category, items }) => (
          <CategorySection
            key={category}
            category={category}
            items={items}
          />
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// CategorySection — header + responsive card grid.
// ───────────────────────────────────────────────────────────────────────

async function CategorySection({
  category,
  items,
}: {
  category: CalculatorCategory;
  items: readonly CalculatorMeta[];
}) {
  const tIndex = await getTranslations("Calculators.index");

  return (
    <section aria-labelledby={`cat-${category}`}>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2
          id={`cat-${category}`}
          className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
        >
          {tIndex(`categories.${category}`)}
        </h2>
        <span className="text-xs font-medium text-muted-foreground numeric tabular-nums">
          {items.length}
        </span>
      </div>

      <ul
        className={cn(
          "grid gap-3",
          "grid-cols-1",
          "sm:grid-cols-2",
          "lg:grid-cols-3",
        )}
      >
        {items.map((item) => (
          <li key={item.slug} className="min-w-0">
            <CalculatorCard item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────
// CalculatorCard — one card per calculator.
// ───────────────────────────────────────────────────────────────────────

async function CalculatorCard({ item }: { item: CalculatorMeta }) {
  const tIndex = await getTranslations("Calculators.index");
  const title = tIndex(`items.${item.messageKey}.title`);
  const description = tIndex(`items.${item.messageKey}.description`);

  const Icon = item.icon;

  return (
    <Link
      href={item.slug}
      className={cn(
        "group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <Card
        className={cn(
          "h-full transition-all duration-200",
          "group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md",
          "group-focus-visible:border-primary/40 group-focus-visible:shadow-md",
        )}
      >
        <CardHeader className="gap-3">
          <div className="flex items-start justify-between gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
                "bg-primary/10 text-primary",
                "transition-colors group-hover:bg-primary/15",
              )}
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" />
            </div>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              aria-hidden="true"
            />
          </div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="line-clamp-3 text-sm">
            {description}
          </CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}