"use client";

import * as React from "react";
import { z } from "zod";
import {
  formatDuration,
  timeToTarget,
  xpToTargetFn as xpToTarget,
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

/**
 * `ExperienceCalculator` — interactive form + result for
 * `/calculators/experience` (T19, Experience / Levelling, arch §13).
 *
 * Computes:
 *   - XP delta from `currentLevel` to `targetLevel` (TibiaWiki Experience Table).
 *   - Time required at the given `xpPerHour` (bigint XP → seconds, bigint
 *     math dodges IEEE-754 precision loss for high levels).
 *
 * Architecture:
 *   - Module-level store (`useSyncExternalStore`) so form + result share
 *     state without React context (CalculatorLayout renders them as siblings).
 *   - Zod validates inputs locally before calling the pure formula.
 *
 * Edge cases surfaced via Zod:
 *   - `targetLevel` ≤ currentLevel → validation error (nothing to gain)
 *   - `xpPerHour` ≤ 0 → validation error
 *   - Non-integer values → validation error
 *   - Levels out of Tibia range [0, 2500] → validation error (TibiaWiki cap)
 */

const MAX_TIBIA_LEVEL = 2500;

const formSchema = z.object({
  currentLevel: z
    .number({ invalid_type_error: "invalidCurrent" })
    .int("invalidCurrent")
    .min(0, "invalidCurrent")
    .max(MAX_TIBIA_LEVEL, "invalidCurrent"),
  targetLevel: z
    .number({ invalid_type_error: "invalidTarget" })
    .int("invalidTarget")
    .min(1, "invalidTarget")
    .max(MAX_TIBIA_LEVEL, "invalidTarget"),
  xpPerHour: z
    .number({ invalid_type_error: "invalidRate" })
    .int("invalidRate")
    .min(1, "invalidRate")
    .max(100_000_000, "invalidRate"),
});

interface StoreState {
  currentLevel: string;
  targetLevel: string;
  xpPerHour: string;
}

const initialState: StoreState = {
  currentLevel: "100",
  targetLevel: "101",
  xpPerHour: "250000",
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

interface ExperienceOk {
  ok: true;
  realMinutes: number;
  hoursGained: number;
  primaryLabel: string;
  recommendation: Recommendation;
  secondary: ResultSecondaryValue[];
  /** Per-level XP delta (bigint). Used for "XP to gain" secondary. */
  xpDelta: bigint;
  /** Difference in levels (for "Levels to gain" secondary). */
  levelDelta: number;
}

interface ExperienceErr {
  ok: false;
  fieldErrors: Partial<Record<keyof StoreState, string>>;
}

type ExperienceOutcome = ExperienceOk | ExperienceErr;

function useComputed(): ExperienceOutcome {
  const tErrors = useTranslations("Calculators.experience.errors");
  const tResult = useTranslations("Calculators.experience.result");
  const tRecs = useTranslations("Calculators.experience.recommendations");
  const format = useFormatter();
  const store = useStore();

  return React.useMemo<ExperienceOutcome>(() => {
    const parsed = formSchema.safeParse({
      currentLevel: Number(store.currentLevel),
      targetLevel: Number(store.targetLevel),
      xpPerHour: Number(store.xpPerHour),
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

    const { currentLevel, targetLevel, xpPerHour } = parsed.data;

    // Cross-field: target must be > current (no XP delta otherwise).
    if (targetLevel <= currentLevel) {
      return {
        ok: false,
        fieldErrors: { targetLevel: tErrors("invalidTarget") },
      };
    }

    const xpResult = xpToTarget(currentLevel, targetLevel);
    if (!xpResult.ok) {
      return {
        ok: false,
        fieldErrors: { targetLevel: tErrors("invalidTarget") },
      };
    }

    const xpDelta = xpResult.value;
    const levelDelta = targetLevel - currentLevel;

    const timeResult = timeToTarget(currentLevel, targetLevel, xpPerHour);
    if (!timeResult.ok) {
      return {
        ok: false,
        fieldErrors: { xpPerHour: tErrors("invalidRate") },
      };
    }

    const totalSeconds = timeResult.value.seconds;
    const hoursGained = timeResult.value.hours;

    // Primary: format seconds → "Xd Yh" / "Yh Zmin" / "Zmin"
    const parts = formatDuration(totalSeconds);
    let primaryLabel: string;
    if (parts.hours >= 24) {
      const days = Math.floor(parts.hours / 24);
      const remHours = parts.hours % 24;
      primaryLabel =
        remHours > 0
          ? `${format.number(days, { useGrouping: true })} d ${format.number(remHours, { useGrouping: true })} h`
          : `${format.number(days, { useGrouping: true })} d`;
    } else if (parts.hours > 0) {
      primaryLabel =
        parts.minutes > 0
          ? `${format.number(parts.hours, { useGrouping: true })} h ${format.number(parts.minutes, { useGrouping: true })} min`
          : `${format.number(parts.hours, { useGrouping: true })} h`;
    } else {
      primaryLabel = `${format.number(parts.minutes, { useGrouping: true })} min`;
    }

    // Already at target (xpDelta = 0n): short-circuit
    if (xpDelta === 0n) {
      return {
        ok: true,
        realMinutes: 0,
        hoursGained: 0,
        primaryLabel: primaryLabel || "0",
        recommendation: {
          tone: "info",
          message: tRecs("alreadyThere"),
        },
        secondary: [
          {
            label: tResult("xpDelta"),
            value: "0 XP",
          },
          {
            label: tResult("levelDelta"),
            value: format.number(0, { useGrouping: true }),
          },
        ],
        xpDelta: 0n,
        levelDelta: 0,
      };
    }

    // Recommendation tone: based on hours needed
    let recommendation: Recommendation;
    if (hoursGained < 24) {
      recommendation = {
        tone: "success",
        message: tRecs("underDay"),
      };
    } else if (hoursGained < 24 * 7) {
      recommendation = {
        tone: "info",
        message: tRecs("underWeek"),
      };
    } else {
      recommendation = {
        tone: "warning",
        message: tRecs("longTerm"),
      };
    }

    // Compact XP if huge
    const xpDeltaCompact = xpDelta > 100_000_000n;

    return {
      ok: true,
      realMinutes: totalSeconds / 60,
      hoursGained,
      primaryLabel,
      recommendation,
      secondary: [
        {
          label: tResult("xpDelta"),
          value: xpDeltaCompact
            ? format.number(xpDelta, {
                notation: "compact",
                maximumFractionDigits: 1,
              }) + " XP"
            : `${format.number(xpDelta, { useGrouping: true })} XP`,
        },
        {
          label: tResult("levelDelta"),
          value: format.number(levelDelta, { useGrouping: true }),
        },
        {
          label: tResult("xpPerHour"),
          value: `${format.number(xpPerHour, { useGrouping: true })} /h`,
        },
      ],
      xpDelta,
      levelDelta,
    };
  }, [store, format, tErrors, tResult, tRecs]);
}

// ───────────────────────────────────────────────────────────────────────
// Form column — `<ExperienceForm />`
// ───────────────────────────────────────────────────────────────────────

export function ExperienceForm() {
  const t = useTranslations("Calculators.experience");
  const tFields = useTranslations("Calculators.experience.fields");
  const tErrors = useTranslations("Calculators.experience.errors");
  const store = useStore();
  const outcome = useComputed();

  const fieldErrors = outcome.ok ? {} : outcome.fieldErrors;

  return (
    <CalculatorForm aria-label={t("title")}>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          id="xp-currentLevel"
          label={tFields("currentLevel.label")}
          help={tFields("currentLevel.help")}
          error={fieldErrors.currentLevel}
        >
          <CalculatorNumberInput
            id="xp-currentLevel"
            min={0}
            max={MAX_TIBIA_LEVEL}
            step={1}
            value={store.currentLevel}
            onChange={(event) =>
              patchState({ currentLevel: event.target.value })
            }
            placeholder={tFields("currentLevel.placeholder")}
          />
        </FormField>

        <FormField
          id="xp-targetLevel"
          label={tFields("targetLevel.label")}
          help={tFields("targetLevel.help")}
          error={fieldErrors.targetLevel}
        >
          <CalculatorNumberInput
            id="xp-targetLevel"
            min={1}
            max={MAX_TIBIA_LEVEL}
            step={1}
            value={store.targetLevel}
            onChange={(event) =>
              patchState({ targetLevel: event.target.value })
            }
            placeholder={tFields("targetLevel.placeholder")}
          />
        </FormField>
      </div>

      <FormField
        id="xp-xpPerHour"
        label={tFields("xpPerHour.label")}
        help={tFields("xpPerHour.help")}
        error={fieldErrors.xpPerHour}
      >
        <CalculatorNumberInput
          id="xp-xpPerHour"
          min={1}
          step={1000}
          value={store.xpPerHour}
          onChange={(event) =>
            patchState({ xpPerHour: event.target.value })
          }
          placeholder={tFields("xpPerHour.placeholder")}
        />
      </FormField>

      {/* Hidden helpers (noUnusedLocales) */}
      <span className="sr-only">{tErrors("invalidCurrent")}</span>
    </CalculatorForm>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Result column — `<ExperienceResult />`
// ───────────────────────────────────────────────────────────────────────

export function ExperienceResult() {
  const tResult = useTranslations("Calculators.experience.result");
  const outcome = useComputed();

  if (!outcome.ok) {
    return <ResultDisplay empty />;
  }

  // Primary value: render as a string when formatted (e.g. "12 d 4 h"),
  // otherwise raw minutes count. We always pass the formatted string via
  // primaryLabel + zero numeric to bypass ResultDisplay's format logic.
  return (
    <ResultDisplay
      primaryValue={outcome.primaryLabel}
      primaryLabel={tResult("timeLabel")}
      secondaryValues={outcome.secondary}
      recommendation={outcome.recommendation}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────
// Compound wrapper
// ───────────────────────────────────────────────────────────────────────

/**
 * Compound entry-point consumed by `/calculators/experience/page.tsx`.
 * The form column is `<ExperienceForm />`; the result column reads from
 * the same module-level store via `ExperienceCalculator.Result`.
 */
export function ExperienceCalculator() {
  return <ExperienceForm />;
}

ExperienceCalculator.Result = ExperienceResult;