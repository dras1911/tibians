import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * LoadingState (T66, arch §6.4 pkt 9 — skeleton zamiast spinnera).
 *
 * Każdy wariant naśladuje finalny layout, więc brak przesunięć przy
 * hydratacji (CLS = 0). `role="status"` + `aria-busy` dla czytników ekranu.
 */
export type LoadingVariant = "card" | "table" | "detail" | "list";

export interface LoadingStateProps {
  variant?: LoadingVariant;
  count?: number;
  className?: string;
}

function CardSkeleton(): React.ReactElement {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    </div>
  );
}

function TableRowSkeleton(): React.ReactElement {
  return (
    <div className="flex items-center gap-4 border-b border-border-subtle px-4 py-3">
      <Skeleton className="h-8 w-8 rounded-full" />
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="ml-auto h-4 w-24" />
    </div>
  );
}

function ListItemSkeleton(): React.ReactElement {
  return (
    <div className="flex items-center gap-3 py-2">
      <Skeleton className="h-10 w-10 rounded-md" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-1/5" />
      </div>
    </div>
  );
}

function DetailSkeleton(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-24 w-24 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function LoadingState({
  variant = "card",
  count = 6,
  className,
}: LoadingStateProps): React.ReactElement {
  const items = Array.from({ length: count });

  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("w-full", className)}
    >
      <span className="sr-only">Ładowanie…</span>

      {variant === "card" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : null}

      {variant === "table" ? (
        <div className="overflow-hidden rounded-lg border border-border-subtle">
          {items.map((_, i) => (
            <TableRowSkeleton key={i} />
          ))}
        </div>
      ) : null}

      {variant === "list" ? (
        <div className="divide-y divide-border-subtle">
          {items.map((_, i) => (
            <ListItemSkeleton key={i} />
          ))}
        </div>
      ) : null}

      {variant === "detail" ? <DetailSkeleton /> : null}
    </div>
  );
}
