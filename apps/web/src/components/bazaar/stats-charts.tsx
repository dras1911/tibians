"use client";

/**
 * StatsCharts — wykresy Recharts dla `/bazaar/statistics` (plan task 58,
 * arch §5 "Statystyki rynkowe z wykresami Recharts").
 *
 * Wymóg SSR (arch §8.2): Recharts to biblioteka client-only (używa
 * wewnętrznie `ResponsiveContainer` + `requestAnimationFrame`). Ten
 * wrapper ma `"use client"` na górze — Server Component statystyk
 * (`page.tsx`) może go importować bezpośrednio, bo Next.js 15 App
 * Router automatycznie serializuje propsy SSR → CSR.
 *
 * Wykresy:
 *   1. **BarChart — Top vocations** (count + avgBid) — grouped bars
 *      z secondary axis dla avgBid.
 *   2. **BarChart — Top worlds** (count) — horizontal layout dla
 *      czytelności (10 kategorii).
 *   3. **BarChart — Price distribution** (histogram, 6 bucketów).
 *   4. **PieChart — Level distribution** (5 bucketów) — z `Cell`
 *      kolorowaniem per bucket (arch §6.1: paleta OKLCH + spójne
 *      kolory per vocation/region).
 *
 * A11y (arch §6.3):
 *   - `<figure>` + `<figcaption>` z kontekstem (screen readers).
 *   - `aria-label` na `<ResponsiveContainer>` (Recharts eksponuje role).
 *   - Touch targets w tooltip ≥ 44×44 (CSS inheritance).
 *   - `prefers-reduced-motion` respektowane (`isAnimationActive={false}`
 *     na wykresach, żeby uniknąć niepotrzebnej animacji).
 */

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormatter, useTranslations } from "next-intl";
import {
  BarChart3,
  CircleDollarSign,
  Layers,
  TrendingUp,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// Typy danych (kanoniczny kształt z `getMarketStats()`)
// ─────────────────────────────────────────────────────────────────────

export interface VocationDatum {
  vocation: string;
  count: number;
  avgBid: number | null;
}

export interface WorldDatum {
  world: string;
  count: number;
  avgLevel: number | null;
}

export interface BucketDatum {
  bucket: string;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────
// Paleta kolorów (arch §6.1 — OKLCH, semantycznie zgodna z resztą UI)
// ─────────────────────────────────────────────────────────────────────

/**
 * 5 kolorów dla pie chart leveli — gradient od `success` (niski level)
 * do `danger` (wysoki level). Używamy CSS vars z design system.
 */
const LEVEL_BUCKET_COLORS = [
  "oklch(var(--success))",
  "oklch(var(--primary))",
  "oklch(var(--warning))",
  "oklch(var(--warning) / 0.8)",
  "oklch(var(--danger))",
] as const;

const VOCATION_COLOR = "oklch(var(--primary))";
const AVG_BID_COLOR = "oklch(var(--accent-foreground))";

// ─────────────────────────────────────────────────────────────────────
// TopVocationsChart — bar chart (count + avgBid)
// ─────────────────────────────────────────────────────────────────────

interface TopVocationsChartProps {
  data: readonly VocationDatum[];
  className?: string;
}

export function TopVocationsChart({ data, className }: TopVocationsChartProps) {
  const t = useTranslations("Bazaar.statistics.charts");
  const format = useFormatter();

  if (data.length === 0) {
    return <EmptyChart title={t("topVocations.title")} className={className} />;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("topVocations.title")}
        </CardTitle>
        <CardDescription>{t("topVocations.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <figure className="overflow-hidden rounded-md border bg-background/50 p-2">
          <figcaption className="sr-only">{t("topVocations.title")}</figcaption>
          <div
            role="img"
            aria-label={t("topVocations.title")}
            className="h-72 w-full sm:h-80"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data as VocationDatum[]}
                margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="vocation"
                  stroke="currentColor"
                  className="text-muted-foreground"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  yAxisId="left"
                  stroke="currentColor"
                  className="text-muted-foreground tabular-nums"
                  tick={{ fontSize: 11 }}
                  width={50}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="currentColor"
                  className="text-muted-foreground tabular-nums"
                  tick={{ fontSize: 11 }}
                  width={60}
                  tickFormatter={(value: number) =>
                    format.number(value, { useGrouping: true })
                  }
                />
                <Tooltip
                  cursor={{ fill: "currentColor", opacity: 0.08 }}
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, key: string) => {
                    if (key === "avgBid") {
                      return [
                        `${format.number(value, { useGrouping: true })} TC`,
                        t("topVocations.avgBid"),
                      ];
                    }
                    return [
                      format.number(value, { useGrouping: true }),
                      t("topVocations.count"),
                    ];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value: string) => {
                    if (value === "count") return t("topVocations.count");
                    if (value === "avgBid") return t("topVocations.avgBid");
                    return value;
                  }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="count"
                  fill={VOCATION_COLOR}
                  isAnimationActive={false}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  yAxisId="right"
                  dataKey="avgBid"
                  fill={AVG_BID_COLOR}
                  isAnimationActive={false}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TopWorldsChart — horizontal bar (count)
// ─────────────────────────────────────────────────────────────────────

interface TopWorldsChartProps {
  data: readonly WorldDatum[];
  className?: string;
}

export function TopWorldsChart({ data, className }: TopWorldsChartProps) {
  const t = useTranslations("Bazaar.statistics.charts");
  const format = useFormatter();

  if (data.length === 0) {
    return <EmptyChart title={t("topWorlds.title")} className={className} />;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("topWorlds.title")}
        </CardTitle>
        <CardDescription>{t("topWorlds.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <figure className="overflow-hidden rounded-md border bg-background/50 p-2">
          <figcaption className="sr-only">{t("topWorlds.title")}</figcaption>
          <div
            role="img"
            aria-label={t("topWorlds.title")}
            className="h-80 w-full sm:h-96"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data as WorldDatum[]}
                layout="vertical"
                margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                  opacity={0.4}
                />
                <XAxis
                  type="number"
                  stroke="currentColor"
                  className="text-muted-foreground tabular-nums"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="world"
                  stroke="currentColor"
                  className="text-muted-foreground"
                  tick={{ fontSize: 11 }}
                  width={90}
                />
                <Tooltip
                  cursor={{ fill: "currentColor", opacity: 0.08 }}
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [
                    format.number(value, { useGrouping: true }),
                    t("topWorlds.count"),
                  ]}
                />
                <Bar
                  dataKey="count"
                  fill={VOCATION_COLOR}
                  isAnimationActive={false}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PriceDistributionChart — histogram bar chart (6 buckets)
// ─────────────────────────────────────────────────────────────────────

interface PriceDistributionChartProps {
  data: readonly BucketDatum[];
  className?: string;
}

export function PriceDistributionChart({
  data,
  className,
}: PriceDistributionChartProps) {
  const t = useTranslations("Bazaar.statistics.charts");
  const format = useFormatter();

  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return (
      <EmptyChart
        title={t("priceDistribution.title")}
        className={className}
      />
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleDollarSign className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("priceDistribution.title")}
        </CardTitle>
        <CardDescription>{t("priceDistribution.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <figure className="overflow-hidden rounded-md border bg-background/50 p-2">
          <figcaption className="sr-only">
            {t("priceDistribution.title")}
          </figcaption>
          <div
            role="img"
            aria-label={t("priceDistribution.title")}
            className="h-64 w-full sm:h-72"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data as BucketDatum[]}
                margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="bucket"
                  stroke="currentColor"
                  className="text-muted-foreground"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  stroke="currentColor"
                  className="text-muted-foreground tabular-nums"
                  tick={{ fontSize: 11 }}
                  width={50}
                />
                <Tooltip
                  cursor={{ fill: "currentColor", opacity: 0.08 }}
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [
                    format.number(value, { useGrouping: true }),
                    t("priceDistribution.count"),
                  ]}
                />
                <Bar
                  dataKey="count"
                  fill={VOCATION_COLOR}
                  isAnimationActive={false}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// LevelDistributionChart — pie chart (5 buckets)
// ─────────────────────────────────────────────────────────────────────

interface LevelDistributionChartProps {
  data: readonly BucketDatum[];
  className?: string;
}

export function LevelDistributionChart({
  data,
  className,
}: LevelDistributionChartProps) {
  const t = useTranslations("Bazaar.statistics.charts");
  const format = useFormatter();

  const filtered = data.filter((d) => d.count > 0);

  if (filtered.length === 0) {
    return (
      <EmptyChart
        title={t("levelDistribution.title")}
        className={className}
      />
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("levelDistribution.title")}
        </CardTitle>
        <CardDescription>{t("levelDistribution.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <figure className="overflow-hidden rounded-md border bg-background/50 p-2">
          <figcaption className="sr-only">
            {t("levelDistribution.title")}
          </figcaption>
          <div
            role="img"
            aria-label={t("levelDistribution.title")}
            className="h-64 w-full sm:h-72"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, _name: string, item: { payload?: BucketDatum }) => {
                    const label = item?.payload?.bucket ?? "";
                    return [
                      `${format.number(value, { useGrouping: true })} (${label})`,
                      t("levelDistribution.count"),
                    ];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value: string) => value}
                />
                <Pie
                  data={filtered as BucketDatum[]}
                  dataKey="count"
                  nameKey="bucket"
                  cx="50%"
                  cy="50%"
                  outerRadius="80%"
                  isAnimationActive={false}
                  label={(props: { bucket?: string; percent?: number }) => {
                    const pct = props.percent ?? 0;
                    const bucket = props.bucket ?? "";
                    // Skracamy etykiety żeby nie nachodziły na siebie
                    return pct > 0.05 ? `${bucket}` : "";
                  }}
                  labelLine={false}
                >
                  {filtered.map((entry, idx) => (
                    <Cell
                      key={`cell-${entry.bucket}`}
                      fill={LEVEL_BUCKET_COLORS[idx % LEVEL_BUCKET_COLORS.length]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// EmptyChart — placeholder gdy brak danych
// ─────────────────────────────────────────────────────────────────────

function EmptyChart({
  title,
  className,
}: {
  title: string;
  className?: string | undefined;
}) {
  const t = useTranslations("Bazaar.statistics.charts");
  return (
    <Card className={cn("border-dashed", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          role="status"
          className="flex flex-col items-center gap-2 rounded-md border border-dashed bg-muted/30 px-4 py-10 text-center"
        >
          <p className="text-sm font-medium text-foreground">
            {t("empty.title")}
          </p>
          <p className="text-xs text-muted-foreground">{t("empty.description")}</p>
        </div>
      </CardContent>
    </Card>
  );
}