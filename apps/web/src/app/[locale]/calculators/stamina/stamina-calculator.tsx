"use client";

import * as React from "react";
import { z } from "zod";
import { formatDuration, staminaRegen, type StaminaConfig } from "@tibians/calc";
import { useFormatter, useTranslations } from "next-intl";

import {
  CalculatorForm,
  CalculatorNumberInput,
  FormField,
  ResultDisplay,
  type Recommendation,
  type ResultSecondaryValue,
} from "@/components/calculators";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * `StaminaCalculator` — interactive form + result for `/calculators/stamina`
 * (T18, Stamina regen calculator, arch §2.1).
 *
 * Reads its thresholds from the `StaminaConfig` prop (populated server-side
 * via `loadStaminaConfig()` from `getConfig()` / T16). The calc formula
 * `staminaRegen()` in `@tibians/calc` is pure — we just feed it the config
 * resolved at request time.
 *
 * Architecture:
 *   - Module-level event store (`useSyncExternalStore`) so the form and
 *     result columns share state without React context.
 *   - Server renders `<CalculatorLayout>` with two client islands;
 *     `StaminaCalculator` is the form and `StaminaCalculator.Result` is
 *     the result — both subscribe to the same store.
 *   - Zod validates inputs locally before calling the pure formula.
 *   - Switch toggles between Premium (max 42h + green zone) and Free
 *     (max 40h, no green zone).
 *
 * Edge cases surfaced via Zod:
 *   - `currentStamina` > max → clamped server-side, banner w UI
 *   - `targetStamina` < current → validation error
 *   - Negative / non-integer values → validation error
 */

const formSchema = z.object({
  currentStamina: z
    .number({ invalid_type_error: "invalidCurrent" })
    .int("invalidCurrent")
    .min(0, "invalidCurrent"),
  targetStamina: z
    .number({ invalid_type_error: "invalidTarget" })
    .int("invalidTarget")
    .min(0, "invalidTarget"),
  isPremium: z.boolean(),
});

interface StoreState {
  currentStamina: string;
  targetStamina: string;
  isPremium: boolean;
}

interface StaminaCalculatorProps {
  /**
   * Resolved `StaminaConfig` from server (T16 `getConfig` + seed fallback).
   * `maxStaminaHours` is the Premium cap (42h); Free accounts clamp to 40h.
   */
  config: StaminaConfig;
}

const initialState: StoreState = {
  currentStamina: "36",
  targetStamina: "42",
  isPremium: true,
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

interface StaminaOk {
  ok: true;
  realMinutes: number;
  hoursGained: number;
  primaryLabel: string;
  recommendation: Recommendation;
  secondary: ResultSecondaryValue[];
  /**
   * Computed-effective `maxStaminaHours` for the active account (premium 42
   * or free 40). Used by validation messages and the empty state.
   */
  maxForAccount: number;
  /** Per-segment breakdown (normal / green) for the secondary card. */
  zones: readonly { zone: "normal" | "green"; hours: number }[];
}

interface StaminaErr {
  ok: false;
  fieldErrors: Partial<Record<keyof StoreState, string>>;
}

type StaminaOutcome = StaminaOk | StaminaErr;

function useComputed(
  config: StaminaConfig,
  tErrors: ReturnType<typeof useTranslations>,
): StaminaOutcome {
  const tResult = useTranslations("Calculators.stamina.result");
  const tRecs = useTranslations("Calculators.stamina.recommendations");
  const tZones = useTranslations("Calculators.stamina.zones");
  const format = useFormatter();
  const store = useStore();

  // Free account → max stamina is 40h, green zone inactive.
  const maxForAccount = store.isPremium
    ? config.maxStaminaHours
    : Math.min(config.maxStaminaHours, 40);

  return React.useMemo<StaminaOutcome>(() => {
    const parsed = formSchema.safeParse({
      currentStamina: Number(store.currentStamina),
      targetStamina: Number(store.targetStamina),
      isPremium: store.isPremium,
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

    const current = parsed.data.currentStamina;
    const target = parsed.data.targetStamina;

    // Cross-field: target must be > current
    if (target <= current) {
      return {
        ok: false,
        fieldErrors: { targetStamina: tErrors("invalidTarget", { max: maxForAccount }) },
      };
    }

    // Cross-field: target clamped to maxForAccount
    if (target > maxForAccount) {
      return {
        ok: false,
        fieldErrors: { targetStamina: tErrors("invalidTarget", { max: maxForAccount }) },
      };
    }

    // Build effective config (free → max 40h, green zone off)
    const effectiveConfig: StaminaConfig = store.isPremium
      ? config
      : { ...config, maxStaminaHours: maxForAccount };

    const calc = staminaRegen(current, target, store.isPremium, effectiveConfig);
    if (!calc.ok) {
      return {
        ok: false,
        fieldErrors: { targetStamina: tErrors("invalidTarget", { max: maxForAccount }) },
      };
    }

    const { realMinutes, hoursGained, segments } = calc.value;

    // Already-full short-circuit: empty state + "already full" recommendation
    if (hoursGained === 0) {
      return {
        ok: true,
        realMinutes: 0,
        hoursGained: 0,
        maxForAccount,
        primaryLabel: tResult("alreadyFull"),
        recommendation: {
          tone: "info",
          message: tRecs("full", {
            value: format.number(current, { useGrouping: true }),
          }),
        },
        secondary: [
          {
            label: tResult("fromTo"),
            value: `${format.number(current, { useGrouping: true })} → ${format.number(target, { useGrouping: true })} (max ${format.number(maxForAccount, { useGrouping: true })} h)`,
          },
        ],
        zones: [],
      };
    }

    // Format primary value: "X h Y min"
    const totalSeconds = realMinutes * 60;
    const parts = formatDuration(totalSeconds);
    const realTimeLabel =
      parts.hours > 0
        ? `${format.number(parts.hours, { useGrouping: true })} h ${format.number(parts.minutes, { useGrouping: true })} min`
        : `${format.number(parts.minutes, { useGrouping: true })} min`;

    const zones = segments.map((s) => ({ zone: s.zone, hours: s.hours }));

    // Recommendation: depends on isPremium + whether green zone active
    let recommendation: Recommendation;
    if (store.isPremium) {
      const hasGreen = segments.some((s) => s.zone === "green");
      recommendation = hasGreen
        ? {
            tone: "info",
            message: tRecs("withGreen", {
              normalRate: format.number(config.regenMinutesPerHour, { useGrouping: true }),
              greenRate: format.number(config.regenMinutesPerHourGreenZone, {
                useGrouping: true,
              }),
            }),
          }
        : {
            tone: "info",
            message: tRecs("premiumNormal", {
              rate: format.number(config.regenMinutesPerHour, { useGrouping: true }),
            }),
          };
    } else {
      recommendation = {
        tone: "info",
        message: tRecs("free", {
          rate: format.number(config.regenMinutesPerHour, { useGrouping: true }),
        }),
      };
    }

    return {
      ok: true,
      realMinutes,
      hoursGained,
      maxForAccount,
      primaryLabel: realTimeLabel,
      recommendation,
      secondary: [
        {
          label: tResult("hoursGained"),
          value: `${format.number(hoursGained, { useGrouping: true })} h`,
        },
        {
          label: tResult("zones"),
          value: zones
            .map((z) =>
              z.zone === "green"
                ? tZones("green", { hours: format.number(z.hours, { useGrouping: true }) })
                : tZones("normal", { hours: format.number(z.hours, { useGrouping: true }) }),
            )
            .join(" + "),
        },
        {
          label: tResult("fromTo"),
          value: `${format.number(current, { useGrouping: true })} → ${format.number(target, { useGrouping: true })} (max ${format.number(maxForAccount, { useGrouping: true })} h)`,
        },
      ],
      zones,
    };
  }, [store, config, maxForAccount, format, tErrors, tResult, tRecs, tZones]);
}

// ───────────────────────────────────────────────────────────────────────
// Form column — `<StaminaForm />`
// ───────────────────────────────────────────────────────────────────────

export function StaminaForm({ config }: StaminaCalculatorProps) {
  const t = useTranslations("Calculators.stamina");
  const tFields = useTranslations("Calculators.stamina.fields");
  const tErrors = useTranslations("Calculators.stamina.errors");
  const store = useStore();
  const outcome = useComputed(config, tErrors);

  const fieldErrors = outcome.ok ? {} : outcome.fieldErrors;

  // Effective max for placeholder/help (Premium → 42, Free → 40)
  const maxForAccount = store.isPremium
    ? config.maxStaminaHours
    : Math.min(config.maxStaminaHours, 40);

  return (
    <CalculatorForm aria-label={t("title")}>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          id="st-currentStamina"
          label={tFields("currentStamina.label")}
          help={tFields("currentStamina.help")}
          error={fieldErrors.currentStamina}
        >
          <CalculatorNumberInput
            id="st-currentStamina"
            min={0}
            max={maxForAccount}
            step={1}
            value={store.currentStamina}
            onChange={(event) =>
              patchState({ currentStamina: event.target.value })
            }
            placeholder={tFields("currentStamina.placeholder")}
          />
        </FormField>

        <FormField
          id="st-targetStamina"
          label={tFields("targetStamina.label")}
          help={tFields("targetStamina.help", {
            max: maxForAccount,
          })}
          error={fieldErrors.targetStamina}
        >
          <CalculatorNumberInput
            id="st-targetStamina"
            min={0}
            max={maxForAccount}
            step={1}
            value={store.targetStamina}
            onChange={(event) =>
              patchState({ targetStamina: event.target.value })
            }
            placeholder={String(maxForAccount)}
          />
        </FormField>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
        <div className="space-y-1">
          <Label
            htmlFor="st-isPremium"
            className="text-sm font-medium"
          >
            {store.isPremium
              ? tFields("isPremium.premium")
              : tFields("isPremium.free")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {tFields("isPremium.help")}
          </p>
        </div>
        <Switch
          id="st-isPremium"
          checked={store.isPremium}
          onCheckedChange={(checked) => patchState({ isPremium: checked })}
          aria-label={tFields("isPremium.ariaLabel")}
        />
      </div>

      {/* Hidden helpers (noUnusedLocales) */}
      <span className="sr-only">{tErrors("invalidCurrent")}</span>
    </CalculatorForm>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Result column — `<StaminaResult />`
// ───────────────────────────────────────────────────────────────────────

export function StaminaResult({ config }: StaminaCalculatorProps) {
  const tResult = useTranslations("Calculators.stamina.result");
  const tErrors = useTranslations("Calculators.stamina.errors");
  const outcome = useComputed(config, tErrors);

  if (!outcome.ok) {
    return <ResultDisplay empty />;
  }

  return (
    <ResultDisplay
      primaryValue={outcome.hoursGained === 0 ? 0 : outcome.realMinutes}
      unit={outcome.hoursGained === 0 ? "" : "min"}
      primaryLabel={
        outcome.hoursGained === 0
          ? tResult("doneLabel")
          : tResult("realTimeLabel")
      }
      secondaryValues={outcome.secondary}
      recommendation={outcome.recommendation}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────
// Compound wrapper
// ───────────────────────────────────────────────────────────────────────

/**
 * Compound entry-point consumed by `/calculators/stamina/page.tsx`.
 * The form column is `<StaminaForm />`; the result column reads from the
 * same module-level store via `StaminaCalculator.Result`.
 *
 * `config` is resolved server-side via `loadStaminaConfig()` (T16 `getConfig`
 * with seed defaults as fallback when DB is unavailable).
 */
export function StaminaCalculator({ config }: StaminaCalculatorProps) {
  return <StaminaForm config={config} />;
}

StaminaCalculator.Result = StaminaResult;