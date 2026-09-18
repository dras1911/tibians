/**
 * `BazaarPageContent` — współdzielona treść listy aukcji Char Bazaar.
 *
 * Wydzielone z `app/[locale]/bazaar/page.tsx` (W18, 2026-09-18), żeby ta
 * sama lista z filtrami mogła być renderowana na DWÓCH trasach:
 *
 *   - `/[locale]`        (variant="home")   — strona główna = 25 aukcji
 *                          z pełnymi filtrami (wzór: Exiva.pro). Kompaktowy
 *                          nagłówek z licznikiem aktywnych aukcji.
 *   - `/[locale]/bazaar` (variant="bazaar") — klasyczna podstrona z
 *                          breadcrumbs + opisem SEO.
 *
 * URL state (filtry/sort/paginacja) działa identycznie na obu trasach —
 * `BazaarClient` używa względnego `router.replace("?...")`.
 *
 * Architektura danych (bez zmian względem oryginału):
 *   - Server-side filters + sort + pagination (arch §7.3)
 *   - Faceted counts (arch §6.4) + worldsByRegion + store-item facets
 *   - Degradacja do pustego stanu przy niedostępnej bazie (arch §6.4)
 *   - `getSuggestionCounts()` tylko gdy `total === 0` (T45)
 */

import * as React from "react";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { BazaarClient, toAuctionSummaries } from "@/components/bazaar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listAuctions,
  getFacetCounts,
  getWorldsByRegion,
  getSuggestionCounts,
  getStoreItemFacetCounts,
} from "@/lib/server/auctions";
import { parseBazaarSearchParams } from "@/lib/server/bazaar-params";
import { totalPagesOf } from "@tibians/shared/auction";
import type { Locale } from "@/i18n/routing";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

export interface BazaarPageContentProps {
  locale: Locale;
  /** Surowe `searchParams` z Next.js 15 (string | string[] | undefined). */
  rawSearchParams: Record<string, string | string[] | undefined>;
  /** "home" — strona główna (kompaktowy nagłówek); "bazaar" — podstrona. */
  variant: "home" | "bazaar";
}

export async function BazaarPageContent({
  locale,
  rawSearchParams,
  variant,
}: BazaarPageContentProps) {
  const isHome = variant === "home";

  const [t, tBazaar] = await Promise.all([
    getTranslations({ locale, namespace: "Bazaar.list" }),
    getTranslations({ locale, namespace: "Bazaar" }),
  ]);

  // ── Parsowanie + walidacja query params (Zod) ──────────────────────
  // T39: search params = URL state — źródło prawdy (T43).
  const flat = flattenSearchParams(rawSearchParams);

  const { filters, pagination } = parseBazaarSearchParams(flat);

  // ── Zapytania do DB — OSŁONIĘTE (degradacja zamiast 500) ──────────
  const dbResult = await Promise.all([
    listAuctions(filters, pagination),
    getFacetCounts(filters),
    getWorldsByRegion(),
    getStoreItemFacetCounts(),
  ]).catch((error: unknown) => {
    console.error("[bazaar] zapytania DB nie powiodły się — degradacja do stanu pustego:", error);
    return null;
  });

  const requestHeaders = await headers();

  const listResult = dbResult?.[0] ?? { rows: [], total: 0 };
  const facetCounts = dbResult?.[1] ?? {
    vocation: [],
    region: [],
    world: [],
    pvpType: [],
    battleye: [],
    storeItems: [],
    totalActive: 0,
  };
  const worldsByRegion = dbResult?.[2] ?? {
    EU: [],
    NA: [],
    BR: [],
    OCE: [],
  };
  const storeItemFacetCounts = dbResult?.[3] ?? [];

  const { rows, total } = listResult;

  // T45 — sugestie rozluźniające filtry tylko gdy 0 wyników.
  const suggestions = total === 0 ? await getSuggestionCounts(filters).catch(() => []) : [];

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

  // ── Default view (server-side hint z UA) ──────────────────────────
  const defaultView = inferDefaultViewFromHeaders(requestHeaders.get("user-agent"));

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="container py-6 md:py-8">
      {isHome ? (
        /* Strona główna: kompaktowy nagłówek + licznik (wzór: Exiva.pro,
           tylko zwięźlej — bez wielkiego hero, lista jest bohaterem). */
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {tBazaar("title")}
          </h1>
          {facetCounts.totalActive > 0 ? (
            <p className="text-sm text-muted-foreground">
              {tBazaar("activeCount", { count: facetCounts.totalActive })}
            </p>
          ) : null}
        </header>
      ) : (
        <>
          {/* Breadcrumbs (z JSON-LD BreadcrumbList) */}
          <Breadcrumbs
            items={[{ label: tBazaar("title"), href: "/bazaar" }] satisfies BreadcrumbItem[]}
          />

          {/* Page heading */}
          <header className="mt-6 max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {tBazaar("title")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {t("pageDescription")}
            </p>
          </header>
        </>
      )}

      {/* Lista + sidebar (client island) */}
      <div className={isHome ? "mt-4" : "mt-6"}>
        <React.Suspense fallback={<BazaarClientSkeleton />}>
          <BazaarClient
            auctions={toAuctionSummaries(rows)}
            total={total}
            totalPages={totalPages}
            page={pagination.page}
            pageSize={pagination.pageSize}
            facetCounts={{ ...facetCounts, storeItems: storeItemFacetCounts }}
            worldsByRegion={worldsByRegion}
            defaultView={defaultView}
            suggestions={suggestions}
          />
        </React.Suspense>
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
 */
function inferDefaultViewFromHeaders(ua: string | null): "cards" | "table" {
  if (!ua) return "cards";
  return /Mobile|Android|iPhone/i.test(ua) ? "cards" : "table";
}

/**
 * Skeleton renderowany w `<Suspense fallback>` (Next.js 15 +
 * `useSearchParams()`). Zapobiega fallbackowi SSR dla client islandu
 * Bazaar — T43 URL state.
 */
function BazaarClientSkeleton() {
  return (
    <div role="status" aria-label="Loading Bazaar…" className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <aside className="hidden md:block">
        <Skeleton className="h-96 w-full rounded-lg" />
      </aside>
      <div className="space-y-3">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}
