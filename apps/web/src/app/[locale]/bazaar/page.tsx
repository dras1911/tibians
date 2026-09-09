/**
 * `/[locale]/bazaar` — lista aukcji Char Bazaar (plan task 39, arch §5).
 *
 * Server Component (RSC) renderujący listę aukcji z:
 *   - Server-side filters + sort + pagination (arch §7.3 — Index Scan ~3-8 ms)
 *   - ISR cache tag `auctions` (arch §8.2) → revalidowany przez /api/revalidate
 *   - Default sort: `auctionEnd ASC` (arch §5 krok 2 — pilność)
 *   - Faceted counts (arch §6.4 pkt 1) — z `mv_facet_counts` view
 *   - Breadcrumbs + JSON-LD (`ItemList` schema)
 *
 * Przepływ (arch §5):
 *   1. Wejście z `/` (KROK 1) → hero z licznikiem aktywnych aukcji
 *   2. Tutaj: lista + sidebar filtrów + toolbar (KROK 2-3)
 *   3. Karta aukcji (KROK 5) — renderowana przez `AuctionCard` (T40)
 *
 * Źródła danych:
 *   - `getActiveAuctions(db, filters, sort, {page, pageSize})` — T34 + T38
 *   - `getFacetCounts(filters)` — nowy helper z T41
 *   - `getWorldsByRegion()` — dla searchable multi-select
 *
 * Bilingual PL + EN: wszystkie labels w `useTranslations("Bazaar")`.
 */

import * as React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { BazaarClient, toAuctionSummaries } from "@/components/bazaar";
import { listAuctions, getFacetCounts, getWorldsByRegion } from "@/lib/server/auctions";
import {
  auctionFiltersSchema,
  paginationSchema,
  totalPagesOf,
} from "@tibians/shared/auction";
import { routing, type Locale } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const PATH = "/bazaar";

/**
 * ISR cache tag (arch §8.2): pozwala `revalidateTag('auctions')`
 * z `/api/revalidate` (T38) wymusić natychmiastowy refresh po scrape.
 * `revalidate = 300` (5 min fallback) gdy webhook nie przyjdzie.
 */
export const revalidate = 300;
export const dynamic = "force-dynamic"; // dopóki DB jest tylko w runtime; po W8 → ISR

// ───────────────────────────────────────────────────────────────────────
// generateMetadata — per-locale SEO
// ───────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Bazaar.list",
  });
  const tBazaar = await getTranslations({
    locale: locale as Locale,
    namespace: "Bazaar",
  });

  // Title ≤ 60 znaków (SEO best practice).
  const title = t("pageTitle");
  const localizedTitle = `${title} · Tibians`;
  const finalTitle =
    localizedTitle.length <= 60 ? localizedTitle : title;

  const description = t("pageDescription");
  const finalDescription =
    description.length <= 155
      ? description
      : `${description.slice(0, 152)}…`;

  const canonical = `${SITE_URL}/${locale}${PATH}`;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}${PATH}`;
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
      type: "website",
      images: [
        {
          url: `${SITE_URL}/og/bazaar.png`,
          width: 1200,
          height: 630,
          alt: tBazaar("title"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: finalTitle,
      description: finalDescription,
    },
    // JSON-LD ItemList schema dla listy aukcji (SEO §4.3).
    other: {
      "x-bazaar-cache-tag": "auctions",
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function BazaarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale as Locale;
  const [rawSearch, t, tBazaar] = await Promise.all([
    searchParams,
    getTranslations({ locale, namespace: "Bazaar.list" }),
    getTranslations({ locale, namespace: "Bazaar" }),
  ]);

  // ── Parsowanie + walidacja query params (Zod) ──────────────────────
  // T39: search params = URL state — źródło prawdy (T43).
  const flat = flattenSearchParams(rawSearch);

  let filters;
  let pagination;
  try {
    filters = auctionFiltersSchema.parse(flat);
    pagination = paginationSchema.parse(flat);
  } catch {
    // Fallback na domyślne filtry (arch §6.4 pkt 4 — URL zawsze działa).
    filters = auctionFiltersSchema.parse({});
    pagination = paginationSchema.parse({});
  }

  // ── Równoległe zapytania do DB (T34 + T41) ────────────────────────
  // Arch §8.2: `next: { tags: ['auctions'] }` — revalidowane przez
  // /api/revalidate (T38 webhook) po każdym pełnym scrape.
  const [requestHeaders, dbResults] = await Promise.all([
    headers(),
    Promise.all([
      listAuctions(filters, pagination),
      getFacetCounts(filters),
      getWorldsByRegion(),
    ]),
  ]);
  const [{ rows, total }, facetCounts, worldsByRegion] = dbResults;

  const totalPages = totalPagesOf(total, pagination.pageSize);

  // ── JSON-LD ItemList schema ───────────────────────────────────────
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: rows.slice(0, 25).map((row, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${SITE_URL}/${locale}/bazaar/${row.auctionId.toString()}`,
      name: row.characterName,
    })),
    numberOfItems: total,
  };

  // ── Breadcrumbs ───────────────────────────────────────────────────
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tBazaar("title"), href: "/bazaar" },
  ];

  // ── Default view (server-side hint z UA) ──────────────────────────
  const defaultView = inferDefaultViewFromHeaders(
    requestHeaders.get("user-agent"),
  );

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="container py-6 md:py-8">
      {/* Breadcrumbs (z JSON-LD BreadcrumbList) */}
      <Breadcrumbs items={breadcrumbItems} />

      {/* Page heading */}
      <header className="mt-6 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {tBazaar("title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {t("pageDescription")}
        </p>
      </header>

      {/* Lista + sidebar (client island) */}
      <div className="mt-6">
        <BazaarClient
          auctions={toAuctionSummaries(rows)}
          total={total}
          totalPages={totalPages}
          page={pagination.page}
          pageSize={pagination.pageSize}
          facetCounts={facetCounts}
          worldsByRegion={worldsByRegion}
          defaultView={defaultView}
        />
      </div>

      {/* JSON-LD ItemList schema (SEO §4.3 + arch §5 — ItemList). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

/**
 * Flatten `searchParams` Promise do zwykłego obiektu (URLSearchParams
 * -kompatybilny). Next.js 15 zwraca wartości jako `string | string[]`;
 * my preferujemy `string` (ostatnia wartość gdy multi).
 */
function flattenSearchParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      const last = value[value.length - 1];
      if (last !== undefined) out[key] = last;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Heurystyka: na mobile preferuj karty, na desktop tabelę.
 * Czyta `User-Agent` z nagłówków (server-side hint).
 *
 * Wywoływane z `await headers()` w page.tsx — przekazujemy gotowy UA.
 */
function inferDefaultViewFromHeaders(ua: string | null): "cards" | "table" {
  if (!ua) return "cards";
  return /Mobile|Android|iPhone/i.test(ua) ? "cards" : "table";
}