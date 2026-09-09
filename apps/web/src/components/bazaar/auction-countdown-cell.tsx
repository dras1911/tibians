"use client";

/**
 * AuctionCountdownCell — kompaktowy countdown do tabeli (arch §5 krok 5).
 *
 * Różnice w stosunku do `<Countdown>` z `auction-card.tsx`:
 *   - Mniejszy padding, brak ikony (compact)
 *   - Wspólna funkcja tykania (extractable do utils), ale inline dla
 *     prostoty (komponent klientowy leaf)
 *
 * Zasady (arch §6.4 pkt 10):
 *   - `aria-live="off"` — SR nie czyta co sekundę
 *   - `tabular-nums` — zero jitter
 *   - `< 5 min` → `animate-pulse` + danger
 */

import * as React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export interface AuctionCountdownCellProps {
  endsAt: string;
  className?: string;
}

export function AuctionCountdownCell({
  endsAt,
  className,
}: AuctionCountdownCellProps) {
  const t = useTranslations("Bazaar.card");
  const endMs = React.useMemo(() => Date.parse(endsAt), [endsAt]);

  const computeRemaining = React.useCallback(
    (now: number) => Math.max(0, endMs - now),
    [endMs],
  );

  const [remainingMs, setRemainingMs] = React.useState<number>(() =>
    computeRemaining(Date.now()),
  );

  React.useEffect(() => {
    setRemainingMs(computeRemaining(Date.now()));
    const interval = setInterval(() => {
      setRemainingMs(computeRemaining(Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [computeRemaining]);

  const isEnded = remainingMs <= 0;
  const isUrgent = !isEnded && remainingMs < 5 * 60 * 1000;

  const formatted = React.useMemo(() => {
    if (isEnded) return t("ended");
    const totalSec = Math.floor(remainingMs / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0)
      return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }, [remainingMs, isEnded, t]);

  return (
    <span
      className={cn(
        "numeric inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums",
        isEnded
          ? "bg-muted text-muted-foreground"
          : isUrgent
            ? "bg-danger/15 text-danger animate-pulse"
            : "bg-warning/15 text-warning-foreground",
        className,
      )}
      aria-live="off"
      title={formatted}
    >
      {formatted}
    </span>
  );
}