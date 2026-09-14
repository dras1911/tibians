"use client";

/**
 * EndingSoonClient — klient live view dla `/bazaar/ending-soon`
 * (plan task 56, arch §5 krok 1 + §8.5).
 *
 * ## Funkcjonalność (plan task 56)
 *
 * 1. **SSE + polling fallback** przez `useAuctionLive()` (T55, arch §8.5).
 * 2. **Sort `auction_end ASC`** — najbliżej końca na górze (pilność! arch §5).
 * 3. **Live indicator badge** — LIVE / POLLING / OFFLINE.
 * 4. **LivePriceFlash** na każdej karcie (AuctionCard `showLiveFlash`).
 * 5. **Auto-remove** zakończonych aukcji: countdown → 0 → 5s grace →
 *    fade-out animacja (600ms) → usunięcie z DOM.
 * 6. **Empty state** z CTA do `/bazaar` (gdy brak aukcji < 1h).
 * 7. **i18n PL + EN** — `useTranslations("Bazaar.endingSoon")`.
 * 8. **`tabular-nums`** wszędzie (arch §6.2).
 *
 * ## MUST NOT
 *
 * - **NIE** duplikuj AuctionCard (reuse z T40)
 * - **NIE** hardcoded PL/EN
 * - **NIE** `as any` / `@ts-ignore`
 */

import * as React from "react";
import { Clock, Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuctionCard } from "@/components/bazaar/auction-card";
import type { AuctionSummary } from "@/components/bazaar/auction-summary";
import {
  useAuctionLive,
  type AuctionLiveStatus,
  type EndingAuction,
} from "@/lib/hooks/use-auction-live";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function sortByEndingAsc(list: AuctionSummary[]): AuctionSummary[] {
  return [...list].sort((a, b) => a.auctionEnd.localeCompare(b.auctionEnd));
}

/**
 * Merge T55 SSE `EndingAuction` → `AuctionSummary` (T56).
 *
 * T55 hook zwraca `EndingAuction[]` (lekki payload). Nasza strona
 * potrzebuje `AuctionSummary[]` (pełne dane SSR) do renderowania
 * `<AuctionCard>`. Hook NIE ma wbudowanego merge → wykonujemy lokalnie
 * na bazie `initialAuctions` (pełne dane SSR).
 */
function mergeLiveIntoBase(
  base: AuctionSummary[],
  live: EndingAuction[],
): AuctionSummary[] {
  if (live.length === 0) return base;

  const liveById = new Map<string, EndingAuction>();
  for (const a of live) {
    liveById.set(a.auctionId, a);
  }

  return base.map((item) => {
    const update = liveById.get(item.id);
    if (update === undefined) return item;
    return {
      ...item,
      bid: update.bid,
      bidType: update.bidType,
      auctionEnd: update.auctionEnd,
      auctionStart: update.auctionStart,
      status: update.status,
      finalPrice: update.finalPrice,
      estimatedValue: update.estimatedValue,
      hasSoulWar: update.hasSoulWar,
      hasPrimalOrdeal: update.hasPrimalOrdeal,
      hasWorldTransfer: update.hasWorldTransfer,
    };
  });
}

// ───────────────────────────────────────────────────────────────────────
// Auto-remove hook (countdown → 0 → 5s grace → fade-out → remove)
// ───────────────────────────────────────────────────────────────────────

function useAutoRemove(auctions: AuctionSummary[]): {
  fadingIds: Set<string>;
  hiddenIds: Set<string>;
} {
  const [fadingIds, setFadingIds] = React.useState<Set<string>>(() => new Set());
  const [hiddenIds, setHiddenIds] = React.useState<Set<string>>(() => new Set());
  const [now, setNow] = React.useState<number>(() => Date.now());
  const timersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    for (const a of auctions) {
      const endMs = Date.parse(a.auctionEnd);
      if (
        Number.isFinite(endMs) &&
        endMs <= now &&
        !timersRef.current.has(a.id) &&
        !hiddenIds.has(a.id)
      ) {
        const id = a.id;
        const t = setTimeout(() => {
          setFadingIds((prev) => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            return next;
          });
          const removeT = setTimeout(() => {
            setHiddenIds((prev) => {
              if (prev.has(id)) return prev;
              const next = new Set(prev);
              next.add(id);
              return next;
            });
            timersRef.current.delete(id);
            timersRef.current.delete(`__remove_${id}`);
          }, 600);
          timersRef.current.set(`__remove_${id}`, removeT);
        }, 5000);
        timersRef.current.set(id, t);
      }
    }
  }, [now, auctions, hiddenIds]);

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) {
        clearTimeout(t);
      }
      timers.clear();
    };
  }, []);

  return { fadingIds, hiddenIds };
}

// ───────────────────────────────────────────────────────────────────────
// LiveIndicator — badge LIVE/POLLING/OFFLINE
// ───────────────────────────────────────────────────────────────────────

interface LiveIndicatorProps {
  status: AuctionLiveStatus;
  liveLabel: string;
  pollingLabel: string;
  offlineLabel: string;
}

function LiveIndicator({
  status,
  liveLabel,
  pollingLabel,
  offlineLabel,
}: LiveIndicatorProps) {
  const isLive = status === "live";
  const isError = status === "error";
  const label = isLive
    ? liveLabel
    : isError
      ? offlineLabel
      : pollingLabel;

  const dataStatus: "live" | "polling" | "offline" = isLive
    ? "live"
    : isError
      ? "offline"
      : "polling";

  const variantClass =
    dataStatus === "live"
      ? "border-success/40 bg-success/15 text-success"
      : dataStatus === "polling"
        ? "border-warning/40 bg-warning/15 text-warning-foreground"
        : "border-danger/40 bg-danger/15 text-danger";

  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 border font-mono text-xs uppercase tabular-nums",
        variantClass,
      )}
      aria-live="polite"
      data-status={dataStatus}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
          dataStatus === "live"
            ? "bg-success animate-pulse"
            : dataStatus === "polling"
              ? "bg-warning"
              : "bg-danger",
        )}
      />
      {label}
    </Badge>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Komponent
// ───────────────────────────────────────────────────────────────────────

export interface EndingSoonClientProps {
  /** SSR snapshot z `listEndingSoon(1)` (T38) — pełne AuctionSummary[]. */
  initialAuctions: AuctionSummary[];
}

export function EndingSoonClient({ initialAuctions }: EndingSoonClientProps) {
  const t = useTranslations("Bazaar.endingSoon");
  const format = useFormatter();

  // T55 hook — zwraca `EndingAuction[]` (lekki payload SSE).
  const { auctions: liveLight, status, lastUpdate } = useAuctionLive();

  // Merge SSE payload → SSR snapshot (pełne AuctionSummary).
  const mergedAuctions = React.useMemo(
    () => mergeLiveIntoBase(initialAuctions, liveLight),
    [initialAuctions, liveLight],
  );

  // Defensive sort po `auction_end ASC` (plan task 56 — pilność).
  const sortedAuctions = React.useMemo(
    () => sortByEndingAsc(mergedAuctions),
    [mergedAuctions],
  );

  // Auto-remove dla aukcji zakończonych.
  const { fadingIds, hiddenIds } = useAutoRemove(sortedAuctions);

  // Filtrowana lista do wyświetlenia.
  const visibleAuctions = React.useMemo(
    () => sortedAuctions.filter((a) => !hiddenIds.has(a.id)),
    [sortedAuctions, hiddenIds],
  );

  return (
    <div className="mt-6">
      <header className="mb-6 max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <Clock className="h-6 w-6 text-primary" aria-hidden="true" />
          {t("headerTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {t("pageDescription")}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="numeric text-sm font-medium tabular-nums text-muted-foreground">
            {t("auctionsCount", { count: visibleAuctions.length })}
          </p>
          <LiveIndicator
            status={status}
            liveLabel={t("liveBadge")}
            pollingLabel={t("pollingBadge")}
            offlineLabel={t("offlineBadge")}
          />
          {visibleAuctions.length > 0 && lastUpdate !== null ? (
            <p className="text-xs text-muted-foreground/80">
              {t("lastUpdate", {
                time: format.dateTime(lastUpdate, {
                  timeStyle: "medium",
                }),
              })}
            </p>
          ) : null}
        </div>
      </header>

      {visibleAuctions.length === 0 ? (
        <EmptyEndingSoon
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          cta={t("emptyCta")}
        />
      ) : (
        <ul
          className={cn(
            "grid gap-4",
            "grid-cols-1",
            "sm:grid-cols-2",
            "lg:grid-cols-3",
            "xl:grid-cols-4",
          )}
          aria-label={t("headerTitle")}
        >
          {visibleAuctions.map((auction) => {
            const isFading = fadingIds.has(auction.id);
            return (
              <li
                key={auction.id}
                className={cn(
                  "min-w-0",
                  isFading && "animate-bazaar-fade-out pointer-events-none",
                )}
                aria-hidden={isFading || undefined}
              >
                <AuctionCard auction={auction} showLiveFlash />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// EmptyEndingSoon — pusty stan z CTA do /bazaar
// ───────────────────────────────────────────────────────────────────────

interface EmptyEndingSoonProps {
  title: string;
  description: string;
  cta: string;
}

function EmptyEndingSoon({ title, description, cta }: EmptyEndingSoonProps) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
      <Clock
        className="mx-auto h-10 w-10 text-muted-foreground/70"
        aria-hidden="true"
      />
      <p className="mt-3 text-base font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <Button asChild className="mt-5">
        <Link href="/bazaar">
          <Search className="h-4 w-4" aria-hidden="true" />
          {cta}
        </Link>
      </Button>
    </div>
  );
}
