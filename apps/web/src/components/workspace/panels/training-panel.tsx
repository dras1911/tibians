"use client";

/**
 * @file panels/training-panel.tsx — task 25.
 *
 * Training tab: surfaces "Time to next level" using the snapshot's
 * `level` + `xp/h` heuristic, and offers CTAs to the relevant
 * calculators (Exercise Weapons + Training). The panel is intentionally
 * lightweight for T25 — the deep what-if logic (interactive target /
 * double-event toggle) ships with T26.
 *
 * XP/h constant is a placeholder heuristic (no calculator context yet)
 * — T26 wires the real `xpToTarget` + `timeToTarget` calculators from
 * `packages/calc`.
 */

import * as React from "react";
import { ChevronRight, Timer } from "lucide-react";
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
import { useCharacterStore } from "@tibians/character-context";

const ASSUMED_XP_PER_HOUR = 250_000;

export function TrainingPanel() {
  const t = useTranslations("Workspace.panelsContent.training");
  const format = useFormatter();

  const level = useCharacterStore((s) => s.snapshot.identity.level);

  // Estimate: TibiaWiki ground-truth XP table grows quickly — at level
  // 619 a single level is on the order of ~250M XP. With 250k XP/h
  // that's ~1000 h. We render only the relative statement ("set a
  // target in the calculator") until T26 wires the real calculation.
  const estimatedHours = Math.max(1, Math.round((level * 4_000) / ASSUMED_XP_PER_HOUR));
  const duration = formatDuration(estimatedHours, format);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>{t("timeToNext")}</span>
        </CardTitle>
        <CardDescription>
          {t("noTarget")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            {t("timeToNext")} (level {level} → {level + 1})
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {duration}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            @ {ASSUMED_XP_PER_HOUR.toLocaleString("en-US")} XP/h baseline
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/calculators/exercise-weapons">
              {t("openExercise")}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/calculators/skills">
              {t("openTraining")}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Renders an hours estimate as `Xd Yh` / `Yh Zm` / `Zm` for readability.
 * Locale-aware via `Intl.NumberFormat` (next-intl formatter already
 * wraps it).
 */
function formatDuration(
  totalHours: number,
  format: ReturnType<typeof useFormatter>,
): string {
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `${format.number(days, { useGrouping: true })}d ${format.number(hours, { useGrouping: true })}h`;
  }
  if (totalHours >= 1) {
    const hours = Math.floor(totalHours);
    const minutes = Math.round((totalHours - hours) * 60);
    return `${format.number(hours, { useGrouping: true })}h ${format.number(minutes, { useGrouping: true })}m`;
  }
  const minutes = Math.round(totalHours * 60);
  return `${format.number(minutes, { useGrouping: true })}m`;
}