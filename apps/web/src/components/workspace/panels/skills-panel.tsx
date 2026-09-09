"use client";

/**
 * @file panels/skills-panel.tsx — task 25.
 *
 * Skills tab: list every skill with base value, optional loyalty bonus,
 * and a CTA to the relevant calculators. Panel is purely presentational;
 * it consumes the global Zustand store via per-skill selectors so it
 * re-renders only when the corresponding skill changes (architecture
 * §13.4 panel reactivity contract).
 *
 * `useShallow` wraps the object-shaped selectors (skills map, total) to
 * keep the reference stable when the snapshot object identity changes
 * but the values inside don't.
 */

import * as React from "react";
import { ChevronRight, Sparkles } from "lucide-react";
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
  SKILL_KEYS,
  useCharacterStore,
  useShallow,
  type CharacterSnapshot,
  type SkillKey,
} from "@tibians/character-context";

const SKILL_LABEL_KEYS: Record<SkillKey, string> = {
  magic: "magic",
  club: "club",
  fist: "fist",
  sword: "sword",
  axe: "axe",
  distance: "distance",
  shielding: "shielding",
  fishing: "fishing",
};

export function SkillsPanel() {
  const t = useTranslations("Workspace.panelsContent.skills");
  const tCommon = useTranslations("Calculators.characterValue.skillKeys");
  const format = useFormatter();

  // Memoize skills object reference to keep re-renders surgical. We pull
  // the whole Skills map (it's small, 8 keys) and let the row components
  // own their own slice via store selectors.
  const skills = useCharacterStore(
    useShallow((s) => s.snapshot.skills),
  );
  const totalBase = useCharacterStore(
    useShallow((s) =>
      SKILL_KEYS.reduce((sum, key) => sum + s.snapshot.skills[key].base, 0),
    ),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>{t("base")}</span>
        </CardTitle>
        <CardDescription>
          {format.number(totalBase, { useGrouping: true })} total base across
          all 8 skills
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul
          className={cn(
            "grid gap-2",
            "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
          )}
        >
          {SKILL_KEYS.map((key) => (
            <SkillRow
              key={key}
              skillKey={key}
              entry={skills[key]}
              label={tCommon(SKILL_LABEL_KEYS[key])}
              t={t}
              format={format}
            />
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/calculators/exercise-weapons">
              {t("openCalculator")}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/calculators/skills">
              {t("openCalculator")}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/calculators/true-skill">
              {t("openCalculator")}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────
// SkillRow — individual skill tile
// ───────────────────────────────────────────────────────────────────────

interface SkillRowProps {
  skillKey: SkillKey;
  entry: CharacterSnapshot["skills"][SkillKey];
  label: string;
  t: ReturnType<typeof useTranslations<"Workspace.panelsContent.skills">>;
  format: ReturnType<typeof useFormatter>;
}

function SkillRow({ entry, label, t, format }: SkillRowProps) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        {entry.loyaltyPct !== undefined && entry.loyaltyPct > 0 ? (
          <Badge
            variant="outline"
            className="mt-1 border-info/40 bg-info/10 text-info"
          >
            {t("loyalty", { pct: entry.loyaltyPct })}
          </Badge>
        ) : null}
      </div>
      <span className="numeric text-base font-semibold tabular-nums text-foreground">
        {format.number(entry.base, { useGrouping: true })}
      </span>
    </li>
  );
}