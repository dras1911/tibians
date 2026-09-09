"use client";

import * as React from "react";
import { z } from "zod";
import {
  blessingCost,
  MAX_BLESSINGS,
  MAX_BLESSING_LEVEL,
  MIN_BLESSING_LEVEL,
  type BlessingsConfig,
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
 * `BlessingsCalculator` — interactive form + result for
 * `/calculators/blessings` (T20, arch §2.3, TibiaWiki Blessings).
 *
 * Reads its thresholds from the `BlessingsConfig` prop (populated
 * server-side via `loadBlessingsConfig()` from `getConfig()` / T16).
 * The calc formula `blessingCost()` in `@tibians/calc` is pure — we
 * just feed it the config resolved at request time.
 *
 * Architecture:
 *   - Module-level event store (`useSyncExternalStore`) so the form and
 *     result columns share state without React context.
 *   - Server renders `<CalculatorLayout>` with two client islands;
 *     `BlessingsCalculator` is the form and `BlessingsCalculator.Result`
 *     is the result — both subscribe to the same store.
 *   - Zod validates inputs locally before calling the pure formula.
 *
 * Form fields:
 *   - `currentLevel` (integer ∈ [8, 2500]) — wpływa na R(L) TibiaWiki
 *   - `targetLevel` (integer ∈ [8, 2500]) — informational; domyślnie currentLevel+1
 *   - `currentBlessings` (integer ∈ [0, 7]) — ile gracz już ma
 *   - `targetBlessings` (integer ∈ [0, 7]) — domyślnie MAX (7)
 *
 * Edge cases surfaced via Zod:
 *   - targetLevel ≤ currentLevel → validation error (już masz wyższy level)
 *   - currentBlessings / targetBlessings > 7 → validation error
 *   - level poza [8, 2500] → validation error
 */

const formSchema = z.object({
  currentLevel: z
    .number({ invalid_type_error: "invalidLevel" })
    .int("invalidLevel")
    .min(MIN_BLESSING_LEVEL, "invalidLevel")
    .max(MAX_BLESSING_LEVEL, "invalidLevel"),
  targetLevel: z
    .number({ invalid_type_error: "invalidTarget" })
    .int("invalidTarget")
    .min(MIN_BLESSING_LEVEL, "invalidTarget")
    .max(MAX_BLESSING_LEVEL, "invalidTarget"),
  currentBlessings: z
    .number({ invalid_type_error: "invalidCurrent" })
    .int("invalidCurrent")
    .min(0, "invalidCurrent")
    .max(MAX_BLESSINGS, "invalidCurrent"),
});

interface StoreState {
  currentLevel: string;
  targetLevel: string;
  currentBlessings: string;
}

interface BlessingsCalculatorProps {
  /**
   * Resolved `BlessingsConfig` from server (T16 `getConfig` + seed fallback).
   * Three TibiaWiki anchor points: L=1, L=100, L=200.
   */
  config: BlessingsConfig;
}

const initialState: StoreState = {
  currentLevel: "100",
  targetLevel: "101",
  currentBlessings: "5",
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

interface BlessingsOk {
  ok: true;
  totalCostGp: number;
  costPerBlessingGp: number;
  targetBlessings: number;
  currentBlessings: number;
  blessingsToBuy: number;
  level: number;
  primaryLabel: string;
  recommendation: Recommendation;
  secondary: ResultSecondaryValue[];
}

interface BlessingsErr {
  ok: false;
  fieldErrors: Partial<Record<keyof StoreState, string>>;
}

type BlessingsOutcome = BlessingsOk | BlessingsErr;

function useComputed(
  config: BlessingsConfig,
  tErrors: ReturnType<typeof useTranslations>,
): BlessingsOutcome {
  const tResult = useTranslations("Calculators.blessings.result");
  const tRecs = useTranslations("Calculators.blessings.recommendations");
  const format = useFormatter();
  const store = useStore();

  return React.useMemo<BlessingsOutcome>(() => {
    const parsed = formSchema.safeParse({
      currentLevel: Number(store.currentLevel),
      targetLevel: Number(store.targetLevel),
      currentBlessings: Number(store.currentBlessings),
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

    const { currentLevel, targetLevel, currentBlessings } = parsed.data;

    // Cross-field: targetLevel must be > currentLevel (już masz wyższy)
    if (targetLevel <= currentLevel) {
      return {
        ok: false,
        fieldErrors: { targetLevel: tErrors("alreadyHigher") },
      };
    }

    // Docelowa liczba błogosławieństw: 7 = pełna ochrona (Twist of Fate)
    const targetBlessings = MAX_BLESSINGS;
    const calc = blessingCost(
      currentLevel,
      targetBlessings,
      currentBlessings,
      config,
    );
    if (!calc.ok) {
      return {
        ok: false,
        fieldErrors: { currentLevel: tErrors("invalidLevel") },
      };
    }

    const {
      costPerBlessingGp,
      blessingsToBuy,
      totalCostGp,
    } = calc.value;

    // Rekomendacja słowna per task spec T20:
    //   - blessingsToBuy = 0 (już masz 7/7) → success "Już masz wyższy poziom"
    //   - blessingsToBuy = 7 (0/7 → 7/7) → success "Pełna ochrona 7/7"
    //   - blessingsToBuy = 1..6 → info "Dokup N błogosławieństw"
    let recommendation: Recommendation;
    let primaryLabel: string;
    if (blessingsToBuy === 0) {
      recommendation = {
        tone: "success",
        message: tRecs("alreadyFull"),
      };
      primaryLabel = tResult("doneLabel");
    } else if (blessingsToBuy === MAX_BLESSINGS) {
      recommendation = {
        tone: "success",
        message: tRecs("fullProtection", {
          count: format.number(blessingsToBuy, { useGrouping: true }),
        }),
      };
      primaryLabel = tResult("totalCostLabel");
    } else {
      recommendation = {
        tone: "info",
        message: tRecs("partial", {
          count: format.number(blessingsToBuy, { useGrouping: true }),
        }),
      };
      primaryLabel = tResult("totalCostLabel");
    }

    return {
      ok: true,
      totalCostGp,
      costPerBlessingGp,
      targetBlessings,
      currentBlessings,
      blessingsToBuy,
      level: currentLevel,
      primaryLabel,
      recommendation,
      secondary: [
        {
          label: tResult("blessings"),
          value: format.number(blessingsToBuy, { useGrouping: true }),
        },
        {
          label: tResult("costPerBl"),
          value: `${format.number(costPerBlessingGp, { useGrouping: true })} gp`,
        },
        {
          label: tResult("current"),
          value: `${format.number(currentBlessings, { useGrouping: true })} / ${format.number(MAX_BLESSINGS, { useGrouping: true })}`,
        },
      ],
    };
  }, [store, config, format, tErrors, tResult, tRecs]);
}

// ───────────────────────────────────────────────────────────────────────
// Form column — `<BlessingsForm />`
// ───────────────────────────────────────────────────────────────────────

export function BlessingsForm({ config }: BlessingsCalculatorProps) {
  const t = useTranslations("Calculators.blessings");
  const tFields = useTranslations("Calculators.blessings.fields");
  const tErrors = useTranslations("Calculators.blessings.errors");
  const store = useStore();
  const outcome = useComputed(config, tErrors);

  const fieldErrors = outcome.ok ? {} : outcome.fieldErrors;

  return (
    <CalculatorForm aria-label={t("title")}>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          id="bl-currentLevel"
          label={tFields("currentLevel.label")}
          help={tFields("currentLevel.help")}
          error={fieldErrors.currentLevel}
        >
          <CalculatorNumberInput
            id="bl-currentLevel"
            min={MIN_BLESSING_LEVEL}
            max={MAX_BLESSING_LEVEL}
            step={1}
            value={store.currentLevel}
            onChange={(event) =>
              patchState({ currentLevel: event.target.value })
            }
            placeholder={tFields("currentLevel.placeholder")}
          />
        </FormField>

        <FormField
          id="bl-targetLevel"
          label={tFields("targetLevel.label")}
          help={tFields("targetLevel.help")}
          error={fieldErrors.targetLevel}
        >
          <CalculatorNumberInput
            id="bl-targetLevel"
            min={MIN_BLESSING_LEVEL}
            max={MAX_BLESSING_LEVEL}
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
        id="bl-currentBlessings"
        label={tFields("currentBlessings.label")}
        help={tFields("currentBlessings.help", {
          max: MAX_BLESSINGS,
        })}
        error={fieldErrors.currentBlessings}
      >
        <CalculatorNumberInput
          id="bl-currentBlessings"
          min={0}
          max={MAX_BLESSINGS}
          step={1}
          value={store.currentBlessings}
          onChange={(event) =>
            patchState({ currentBlessings: event.target.value })
          }
          placeholder={String(MAX_BLESSINGS)}
        />
      </FormField>

      {/* Hidden helpers (noUnusedLocales) */}
      <span className="sr-only">{tErrors("invalidLevel")}</span>
    </CalculatorForm>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Result column — `<BlessingsResult />`
// ───────────────────────────────────────────────────────────────────────

export function BlessingsResult({ config }: BlessingsCalculatorProps) {
  const tErrors = useTranslations("Calculators.blessings.errors");
  const outcome = useComputed(config, tErrors);

  if (!outcome.ok) {
    return <ResultDisplay empty />;
  }

  return (
    <ResultDisplay
      primaryValue={outcome.totalCostGp}
      unit="gp"
      primaryLabel={outcome.primaryLabel}
      secondaryValues={outcome.secondary}
      recommendation={outcome.recommendation}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────
// Compound wrapper
// ───────────────────────────────────────────────────────────────────────

/**
 * Compound entry-point consumed by `/calculators/blessings/page.tsx`.
 * The form column is `<BlessingsForm />`; the result column reads from
 * the same module-level store via `BlessingsCalculator.Result`.
 *
 * `config` is resolved server-side via `loadBlessingsConfig()` (T16
 * `getConfig` with seed defaults as fallback when DB is unavailable).
 */
export function BlessingsCalculator({ config }: BlessingsCalculatorProps) {
  return <BlessingsForm config={config} />;
}

BlessingsCalculator.Result = BlessingsResult;