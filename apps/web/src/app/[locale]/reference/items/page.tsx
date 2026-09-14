/**
 * `/[locale]/reference/items` — stronicowana + searchable lista przedmiotów
 * (plan T61, arch §7.2 + §18.1).
 *
 * **Fetch:**
 *   - `listReferenceItems({ page, pageSize, query, category })` (T61 helper)
 *   - DB query + ILIKE na `name` i `name_pl`. W produkcji migracja T32
 *     aktywuje `pg_trgm` GIN index → fuzzy search.
 *
 * **ISR:** 24h (revalidate = 86_400) — rzadko się zmienia.
 *
 * **Render:**
 *   - Breadcrumbs `Strona główna / Referencje / Przedmioty`
 *   - Search box (klient) — wysyła `?q=...` do URL → server render z nowym q.
 *   - Grid kart (obrazek + nazwa PL/EN + marketPrice jeśli dostępne +
 *     badge "Store" / "Rare").
 *   - Paginacja (prev / next, numery).
 *   - JSON-LD ItemList.
 *
 * **i18n:** `Reference.items.*` (PL + EN).
 */

import * as React from "react";
import type { Metadata } from "next";
import { Backpack, Search } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { listReferenceItems, type ReferenceItemRow } from "@/lib/server/reference-pages";
import { routing } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const PAGE_SIZE = 48;

/** ISR: 24h (plan T61). */
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
    namespace: "Reference.items",
  });
  const tRef = await getTranslations({
    locale,
    namespace: "Reference.index",
  });

  const title = t("pageTitle");
  const description = t("pageDescription");
  const path = "/reference/items";

  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}${path}`;
  }

  void tRef; // referenced indirectly through breadcrumb pageTitle at runtime

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

function parseQuery(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" ? v.trim().slice(0, 60) : "";
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function ReferenceItemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const page = parsePage(sp.page);
  const query = parseQuery(sp.q);

  const [t, tRef] = await Promise.all([
    getTranslations({ locale, namespace: "Reference.items" }),
    getTranslations({ locale, namespace: "Reference.index" }),
  ]);

  // Best-effort DB query.
  let result: Awaited<ReturnType<typeof listReferenceItems>> | null = null;
  try {
    result = await listReferenceItems({
      page,
      pageSize: PAGE_SIZE,
      query: query.length >= 2 ? query : "",
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[reference/items] DB query failed:", error);
    result = null;
  }

  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Breadcrumb segment labels
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tRef("title"), href: "/reference" },
    { label: t("pageTitle"), href: "/reference/items" },
  ];

  // JSON-LD ItemList
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

  const prevHref =
    page > 1
      ? `/reference/items?page=${(page - 1).toString()}${query ? `&q=${encodeURIComponent(query)}` : ""}`
      : null;
  const nextHref =
    page < totalPages
      ? `/reference/items?page=${(page + 1).toString()}${query ? `&q=${encodeURIComponent(query)}` : ""}`
      : null;

  return (
    <div className="container py-6 md:py-8">
      <Breadcrumbs items={breadcrumbItems} />

      <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            <Backpack className="h-6 w-6 text-primary" aria-hidden="true" />
            {t("pageTitle")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {t("pageDescription")}
          </p>
        </div>
        {/* Search form — GET → URL state → server query (next-intl Link). */}
        <form
          method="get"
          action="/reference/items"
          className="flex w-full max-w-sm items-center gap-2"
        >
          <label htmlFor="items-search" className="sr-only">
            {t("searchLabel")}
          </label>
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="items-search"
              name="q"
              type="search"
              defaultValue={query}
              minLength={2}
              maxLength={60}
              placeholder={t("searchPlaceholder")}
              className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </form>
      </header>

      {/* ── Empty state ────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <Card className="mx-auto mt-8 max-w-xl border-dashed">
          <CardHeader>
            <CardTitle className="text-base">{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyDescription")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {/* ── Grid kart ───────────────────────────────────────────── */}
          <div className="mt-8">
            <p
              className="numeric mb-3 text-xs font-medium text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {t("resultsLabel", { count: total })}
            </p>
            <ul
              role="list"
              aria-label={t("gridAria")}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
            >
              {rows.map((row) => (
                <li key={row.id} role="listitem">
                  <ItemCard row={row} storeLabel={t("storeLabel")} rareLabel={t("rareLabel")} />
                </li>
              ))}
            </ul>
          </div>

          {/* ── Paginacja ──────────────────────────────────────────── */}
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
        </>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// ItemCard — jedna karta przedmiotu.
// ───────────────────────────────────────────────────────────────────────

function ItemCard({
  row,
  storeLabel,
  rareLabel,
}: {
  row: ReferenceItemRow;
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
            {row.isStoreItem ? (
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
        <div>
          <p className="line-clamp-2 text-xs font-medium leading-tight text-foreground">
            {displayName}
          </p>
          {row.marketPrice !== null ? (
            <p className="numeric mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
              {row.marketPrice.toLocaleString("en-US")} gp
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}