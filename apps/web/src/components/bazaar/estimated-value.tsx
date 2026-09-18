"use client";

/**
 * EstimatedValue — wycena postaci na detalu aukcji (task 48, arch §5 krok 7).
 *
 * Wyświetla TYLKO:
 *   - „Szacowana wartość" w TC (jak Exiva.pro — bez ujawniania metody),
 *   - wskaźnik okazji (bid vs wycena ±%).
 *
 * HISTORIA (W19, 2026-09-18): wcześniej był tu rozwijalny „breakdown"
 * 6 komponentów za `<PremiumBlur>` (bramka premium). Decyzja produktowa:
 * WSZYSTKO DARMOWE, żadnych bramek — a skoro tak, to nie pokazujemy
 * rozbicia w ogóle (użytkownik: „Nie wyświetlaj skąd bierzemy tą cenę,
 * tylko że jest to szacowana wartość tak jak na exiva pro"). Metoda
 * (mediana rynkowa) zostaje w DB (`valuation_history.breakdown`) —
 * do kalibracji, nie do UI.
 */

import * as React from "react";
import { Coins, TrendingDown, TrendingUp } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface EstimatedValueProps {
  /** Wycena z bazy danych (TC, null = brak wyceny). */
  estimatedValue: number | null;
  /** Aktualna lub minimalna oferta aukcji (do wskaźnika okazji). */
  marketBid: number;
  className?: string;
}

type DealTone = "success" | "info" | "warning" | "muted";

interface DealInfo {
  tone: DealTone;
  deltaPct: number | null;
  /** i18n key — pod którym tłumaczeniem szukać badge'a. */
  i18nKey: "dealBadgeUnderpriced" | "dealBadgeFair" | "dealBadgeOverpriced";
}

/**
 * Heurystyka: bid jest okazją gdy estimatedValue - bid > 5%.
 * Fair w przedziale ±5%, overpriced gdy bid > estimatedValue + 5%.
 */
function bucketDeal(marketBid: number, estimatedValue: number | null): DealInfo {
  if (estimatedValue === null || estimatedValue <= 0 || marketBid <= 0) {
    return { tone: "muted", deltaPct: null, i18nKey: "dealBadgeFair" };
  }
  const delta = ((estimatedValue - marketBid) / estimatedValue) * 100;
  if (delta >= 5) {
    return { tone: "success", deltaPct: delta, i18nKey: "dealBadgeUnderpriced" };
  }
  if (delta <= -5) {
    return { tone: "warning", deltaPct: delta, i18nKey: "dealBadgeOverpriced" };
  }
  return { tone: "info", deltaPct: delta, i18nKey: "dealBadgeFair" };
}

const DEAL_TONE_CLASSES: Record<DealTone, string> = {
  success: "border-success/40 bg-success/15 text-success",
  warning: "border-warning/40 bg-warning/15 text-warning",
  info: "border-info/40 bg-info/15 text-info",
  muted: "border-border bg-muted text-muted-foreground",
};

const DEAL_ICON: Record<DealTone, React.ComponentType<{ className?: string }>> = {
  success: TrendingDown,
  warning: TrendingUp,
  info: Coins,
  muted: Coins,
};

export function EstimatedValue({ estimatedValue, marketBid, className }: EstimatedValueProps) {
  const t = useTranslations("Bazaar.detail.valuation");
  const format = useFormatter();

  const deal = React.useMemo(
    () => bucketDeal(marketBid, estimatedValue),
    [marketBid, estimatedValue],
  );

  const DealIcon = DEAL_ICON[deal.tone];

  const hasEstimate = estimatedValue !== null && estimatedValue > 0;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("sectionTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasEstimate ? (
          <p className="text-sm text-muted-foreground">{t("noEstimate")}</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="numeric font-mono text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
              {format.number(estimatedValue, { useGrouping: true })}
              <span className="ml-2 text-sm font-medium text-muted-foreground">TC</span>
            </p>
            <Badge
              variant="outline"
              className={cn("gap-1 font-semibold", DEAL_TONE_CLASSES[deal.tone])}
            >
              <DealIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {deal.deltaPct !== null
                ? t(deal.i18nKey, {
                    delta: format.number(deal.deltaPct, {
                      signDisplay: "always",
                      maximumFractionDigits: 1,
                    }),
                  })
                : t("dealBadgeUnknown")}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
