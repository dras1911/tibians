"use client";

/**
 * BazaarClient — client-side glue dla strony `/bazaar` (plan T39-T44).
 *
 * Odpowiedzialności (arch §5 + §6.4):
 *   1. **URL state sync** (T43): `useBazaarFilters()` zarządza wszystkimi
 *      filtrami. Read = natychmiastowy, Write = debounce 300 ms (częste
 *      interakcje z filtrami nie spamują historii przeglądarki).
 *   2. **Renderowanie sidebara + toolbara + listy** (T41 + T40).
 *   3. **Widok Cards / Table** (T40): `useState` synchronizowany z
 *      `localStorage['tibians:bazaar:view']`.
 *   4. **Paginacja + sortowanie**: parent (`page.tsx`) przekazuje SSR
 *      posortowane + spaginowane dane; komponent dispatchuje URL
 *      zmieniając `?page=`, `?sortBy=`, `?sortDir=`, `?pageSize=`.
 *   5. **Empty state** z CTA "Wyczyść wszystkie filtry" (T45 — pełne
 *      sugestie po server-side computation w W9+).
 *   6. **Porównanie** (T62): wspólny stan w `localStorage` (`useCompareSelection`)
 *      — karty i tabela zaznaczają bezpośrednio; pasek `<CompareBar>` prowadzi
 *      do `/bazaar/compare?a=&b=`.
 *   7. **Mobile FAB → Sheet** (T14): filtr dostępny przez `Sheet`.
 *   8. **Sticky rząd aktywnych chipów + Kopiuj link** (T43): renderowany
 *      przez `<ActiveFiltersBar>` tuż pod toolbar.
 *   9. **Live indicator** (T44): `<BazaarLiveIndicator>` w prawym górnym
 *      rogu toolbara.
 *
 * Filozofia (arch §5):
 *   - URL jest źródłem prawdy (T43) — `useBazaarFilters` czyta i pisze.
 *   - Server zwraca dane posortowane + spaginowane — re-render po
 *     zmianie URL to `next/link` z `replace()`, dzięki czemu SSR
 *     ponownie renderuje stronę (ISR cache tag `auctions`).
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ToastProvider } from "@/components/ui/toast";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  AuctionTable,
  AuctionResultsToolbar,
  AuctionFiltersSidebar,
  type AuctionSummary,
  type BazaarSortKey,
  type BazaarView,
  type FacetCounts,
} from "./index";
import { ActiveFiltersBar } from "./active-filters-bar";
import { BazaarLiveIndicator } from "./bazaar-live-indicator";
import { EmptyResults, type EmptyResultsSuggestion } from "./empty-results";
import { VirtualizedAuctionGrid } from "./virtualized-grid";
import { useBazaarFilters } from "@/lib/hooks/use-bazaar-filters";

// ─────────────────────────────────────────────────────────────────────
// URL ↔ Pagination/Sort helpers (T39 — sort + page mieszkają poza
// useBazaarFilters, bo są zarządzane przez toolbar/paginację)
// ─────────────────────────────────────────────────────────────────────

/**
 * Kanoniczny URL sortKey → AuctionSortKey dla API (arch §7.3).
 */
export function sortKeyToUrlParams(key: BazaarSortKey): {
  sortBy: string;
  sortDir: "asc" | "desc";
} {
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
      // „Najnowsze" = świeżo WYSTAWIONE aukcje (data startu), nie ostatnio
      // zaktualizowane — zgłoszenie użytkownika: „mam aukcję, która
      // startowała 14.09" (scrapedAt pokazywał ostatnio odświeżane).
      return { sortBy: "auctionStart", sortDir: "desc" };
  }
}

function readSortKeyFromSearchParams(searchParams: URLSearchParams): BazaarSortKey {
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
  if (sortBy === "auctionStart" && sortDir === "desc") return "newest";
  if (sortBy === "scrapedAt" && sortDir === "desc") return "newest";
  return "ending";
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
  storeItems: [],
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
  worldsByRegion: Record<"EU" | "NA" | "BR" | "OCE", string[]>;
  /** Tryb domyślny widoku (serwer decyduje na podstawie UA). */
  defaultView: BazaarView;
  /**
   * Sugestie rozluźnienia filtrów (T45) — wyliczane **server-side**
   * przez `getSuggestionCounts()`. Puste gdy `total > 0` (arch §5:
   * "nie pokazuj sugestii gdy count > 0").
   */
  suggestions?: EmptyResultsSuggestion[];
}

/**
 * BazaarClient — używa `useBazaarFilters()` dla URL state filtrów
 * (T43). Renderuje `<ActiveFiltersBar>` (T43) + live indicator
 * (T44) wokół głównego grida.
 *
 * UWAGA: ten komponent używa `useSearchParams()`, więc **musi być
 * renderowany wewnątrz `<Suspense>`** (Next.js 15 App Router) —
 * parent (`page.tsx`) zapewnia to opakowanie.
 */
export function BazaarClient(props: BazaarClientProps) {
  return (
    <ToastProvider>
      <BazaarClientInner {...props} />
    </ToastProvider>
  );
}

function BazaarClientInner({
  auctions,
  total,
  totalPages,
  page,
  pageSize,
  facetCounts,
  worldsByRegion,
  defaultView,
  suggestions = [],
}: BazaarClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tList = useTranslations("Bazaar.list");
  const tFilters = useTranslations("Bazaar.filters");
  const tPag = useTranslations("Bazaar.pagination");

  // URL state — filtry (T43: useBazaarFilters).
  const { filters, setFilters, reset } = useBazaarFilters();

  // URL state — sortowanie (nie jest w useBazaarFilters, bo to nie filtr).
  const sortKey = React.useMemo(() => readSortKeyFromSearchParams(searchParams), [searchParams]);

  // Local state: widok (karty vs tabela) — localStorage jako persistence.
  const [view, setView] = React.useState<BazaarView>(defaultView);

  // Sheet (mobile) — otwarty gdy user kliknie FAB "Filtry".
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  // ── Patch URL (sort / page / pageSize) — `replace()` żeby nie zaśmiecać
  // historii (arch §5). Filtry idą przez `setFilters` z debounce.
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

  // ── Bridge: useBazaarFilters.setFilters resetuje `?page` do 1 przy
  // zmianie filtrów (analogicznie do starego handlera w BazaarClient).
  const handleFilterChange = React.useCallback(
    (next: typeof filters) => {
      setFilters(next);
      // Reset paginacji (bez debounce — natychmiastowy reset strony).
      replaceUrl({ page: 1 });
    },
    [setFilters, replaceUrl],
  );

  const handleReset = React.useCallback(() => {
    reset();
    replaceUrl({ page: 1 });
  }, [reset, replaceUrl]);

  /**
   * T45 — handler dla kliknięcia sugestii w `<EmptyResults>`.
   * Aplikuje patch (częściowy zestaw filtrów) do bieżącego stanu URL.
   *
   * Reguły:
   *   - Patch nakładany jest na OBECNY `filters` (NIE pusty obiekt),
   *     bo user mógł mieć kilka filtrów — chcemy tylko ROZLUŹNIĆ,
   *     nie resetować wszystko.
   *   - Klucze z `undefined`/`null`/`""` usuwają pole z URL (pusty
   *     stan → `useBazaarFilters` je pomija w `buildQueryString`).
   *   - Reset strony do 1 (tak jak `handleFilterChange`).
   *
   * Zwraca `void`; efektem jest nawigacja `router.replace()`.
   */
  const handleApplySuggestion = React.useCallback(
    (suggestion: EmptyResultsSuggestion) => {
      const next = { ...filters, ...suggestion.patch };
      // Klucze z `undefined`/`null` → wyczyść.
      for (const [key, value] of Object.entries(suggestion.patch)) {
        if (value === undefined || value === null || value === "") {
          delete (next as Record<string, unknown>)[key];
        }
      }
      // `useBazaarFilters.setFilters` debounce'uje write do URL (300 ms).
      setFilters(next);
      replaceUrl({ page: 1 });
    },
    [filters, setFilters, replaceUrl],
  );

  // ── Sidebar (desktop) + FAB trigger (mobile) ─────────────────────
  const sidebarContent = (
    <AuctionFiltersSidebar
      filters={filters}
      onFilterChange={handleFilterChange}
      onReset={handleReset}
      facetCounts={facetCounts ?? EMPTY_FACETS}
      worldsByRegion={worldsByRegion}
      className="border-0 bg-transparent p-0"
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Top bar (toolbar + live indicator) ────── */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <AuctionResultsToolbar
            total={total}
            sortKey={sortKey}
            onSortChange={handleSortChange}
            pageSize={pageSize}
            onPageSizeChange={handlePageSizeChange}
            view={view}
            onViewChange={setView}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BazaarLiveIndicator />
        </div>
      </div>

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

      {/* ── Active filters (sticky — T43) ─────────────────────────── */}
      <ActiveFiltersBar />

      {/* ── Layout: sidebar + content ─────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
        {/* Desktop sidebar — sticky z własnym scrollem: sidebar bywa wyższy
            niż viewport, więc bez `max-h` + `overflow-y-auto` dolne sekcje
            filtrów były nieosiągalne do czasu dojechania listy do końca. */}
        <aside className="hidden md:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain pr-1">
            {sidebarContent}
          </div>
        </aside>

        {/* Mobile sheet */}
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent side="left" className="w-full max-w-md overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>{tFilters("title")}</SheetTitle>
              <SheetDescription>
                {tFilters("openFiltersCount", {
                  count: countActiveFiltersLocal(filters),
                })}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6">{sidebarContent}</div>
          </SheetContent>
        </Sheet>

        {/* ── Content: list (cards / table) or empty state ──────── */}
        <div className="min-w-0 space-y-4">
          {total === 0 ? (
            <EmptyResults
              suggestions={suggestions}
              onApplySuggestion={handleApplySuggestion}
              onReset={handleReset}
            />
          ) : view === "cards" ? (
            <VirtualizedAuctionGrid auctions={auctions} />
          ) : (
            <AuctionTable rows={auctions} caption={tList("pageTitle")} />
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
                  onClick={() => replaceUrl({ page: Math.min(totalPages, page + 1) })}
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

function countActiveFiltersLocal(f: ReturnType<typeof useBazaarFilters>["filters"]): number {
  let count = 0;
  if (f.vocation) count++;
  if (f.skillType || f.skillMin !== undefined) count++;
  if (f.levelMin !== undefined || f.levelMax !== undefined) count++;
  if (f.bidMin !== undefined || f.bidMax !== undefined) count++;
  if (f.region) count++;
  if (f.world) count++;
  if (f.pvpType) count++;
  if (f.battleye) count++;
  if (f.hasSoulWar) count++;
  if (f.hasPrimalOrdeal) count++;
  if (f.hasWorldTransfer) count++;
  if (f.hasPreySlot) count++;
  if (f.hasCharmExpansion) count++;
  if (f.hasWeeklyTaskExp) count++;
  if (f.hasTwistOfFate) count++;
  if (f.imbuesFull) count++;
  if (f.mustHaveItemId !== undefined) count++;
  if (
    f.gemsMinLesser !== undefined ||
    f.gemsMinRegular !== undefined ||
    f.gemsMinGreater !== undefined
  )
    count++;
  if (
    f.storeMinOutfits !== undefined ||
    f.storeMinMounts !== undefined ||
    f.storeMinItems !== undefined
  )
    count++;
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
