/**
 * `/[locale]/reference/outfits` — stronicowana lista outfits (plan T61, arch
 * §7.2 + §18.1).
 *
 * **Fetch:**
 *   - `listReferenceOutfits()` z DB (T7 schema `outfits`, T32 scraper).
 *
 * **ISR:** 24h (revalidate = 86_400).
 *
 * **Render:** Grid kart (obrazek + nazwa PL/EN + badge Store/Rare).
 *
 * **i18n:** `Reference.outfits.*` (PL + EN).
 */

import * as React from "react";
import type { Metadata } from "next";
import { Shirt } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { listReferenceOutfits } from "@/lib/server/reference-pages";
import { routing } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const PAGE_SIZE = 48;

/** ISR: 24h. */
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
    namespace: "Reference.outfits",
  });

  const title = t("pageTitle");
  const description = t("pageDescription");
  const path = "/reference/outfits";

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
// Helpers
// ───────────────────────────────────────────────────────────────────────

function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return 1;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 200);
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function ReferenceOutfitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const page = parsePage(sp.page);

  const [t, tRef] = await Promise.all([
    getTranslations({ locale, namespace: "Reference.outfits" }),
    getTranslations({ locale, namespace: "Reference.index" }),
  ]);

  // Best-effort DB query.
  let result: Awaited<ReturnType<typeof listReferenceOutfits>> | null = null;
  try {
    result = await listReferenceOutfits({ page, pageSize: PAGE_SIZE });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[reference/outfits] DB query failed:", error);
    result = null;
  }

  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tRef("title"), href: "/reference" },
    { label: t("pageTitle"), href: "/reference/outfits" },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("pageTitle"),
    description: t("pageDescription"),
    numberOfItems: total,
    itemListElement: rows.slice(0, 25).map((row, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: row.namePl ?? row.name,
    })),
  };

  const prevHref = page > 1 ? `/reference/outfits?page=${(page - 1).toString()}` : null;
  const nextHref = page < totalPages ? `/reference/outfits?page=${(page + 1).toString()}` : null;

  if (rows.length === 0) {
    return (
      <div className="container py-6 md:py-8">
        <Breadcrumbs items={breadcrumbItems} />
        <Card className="mx-auto mt-8 max-w-xl border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shirt className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              {t("emptyTitle")}
            </CardTitle>
            <CardDescription>{t("emptyDescription")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-6 md:py-8">
      <Breadcrumbs items={breadcrumbItems} />

      <header className="mt-6 max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <Shirt className="h-6 w-6 text-primary" aria-hidden="true" />
          {t("pageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {t("pageDescription")}
        </p>
        <p
          className="numeric mt-2 font-mono text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {t("resultsLabel", { count: total })}
        </p>
      </header>

      <ul
        role="list"
        aria-label={t("gridAria")}
        className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      >
        {rows.map((row) => (
          <li key={row.id} role="listitem">
            <CosmeticCard
              row={row}
              storeLabel={t("storeLabel")}
              rareLabel={t("rareLabel")}
            />
          </li>
        ))}
      </ul>

      <nav
        aria-label={t("paginationAria")}
        className="mt-8 flex items-center justify-between gap-4"
      >
        {prevHref !== null ? (
          <Link
            href={prevHref as Parameters<typeof Link>[0]["href"]}
            className="inline-flex h-11 items-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">←</span>
            {t("prevLabel")}
          </Link>
        ) : (
          <span className="inline-flex h-11 items-center rounded-md border border-border/40 bg-muted px-4 text-sm font-medium text-muted-foreground">
            <span aria-hidden="true">←</span>
            {t("prevLabel")}
          </span>
        )}
        <span className="numeric font-mono text-sm tabular-nums text-muted-foreground">
          {t("pageOfLabel", { page, totalPages })}
        </span>
        {nextHref !== null ? (
          <Link
            href={nextHref as Parameters<typeof Link>[0]["href"]}
            className="inline-flex h-11 items-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("nextLabel")}
            <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <span className="inline-flex h-11 items-center rounded-md border border-border/40 bg-muted px-4 text-sm font-medium text-muted-foreground">
            {t("nextLabel")}
            <span aria-hidden="true">→</span>
          </span>
        )}
      </nav>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// CosmeticCard — wspólna karta dla outfits + mounts.
// ───────────────────────────────────────────────────────────────────────

function CosmeticCard({
  row,
  storeLabel,
  rareLabel,
}: {
  row: {
    id: number;
    name: string;
    namePl: string | null;
    isStore: boolean;
    isRare: boolean;
    imageUrl: string;
  };
  storeLabel: string;
  rareLabel: string;
}) {
  const displayName = row.namePl ?? row.name;
  return (
    <Card className="group h-full overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-background">
          <img
            src={row.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain"
          />
          <div className="pointer-events-none absolute right-1 top-1 flex flex-col items-end gap-1">
            {row.isStore ? (
              <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                {storeLabel}
              </Badge>
            ) : null}
            {row.isRare ? (
              <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                {rareLabel}
              </Badge>
            ) : null}
          </div>
        </div>
        <p className="line-clamp-2 text-xs font-medium leading-tight text-foreground">
          {displayName}
        </p>
      </CardContent>
    </Card>
  );
}