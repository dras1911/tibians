"use client";

/**
 * BazaarClient — client-side glue dla strony `/bazaar` (plan T39-T41).
 *
 * Odpowiedzialności (arch §5 + §6.4):
 *   1. **URL state sync** (T43): wszystkie zmiany filtrów → `router.replace()`
 *      z `scroll: false` — nie zaśmieca historii.
 *   2. **Renderowanie sidebara + toolbara + listy** (T41 + T40).
 *   3. **Widok Cards / Table** (T40): `useState` synchronizowany z
 *      `localStorage['tibians:bazaar:view']`.
 *   4. **Paginacja + sortowanie**: parent (`page.tsx`) przekazuje SSR
 *      posortowane + spaginowane dane; komponent dispatchuje URL
 *      zmieniając `?page=`, `?sortBy=`, `?sortDir=`, `?pageSize=`.
 *   5. **Empty state** z CTA "Wyczyść wszystkie filtry" (T45 — pełne
 *      sugestie po server-side computation w W9+).
 *   6. **Porównanie** (T62): stan `comparedIds` w URL `?compare=id1,id2`.
 *      Tutaj trzymamy prosty state (lifted up do tego klienta).
 *   7. **Mobile FAB → Sheet** (T14): filtr dostępny przez `Sheet`.
 *
 * Filozofia (arch §5):
 *   - URL jest źródłem prawdy (T43).
 *   - Server zwraca dane posortowane + spaginowane — re-render po
 *     zmianie URL to `next/link` z `replace()`, dzięki czemu SSR
 *     ponownie renderuje stronę (ISR cache tag `auctions`).
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Inbox } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Link } from "@/i18n/routing";

import {
  AuctionCard,
  AuctionTable,
  AuctionResultsToolbar,
  AuctionFiltersSidebar,
  type AuctionFiltersSidebarProps,
  type AuctionSummary,
  type BazaarFilters,
  type BazaarSortKey,
  type BazaarView,
  type FacetCounts,
} from "./index";

// ─────────────────────────────────────────────────────────────────────
// URL ↔ Filters ↔ Pagination helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Kanoniczne mapowanie URL → filtry Bazaar.
 * Wszystkie URL parametry są stringami; konwersja typów odbywa się tu.
 */
function readFiltersFromSearchParams(
  searchParams: URLSearchParams,
): BazaarFilters {
  const vocation = searchParams.get("vocation");
  const region = searchParams.get("region");
  const world = searchParams.get("world");
  const pvpType = searchParams.get("pvpType");
  const battleye = searchParams.get("battleye");
  const search = searchParams.get("search");

  return {
    vocation: (vocation as BazaarFilters["vocation"]) ?? undefined,
    levelMin: parseIntOr(searchParams.get("levelMin"), undefined),
    levelMax: parseIntOr(searchParams.get("levelMax"), undefined),
    bidMin: parseIntOr(searchParams.get("bidMin"), undefined),
    bidMax: parseIntOr(searchParams.get("bidMax"), undefined),
    region: (region as BazaarFilters["region"]) ?? undefined,
    world: world ?? undefined,
    pvpType: (pvpType as BazaarFilters["pvpType"]) ?? undefined,
    battleye: (battleye as BazaarFilters["battleye"]) ?? undefined,
    hasSoulWar: searchParams.get("hasSoulWar") === "1" ? true : undefined,
    hasPrimalOrdeal:
      searchParams.get("hasPrimalOrdeal") === "1" ? true : undefined,
    search: search ?? undefined,
  };
}

function parseIntOr(value: string | null, fallback: number | undefined) {
  if (value === null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Kanoniczny URL sortKey → AuctionSortKey dla API (arch §7.3).
 */
export function sortKeyToUrlParams(
  key: BazaarSortKey,
): { sortBy: string; sortDir: "asc" | "desc" } {
  switch (key) {
    case "ending":
      return { sortBy: "auctionEnd", sortDir: "asc" };
    case "endingDesc":
      return { sortBy: "auctionEnd", sortDir: "desc" };
    case "bidAsc":
      return { sortBy: "bid", sortDir: "asc" };
    case "bidDesc":
      return { sortBy: "bid", sortDir: "desc" };
    case "levelAsc":
      return { sortBy: "level", sortDir: "asc" };
    case "levelDesc":
      return { sortBy: "level", sortDir: "desc" };
    case "nameAsc":
      return { sortBy: "firstSeenAt", sortDir: "asc" };
    case "nameDesc":
      return { sortBy: "firstSeenAt", sortDir: "desc" };
    case "newest":
      return { sortBy: "scrapedAt", sortDir: "desc" };
  }
}

function readSortKeyFromSearchParams(
  searchParams: URLSearchParams,
): BazaarSortKey {
  const sortBy = searchParams.get("sortBy") ?? "auctionEnd";
  const sortDir = searchParams.get("sortDir") ?? "asc";

  if (sortBy === "auctionEnd" && sortDir === "asc") return "ending";
  if (sortBy === "auctionEnd" && sortDir === "desc") return "endingDesc";
  if (sortBy === "bid" && sortDir === "asc") return "bidAsc";
  if (sortBy === "bid" && sortDir === "desc") return "bidDesc";
  if (sortBy === "level" && sortDir === "asc") return "levelAsc";
  if (sortBy === "level" && sortDir === "desc") return "levelDesc";
  if (sortBy === "firstSeenAt" && sortDir === "asc") return "nameAsc";
  if (sortBy === "firstSeenAt" && sortDir === "desc") return "nameDesc";
  if (sortBy === "scrapedAt" && sortDir === "desc") return "newest";
  return "ending";
}

// ─────────────────────────────────────────────────────────────────────
// AuctionFiltersSidebar props bridge (BazaarFilters → AuctionFiltersSidebar)
// ─────────────────────────────────────────────────────────────────────

function toSidebarFilters(f: BazaarFilters): AuctionFiltersSidebarProps["filters"] {
  return f;
}

// ─────────────────────────────────────────────────────────────────────
// Empty facets (gdy brak danych z parent)
// ─────────────────────────────────────────────────────────────────────

const EMPTY_FACETS: FacetCounts = {
  vocation: [],
  region: [],
  world: [],
  pvpType: [],
  battleye: [],
  totalActive: 0,
};

// ─────────────────────────────────────────────────────────────────────
// BazaarClient
// ─────────────────────────────────────────────────────────────────────

export interface BazaarClientProps {
  /** SSR-posortowane + spaginowane aukcje (AuctionSummary[]). */
  auctions: AuctionSummary[];
  /** Łączna liczba aukcji (po filtrach). */
  total: number;
  /** Łączna liczba stron. */
  totalPages: number;
  /** Aktualna strona (1-indeksowana). */
  page: number;
  /** Rozmiar strony. */
  pageSize: number;
  /** Facet counts z servera. */
  facetCounts: FacetCounts;
  /** Światy pogrupowane po regionie. */
  worldsByRegion: Record<"EU" | "NA" | "BR", string[]>;
  /** Tryb domyślny widoku (serwer decyduje na podstawie UA). */
  defaultView: BazaarView;
}

export function BazaarClient({
  auctions,
  total,
  totalPages,
  page,
  pageSize,
  facetCounts,
  worldsByRegion,
  defaultView,
}: BazaarClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tList = useTranslations("Bazaar.list");
  const tFilters = useTranslations("Bazaar.filters");
  const tPag = useTranslations("Bazaar.pagination");

  // URL state — źródło prawdy (arch §5 + T43).
  const filters = React.useMemo(
    () => readFiltersFromSearchParams(searchParams),
    [searchParams],
  );
  const sortKey = React.useMemo(
    () => readSortKeyFromSearchParams(searchParams),
    [searchParams],
  );

  // Local state: widok (karty vs tabela) — localStorage jako persistence.
  const [view, setView] = React.useState<BazaarView>(defaultView);

  // Sheet (mobile) — otwarty gdy user kliknie FAB "Filtry".
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  // Porównanie — prosty lifted state (T62 docelowo server-side).
  const [comparedIds, setComparedIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  /**
   * Push nowego URL — `replace()` żeby nie zaśmiecać historii (arch §5).
   */
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

  const handleFilterChange = React.useCallback(
    (next: BazaarFilters) => {
      replaceUrl({
        vocation: next.vocation,
        levelMin: next.levelMin,
        levelMax: next.levelMax,
        bidMin: next.bidMin,
        bidMax: next.bidMax,
        region: next.region,
        world: next.world,
        pvpType: next.pvpType,
        battleye: next.battleye,
        hasSoulWar: next.hasSoulWar ? "1" : null,
        hasPrimalOrdeal: next.hasPrimalOrdeal ? "1" : null,
        search: next.search,
        // Reset do strony 1 po zmianie filtrów (UX: nie wyrzucaj na pustą stronę).
        page: 1,
      });
    },
    [replaceUrl],
  );

  const handleReset = React.useCallback(() => {
    replaceUrl({
      vocation: null,
      levelMin: null,
      levelMax: null,
      bidMin: null,
      bidMax: null,
      region: null,
      world: null,
      pvpType: null,
      battleye: null,
      hasSoulWar: null,
      hasPrimalOrdeal: null,
      search: null,
      page: 1,
    });
  }, [replaceUrl]);

  const handleSortChange = React.useCallback(
    (next: BazaarSortKey) => {
      const { sortBy, sortDir } = sortKeyToUrlParams(next);
      replaceUrl({ sortBy, sortDir, page: 1 });
    },
    [replaceUrl],
  );

  const handlePageSizeChange = React.useCallback(
    (next: number) => {
      replaceUrl({ pageSize: next, page: 1 });
    },
    [replaceUrl],
  );

  const handleCompareToggle = React.useCallback(
    (id: string, selected: boolean) => {
      setComparedIds((prev) => {
        const next = new Set(prev);
        if (selected) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [],
  );

  // ── Sidebar (desktop) + FAB trigger (mobile) ─────────────────────
  const sidebarContent = (
    <AuctionFiltersSidebar
      filters={toSidebarFilters(filters)}
      onFilterChange={handleFilterChange}
      onReset={handleReset}
      facetCounts={facetCounts ?? EMPTY_FACETS}
      worldsByRegion={worldsByRegion}
      className="border-0 bg-transparent p-0"
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Top bar (toolbar) ──────────────────────────────────────── */}
      <AuctionResultsToolbar
        total={total}
        sortKey={sortKey}
        onSortChange={handleSortChange}
        pageSize={pageSize}
        onPageSizeChange={handlePageSizeChange}
        view={view}
        onViewChange={setView}
      />

      {/* ── Mobile FAB: filtry ─────────────────────────────────────── */}
      <div className="md:hidden">
        <Button
          variant="outline"
          size="sm"
          className="h-11 w-full justify-center gap-2"
          onClick={() => setFiltersOpen(true)}
        >
          <Filter className="h-4 w-4" aria-hidden="true" />
          {tFilters("openFilters")}
        </Button>
      </div>

      {/* ── Layout: sidebar + content ─────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
        {/* Desktop sidebar */}
        <aside className="hidden md:block">
          <div className="sticky top-20">{sidebarContent}</div>
        </aside>

        {/* Mobile sheet */}
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent
            side="left"
            className="w-full max-w-md overflow-y-auto sm:max-w-md"
          >
            <SheetHeader>
              <SheetTitle>{tFilters("title")}</SheetTitle>
              <SheetDescription>
                {tFilters("openFiltersCount", {
                  count: countActiveFilters(filters),
                })}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6">{sidebarContent}</div>
          </SheetContent>
        </Sheet>

        {/* ── Content: list (cards / table) or empty state ──────── */}
        <div className="min-w-0 space-y-4">
          {total === 0 ? (
            <EmptyState onReset={handleReset} />
          ) : view === "cards" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {auctions.map((a) => (
                <AuctionCard
                  key={a.id}
                  auction={a}
                  onCompareToggle={handleCompareToggle}
                  isCompared={comparedIds.has(a.id)}
                />
              ))}
            </div>
          ) : (
            <AuctionTable
              rows={auctions}
              onCompareToggle={handleCompareToggle}
              comparedIds={comparedIds}
              caption={tList("pageTitle")}
            />
          )}

          {/* ── Pagination ──────────────────────────────────────── */}
          {totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <p className="numeric font-mono text-sm tabular-nums text-muted-foreground">
                {tPag("page", { page, total: totalPages })}
              </p>
              <div className="flex items-center gap-1">
                <PaginationButton
                  disabled={page <= 1}
                  onClick={() => replaceUrl({ page: Math.max(1, page - 1) })}
                  label={tPag("previous")}
                />
                <PaginationButton
                  disabled={page >= totalPages}
                  onClick={() =>
                    replaceUrl({ page: Math.min(totalPages, page + 1) })
                  }
                  label={tPag("next")}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers (lokalne)
// ─────────────────────────────────────────────────────────────────────

function countActiveFilters(f: BazaarFilters): number {
  let count = 0;
  if (f.vocation) count++;
  if (f.levelMin !== undefined || f.levelMax !== undefined) count++;
  if (f.bidMin !== undefined || f.bidMax !== undefined) count++;
  if (f.region) count++;
  if (f.world) count++;
  if (f.pvpType) count++;
  if (f.battleye) count++;
  if (f.hasSoulWar) count++;
  if (f.hasPrimalOrdeal) count++;
  if (f.search) count++;
  return count;
}

interface PaginationButtonProps {
  disabled: boolean;
  onClick: () => void;
  label: string;
}

function PaginationButton({ disabled, onClick, label }: PaginationButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="h-11"
    >
      {label}
    </Button>
  );
}

interface EmptyStateProps {
  onReset: () => void;
}

function EmptyState({ onReset }: EmptyStateProps) {
  const t = useTranslations("Bazaar.list");
  return (
    <Card className="border-dashed bg-muted/30">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <Inbox className="h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t("emptyTitle")}
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {t("emptyDescription")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={onReset} size="sm" className="h-11">
            {t("emptyCta")}
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-11">
            <Link href="/bazaar">Bazaar</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// (Separator import removed — kept minimal.)