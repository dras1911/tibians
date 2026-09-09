"use client";

import * as React from "react";
import { z } from "zod";
import { trueSkill, type LoyaltyBonus } from "@tibians/calc";
import { useFormatter, useTranslations } from "next-intl";

import {
  CalculatorForm,
  CalculatorNumberInput,
  FormField,
  ResultDisplay,
} from "@/components/calculators";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LOYALTY_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;

const formSchema = z.object({
  displayedSkill: z
    .number({ invalid_type_error: "must be number" })
    .int("must be integer")
    .min(0, "must be ≥ 0"),
  loyaltyPct: z.union(
    LOYALTY_OPTIONS.map((v) => z.literal(v)) as [
      z.ZodLiteral<0>,
      z.ZodLiteral<5>,
      z.ZodLiteral<10>,
      z.ZodLiteral<15>,
      z.ZodLiteral<20>,
      z.ZodLiteral<25>,
      z.ZodLiteral<30>,
      z.ZodLiteral<35>,
      z.ZodLiteral<40>,
      z.ZodLiteral<45>,
      z.ZodLiteral<50>,
    ],
  ),
});

interface TrueSkillStoreState {
  displayedSkill: string;
  loyaltyPct: LoyaltyBonus;
}

const initialState: TrueSkillStoreState = {
  displayedSkill: "100",
  loyaltyPct: 5,
};

let state: TrueSkillStoreState = { ...initialState };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): TrueSkillStoreState {
  return state;
}

function getServerSnapshot(): TrueSkillStoreState {
  return initialState;
}

function setDisplayedSkill(value: string): void {
  if (state.displayedSkill === value) return;
  state = { ...state, displayedSkill: value };
  listeners.forEach((l) => l());
}

function setLoyaltyPct(value: LoyaltyBonus): void {
  if (state.loyaltyPct === value) return;
  state = { ...state, loyaltyPct: value };
  listeners.forEach((l) => l());
}

interface TrueSkillComputed {
  ok: true;
  baseSkill: number;
  displayedSkill: number;
  loyaltyPct: LoyaltyBonus;
  loyaltyBonus: number;
}

interface TrueSkillInvalid {
  ok: false;
  fieldErrors: { displayedSkill?: string; loyaltyPct?: string };
}

type TrueSkillOutcome = TrueSkillComputed | TrueSkillInvalid;

function useTrueSkillState(): TrueSkillStoreState {
  return React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
}

function useComputed(): TrueSkillOutcome {
  const tErrors = useTranslations("Calculators.trueSkill.errors");
  const store = useTrueSkillState();
  const numeric = Number(store.displayedSkill);

  const parsed = formSchema.safeParse({
    displayedSkill: numeric,
    loyaltyPct: store.loyaltyPct,
  });

  return React.useMemo<TrueSkillOutcome>(() => {
    if (!parsed.success) {
      const fieldErrors: { displayedSkill?: string; loyaltyPct?: string } = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (path === "displayedSkill") {
          fieldErrors.displayedSkill = tErrors("invalidSkill");
        } else if (path === "loyaltyPct") {
          fieldErrors.loyaltyPct = tErrors("invalidLoyalty");
        }
      }
      return { ok: false, fieldErrors };
    }
    const result = trueSkill(
      parsed.data.displayedSkill,
      parsed.data.loyaltyPct,
    );
    if (!result.ok) {
      return {
        ok: false,
        fieldErrors: { displayedSkill: tErrors("invalidSkill") },
      };
    }
    return {
      ok: true,
      baseSkill: result.value,
      displayedSkill: parsed.data.displayedSkill,
      loyaltyPct: parsed.data.loyaltyPct,
      loyaltyBonus: parsed.data.displayedSkill - result.value,
    };
  }, [parsed, tErrors]);
}

export function TrueSkillForm() {
  const t = useTranslations("Calculators.trueSkill");
  const store = useTrueSkillState();
  const outcome = useComputed();

  const fieldErrors =
    outcome.ok
      ? {}
      : {
          displayedSkill: outcome.fieldErrors.displayedSkill,
          loyaltyPct: outcome.fieldErrors.loyaltyPct,
        };

  return (
    <CalculatorForm aria-label={t("title")}>
      <FormField
        id="displayedSkill"
        label={t("fields.displayedSkill.label")}
        help={t("fields.displayedSkill.help")}
        error={fieldErrors.displayedSkill}
      >
        <CalculatorNumberInput
          min={0}
          max={250}
          step={1}
          value={store.displayedSkill}
          onChange={(event) => setDisplayedSkill(event.target.value)}
          placeholder={t("fields.displayedSkill.placeholder")}
        />
      </FormField>

      <FormField
        id="loyaltyPct"
        label={t("fields.loyaltyPct.label")}
        help={t("fields.loyaltyPct.help")}
        error={fieldErrors.loyaltyPct}
      >
        <Select
          value={String(store.loyaltyPct)}
          onValueChange={(value) => {
            const next = Number(value) as LoyaltyBonus;
            setLoyaltyPct(next);
          }}
        >
          <SelectTrigger id="loyaltyPct">
            <SelectValue placeholder={t("fields.loyaltyPct.placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {LOYALTY_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={String(opt)}>
                {opt}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </CalculatorForm>
  );
}

export function TrueSkillResult() {
  const t = useTranslations("Calculators.trueSkill");
  const format = useFormatter();
  const outcome = useComputed();

  if (!outcome.ok) {
    return <ResultDisplay empty />;
  }

  const { baseSkill, displayedSkill, loyaltyPct, loyaltyBonus } = outcome;

  const recommendation =
    loyaltyPct === 0
      ? {
          tone: "info" as const,
          message: t("recommendations.noLoyalty", {
            value: format.number(displayedSkill, { useGrouping: true }),
          }),
        }
      : {
          tone: "success" as const,
          message: t("recommendations.bazaar", {
            value: format.number(round2(baseSkill), { useGrouping: true }),
            discount: format.number(round2(loyaltyBonus), {
              useGrouping: true,
            }),
          }),
        };

  return (
    <ResultDisplay
      primaryValue={round2(baseSkill)}
      primaryLabel={t("result.baseLabel")}
      unit=""
      secondaryValues={[
        {
          label: t("result.loyaltyBonus"),
          value: round2(loyaltyBonus),
        },
        {
          label: t("result.displayedSkill"),
          value: displayedSkill,
        },
      ]}
      recommendation={recommendation}
    />
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}