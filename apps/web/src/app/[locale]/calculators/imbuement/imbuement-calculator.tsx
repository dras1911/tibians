"use client";

import * as React from "react";
import { z } from "zod";
import { imbuementCost, type ImbuementConfig, type ImbuementTier } from "@tibians/calc";
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
 * `ImbuementCalculator` — interactive form + result for
 * `/calculators/imbuement` (T20, arch §2.3, TibiaWiki Imbuing).
 *
 * Reads its thresholds from the `ImbuementConfig` prop (populated
 * server-side via `loadImbuementConfig()` from `getConfig()` / T16).
 * The calc formula `imbuementCost()` in `@tibians/calc` is pure — we
 * just feed it the config resolved at request time.
 *
 * Architecture:
 *   - Module-level event store (`useSyncExternalStore`) so the form and
 *     result columns share state without React context.
 *   - Server renders `<CalculatorLayout>` with two client islands;
 *     `ImbuementCalculator` is the form and `ImbuementCalculator.Result`
 *     is the result — both subscribe to the same store.
 *   - Zod validates inputs locally before calling the pure formula.
 *
 * Form fields:
 *   - `imbuementType` — enum: basic / intricate / powerful (select)
 *   - `level` — informational (nie wpływa na koszt; domyślnie 100)
 *   - `hours` — informational (czas trwania z config; domyślnie 20)
 *
 * Edge cases surfaced via Zod:
 *   - imbuementType spoza enum → validation error
 *   - level / hours non-integer / < 0 → validation error
 */

const formSchema = z.object({
  imbuementType: z.enum(["basic", "intricate", "powerful"], {
    errorMap: () => ({ message: "invalidType" }),
  }),
  level: z
    .number({ invalid_type_error: "invalidLevel" })
    .int("invalidLevel")
    .min(0, "invalidLevel"),
  hours: z
    .number({ invalid_type_error: "invalidHours" })
    .int("invalidHours")
    .min(0, "invalidHours"),
});

interface StoreState {
  imbuementType: ImbuementTier;
  level: string;
  hours: string;
}

interface ImbuementCalculatorProps {
  /**
   * Resolved `ImbuementConfig` from server (T16 `getConfig` + seed fallback).
   * Contains slot TC costs, fee gp per tier, and duration hours.
   */
  config: ImbuementConfig;
}

const initialState: StoreState = {
  imbuementType: "basic",
  level: "100",
  hours: "20",
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

interface ImbuementOk {
  ok: true;
  tier: ImbuementTier;
  slotCostTc: number;
  feeGp: number;
  totalCostTc: number;
  durationHours: number;
  primaryLabel: string;
  recommendation: Recommendation;
  secondary: ResultSecondaryValue[];
}

interface ImbuementErr {
  ok: false;
  fieldErrors: Partial<Record<keyof StoreState, string>>;
}

type ImbuementOutcome = ImbuementOk | ImbuementErr;

function useComputed(
  config: ImbuementConfig,
  tErrors: ReturnType<typeof useTranslations>,
): ImbuementOutcome {
  const tResult = useTranslations("Calculators.imbuement.result");
  const tRecs = useTranslations("Calculators.imbuement.recommendations");
  const tTiers = useTranslations("Calculators.imbuement.tiers");
  const format = useFormatter();
  const store = useStore();

  return React.useMemo<ImbuementOutcome>(() => {
    const parsed = formSchema.safeParse({
      imbuementType: store.imbuementType,
      level: Number(store.level),
      hours: Number(store.hours),
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

    const { imbuementType } = parsed.data;
    const calc = imbuementCost(imbuementType, config);
    if (!calc.ok) {
      return {
        ok: false,
        fieldErrors: { imbuementType: tErrors("invalidType") },
      };
    }

    const { slotCostTc, feeGp, totalCostTc, durationHours } = calc.value;

    // Tone per tier (per task spec T20 — rekomendacja słowna):
    //   - basic     → info (standard tier)
    //   - intricate → info (medium tier)
    //   - powerful  → success (top tier — worth it)
    let recommendation: Recommendation;
    let primaryLabel: string;
    if (imbuementType === "powerful") {
      recommendation = {
        tone: "success",
        message: tRecs("powerful", {
          slot: format.number(slotCostTc, { useGrouping: true }),
          fee: format.number(feeGp, { useGrouping: true }),
        }),
      };
      primaryLabel = tResult("totalCostTc");
    } else if (imbuementType === "intricate") {
      recommendation = {
        tone: "info",
        message: tRecs("intricate", {
          fee: format.number(feeGp, { useGrouping: true }),
        }),
      };
      primaryLabel = tResult("totalCostTc");
    } else {
      recommendation = {
        tone: "info",
        message: tRecs("basic", {
          slot: format.number(slotCostTc, { useGrouping: true }),
          fee: format.number(feeGp, { useGrouping: true }),
        }),
      };
      primaryLabel = tResult("totalCostTc");
    }

    return {
      ok: true,
      tier: imbuementType,
      slotCostTc,
      feeGp,
      totalCostTc,
      durationHours,
      primaryLabel,
      recommendation,
      secondary: [
        {
          label: tResult("slotCost"),
          value: `${format.number(slotCostTc, { useGrouping: true })} TC`,
        },
        {
          label: tResult("fee"),
          value: `${format.number(feeGp, { useGrouping: true })} gp`,
        },
        {
          label: tResult("duration"),
          value: `${format.number(durationHours, { useGrouping: true })} h`,
        },
        {
          label: tResult("tier"),
          value: tTiers(imbuementType),
        },
      ],
    };
  }, [store, config, format, tErrors, tResult, tRecs, tTiers]);
}

// ───────────────────────────────────────────────────────────────────────
// Form column — `<ImbuementForm />`
// ───────────────────────────────────────────────────────────────────────

export function ImbuementForm({ config }: ImbuementCalculatorProps) {
  const t = useTranslations("Calculators.imbuement");
  const tFields = useTranslations("Calculators.imbuement.fields");
  const tErrors = useTranslations("Calculators.imbuement.errors");
  const tTiers = useTranslations("Calculators.imbuement.tiers");
  const store = useStore();
  const outcome = useComputed(config, tErrors);

  const fieldErrors = outcome.ok ? {} : outcome.fieldErrors;

  return (
    <CalculatorForm aria-label={t("title")}>
      <FormField
        id="imb-type"
        label={tFields("imbuementType.label")}
        help={tFields("imbuementType.help")}
        error={fieldErrors.imbuementType}
      >
        <Select
          value={store.imbuementType}
          onValueChange={(value) => {
            patchState({ imbuementType: value as ImbuementTier });
          }}
        >
          <SelectTrigger id="imb-type">
            <SelectValue placeholder={tFields("imbuementType.placeholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="basic">{tTiers("basic")}</SelectItem>
            <SelectItem value="intricate">{tTiers("intricate")}</SelectItem>
            <SelectItem value="powerful">{tTiers("powerful")}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          id="imb-level"
          label={tFields("level.label")}
          help={tFields("level.help")}
          error={fieldErrors.level}
        >
          <CalculatorNumberInput
            id="imb-level"
            min={0}
            step={1}
            value={store.level}
            onChange={(event) => patchState({ level: event.target.value })}
            placeholder={tFields("level.placeholder")}
          />
        </FormField>

        <FormField
          id="imb-hours"
          label={tFields("hours.label")}
          help={tFields("hours.help")}
          error={fieldErrors.hours}
        >
          <CalculatorNumberInput
            id="imb-hours"
            min={0}
            step={1}
            value={store.hours}
            onChange={(event) => patchState({ hours: event.target.value })}
            placeholder={tFields("hours.placeholder")}
          />
        </FormField>
      </div>

      {/* Hidden helpers (noUnusedLocales) */}
      <span className="sr-only">{tErrors("invalidType")}</span>
    </CalculatorForm>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Result column — `<ImbuementResult />`
// ───────────────────────────────────────────────────────────────────────

export function ImbuementResult({ config }: ImbuementCalculatorProps) {
  const tErrors = useTranslations("Calculators.imbuement.errors");
  const outcome = useComputed(config, tErrors);

  if (!outcome.ok) {
    return <ResultDisplay empty />;
  }

  return (
    <ResultDisplay
      primaryValue={outcome.totalCostTc}
      unit="TC"
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
 * Compound entry-point consumed by `/calculators/imbuement/page.tsx`.
 * The form column is `<ImbuementForm />`; the result column reads from
 * the same module-level store via `ImbuementCalculator.Result`.
 *
 * `config` is resolved server-side via `loadImbuementConfig()` (T16
 * `getConfig` with seed defaults as fallback when DB is unavailable).
 */
export function ImbuementCalculator({ config }: ImbuementCalculatorProps) {
  return <ImbuementForm config={config} />;
}

ImbuementCalculator.Result = ImbuementResult;