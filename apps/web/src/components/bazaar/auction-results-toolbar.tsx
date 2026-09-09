"use client";

/**
 * AuctionResultsToolbar — pasek nad listą aukcji (plan T40).
 *
 * Zawiera (arch §5 krok 2):
 *   - Całkowita liczba wyników (z `useTranslations` plural forms — PL ma 3)
 *   - Sort dropdown (Ending Soon / Bid asc/desc / Level / Name / Newest)
 *   - PageSize select (25/50/100)
 *   - View toggle (Cards/Table) — reużywa `AuctionViewToggle`
 *
 * Zmiana sortowania / pageSize wysyła nowe parametry do URL przez
 * parent (handlery przekazane jako props). Komponent jest prezentacyjny
 * — zero local state dla sortowania (źródło prawdy = URL, plan T43).
 */

import * as React from "react";
import { ArrowDownAZ, ArrowUpDown, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { AuctionViewToggle, type BazaarView } from "./auction-view-toggle";

/**
 * Klucze sortowania wspierane przez API (arch §7.3 + AuctionOrderColumnSchema).
 * UI prezentuje je w czytelnej formie; mapowanie na URL `sortBy=…&sortDir=…`
 * jest w parent (`/bazaar/page.tsx`).
 */
export type BazaarSortKey =
  | "ending"
  | "endingDesc"
  | "bidAsc"
  | "bidDesc"
  | "levelAsc"
  | "levelDesc"
  | "nameAsc"
  | "nameDesc"
  | "newest";

export interface AuctionResultsToolbarProps {
  /** Łączna liczba aukcji (po filtrach). */
  total: number;
  /** Aktywny klucz sortowania. */
  sortKey: BazaarSortKey;
  /** Zmiana klucza → parent wywołuje `router.replace()`. */
  onSortChange: (next: BazaarSortKey) => void;
  /** Rozmiar strony (25/50/100). */
  pageSize: number;
  /** Zmiana rozmiaru strony. */
  onPageSizeChange: (next: number) => void;
  /** Aktualny widok (Cards / Table). */
  view: BazaarView;
  /** Zmiana widoku (parent aktualizuje localStorage + state). */
  onViewChange: (next: BazaarView) => void;
  className?: string;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function AuctionResultsToolbar({
  total,
  sortKey,
  onSortChange,
  pageSize,
  onPageSizeChange,
  view,
  onViewChange,
  className,
}: AuctionResultsToolbarProps) {
  const t = useTranslations("Bazaar");
  const tSort = useTranslations("Bazaar.sort");
  const tPage = useTranslations("Bazaar.pageSize");

  const sortLabel = (() => {
    switch (sortKey) {
      case "ending":
        return tSort("endingSoon");
      case "endingDesc":
        return tSort("endingSoonDesc");
      case "bidAsc":
        return tSort("bidAsc");
      case "bidDesc":
        return tSort("bidDesc");
      case "levelAsc":
        return tSort("levelAsc");
      case "levelDesc":
        return tSort("levelDesc");
      case "nameAsc":
        return tSort("nameAsc");
      case "nameDesc":
        return tSort("nameDesc");
      case "newest":
        return tSort("newest");
      default:
        return tSort("endingSoon");
    }
  })();

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 sm:gap-4",
        className,
      )}
    >
      {/* Total — lewa strona */}
      <div
        className="numeric flex items-center gap-2 font-mono text-sm font-semibold tabular-nums"
        aria-live="polite"
      >
        <span>{t("list.totalCount", { count: total })}</span>
      </div>

      {/* Prawa strona: sort + pageSize + view */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Sort dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1.5"
              aria-label={tSort("label")}
            >
              <ArrowDownAZ className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{tSort("label")}:</span>
              <span className="font-semibold">{sortLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{tSort("label")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sortKey}
              onValueChange={(value) => onSortChange(value as BazaarSortKey)}
            >
              <DropdownMenuRadioItem value="ending">
                {tSort("endingSoon")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="endingDesc">
                {tSort("endingSoonDesc")}
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              <DropdownMenuRadioItem value="bidAsc">
                {tSort("bidAsc")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="bidDesc">
                {tSort("bidDesc")}
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              <DropdownMenuRadioItem value="levelAsc">
                {tSort("levelAsc")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="levelDesc">
                {tSort("levelDesc")}
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              <DropdownMenuRadioItem value="nameAsc">
                {tSort("nameAsc")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="nameDesc">
                {tSort("nameDesc")}
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              <DropdownMenuRadioItem value="newest">
                {tSort("newest")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Page size select */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1.5"
              aria-label={tPage("label")}
            >
              <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{tPage("label")}:</span>
              <span className="font-semibold">{pageSize}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel>{tPage("label")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number.parseInt(value, 10))}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <DropdownMenuRadioItem key={size} value={String(size)}>
                  {tPage("option", { count: size })}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* View toggle (Cards / Table) */}
        <AuctionViewToggle value={view} onValueChange={onViewChange} />
      </div>
    </div>
  );
}

// (typ `BazaarSortKey` już wyeksportowany powyżej przez `export type`).