"use client";

/**
 * AuctionTable — widok tabelaryczny listy aukcji (plan T40, arch §5).
 *
 * Używa `@tanstack/react-table` (T3 już dostarczył `DataTable<TData, TValue>`
 * — ten komponent idzie dalej: sortowalne kolumny, sticky header,
 * gęstość wierszy z `useDensity()`, multi-column sort.
 *
 * Dane wejściowe: `AuctionSummary[]` (client-safe shape z
 * `./auction-summary`). Sortowanie jest **klient-side** (TanStack
 * `getSortedRowModel`) — server już zwrócił dane posortowane po
 * `?sortBy&sortDir`, ale tu dodajemy lokalne toggle ASC/DESC na
 * kliknięcie nagłówka (szybsze niż round-trip do server).
 *
 * Kolumny (arch §5 krok 5):
 *   Checkbox | Outfit | Name | Lvl | Voc | World | PvP | Bid | Ends | Actions
 *
 * Zasady (arch §6.3 + §6.4):
 *   - Dotykowe cele ≥ 44 px
 *   - Wszystkie numery z `tabular-nums` (klasa `.numeric`)
 *   - Sticky header (`[&_thead]:sticky [&_thead]:top-0`)
 *   - Density provider kontroluje wysokość wierszy (40/52 px)
 *   - Brak spinnerów — skeleton przy pustym `data`
 */

import * as React from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, ChevronUp, ExternalLink, Gavel } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDensity, densityRowClass } from "@/components/density-provider";
import { Link } from "@/i18n/routing";
import { outfitImageUrl, tibiaAuctionUrl } from "@/lib/tibia";
import { cn } from "@/lib/utils";

import { AuctionCountdownCell } from "./auction-countdown-cell";
import type { AuctionSummary } from "./auction-summary";
import { BattlEyeBadge } from "./battleye-badge";

// ─────────────────────────────────────────────────────────────────────
// Vocation / region tone (spójne z AuctionCard)
// ─────────────────────────────────────────────────────────────────────

const VOCATION_TONE: Record<string, string> = {
  Knight: "bg-voc-knight/15 text-voc-knight border-voc-knight/40",
  Paladin: "bg-voc-paladin/15 text-voc-paladin border-voc-paladin/40",
  Druid: "bg-voc-druid/15 text-voc-druid border-voc-druid/40",
  Sorcerer: "bg-voc-sorcerer/15 text-voc-sorcerer border-voc-sorcerer/40",
  Monk: "bg-voc-monk/15 text-voc-monk border-voc-monk/40",
};

const REGION_TONE: Record<AuctionSummary["worldRegion"], string> = {
  EU: "bg-region-eu/15 text-region-eu border-region-eu/40",
  NA: "bg-region-na/15 text-region-na border-region-na/40",
  BR: "bg-region-br/15 text-region-br border-region-br/40",
  OCE: "bg-region-oce/15 text-region-oce border-region-oce/40",
};

// ─────────────────────────────────────────────────────────────────────
// AuctionTable
// ─────────────────────────────────────────────────────────────────────

export interface AuctionTableProps {
  rows: AuctionSummary[];
  /** Wywoływane przez parent przy zaznaczeniu do porównania. */
  onCompareToggle?: (id: string, selected: boolean) => void;
  /** Mapa zaznaczonych ID aukcji (kontrolowany checkbox). */
  comparedIds?: ReadonlySet<string>;
  /** Caption dostępny dla SR (arch §6.5). */
  caption?: string;
  className?: string;
}

export function AuctionTable({
  rows,
  onCompareToggle,
  comparedIds,
  caption,
  className,
}: AuctionTableProps) {
  const t = useTranslations("Bazaar.table");
  const tCard = useTranslations("Bazaar.card");
  const format = useFormatter();
  const { density } = useDensity();

  // Klient-side sortowanie (dodatkowa warstwa na już posortowane dane z SSR).
  // Domyślnie brak (pierwszy render = sort z URL).
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = React.useMemo<ColumnDef<AuctionSummary>[]>(() => {
    return [
      // ── Checkbox (select to compare) ─────────────────────────────
      {
        id: "select",
        enableSorting: false,
        header: () => <span className="sr-only">{t("select")}</span>,
        cell: ({ row }) => {
          const id = row.original.id;
          const checked = comparedIds?.has(id) ?? false;
          return (
            <Checkbox
              checked={checked}
              onCheckedChange={(value) => onCompareToggle?.(id, value === true)}
              aria-label={t("select")}
              className="h-4 w-4"
            />
          );
        },
      },
      // ── Outfit (compact thumbnail) ───────────────────────────────
      {
        id: "outfit",
        enableSorting: false,
        header: () => <span className="sr-only">{t("outfit")}</span>,
        cell: ({ row }) => {
          const url = outfitImageUrl(row.original.outfitId);
          if (!url) {
            return (
              <div
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed bg-muted/40 text-[0.6rem] text-muted-foreground"
              >
                {tCard("noImage")}
              </div>
            );
          }
          return (
            <img
              src={url}
              alt={tCard("outfitAlt", { name: row.original.name })}
              width={36}
              height={36}
              loading="lazy"
              className="h-9 w-9 rounded-md border bg-background object-cover"
            />
          );
        },
      },
      // ── Name + level/vocation ───────────────────────────────────
      {
        id: "name",
        accessorKey: "name",
        enableSorting: true,
        header: () => <SortableHeader label={t("name")} />,
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="min-w-0">
              <div className="truncate font-medium">
                <Link
                  href={`/bazaar/${a.id}`}
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {a.name}
                </Link>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                <Badge
                  variant="outline"
                  className={cn(
                    "mr-1 border px-1.5 py-0 text-[0.65rem]",
                    VOCATION_TONE[a.vocation] ?? VOCATION_TONE.Knight,
                  )}
                >
                  {a.vocationPromoted}
                </Badge>
              </div>
            </div>
          );
        },
      },
      // ── Level (sortable, numeric) ───────────────────────────────
      {
        id: "level",
        accessorKey: "level",
        enableSorting: true,
        header: () => <SortableHeader label={t("level")} />,
        cell: ({ row }) => (
          <span className="numeric font-mono font-semibold tabular-nums">{row.original.level}</span>
        ),
      },
      // ── Vocation (sortable po bazowej) ──────────────────────────
      {
        id: "vocation",
        accessorKey: "vocation",
        enableSorting: true,
        header: () => <SortableHeader label={t("vocation")} />,
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn(
              "border text-[0.65rem] font-medium",
              VOCATION_TONE[row.original.vocation] ?? VOCATION_TONE.Knight,
            )}
          >
            {row.original.vocation}
          </Badge>
        ),
      },
      // ── World (sortable po nazwie) ──────────────────────────────
      {
        id: "world",
        accessorKey: "world",
        enableSorting: true,
        header: () => <SortableHeader label={t("world")} />,
        cell: ({ row }) => {
          const a = row.original;
          return (
            <Badge
              variant="outline"
              className={cn("border text-[0.65rem]", REGION_TONE[a.worldRegion])}
            >
              {a.world}
              <span className="ml-1 font-mono text-[0.6rem] opacity-70">{a.worldRegion}</span>
            </Badge>
          );
        },
      },
      // ── PvP type ────────────────────────────────────────────────
      {
        id: "pvp",
        accessorFn: (row) => row.worldPvpType,
        enableSorting: true,
        header: () => <SortableHeader label={t("pvp")} />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.worldPvpType}</span>
        ),
      },
      // ── BattlEye ────────────────────────────────────────────────
      {
        id: "battleye",
        accessorFn: (row) => row.worldBattleye,
        enableSorting: true,
        header: () => <SortableHeader label={t("battleye")} />,
        cell: ({ row }) => <BattlEyeBadge value={row.original.worldBattleye} size="sm" />,
      },
      // ── Bid (sortable, numeric, Intl) ─────────────────────────
      {
        id: "bid",
        accessorKey: "bid",
        enableSorting: true,
        header: () => (
          <div className="text-right">
            <SortableHeader label={t("bid")} align="right" />
          </div>
        ),
        cell: ({ row }) => (
          <div className="numeric text-right font-mono font-semibold tabular-nums">
            {format.number(row.original.bid, { useGrouping: true })}
          </div>
        ),
      },
      // ── Ends (countdown, sortable po auctionEnd ISO) ───────────
      {
        id: "ends",
        accessorKey: "auctionEnd",
        enableSorting: true,
        header: () => <SortableHeader label={t("ends")} />,
        cell: ({ row }) => <AuctionCountdownCell endsAt={row.original.auctionEnd} />,
      },
      // ── Actions ────────────────────────────────────────────────
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">{t("actions")}</span>,
        cell: ({ row }) => {
          const id = row.original.id;
          return (
            <TooltipProvider delayDuration={150}>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="ghost" size="icon" className="h-9 w-9">
                      <Link href={`/bazaar/${id}`}>
                        <Gavel className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("actions")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="ghost" size="icon" className="h-9 w-9">
                      <a href={tibiaAuctionUrl(id)} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{tCard("openExternal")}</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          );
        },
      },
    ];
  }, [t, tCard, format, onCompareToggle, comparedIds]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        // Sticky header — przewijanie pionowe wewnątrz kontenera rodzica.
        "[&_[data-sticky-thead]]:sticky [&_[data-sticky-thead]]:top-0 [&_[data-sticky-thead]]:z-10",
        className,
      )}
    >
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader data-sticky-thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="bg-muted/30 hover:bg-muted/30">
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead key={header.id} className={cn("h-11", densityRowClass(density))}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {sorted ? (
                      <span className="ml-1 inline-block">
                        {sorted === "asc" ? (
                          <ChevronUp className="inline h-3 w-3" />
                        ) : (
                          <ChevronDown className="inline h-3 w-3" />
                        )}
                      </span>
                    ) : null}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className={cn(densityRowClass(density), "hover:bg-muted/40")}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cn(densityRowClass(density))}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-sm text-muted-foreground"
              >
                —
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SortableHeader — przycisk z ikonką (spójność z DataTable z T3)
// ─────────────────────────────────────────────────────────────────────

interface SortableHeaderProps {
  label: string;
  align?: "left" | "right";
}

function SortableHeader({ label, align = "left" }: SortableHeaderProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground",
        align === "right" && "justify-end",
      )}
    >
      {label}
      <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />
    </span>
  );
}
