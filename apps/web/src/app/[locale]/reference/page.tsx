/**
 * `/[locale]/reference` — index 5 kategorii referencyjnych (plan T61,
 * arch §18.1 + §7.1 pkt 4).
 *
 * Kafelki:
 *   - Items / Worlds / Spells / Outfits / Mounts
 *   - Każdy z licznikiem rekordów (z `getReferenceStats`).
 *   - Touch targets ≥ 44×44 (arch §6.3).
 *
 * ISR: 24h (dane referencyjne zmieniają się rzadko — T32 scraper
 * aktualizuje je raz dziennie).
 *
 * i18n: namespace `Reference.*` (PL + EN).
 */

import * as React from "react";
import type { Metadata } from "next";
import {
  Backpack,
  Globe2,
  Sparkles,
  Sword,
  Wand2,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { getReferenceStats } from "@/lib/server/reference-pages";
import { routing } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

/** ISR: 24h (plan T61 — dane reference aktualizowane raz dziennie). */
export const revalidate = 86_400;

// ───────────────────────────────────────────────────────────────────────
// generateMetadata
// ───────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "Reference.index",
  });

  const title = t("pageTitle");
  const description = t("pageDescription");
  const path = "/reference";

  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}${path}`;
  }

  return {
    title,
    description,
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
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function ReferenceIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: "Reference.index",
  });

  // Statystyki (best-effort; build może nie mieć DB → 0 fallback).
  let stats = { items: 0, outfits: 0, mounts: 0, worlds: 0 };
  try {
    stats = await getReferenceStats();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[reference/index] getReferenceStats failed:", error);
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("title"), href: "/reference" },
  ];

  const cards = [
    {
      key: "items",
      href: "/reference/items",
      icon: Backpack,
      title: t("categories.items.title"),
      description: t("categories.items.description"),
      count: stats.items,
      countLabel: t("countLabel"),
    },
    {
      key: "worlds",
      href: "/reference/worlds",
      icon: Globe2,
      title: t("categories.worlds.title"),
      description: t("categories.worlds.description"),
      count: stats.worlds,
      countLabel: t("countLabel"),
    },
    {
      key: "spells",
      href: "/reference/spells",
      icon: Wand2,
      title: t("categories.spells.title"),
      description: t("categories.spells.description"),
      count: null,
      countLabel: t("countLabel"),
    },
    {
      key: "outfits",
      href: "/reference/outfits",
      icon: Sword,
      title: t("categories.outfits.title"),
      description: t("categories.outfits.description"),
      count: stats.outfits,
      countLabel: t("countLabel"),
    },
    {
      key: "mounts",
      href: "/reference/mounts",
      icon: Sparkles,
      title: t("categories.mounts.title"),
      description: t("categories.mounts.description"),
      count: stats.mounts,
      countLabel: t("countLabel"),
    },
  ];

  return (
    <div className="container py-6 md:py-8">
      <Breadcrumbs items={breadcrumbItems} />

      <header className="mt-6 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {t("pageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {t("pageDescription")}
        </p>
      </header>

      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ key, href, icon: Icon, title, description, count, countLabel }) => (
          <li key={key} className="min-w-0">
            <Link
              href={href as Parameters<typeof Link>[0]["href"]}
              className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`${title} — ${description}`}
            >
              <Card className="h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md group-focus-visible:border-primary/40">
                <CardHeader className="gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15" aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </div>
                    {count !== null && count > 0 ? (
                      <span className="numeric rounded-md border border-border px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {count.toLocaleString("en-US")} {countLabel}
                      </span>
                    ) : null}
                  </div>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription className="line-clamp-3 text-sm">
                    {description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}