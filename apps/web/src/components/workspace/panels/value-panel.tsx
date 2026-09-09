"use client";

/**
 * @file panels/value-panel.tsx — task 25.
 *
 * Value tab: estimated character value in TC (from T22
 * `estimateCharacterValue`) + deal badge (`~` / `≈` / fair / overpriced
 * vs the snapshot's `auction.bid`) + CTA to the full breakdown on
 * `/calculators/character-value?auction={id}`.
 *
 * **Reactivity (architecture §13.4):** the result is computed via a
 * `useMemo` keyed on the snapshot reference. Changing any field of the
 * snapshot produces a new reference, so the memo invalidates and the
 * recomputation runs in <16 ms (per the T26 perf budget).
 *
 * **Deal heuristic:** simple comparison between `auction.bid` and
 * `estimatedValue`. We bucket into three tones (success / info /
 * warning) based on the delta — see `bucketDeal()`.
 *
 * **ValuationConfig source:** the page-level Server Component loads
 * the config via `loadValuationConfig()` (which touches the DB seed
 * and cannot run in the browser) and passes it down via props. The
 * client panel is otherwise free of any DB/server imports.
 *
 * **Premium gate:** the deep breakdown (per-component breakdown) lives
 * behind the premium paywall per architecture §8.4. T25 shows the
 * headline number for free; the deep CTA links to the calculator page
 * where T84/85 will own the gate.
 */

import * as React from "react";
import { ChevronRight, Coins, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import {
  estimateCharacterValue,
  type ValuationConfig,
} from "@tibians/calc";
import {
  useCharacterStore,
  useShallow,
  type CharacterSnapshot,
} from "@tibians/character-context";

export interface ValuePanelProps {
  /**
   * `ValuationConfig` loaded server-side (from the DB seed via
   * `loadValuationConfig()`). Required — the calculator is pure and
   * takes the weights as input.
   */
  config: ValuationConfig;
  /**
   * Server-supplied snapshot (Bazaar detail — T50). When present we use
   * it for valuation instead of the current store value, so the panel
   * works for SSR before hydration.
   */
  initialSnapshot: CharacterSnapshot | undefined;
}

type DealTone = "success" | "info" | "warning";

interface DealSummary {
  tone: DealTone;
  badgeKey: "dealBadge" | "fairBadge" | "premiumBadge";
  deltaPct: number | null;
}

function bucketDeal(bid: number | undefined, value: bigint): DealSummary {
  if (bid === undefined || bid <= 0) {
    return { tone: "info", badgeKey: "fairBadge", deltaPct: null };
  }
  const valueNumber = Number(value);
  if (valueNumber <= 0) {
    return { tone: "info", badgeKey: "fairBadge", deltaPct: null };
  }
  const delta = ((valueNumber - bid) / valueNumber) * 100;
  if (delta >= 10) {
    return { tone: "success", badgeKey: "dealBadge", deltaPct: delta };
  }
  if (delta <= -10) {
    return { tone: "warning", badgeKey: "premiumBadge", deltaPct: delta };
  }
  return { tone: "info", badgeKey: "fairBadge", deltaPct: delta };
}

export function ValuePanel({ config, initialSnapshot }: ValuePanelProps) {
  const t = useTranslations("Workspace.panelsContent.value");
  const format = useFormatter();

  // Fine-grained selector — the whole snapshot reference; the calculator
  // is pure and fast enough that this is cheaper than hand-picking
  // every field.
  const snapshot = useCharacterStore(useShallow((s) => s.snapshot));
  const valuation = React.useMemo(() => {
    const active = initialSnapshot ?? snapshot;
    return estimateCharacterValue(active, config);
  }, [snapshot, initialSnapshot, config]);

  const bid = snapshot.auction?.bid;
  const deal = bucketDeal(bid, valuation.ok ? valuation.value.estimatedValue : 0n);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>{t("estimated")}</span>
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <span>
            {t("confidence")}{" "}
            {valuation.ok
              ? format.number(valuation.value.confidence, {
                  style: "percent",
                  maximumFractionDigits: 0,
                })
              : "—"}
          </span>
          <Badge
            variant={
              deal.tone === "success"
                ? "success"
                : deal.tone === "warning"
                  ? "warning"
                  : "info"
            }
            className={cn(
              deal.tone === "success" && "border-success/40 bg-success/15 text-success",
              deal.tone === "warning" && "border-warning/40 bg-warning/15 text-warning",
              deal.tone === "info" && "border-info/40 bg-info/15 text-info",
            )}
          >
            {t(deal.badgeKey)}
            {deal.deltaPct !== null ? ` (${format.number(deal.deltaPct, { signDisplay: "always", maximumFractionDigits: 1 })}%)` : null}
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {valuation.ok ? (
          <p className="text-3xl font-semibold tabular-nums text-foreground">
            <span className="text-muted-foreground">
              {valuation.value.confidenceSymbol}
            </span>
            {format.number(valuation.value.estimatedValue, { useGrouping: true })}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              TC
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link
              href={
                snapshot.source.kind === "auction"
                  ? `/calculators/character-value?auction=${snapshot.source.auctionId.toString()}`
                  : "/calculators/character-value"
              }
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("viewBreakdown")}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}