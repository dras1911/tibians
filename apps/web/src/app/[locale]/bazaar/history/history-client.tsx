"use client";

/**
 * HistoryClient — client island dla `/bazaar/history` (plan task 58).
 *
 * Odpowiedzialności (arch §5):
 *   1. **URL state sync** (T43): filtry i paginacja zarządzane przez
 *      `router.replace()`. Filtry są z natychmiastowym update (input
 *      + select), ale paginacja używa dedykowanych przycisków (arch §6.4).
 *   2. **Renderowanie sidebara z filtrami** + listy kart + paginacji.
 *
 * Filtry są mniejsze niż na `/bazaar` (brak skillów, level, ceny) —
 * plan T58: tylko world, vocation, date range.
 *
 * Sortowanie jest stałe (`auction_end DESC`) — nie ma UI do zmiany
 * (historia zawsze od najnowszych).
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { AuctionCard } from "@/components/bazaar/auction-card";
import {
  HistoryFilters,
  type HistoryFiltersValue,
} from "@/components/bazaar/history-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  toAuctionSummaries,
  type AuctionSummary,
} from "@/components/bazaar/auction-summary";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// Adapter — AuctionRow[] (server) → AuctionSummary[] (client)
// ─────────────────────────────────────────────────────────────────────

/**
 * Adapter dla listy zakończonych aukcji. Reużywa `toAuctionSummaries`
 * (T40), bo `finalPrice` jest już częścią `AuctionSummary` po T58.
 *
 * Eksportowany jako alias dla czytelności w wywołaniu `page.tsx`.
 */
export function toHistorySummaries(rows: Parameters<typeof toAuctionSummaries>[0]): AuctionSummary[] {
  return toAuctionSummaries(rows);
}

// ─────────────────────────────────────────────────────────────────────
// Publiczne typy
// ─────────────────────────────────────────────────────────────────────

export interface HistoryClientProps {
  auctions: AuctionSummary[];
  total: number;
  totalPages: number;
  page: number;
  filters: HistoryFiltersValue;
  worlds: string[];
}

// ─────────────────────────────────────────────────────────────────────
// URL ↔ Filters helpers
// ─────────────────────────────────────────────────────────────────────

/** Buduje URL patch (Record<string, string | undefined>) dla `router.replace`. */
function filtersToQueryPatch(
  filters: HistoryFiltersValue,
  extra?: Record<string, string | number | undefined | null>,
): Record<string, string | number | undefined | null> {
  const out: Record<string, string | number | undefined | null> = {};
  if (filters.world !== undefined) out.world = filters.world;
  if (filters.vocation !== undefined) out.vocation = filters.vocation;
  if (filters.dateFrom !== undefined && filters.dateFrom !== "")
    out.dateFrom = filters.dateFrom;
  if (filters.dateTo !== undefined && filters.dateTo !== "")
    out.dateTo = filters.dateTo;
  if (extra) Object.assign(out, extra);
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// HistoryClient
// ─────────────────────────────────────────────────────────────────────

export function HistoryClient({
  auctions,
  total,
  totalPages,
  page,
  filters,
  worlds,
}: HistoryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Bazaar.history");
  const tPag = useTranslations("Bazaar.pagination");

  // ── Patch URL helper (arch §5: replace() bez scroll) ────────────
  const replaceUrl = React.useCallback(
    (patch: Record<string, string | number | undefined | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      router.replace(qs.length > 0 ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  // ── Filters handler (natychmiastowy reset do page=1) ────────────
  const handleFiltersChange = React.useCallback(
    (next: HistoryFiltersValue) => {
      replaceUrl({ ...filtersToQueryPatch(next), page: 1 });
    },
    [replaceUrl],
  );

  const handleReset = React.useCallback(() => {
    replaceUrl({ world: undefined, vocation: undefined, dateFrom: undefined, dateTo: undefined, page: 1 });
  }, [replaceUrl]);

  // ── Paginacja ────────────────────────────────────────────────────
  const handlePage = React.useCallback(
    (next: number) => {
      replaceUrl({ page: next });
    },
    [replaceUrl],
  );

  // ── Empty state (zero wyników) ──────────────────────────────────
  if (total === 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <HistoryFilters
          value={filters}
          onChange={handleFiltersChange}
          onReset={handleReset}
          worlds={worlds}
        />
        <div className="space-y-4">
          <EmptyHistoryNotice
            hasFilters={
              filters.world !== undefined ||
              filters.vocation !== undefined ||
              filters.dateFrom !== undefined ||
              filters.dateTo !== undefined
            }
            onReset={handleReset}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      {/* ── Sidebar (desktop) ────────────────────────────────────── */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <HistoryFilters
          value={filters}
          onChange={handleFiltersChange}
          onReset={handleReset}
          worlds={worlds}
        />
      </aside>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="min-w-0 space-y-4">
        {/* Total count + page info */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
          <p className="numeric font-mono text-sm font-semibold tabular-nums text-foreground">
            {t("totalCount", { count: total })}
          </p>
          {totalPages > 1 ? (
            <p className="numeric font-mono text-xs tabular-nums text-muted-foreground">
              {tPag("page", { page, total: totalPages })}
            </p>
          ) : null}
        </div>

        {/* ── Lista kart (AuctionCard w trybie "history") ────────── */}
        <ul
          className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2"
          aria-label={t("pageTitle")}
        >
          {auctions.map((a) => (
            <li key={a.id}>
              <AuctionCard auction={a} mode="history" />
            </li>
          ))}
        </ul>

        {/* ── Paginacja ──────────────────────────────────────────── */}
        {totalPages > 1 ? (
          <nav
            aria-label={tPag("page", { page, total: totalPages })}
            className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"
          >
            <p className="numeric font-mono text-sm tabular-nums text-muted-foreground">
              {tPag("page", { page, total: totalPages })}
            </p>
            <div className="flex items-center gap-1">
              <PaginationButton
                disabled={page <= 1}
                onClick={() => handlePage(Math.max(1, page - 1))}
                ariaLabel={tPag("previous")}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{tPag("previous")}</span>
              </PaginationButton>
              <PaginationButton
                disabled={page >= totalPages}
                onClick={() => handlePage(Math.min(totalPages, page + 1))}
                ariaLabel={tPag("next")}
              >
                <span className="hidden sm:inline">{tPag("next")}</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </PaginationButton>
            </div>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PaginationButton — reużywany z wzorca bazaar-client (T39)
// ─────────────────────────────────────────────────────────────────────

function PaginationButton({
  disabled,
  onClick,
  ariaLabel,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="h-11"
      aria-label={ariaLabel}
    >
      {children}
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// EmptyHistoryNotice — zero wyników (bez sugestii rozluźniania)
// ─────────────────────────────────────────────────────────────────────

function EmptyHistoryNotice({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean;
  onReset: () => void;
}) {
  const t = useTranslations("Bazaar.history");

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="text-base font-semibold text-foreground">
          {t("emptyTitle")}
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          {hasFilters ? t("emptyDescription") : t("emptyDescriptionAll")}
        </p>
        {hasFilters ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onReset}
            className={cn("h-11")}
          >
            {t("emptyCta")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}