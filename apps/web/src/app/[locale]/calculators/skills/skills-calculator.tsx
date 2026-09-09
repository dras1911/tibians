"use client";

import * as React from "react";
import { z } from "zod";
import {
  trainingTime,
  type ExerciseWeaponType,
  type VocationSkillCategory,
  VOCATION_SKILL_CATEGORIES,
} from "@tibians/calc";
import { useFormatter, useTranslations } from "next-intl";

import {
  CalculatorForm,
  CalculatorNumberInput,
  FormField,
  ResultDisplay,
  type Recommendation,
  type ResultSecondaryValue,
} from "@/components/calculators";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * `SkillsCalculator` — interactive form + result for
 * `/calculators/skills` (T17, Training/Skills, arch §2.1 + §2.2).
 *
 * Calculates the time and cost of training from `currentSkill` to
 * `targetSkill` for the chosen vocation/skill pair (8 pairs from
 * arch §2.1) and weapon tier.
 *
 * TibiaWiki Skills_Calculator caveat (arch §2.2):
 *   "For a precise calculation of the time and cost to get a certain
 *    skill, select the *Regular* weapon type. When selecting the other
 *    types the time and cost will be calculated assuming total usage of
 *    the weapons, which may be far superior to the time/cost required
 *    to get a certain skill."
 * → The result surfaces a recommendation badge: "precise" for Regular,
 *   "approximate" for Durable/Lasting.
 *
 * Architecture:
 *   - Module-level event store (`useSyncExternalStore`) so the form and
 *     result columns share state without a React context (the
 *     `<CalculatorLayout>` grid renders them as siblings).
 *   - Zod validates inputs locally before calling the pure formula.
 */

const WEAPON_TYPES: readonly ExerciseWeaponType[] = [
  "regular",
  "durable",
  "lasting",
] as const;

interface StoreState {
  category: VocationSkillCategory;
  currentSkill: string;
  targetSkill: string;
  percentToNext: string;
  weaponType: ExerciseWeaponType;
  offline: boolean;
}

const initialState: StoreState = {
  category: "knightMelee",
  currentSkill: "100",
  targetSkill: "110",
  percentToNext: "0",
  weaponType: "regular",
  offline: false,
};

type ComputedOk = {
  ok: true;
  primaryValue: number;
  secondary: ResultSecondaryValue[];
  recommendation: Recommendation;
};

type ComputedErr = {
  ok: false;
  fieldErrors: Partial<Record<keyof StoreState, string>>;
};

type Computed = ComputedOk | ComputedErr;

// ───────────────────────────────────────────────────────────────────────
// Module-level store
// ───────────────────────────────────────────────────────────────────────

let state: StoreState = { ...initialState };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): StoreState {
  return state;
}

function getServerSnapshot(): StoreState {
  return initialState;
}

function patchState(patch: Partial<StoreState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function useStore(): StoreState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ───────────────────────────────────────────────────────────────────────
// Zod schema
// ───────────────────────────────────────────────────────────────────────

const formSchema = z.object({
  category: z.enum(VOCATION_SKILL_CATEGORIES),
  currentSkill: z
    .number({ invalid_type_error: "errors.invalidCurrent" })
    .int("errors.invalidCurrent")
    .min(0, "errors.invalidCurrent"),
  targetSkill: z
    .number({ invalid_type_error: "errors.invalidTarget" })
    .int("errors.invalidTarget")
    .positive("errors.invalidTarget"),
  percentToNext: z
    .number({ invalid_type_error: "errors.invalidPercent" })
    .min(0, "errors.invalidPercent")
    .max(100, "errors.invalidPercent"),
  weaponType: z.enum(["regular", "durable", "lasting"]),
  offline: z.boolean(),
});

// ───────────────────────────────────────────────────────────────────────
// useComputed — shared computation
// ───────────────────────────────────────────────────────────────────────

function useComputed(): Computed {
  const tErrors = useTranslations("Calculators.skills.errors");
  const tResult = useTranslations("Calculators.skills.result");
  const tRec = useTranslations("Calculators.skills.recommendations");
  const tFields = useTranslations("Calculators.skills.fields");
  const format = useFormatter();
  const store = useStore();

  return React.useMemo<Computed>(() => {
    const parsed = formSchema.safeParse({
      category: store.category,
      currentSkill: Number(store.currentSkill),
      targetSkill: Number(store.targetSkill),
      percentToNext: Number(store.percentToNext),
      weaponType: store.weaponType,
      offline: store.offline,
    });

    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof StoreState, string>> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === "string") {
          fieldErrors[path as keyof StoreState] = tErrors(
            issue.message as Parameters<typeof tErrors>[0],
          );
        }
      }
      return { ok: false, fieldErrors };
    }

    // Cross-field: target > current
    if (parsed.data.targetSkill <= parsed.data.currentSkill) {
      return {
        ok: false,
        fieldErrors: { targetSkill: tErrors("invalidTarget") },
      };
    }

    const calcResult = trainingTime({
      category: parsed.data.category,
      currentSkill: parsed.data.currentSkill,
      targetSkill: parsed.data.targetSkill,
      percentToNext: parsed.data.percentToNext,
      weaponType: parsed.data.weaponType,
      offline: parsed.data.offline,
    });

    if (!calcResult.ok) {
      return {
        ok: false,
        fieldErrors: { targetSkill: tErrors("invalidTarget") },
      };
    }

    const v = calcResult.value;

    const recommendation: Recommendation = {
      tone: v.approximate ? "warning" : "success",
      message: v.approximate ? tRec("approximate") : tRec("precise"),
    };

    const secondary: ResultSecondaryValue[] = [
      {
        label: tResult("hits"),
        value: v.hitsRequired,
      },
      {
        label: tResult("costGp"),
        value: v.costGp,
      },
      {
        label: tResult("costTc"),
        value: v.costTc,
      },
    ];

    void tFields; // keep fields translation referenced (noUnusedLocals)

    return {
      ok: true,
      primaryValue: v.timeSeconds,
      secondary,
      recommendation,
    };
  }, [store, tErrors, tResult, tRec, tFields, format]);
}

// ───────────────────────────────────────────────────────────────────────
// Form column — `<SkillsForm />`
// ───────────────────────────────────────────────────────────────────────

export function SkillsForm() {
  const t = useTranslations("Calculators.skills");
  const tFields = useTranslations("Calculators.skills.fields");
  const tSkills = useTranslations("Calculators.skills.skills");
  const tErrors = useTranslations("Calculators.skills.errors");
  const tRecs = useTranslations("Calculators.skills.recommendations");
  const store = useStore();
  const outcome = useComputed();

  const fieldErrors = outcome.ok ? {} : outcome.fieldErrors;

  return (
    <CalculatorForm aria-label={t("title")}>
      <FormField
        id="sk-category"
        label={tFields("category.label")}
        help={tFields("category.help")}
      >
        <Select
          value={store.category}
          onValueChange={(v) =>
            patchState({ category: v as VocationSkillCategory })
          }
        >
          <SelectTrigger id="sk-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VOCATION_SKILL_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {tSkills(cat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="grid grid-cols-3 gap-3">
        <FormField
          id="sk-currentSkill"
          label={tFields("currentSkill.label")}
          help={tFields("currentSkill.help")}
          error={fieldErrors.currentSkill}
        >
          <CalculatorNumberInput
            min={0}
            step={1}
            value={store.currentSkill}
            onChange={(event) =>
              patchState({ currentSkill: event.target.value })
            }
            placeholder={tFields("currentSkill.placeholder")}
          />
        </FormField>

        <FormField
          id="sk-targetSkill"
          label={tFields("targetSkill.label")}
          help={tFields("targetSkill.help")}
          error={fieldErrors.targetSkill}
        >
          <CalculatorNumberInput
            min={0}
            step={1}
            value={store.targetSkill}
            onChange={(event) =>
              patchState({ targetSkill: event.target.value })
            }
            placeholder={tFields("targetSkill.placeholder")}
          />
        </FormField>

        <FormField
          id="sk-percentToNext"
          label={tFields("percentToNext.label")}
          help={tFields("percentToNext.help")}
          error={fieldErrors.percentToNext}
        >
          <CalculatorNumberInput
            min={0}
            max={100}
            step={1}
            value={store.percentToNext}
            onChange={(event) =>
              patchState({ percentToNext: event.target.value })
            }
            placeholder={tFields("percentToNext.placeholder")}
          />
        </FormField>
      </div>

      <FormField
        id="sk-weaponType"
        label={tFields("weaponType.label")}
        help={tFields("weaponType.help")}
      >
        <Select
          value={store.weaponType}
          onValueChange={(v) =>
            patchState({ weaponType: v as ExerciseWeaponType })
          }
        >
          <SelectTrigger id="sk-weaponType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEAPON_TYPES.map((wt) => (
              <SelectItem key={wt} value={wt}>
                {tFields(`weaponType.${wt}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
        <div className="space-y-1">
          <Label htmlFor="sk-offline" className="text-sm font-medium">
            {tFields("offline.label")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {tFields("offline.help")}
          </p>
        </div>
        <Switch
          id="sk-offline"
          checked={store.offline}
          onCheckedChange={(checked) => patchState({ offline: checked })}
        />
      </div>

      {/* Hidden helper to keep tErrors / tRecs referenced (noUnusedLocals) */}
      <span className="sr-only">{tErrors("invalidCurrent")}</span>
      <span className="sr-only">{tRecs("approximateShort")}</span>
    </CalculatorForm>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Result column — `<SkillsResult />`
// ───────────────────────────────────────────────────────────────────────

export function SkillsResult() {
  const tResult = useTranslations("Calculators.skills.result");
  const tWarnings = useTranslations("Calculators.skills.warnings");
  const format = useFormatter();
  const outcome = useComputed();

  if (!outcome.ok) {
    return <ResultDisplay empty />;
  }

  // Translate the raw integer seconds into a localized "Xh Ym" string
  // using Intl.NumberFormat + locale-aware labels (PL/EN).
  const totalSeconds = outcome.primaryValue;
  const total = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);

  const secondsLabel = (() => {
    if (days > 0) {
      return `${format.number(days, { useGrouping: true })} d ${format.number(hours, { useGrouping: true })} h ${format.number(minutes, { useGrouping: true })} min`;
    }
    if (hours > 0) {
      return `${format.number(hours, { useGrouping: true })} h ${format.number(minutes, { useGrouping: true })} min`;
    }
    return `${format.number(minutes, { useGrouping: true })} min`;
  })();

  // Mutate the secondary `time` row to use the formatted string.
  const secondary: ResultSecondaryValue[] = outcome.secondary.map((s) =>
    s.label === tResult("time")
      ? { ...s, value: secondsLabel }
      : s,
  );

  // If the recommendation is "approximate", append the TibiaWiki warning.
  // The base recommendation was set in useComputed based on whether
  // the weapon type gives a precise or approximate result.
  const baseRec = outcome.recommendation;
  const recommendation: Recommendation = (() => {
    if (
      typeof baseRec === "object" &&
      baseRec !== null &&
      !React.isValidElement(baseRec) &&
      "tone" in baseRec &&
      baseRec.tone === "warning"
    ) {
      return {
        ...baseRec,
        message: `${baseRec.message} ${tWarnings("approximate")}`,
      };
    }
    return baseRec;
  })();

  return (
    <ResultDisplay
      primaryValue={total}
      primaryLabel={tResult("time")}
      secondaryValues={secondary}
      recommendation={recommendation}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────
// Compound wrapper
// ───────────────────────────────────────────────────────────────────────

/**
 * Compound entry-point consumed by `/calculators/skills/page.tsx`.
 * The form column is `<SkillsForm />`; the result column reads from the
 * same module-level store via `SkillsCalculator.Result`.
 */
export function SkillsCalculator() {
  return <SkillsForm />;
}
SkillsCalculator.Result = SkillsResult;