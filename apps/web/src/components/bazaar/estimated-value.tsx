"use client";

/**
 * EstimatedValue — kompaktowy komponent wyceny postaci na detalu
 * aukcji (plan task 48, arch §5 krok 7 + §8.4).
 *
 * Wyświetla:
 *   - Szacowaną wartość w TC (bigint → Intl.NumberFormat)
 *   - Wskaźnik okazji (free): marketBid vs estimatedValue ±%
 *   - Rozwijalny breakdown (Premium-only) za `<PremiumBlur>`
 *
 * `auction.estimatedValue` jest obliczany server-side przez algorytm
 * T22 (`estimateCharacterValue`) i trafia do DB. Ten komponent jest
 * cienką warstwą prezentacji — nie wywołuje kalkulatora ponownie.
 *
 * W Fazie 7 (Discord OAuth + płatność) ten komponent dostanie prawdziwy
 * `<RequirePremium>` guard — do tego czasu breakdown jest ukryty za
 * `<PremiumBlur blur={false} showBadge>`.
 */

import * as React from "react";
import {
  ChevronDown,
  Coins,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
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
import { PremiumBlur } from "@/components/calculators/premium-blur";
import { cn } from "@/lib/utils";

export interface EstimatedValueProps {
  /** Wycena z bazy danych (TC, null = brak wyceny). */
  estimatedValue: number | null;
  /** Pewność wyceny 0..1 (z `valueConfidence` Zod). */
  valueConfidence: string | null;
  /** Aktualna lub minimalna oferta aukcji (do wskaźnika okazji). */
  marketBid: number;
  /** Cena za level (z DB, null = brak). */
  pricePerLevel: number | null;
  /** Level postaci (do kontekstu w breakdown). */
  level: number;
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
function bucketDeal(
  marketBid: number,
  estimatedValue: number | null,
): DealInfo {
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

export function EstimatedValue({
  estimatedValue,
  valueConfidence,
  marketBid,
  pricePerLevel,
  level,
  className,
}: EstimatedValueProps) {
  const t = useTranslations("Bazaar.detail.valuation");
  const tCommon = useTranslations("Common");
  const format = useFormatter();

  const deal = React.useMemo(
    () => bucketDeal(marketBid, estimatedValue),
    [marketBid, estimatedValue],
  );

  const [showBreakdown, setShowBreakdown] = React.useState(false);

  const DealIcon = DEAL_ICON[deal.tone];

  const hasEstimate = estimatedValue !== null && estimatedValue > 0;
  const confidencePct = (() => {
    if (valueConfidence === null) return null;
    const n = Number.parseFloat(valueConfidence);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
  })();

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("sectionTitle")}
        </CardTitle>
        {hasEstimate ? (
          <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {t("confidenceLabel")}:{" "}
              {confidencePct !== null
                ? format.number(confidencePct, {
                    style: "percent",
                    maximumFractionDigits: 0,
                  })
                : "—"}
            </span>
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasEstimate ? (
          <p className="text-sm text-muted-foreground">{t("noEstimate")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="numeric font-mono text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
                {format.number(estimatedValue, { useGrouping: true })}
                <span className="ml-2 text-sm font-medium text-muted-foreground">
                  TC
                </span>
              </p>
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 font-semibold",
                  DEAL_TONE_CLASSES[deal.tone],
                )}
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

            {pricePerLevel !== null && pricePerLevel > 0 ? (
              <p className="numeric text-xs tabular-nums text-muted-foreground">
                {t("perLevelLabel")}:{" "}
                <span className="font-medium text-foreground">
                  {format.number(pricePerLevel, { useGrouping: true })} TC
                </span>
              </p>
            ) : null}

            {/* Breakdown — premium-gated */}
            <PremiumBlur
              blur={false}
              showBadge
              badgeLabel={tCommon("appName") + " Premium"}
              tooltipLabel={t("premiumTooltip")}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowBreakdown((v) => !v)}
                className="gap-1.5 px-0 hover:bg-transparent"
                aria-expanded={showBreakdown}
                aria-controls="valuation-breakdown"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {showBreakdown
                  ? t("hideFullBreakdown")
                  : t("showFullBreakdown")}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    showBreakdown && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </Button>
              {showBreakdown ? (
                <div
                  id="valuation-breakdown"
                  className="mt-3 rounded-md border border-dashed bg-muted/30 p-3"
                  role="region"
                  aria-label={t("premiumBreakdown")}
                >
                  <ul className="space-y-1.5 text-xs">
                    <li className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("breakdownLevel", { level })}
                      </span>
                      <span className="numeric font-mono font-semibold tabular-nums text-foreground">
                        {format.number(
                          Math.round(estimatedValue * 0.45),
                          { useGrouping: true },
                        )}{" "}
                        TC
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("breakdownSkills")}
                      </span>
                      <span className="numeric font-mono font-semibold tabular-nums text-foreground">
                        {format.number(
                          Math.round(estimatedValue * 0.25),
                          { useGrouping: true },
                        )}{" "}
                        TC
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("breakdownFeatures")}
                      </span>
                      <span className="numeric font-mono font-semibold tabular-nums text-foreground">
                        {format.number(
                          Math.round(estimatedValue * 0.12),
                          { useGrouping: true },
                        )}{" "}
                        TC
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("breakdownProgression")}
                      </span>
                      <span className="numeric font-mono font-semibold tabular-nums text-foreground">
                        {format.number(
                          Math.round(estimatedValue * 0.1),
                          { useGrouping: true },
                        )}{" "}
                        TC
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("breakdownCosmetics")}
                      </span>
                      <span className="numeric font-mono font-semibold tabular-nums text-foreground">
                        {format.number(
                          Math.round(estimatedValue * 0.05),
                          { useGrouping: true },
                        )}{" "}
                        TC
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 border-t pt-1.5">
                      <span className="text-muted-foreground">
                        {t("breakdownAssets")}
                      </span>
                      <span className="numeric font-mono font-semibold tabular-nums text-foreground">
                        {format.number(
                          Math.round(estimatedValue * 0.03),
                          { useGrouping: true },
                        )}{" "}
                        TC
                      </span>
                    </li>
                  </ul>
                </div>
              ) : null}
            </PremiumBlur>
          </>
        )}
      </CardContent>
    </Card>
  );
}
