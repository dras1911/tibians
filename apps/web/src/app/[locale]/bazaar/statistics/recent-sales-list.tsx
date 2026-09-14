/**
 * RecentSalesList — lista 10 ostatnich sprzedanych aukcji (plan task 58,
 * arch §5 "Recent sales").
 *
 * Wyświetla pojedynczy wiersz per aukcja:
 *   - outfit (placeholder, bo auctions nie zarchiwizowane outfitów)
 *   - postać + level + vocation
 *   - świat + region
 *   - finalPrice (TC)
 *   - data zakończenia (relatywna + absolutna)
 *   - link do detailu aukcji
 *
 * Dane są wstępnie przetworzone po stronie serwera (parent
 * `statistics/page.tsx`), ten komponent jest prezentacyjny.
 *
 * Zasady UI (arch §6):
 *   - `tabular-nums` na liczbach (no jitter, spójność)
 *   - Touch targets ≥ 44 px (`h-11`)
 *   - Touch-friendly hover/focus states (arch §6.4)
 *   - i18n PL + EN (`useTranslations("Bazaar.statistics")`)
 */

import * as React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ExternalLink, Gavel } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// Typy
// ─────────────────────────────────────────────────────────────────────

export interface RecentSaleSummary {
  auctionId: string;
  characterName: string;
  level: number;
  vocation: string;
  worldName: string;
  finalPrice: number | null;
  auctionEnd: string; // ISO
}

export interface RecentSalesListProps {
  sales: readonly RecentSaleSummary[];
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Relatywny czas w przeszłości ("3 godz. temu", "5 dni temu").
 * Lokalizowany przez `Intl.RelativeTimeFormat` (next-intl `useFormatter`
 * używa tego samego API pod spodem).
 */
function relativeTime(
  target: Date,
  now: Date,
  format: ReturnType<typeof useFormatter>,
): string {
  const diffSec = Math.round((target.getTime() - now.getTime()) / 1000);
  const absSec = Math.abs(diffSec);
  if (absSec < 60) return format.relativeTime(diffSec, { unit: "second" });
  if (absSec < 3600)
    return format.relativeTime(Math.round(diffSec / 60), { unit: "minute" });
  if (absSec < 86400)
    return format.relativeTime(Math.round(diffSec / 3600), { unit: "hour" });
  if (absSec < 86400 * 30)
    return format.relativeTime(Math.round(diffSec / 86400), { unit: "day" });
  return format.relativeTime(Math.round(diffSec / (86400 * 30)), {
    unit: "month",
  });
}

// ─────────────────────────────────────────────────────────────────────
// RecentSalesList
// ─────────────────────────────────────────────────────────────────────

export function RecentSalesList({ sales, className }: RecentSalesListProps) {
  const t = useTranslations("Bazaar.statistics.recentSales");

  if (sales.length === 0) {
    return (
      <Card className={cn("border-dashed", className)}>
        <CardContent className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            {t("emptyTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("emptyDescription")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <ul className="divide-y divide-border">
        {sales.map((sale) => (
          <li
            key={sale.auctionId}
            className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-4"
          >
            {/* ── Postać + level + vocation ─────────────────────── */}
            <div className="min-w-0">
              <Link
                href={`/bazaar/${sale.auctionId}`}
                className="block truncate rounded-sm text-sm font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {sale.characterName}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <Badge variant="outline" className="font-mono tabular-nums">
                  lvl <span className="font-semibold">{sale.level}</span>
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {sale.vocation}
                </Badge>
              </div>
            </div>

            {/* ── Świat ─────────────────────────────────────────── */}
            <div className="hidden text-sm text-muted-foreground sm:block">
              <span className="truncate">{sale.worldName}</span>
            </div>

            {/* ── Data zakończenia ───────────────────────────────── */}
            <div className="hidden text-xs text-muted-foreground sm:block">
              <SaleDate sale={sale} />
            </div>

            {/* ── Final price + CTA ──────────────────────────────── */}
            <div className="flex items-center justify-end gap-2">
              <SalePrice sale={sale} />
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-11 w-11 p-0"
                aria-label={t("openAuction")}
              >
                <Link href={`/bazaar/${sale.auctionId}`}>
                  <Gavel className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden h-11 w-11 p-0 sm:inline-flex"
                aria-label={t("openExternal")}
              >
                <a
                  href={`https://www.tibia.com/charactertrade/?auctionid=${sale.auctionId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SaleDate — relatywny + absolutny czas zakończenia
// ─────────────────────────────────────────────────────────────────────

function SaleDate({ sale }: { sale: RecentSaleSummary }) {
  const t = useTranslations("Bazaar.statistics.recentSales");
  const format = useFormatter();
  const date = React.useMemo(() => new Date(sale.auctionEnd), [sale.auctionEnd]);
  const [now, setNow] = React.useState<Date | null>(null);

  // Hydrate "now" po mount, żeby uniknąć SSR/CSR rozbieżności
  // (server renderuje 1 timestamp, klient inny — react hydration mismatch).
  React.useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const relative = now !== null ? relativeTime(date, now, format) : null;
  const absolute = format.dateTime(date, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <span
      className="numeric font-mono tabular-nums"
      title={absolute}
      aria-label={`${t("endedAt")} ${absolute}`}
    >
      {relative ?? absolute}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SalePrice — final price + fallback
// ─────────────────────────────────────────────────────────────────────

function SalePrice({ sale }: { sale: RecentSaleSummary }) {
  const format = useFormatter();
  if (sale.finalPrice === null) {
    return (
      <span className="numeric font-mono text-sm text-muted-foreground">
        —
      </span>
    );
  }
  return (
    <span className="numeric whitespace-nowrap font-mono text-base font-semibold tabular-nums text-foreground">
      {format.number(sale.finalPrice, { useGrouping: true })}
      <span className="ml-1 text-xs font-medium text-muted-foreground">
        TC
      </span>
    </span>
  );
}