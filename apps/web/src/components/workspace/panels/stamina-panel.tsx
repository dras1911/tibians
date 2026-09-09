"use client";

/**
 * @file panels/stamina-panel.tsx — task 25.
 *
 * Stamina tab: minimal "current stamina" gauge + regen rate placeholder
 * + CTA to the Stamina calculator. Full stamina math (premium windows,
 * daily bonus) ships with the dedicated calculator; the panel is a
 * reactive surface so the user can see a top-level number in context.
 *
 * T25 ships the panel chrome + gauge. The stamina value itself lives
 * on the snapshot under a future field (`assets.staminaHours`) which
 * the Bazaar detail parser will populate; until then we default to
 * 42h (full stamina).
 */

import * as React from "react";
import { Battery, ChevronRight, Zap } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

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

const MAX_STAMINA_HOURS = 42;
const DEFAULT_STAMINA_HOURS = 42;
const REGEN_MIN_PER_MIN = 3;

export function StaminaPanel() {
  const t = useTranslations("Workspace.panelsContent.stamina");
  const format = useFormatter();

  const [staminaHours] = React.useState(DEFAULT_STAMINA_HOURS);
  const ratio = Math.min(1, staminaHours / MAX_STAMINA_HOURS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Battery className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>{t("current")}</span>
        </CardTitle>
        <CardDescription>
          {format.number(staminaHours, { useGrouping: true })} /{" "}
          {MAX_STAMINA_HOURS}h
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Gauge */}
        <div
          className="relative h-3 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={staminaHours}
          aria-valuemin={0}
          aria-valuemax={MAX_STAMINA_HOURS}
          aria-label={t("current")}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              ratio > 0.5
                ? "bg-success"
                : ratio > 0.2
                  ? "bg-warning"
                  : "bg-destructive",
            )}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="h-4 w-4 text-info" aria-hidden="true" />
          <span>{t("regenRate")}</span>
          <span className="font-medium tabular-nums text-foreground">
            {REGEN_MIN_PER_MIN} min / 1 stamina
          </span>
        </div>

        <div className="mt-6">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/calculators/stamina">
              {t("openCalculator")}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}