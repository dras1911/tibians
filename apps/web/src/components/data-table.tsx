"use client";

import * as React from "react";
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDensity, densityRowClass } from "@/components/density-provider";
import { cn } from "@/lib/utils";

/**
 * DataTable — TanStack Table v8 wrapper. Ready to be reused by the
 * Bazaar list (tasks 39-47), auction detail, calculator history, etc.
 *
 * Features:
 *   - Token-driven styling (`bg-card`, `text-muted-foreground`, …)
 *   - Density-aware row height via useDensity() (compact 40 px / comfortable 52 px)
 *   - Sticky header (driven by parent container's `overflow-auto`)
 *   - Built-in skeleton empty state (architecture §6.4: skeleton, not spinner)
 *   - Native sort indicators + clickable column headers
 *
 * For >100 rows use `@tanstack/react-virtual` outside of this component
 * (T3 keeps the wrapper dependency-free; T39 adds virtualization).
 */
export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Rendered when the table is empty. Defaults to skeleton placeholder. */
  emptyState?: React.ReactNode;
  /** Override default caption (screen-reader text above the table). */
  caption?: string;
  className?: string;
  /** Optional row click handler — applied to every row. */
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  emptyState,
  caption,
  className,
  onRowClick,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const { density } = useDensity();

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Table className={className}>
      {caption ? (
        <caption className="sr-only">{caption}</caption>
      ) : null}
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              return (
                <TableHead key={header.id} className={densityRowClass(density)}>
                  {header.isPlaceholder ? null : canSort ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={header.column.getToggleSortingHandler()}
                      className="-ml-3 h-10 px-2 font-medium text-muted-foreground"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {sorted === "asc" ? (
                        <ChevronUp className="ml-1 h-3.5 w-3.5" />
                      ) : sorted === "desc" ? (
                        <ChevronDown className="ml-1 h-3.5 w-3.5" />
                      ) : (
                        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />
                      )}
                    </Button>
                  ) : (
                    flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && "selected"}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={cn(
                densityRowClass(density),
                onRowClick && "cursor-pointer",
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className={cn("h-24 text-center", densityRowClass(density))}
            >
              {emptyState ?? (
                <div
                  className="space-y-2"
                  aria-label="Loading rows"
                  role="status"
                >
                  <Skeleton className="mx-auto h-3 w-2/3" />
                  <Skeleton className="mx-auto h-3 w-1/2" />
                  <span className="sr-only">Loading…</span>
                </div>
              )}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}