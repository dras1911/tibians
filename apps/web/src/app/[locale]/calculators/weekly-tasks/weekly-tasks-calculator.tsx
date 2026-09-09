"use client";

import * as React from "react";
import { z } from "zod";
import {
  WEEKLY_TASK_MAX_LEVEL,
  WEEKLY_TASK_MIN_LEVEL_BOUND,
  weeklyTaskReward,
  type WeeklyTaskDifficulty,
  type WeeklyTaskType,
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

/**
 * `WeeklyTasksCalculator` — interactive form + result for
 * `/calculators/weekly-tasks` (T21, TibiaWiki BR Weekly_Tasks ground truth,
 * arch §2.1 TibiaPal benchmark).
 *
 * Computes the maximum XP per task using CipSoft's official formula
 * `XP = 1_995 × level`, capped per difficulty. Both kill and delivery
 * tasks use the same formula (TibiaWiki BR).
 *
 * Architecture:
 *   - Module-level store (`useSyncExternalStore`) so form + result share
 *     state without React context (CalculatorLayout renders them as siblings).
 *   - Zod validates inputs locally before calling the pure formula.
 *
 * Edge cases surfaced via Zod + pure formula:
 *   - Level below CipSoft legal minimum (8) → invalid
 *   - Level above TibiaWiki cap (2500) → invalid
 *   - Difficulty unlock: Adept requires ≥30, Expert ≥150, Master ≥400
 *   - Non-integer level → invalid
 */

const DIFFICULTIES: readonly WeeklyTaskDifficulty[] = [
  "beginner",
  "adept",
  "expert",
  "master",
];

const TASK_TYPES: readonly WeeklyTaskType[] = ["kill", "delivery"];

const formSchema = z.object({
  level: z
    .number({ invalid_type_error: "invalidLevel" })
    .int("invalidLevel")
    .min(WEEKLY_TASK_MIN_LEVEL_BOUND, "invalidLevel")
    .max(WEEKLY_TASK_MAX_LEVEL, "invalidLevel"),
  difficulty: z.enum(["beginner", "adept", "expert", "master"]),
  taskType: z.enum(["kill", "delivery"]),
});

// ───────────────────────────────────────────────────────────────────────
// Module-level store
// ───────────────────────────────────────────────────────────────────────

interface StoreState {
  level: string;
  difficulty: WeeklyTaskDifficulty;
  taskType: WeeklyTaskType;
}

const initialState: StoreState = {
  level: "200",
  difficulty: "expert",
  taskType: "kill",
};

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
// useComputed — shared computation
// ───────────────────────────────────────────────────────────────────────

interface OkOutcome {
  ok: true;
  totalXp: bigint;
  baseXp: bigint;
  capXp: bigint;
  wasCapped: boolean;
  difficulty: WeeklyTaskDifficulty;
  taskType: WeeklyTaskType;
  level: number;
  recommendation: Recommendation;
  secondary: ResultSecondaryValue[];
}

interface ErrOutcome {
  ok: false;
  fieldErrors: Partial<Record<keyof StoreState, string>>;
}

type Outcome = OkOutcome | ErrOutcome;

function useComputed(): Outcome {
  const tErrors = useTranslations("Calculators.weeklyTasks.errors");
  const tResult = useTranslations("Calculators.weeklyTasks.result");
  const tRecs = useTranslations("Calculators.weeklyTasks.recommendations");
  const tDiff = useTranslations("Calculators.weeklyTasks.difficulties");
  const format = useFormatter();
  const store = useStore();

  return React.useMemo<Outcome>(() => {
    const parsed = formSchema.safeParse({
      level: Number(store.level),
      difficulty: store.difficulty,
      taskType: store.taskType,
    });

    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof StoreState, string>> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === "string") {
          const key = path as keyof StoreState;
          const messageKey = issue.message as Parameters<typeof tErrors>[0];
          fieldErrors[key] = tErrors(messageKey, {
            min: WEEKLY_TASK_MIN_LEVEL_BOUND,
            max: WEEKLY_TASK_MAX_LEVEL,
          });
        }
      }
      return { ok: false, fieldErrors };
    }

    const { level, difficulty, taskType } = parsed.data;

    const calcResult = weeklyTaskReward(level, difficulty, taskType);
    if (!calcResult.ok) {
      // Unlock / validation failure — surface as level error.
      if (calcResult.error.code === "WEEKLY_TASK_LEVEL_TOO_LOW") {
        return {
          ok: false,
          fieldErrors: { level: tErrors("levelTooLow") },
        };
      }
      return {
        ok: false,
        fieldErrors: { level: tErrors("invalidLevel") },
      };
    }

    const { totalXp, baseXp, capXp, wasCapped } = {
      totalXp: calcResult.value.xpAfterCap,
      baseXp: calcResult.value.baseXp,
      capXp: calcResult.value.capXp,
      wasCapped: calcResult.value.wasCapped,
    };

    // Recommendation tone
    let recommendation: Recommendation;
    if (difficulty === "master" && !wasCapped) {
      recommendation = {
        tone: "success",
        message: tRecs("masterUnlimited"),
      };
    } else if (wasCapped) {
      recommendation = {
        tone: "warning",
        message: tRecs("capped", {
          base: format.number(baseXp, { useGrouping: true }),
          cap: format.number(capXp, { useGrouping: true }),
          xp: format.number(totalXp, { useGrouping: true }),
        }),
      };
    } else {
      recommendation = {
        tone: "info",
        message: tRecs("noCap", {
          base: format.number(baseXp, { useGrouping: true }),
          cap: format.number(capXp, { useGrouping: true }),
          difficulty: tDiff(difficulty),
        }),
      };
    }

    return {
      ok: true,
      totalXp,
      baseXp,
      capXp,
      wasCapped,
      difficulty,
      taskType,
      level,
      recommendation,
      secondary: [
        {
          label: tResult("baseXp"),
          value: format.number(baseXp, { useGrouping: true }),
        },
        {
          label: tResult("capXp"),
          value: wasCapped
            ? format.number(capXp, { useGrouping: true })
            : "—",
        },
        {
          label: tResult("difficulty"),
          value: tDiff(difficulty),
        },
        {
          label: tResult("level"),
          value: format.number(level, { useGrouping: true }),
        },
      ],
    };
  }, [store, format, tErrors, tResult, tRecs, tDiff]);
}

// ───────────────────────────────────────────────────────────────────────
// Form column — `<WeeklyTasksForm />`
// ───────────────────────────────────────────────────────────────────────

export function WeeklyTasksForm() {
  const t = useTranslations("Calculators.weeklyTasks");
  const tFields = useTranslations("Calculators.weeklyTasks.fields");
  const tDiff = useTranslations("Calculators.weeklyTasks.difficulties");
  const store = useStore();
  const outcome = useComputed();
  const fieldErrors = outcome.ok ? {} : outcome.fieldErrors;

  return (
    <CalculatorForm aria-label={t("title")}>
      <FormField
        id="wt-level"
        label={tFields("level.label")}
        help={tFields("level.help", {
          min: WEEKLY_TASK_MIN_LEVEL_BOUND,
          max: WEEKLY_TASK_MAX_LEVEL,
        })}
        error={fieldErrors.level}
      >
        <CalculatorNumberInput
          id="wt-level"
          min={WEEKLY_TASK_MIN_LEVEL_BOUND}
          max={WEEKLY_TASK_MAX_LEVEL}
          step={1}
          value={store.level}
          onChange={(event) => patchState({ level: event.target.value })}
          placeholder={tFields("level.placeholder")}
        />
      </FormField>

      <FormField
        id="wt-difficulty"
        label={tFields("difficulty.label")}
        help={tFields("difficulty.help")}
        error={fieldErrors.difficulty}
      >
        <Select
          value={store.difficulty}
          onValueChange={(value) =>
            patchState({ difficulty: value as WeeklyTaskDifficulty })
          }
        >
          <SelectTrigger id="wt-difficulty">
            <SelectValue placeholder={tFields("difficulty.placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {DIFFICULTIES.map((diff) => (
              <SelectItem key={diff} value={diff}>
                {tDiff(diff)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        id="wt-taskType"
        label={tFields("taskType.label")}
        help={tFields("taskType.help")}
        error={fieldErrors.taskType}
      >
        <Select
          value={store.taskType}
          onValueChange={(value) =>
            patchState({ taskType: value as WeeklyTaskType })
          }
        >
          <SelectTrigger id="wt-taskType">
            <SelectValue placeholder={tFields("taskType.placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {TASK_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {tFields(`taskType.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </CalculatorForm>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Result column — `<WeeklyTasksResult />`
// ───────────────────────────────────────────────────────────────────────

export function WeeklyTasksResult() {
  const tResult = useTranslations("Calculators.weeklyTasks.result");
  const outcome = useComputed();

  if (!outcome.ok) {
    return <ResultDisplay empty />;
  }

  return (
    <ResultDisplay
      primaryValue={outcome.totalXp}
      primaryLabel={tResult("xpLabel")}
      unit="XP"
      secondaryValues={outcome.secondary}
      recommendation={outcome.recommendation}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────
// Compound wrapper
// ───────────────────────────────────────────────────────────────────────

/**
 * Compound entry-point consumed by `/calculators/weekly-tasks/page.tsx`.
 * The form column is `<WeeklyTasksCalculator />`; the result column reads
 * from the same module-level store via `WeeklyTasksCalculator.Result`.
 */
export function WeeklyTasksCalculator() {
  return <WeeklyTasksForm />;
}

WeeklyTasksCalculator.Result = WeeklyTasksResult;
