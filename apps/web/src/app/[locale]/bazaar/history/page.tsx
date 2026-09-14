/**
 * `/[locale]/bazaar/history` — archiwum zakończonych aukcji Char Bazaar
 * (plan task 58, arch §5 "Historia zakończonych aukcji" + §7.2 queries).
 *
 * Server Component (RSC) renderujący listę zakończonych aukcji z:
 *   - Server-side filters + pagination (arch §7.2: partial index
 *     `idx_au_finished_end` na `auction_end DESC WHERE status='finished'`)
 *   - Sort: `auction_end DESC` (default, kronologicznie od najnowszych)
 *   - Filtry: world, vocation, date range (T58 `HistoryFilters`)
 *   - ISR cache tag (arch §8.2) → revalidowany przez /api/revalidate
 *     z opóźnieniem `revalidate = 300` (5 min) — historia zmienia się
 *     rzadko (zakończenia aukcji co 30-60 min, nie co sekundę).
 *   - Breadcrumbs + JSON-LD (`ItemList` schema)
 *
 * Przepływ (arch §5):
 *   - Server: `getFinishedAuctions(db, filters, { page, pageSize })` (T58)
 *   - Render: `<HistoryClient>` (client island dla filtrów + paginacji)
 *
 * Bilingual PL + EN: wszystkie labels w `useTranslations("Bazaar.history")`.
 */

import * as React from "react";
import type { Metadata } from "next";
import { History as HistoryIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import {
  HistoryClient,
  toHistorySummaries,
} from "./history-client";
import {
  getFinishedAuctions,
  getWorldsByRegion,
  type FinishedAuctionFilters,
} from "@/lib/server/auctions";
import {
  paginationSchema,
  totalPagesOf,
} from "@tibians/shared/auction";
import { routing, type Locale } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const PATH = "/bazaar/history";

/**
 * ISR cache (arch §8.2): 5 min fallback. Historia aukcji zmienia się
 * wolno (każda aukcja żyje ~7 dni), więc 5 min jest wystarczające.
 * Webhook T38 może wymusić natychmiastowy refresh tagiem `auctions`.
 */
export const revalidate = 300;

// ───────────────────────────────────────────────────────────────────────
// generateMetadata — locale-aware SEO
// ───────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Bazaar.history",
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
          url: `${SITE_URL}/og/bazaar-history.png`,
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
    other: {
      "x-bazaar-cache-tag": "auctions",
    },
  };
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
 * Walidacja daty w formacie `YYYY-MM-DD` → `Date` (początek/końiec dnia UTC).
 * Zwraca `undefined` gdy string jest pusty lub niepoprawny.
 *
 * - `dateFrom` → 00:00:00 UTC początku dnia (cały dzień inclusive).
 * - `dateTo` → 23:59:59.999 UTC końca dnia (cały dzień inclusive).
 */
function parseDateParam(
  value: string | undefined,
  endOfDay: boolean,
): Date | undefined {
  if (value === undefined || value === "") return undefined;
  // Format `YYYY-MM-DD` (HTML `<input type="date">`).
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return undefined;
  const time = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const date = new Date(`${value}${time}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function HistoryPage({
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
    getTranslations({ locale, namespace: "Bazaar.history" }),
    getTranslations({ locale, namespace: "Bazaar" }),
  ]);

  // ── Parsowanie + walidacja query params (Zod) ──────────────────────
  const flat = flattenSearchParams(rawSearch);

  let pagination;
  try {
    pagination = paginationSchema.parse(flat);
  } catch {
    pagination = paginationSchema.parse({});
  }

  // ── Filtry historii (ręczny parse — oddzielne od AuctionFilters) ──
  // Walidacja vocation z enum VocationSchema byłaby tu przydatna, ale
  // `HistoryFilters` używa VocationSchema z `@tibians/shared/auction`.
  const { VocationSchema } = await import("@tibians/shared/auction");
  const vocationParse = VocationSchema.safeParse(flat.vocation);

  // Budujemy obiekt filtrów z `exactOptionalPropertyTypes: true` —
  // pomijamy pola `undefined` zamiast ustawiać je na `undefined`
  // (TS2375: `undefined` nie jest assignable do opcjonalnego pola).
  const finishedFilters: FinishedAuctionFilters = {};
  if (flat.world !== undefined && flat.world !== "") {
    finishedFilters.world = flat.world;
  }
  if (vocationParse.success) {
    finishedFilters.vocation = vocationParse.data;
  }
  const dateFrom = parseDateParam(flat.dateFrom, false);
  if (dateFrom !== undefined) finishedFilters.dateFrom = dateFrom;
  const dateTo = parseDateParam(flat.dateTo, true);
  if (dateTo !== undefined) finishedFilters.dateTo = dateTo;

  // ── Równoległe zapytania do DB (T58) ───────────────────────────────
  // 1. Lista zakończonych aukcji + count.
  // 2. Lista światów (dla filtra w panelu).
  const listPromise = getFinishedAuctions(finishedFilters, pagination);
  const worldsPromise = getWorldsByRegion();
  const [listResult, worldsByRegion] = await Promise.all([
    listPromise,
    worldsPromise,
  ]);

  const { rows, total } = listResult;
  const totalPages = totalPagesOf(total, pagination.pageSize);

  // Wszystkie światy (EU + NA + BR) — flat lista dla `<HistoryFilters>`.
  const allWorlds = [
    ...worldsByRegion.EU,
    ...worldsByRegion.NA,
    ...worldsByRegion.BR,
  ];

  // ── JSON-LD ItemList schema (SEO §4.3 + arch §5 — ItemList) ──────
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: rows.slice(0, 25).map((row: { auctionId: bigint; characterName: string }, idx: number) => ({
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
    { label: t("pageTitle"), href: "/bazaar/history" },
  ];

  return (
    <div className="container py-6 md:py-8">
      {/* Breadcrumbs (z JSON-LD BreadcrumbList) */}
      <Breadcrumbs items={breadcrumbItems} />

      {/* Page heading */}
      <header className="mt-6 max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <HistoryIcon className="h-6 w-6 text-primary" aria-hidden="true" />
          {t("pageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {t("pageDescription")}
        </p>
      </header>

      {/* Filtry + lista (client island) */}
      <div className="mt-6">
        <React.Suspense fallback={null}>
          <HistoryClient
            auctions={toHistorySummaries(rows)}
            total={total}
            totalPages={totalPages}
            page={pagination.page}
            filters={{
              world: finishedFilters.world,
              vocation: finishedFilters.vocation,
              dateFrom: flat.dateFrom,
              dateTo: flat.dateTo,
            }}
            worlds={allWorlds}
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