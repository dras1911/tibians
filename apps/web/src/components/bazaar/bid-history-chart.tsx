"use client";

/**
 * BidHistoryChart — line chart historii bidów (plan task 48, arch §5 krok 7).
 *
 * Wykres pokazuje jak zmieniała się oferta aukcji w czasie. Dane z
 * `auction_price_history` (T38). Jeśli jest tylko jeden punkt —
 * wyświetlamy kafelek "Pojedynczy odczyt" zamiast pustego wykresu
 * (UX: nie pokazujemy fałszywej osi czasu).
 *
 * Biblioteka: Recharts 2.15 (już w package.json). Zero zależności
 * runtime poza `recharts` (peer dep).
 *
 * A11y:
 *   - `<figure>` + `<figcaption>` dla kontekstu (screen readers).
 *   - `aria-label` na wykresie (Recharts dostarcza wewnętrznie).
 *   - Touch targets w tooltip ≥ 44×44 (mobile, arch §6.3).
 */

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormatter, useTranslations } from "next-intl";

import { TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { AuctionPriceHistoryPointDto } from "@/lib/server/auction-detail";

export interface BidHistoryChartProps {
  /** Punkty czasowe z `auction_price_history` (posortowane ASC). */
  points: readonly AuctionPriceHistoryPointDto[];
  className?: string;
}

/**
 * Punkt do wykresu — Recharts wymaga string/number w osiach.
 */
interface ChartPoint {
  /** Czas w ms (epoch) — używany w `<XAxis dataKey="ts">`. */
  ts: number;
  /** Oferta w TC. */
  bid: number;
}

const SINGLE_POINT_THRESHOLD = 1;

export function BidHistoryChart({
  points,
  className,
}: BidHistoryChartProps) {
  const t = useTranslations("Bazaar.detail.chart");
  const format = useFormatter();

  const data = React.useMemo<ChartPoint[]>(
    () =>
      points.map((p) => ({
        ts: Date.parse(p.recordedAt),
        bid: p.bid,
      })),
    [points],
  );

  // ── Empty state — brak danych ────────────────────────────────────
  if (data.length === 0) {
    return (
      <Card className={cn("border-dashed", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex flex-col items-center gap-2 rounded-md border border-dashed bg-muted/30 px-4 py-10 text-center"
            role="status"
          >
            <p className="text-sm font-medium text-foreground">
              {t("emptyTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("emptyDescription")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Single point state — wyświetlamy kafelek bez wykresu ────────
  if (data.length <= SINGLE_POINT_THRESHOLD) {
    const only = data[0];
    if (only === undefined) return null;
    return (
      <Card className={cn("border-dashed", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">
              {t("singlePointTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("singlePointDescription")}
            </p>
            <p className="numeric font-mono text-3xl font-bold tabular-nums text-foreground">
              {format.number(only.bid, { useGrouping: true })}
              <span className="ml-1 text-xs font-medium text-muted-foreground">
                TC
              </span>
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Multi-point — renderujemy wykres ──────────────────────────────
  // Zakres Y z 10% paddingiem (góra/dół) — lepsze proporcje wizualne.
  const bids = data.map((p) => p.bid);
  const minBid = Math.min(...bids);
  const maxBid = Math.max(...bids);
  const padding = Math.max(1, Math.round((maxBid - minBid) * 0.1));
  const yMin = Math.max(0, minBid - padding);
  const yMax = maxBid + padding;

  const minTs = data[0]?.ts ?? 0;
  const maxTs = data[data.length - 1]?.ts ?? 0;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
      </CardHeader>
      <CardContent>
        <figure className="overflow-hidden rounded-md border bg-background/50 p-2">
          <figcaption className="sr-only">
            {t("title")} — {data.length} {t("xAxisLabel")}
          </figcaption>
          <div
            aria-hidden={false}
            role="img"
            aria-label={`${t("title")} (${data.length} ${t("xAxisLabel")})`}
            className="h-56 w-full sm:h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={[minTs, maxTs]}
                  scale="time"
                  tickFormatter={(value: number) => {
                    const date = new Date(value);
                    return format.dateTime(date, {
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "short",
                      day: "2-digit",
                    });
                  }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tickFormatter={(value: number) =>
                    format.number(value, { useGrouping: true })
                  }
                  stroke="currentColor"
                  className="text-muted-foreground tabular-nums"
                  tick={{ fontSize: 11 }}
                  width={70}
                />
                <Tooltip
                  cursor={{ stroke: "currentColor", opacity: 0.3 }}
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(value: number) => {
                    const date = new Date(value);
                    return t("tooltipTime", {
                      time: format.dateTime(date, {
                        dateStyle: "short",
                        timeStyle: "short",
                      }),
                    });
                  }}
                  formatter={(value: number) => [
                    t("tooltipBid", {
                      bid: format.number(value, { useGrouping: true }),
                    }),
                    "",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="bid"
                  stroke="oklch(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "oklch(var(--primary))" }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </CardContent>
    </Card>
  );
}
