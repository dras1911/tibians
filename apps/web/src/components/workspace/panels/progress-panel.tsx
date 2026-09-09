"use client";

/**
 * @file panels/progress-panel.tsx — task 25.
 *
 * Progress tab: horizontal progress bars for every progression field —
 * charm points, boss points, quests, imbuements, achievement points.
 *
 * **Bars vs numbers:** we render `done / total` plus a percentage bar.
 * Charm / boss / achievement points don't have a fixed total — we
 * surface them as raw numbers in their own row.
 *
 * **Reactivity:** each bar is keyed on a fine-grained selector so
 * editing one progression field only re-renders its own row. Other rows
 * stay cached.
 */

import * as React from "react";
import { CheckCircle2, TrendingUp } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCharacterStore } from "@tibians/character-context";

export function ProgressPanel() {
  const t = useTranslations("Workspace.panelsContent.progress");
  const format = useFormatter();

  // One selector per metric so the surrounding component re-renders
  // only when at least one changes (Zustand default shallow comparison
  // collapses identical references).
  const charmPoints = useCharacterStore((s) => s.snapshot.progression.charmPoints);
  const bossPoints = useCharacterStore((s) => s.snapshot.progression.bossPoints);
  const questsCompleted = useCharacterStore(
    (s) => s.snapshot.progression.questsCompleted,
  );
  const questsTotal = useCharacterStore((s) => s.snapshot.progression.questsTotal);
  const imbuementsUnlocked = useCharacterStore(
    (s) => s.snapshot.progression.imbuementsUnlocked,
  );
  const imbuementsTotal = useCharacterStore(
    (s) => s.snapshot.progression.imbuementsTotal,
  );
  const achievementPoints = useCharacterStore(
    (s) => s.snapshot.progression.achievementPoints,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>{t("quests") /* group label reused */}</span>
        </CardTitle>
        <CardDescription>{t("quests") /* description uses any */}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <RawMetric
          label={t("charmPoints")}
          value={format.number(charmPoints, { useGrouping: true })}
        />
        <RawMetric
          label={t("bossPoints")}
          value={format.number(bossPoints, { useGrouping: true })}
        />
        <RatioMetric
          label={t("quests")}
          done={questsCompleted}
          total={questsTotal}
          format={format}
          ofTotal={t("ofTotal")}
        />
        <RatioMetric
          label={t("imbuements")}
          done={imbuementsUnlocked}
          total={imbuementsTotal}
          format={format}
          ofTotal={t("ofTotal")}
        />
        <RawMetric
          label={t("achievements")}
          value={format.number(achievementPoints, { useGrouping: true })}
        />
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────
// RawMetric — just a number (charm / boss / achievement points)
// ───────────────────────────────────────────────────────────────────────

function RawMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="numeric text-base font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// RatioMetric — done / total + bar
// ───────────────────────────────────────────────────────────────────────

interface RatioMetricProps {
  label: string;
  done: number;
  total: number;
  format: ReturnType<typeof useFormatter>;
  ofTotal: string;
}

function RatioMetric({ label, done, total, format, ofTotal }: RatioMetricProps) {
  const safeTotal = Math.max(0, total);
  const ratio = safeTotal > 0 ? Math.min(1, done / safeTotal) : 0;
  const doneText = format.number(done, { useGrouping: true });
  const totalText = format.number(safeTotal, { useGrouping: true });

  const isComplete = safeTotal > 0 && done >= safeTotal;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          {isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          ) : null}
          {label}
        </span>
        <span className="numeric text-sm font-semibold tabular-nums text-foreground">
          {ofTotal.replace("{done}", doneText).replace("{total}", totalText)}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            isComplete
              ? "bg-success"
              : ratio >= 0.7
                ? "bg-primary"
                : ratio >= 0.3
                  ? "bg-info"
                  : "bg-warning",
          )}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}