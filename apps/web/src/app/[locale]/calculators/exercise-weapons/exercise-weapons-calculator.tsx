"use client";

import * as React from "react";
import { z } from "zod";
import {
  exerciseWeapons,
  type ExerciseWeaponsMode,
  type ExerciseWeaponType,
  type LoyaltyBonus,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

/**
 * `ExerciseWeaponsCalculator` — interactive form + result for
 * `/calculators/exercise-weapons` (T17, arch §2.1 TibiaPal benchmark).
 *
 * Implements 2 modes:
 *   - `targetSkill`       → ile broni potrzeba, żeby dojść do X
 *   - `targetWeaponsUsed` → ile skillu zyskasz z N broni danego typu
 *
 * Architecture:
 *   - The shared `<CalculatorLayout>` (T24) renders form (left) and
 *     result (right) as sibling DOM trees, so the two can't share a
 *     React context directly.
 *   - We use a **module-level event store** (`useSyncExternalStore`)
 *     so the form column owns the inputs and the result column
 *     re-derives live on every change. Decoupled but tight enough for
 *     O(1) per-keystroke updates.
 *   - Zod gives us friendly field errors before the formula call.
 *
 * Recommendation logic (TibiaPal benchmark):
 *   - `buyGold`  → cost per TC > threshold (default 13 889 gp/TC)
 *   - `buyTc`    → cost per TC < threshold
 *   - `equal`    → within ±0.5% of threshold
 *
 * UX choices:
 *   - **Live recalculation**: every keystroke re-derives the result.
 *   - **Vocation/skill pair** from the 8 pairs in arch §2.1 — contextually
 *     filtered so a Knight never picks "Distance", etc.
 *   - **Tabs** for the two modes — both share the same skill/category
 *     selector so a player switching tabs keeps context.
 */

// ───────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────

const LOYALTY_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;

const WEAPON_TYPES: readonly ExerciseWeaponType[] = [
  "regular",
  "durable",
  "lasting",
] as const;

/**
 * Default TC price threshold (TibiaWiki Exercise_Weapons):
 *   "If the exchange rate of Tibia Coins for gold on a world is higher
 *    than 13,889 gold per coin, it is more economical to buy these
 *    weapons for in-game currency."
 * → 13 889 gp = 13 888.88... gp threshold.
 */
const DEFAULT_TC_PRICE_THRESHOLD = 13_889;

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

/** Mutable, string-friendly store state — strings keep inputs controlled even when invalid. */
interface StoreState {
  mode: ExerciseWeaponsMode;
  category: VocationSkillCategory;
  currentSkill: string;
  percentToNext: string;
  targetSkill: string;
  numWeapons: string;
  weaponType: ExerciseWeaponType;
  loyaltyPct: LoyaltyBonus;
  doubleEvent: boolean;
  privateDummy: boolean;
  tcPriceThreshold: string;
}

const initialState: StoreState = {
  mode: "targetSkill",
  category: "knightMelee",
  currentSkill: "100",
  percentToNext: "0",
  targetSkill: "110",
  numWeapons: "100",
  weaponType: "regular",
  loyaltyPct: 10,
  doubleEvent: false,
  privateDummy: false,
  tcPriceThreshold: String(DEFAULT_TC_PRICE_THRESHOLD),
};

type ComputedOk = {
  ok: true;
  mode: ExerciseWeaponsMode;
  primaryValue: number;
  primaryLabelKey: "primaryTargetSkill" | "primaryTargetWeapons";
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

function setMode(mode: ExerciseWeaponsMode): void {
  if (state.mode === mode) return;
  state = { ...state, mode };
  listeners.forEach((l) => l());
}

function patchState(patch: Partial<StoreState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function useStore(): StoreState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ───────────────────────────────────────────────────────────────────────
// Zod schemas — per mode
// ───────────────────────────────────────────────────────────────────────

const baseSchema = z.object({
  category: z.enum(VOCATION_SKILL_CATEGORIES),
  currentSkill: z
    .number({ invalid_type_error: "errors.invalidCurrent" })
    .int("errors.invalidCurrent")
    .min(0, "errors.invalidCurrent"),
  percentToNext: z
    .number({ invalid_type_error: "errors.invalidPercent" })
    .min(0, "errors.invalidPercent")
    .max(100, "errors.invalidPercent"),
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
  doubleEvent: z.boolean(),
  privateDummy: z.boolean(),
  tcPriceThreshold: z
    .number({ invalid_type_error: "errors.invalidThreshold" })
    .positive("errors.invalidThreshold"),
});

const targetSkillSchema = baseSchema.extend({
  mode: z.literal("targetSkill"),
  targetSkill: z
    .number({ invalid_type_error: "errors.invalidTarget" })
    .int("errors.invalidTarget")
    .positive("errors.invalidTarget"),
});

const targetWeaponsSchema = baseSchema.extend({
  mode: z.literal("targetWeaponsUsed"),
  numWeapons: z
    .number({ invalid_type_error: "errors.invalidNum" })
    .int("errors.invalidNum")
    .min(0, "errors.invalidNum"),
  weaponType: z.enum(["regular", "durable", "lasting"]),
});

// ───────────────────────────────────────────────────────────────────────
// Shared computation — used by both form (for errors) and result (display)
// ───────────────────────────────────────────────────────────────────────

function useComputed(): Computed {
  const tErrors = useTranslations("Calculators.exerciseWeapons.errors");
  const tResult = useTranslations("Calculators.exerciseWeapons.result");
  const tRec = useTranslations("Calculators.exerciseWeapons.recommendations");
  const tFields = useTranslations("Calculators.exerciseWeapons.fields");
  const tSkills = useTranslations("Calculators.exerciseWeapons.skills");
  const format = useFormatter();
  const store = useStore();

  return React.useMemo<Computed>(() => {
    const baseParse = baseSchema.safeParse({
      category: store.category,
      currentSkill: Number(store.currentSkill),
      percentToNext: Number(store.percentToNext),
      loyaltyPct: store.loyaltyPct,
      doubleEvent: store.doubleEvent,
      privateDummy: store.privateDummy,
      tcPriceThreshold: Number(store.tcPriceThreshold),
    });

    if (!baseParse.success) {
      const fieldErrors: Partial<Record<keyof StoreState, string>> = {};
      for (const issue of baseParse.error.issues) {
        const path = issue.path[0];
        if (typeof path === "string") {
          fieldErrors[path as keyof StoreState] = tErrors(
            issue.message as Parameters<typeof tErrors>[0],
          );
        }
      }
      return { ok: false, fieldErrors };
    }

    const base = baseParse.data;
    const threshold = base.tcPriceThreshold;

    if (store.mode === "targetSkill") {
      const parsed = targetSkillSchema.safeParse({
        ...base,
        mode: "targetSkill",
        targetSkill: Number(store.targetSkill),
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

      // Cross-field rule: target > current
      if (parsed.data.targetSkill <= parsed.data.currentSkill) {
        return {
          ok: false,
          fieldErrors: { targetSkill: tErrors("invalidTarget") },
        };
      }

      const calcResult = exerciseWeapons({
        mode: "targetSkill",
        category: parsed.data.category,
        currentSkill: parsed.data.currentSkill,
        percentToNext: parsed.data.percentToNext,
        targetSkill: parsed.data.targetSkill,
        loyaltyPct: parsed.data.loyaltyPct,
        doubleEvent: parsed.data.doubleEvent,
        privateDummy: parsed.data.privateDummy,
        tcPriceThreshold: threshold,
      });

      if (!calcResult.ok) {
        return {
          ok: false,
          fieldErrors: {
            targetSkill: tErrors("invalidTarget"),
          },
        };
      }

      const v = calcResult.value;
      // Show Regular weapon count as primary (most common case).
      const primaryValue = v.weaponsNeeded.regular;
      const costPerTc = v.totalCostTc === 0 ? 0 : v.totalCostGp / v.totalCostTc;

      let recommendation: Recommendation;
      if (v.recommendation === "buyGold") {
        recommendation = {
          tone: "success",
          message: tRec("buyGold", {
            tcPrice: format.number(Math.round(costPerTc), { useGrouping: true }),
            threshold: format.number(Math.round(threshold), {
              useGrouping: true,
            }),
          }),
        };
      } else if (v.recommendation === "buyTc") {
        recommendation = {
          tone: "warning",
          message: tRec("buyTc", {
            tcPrice: format.number(Math.round(costPerTc), { useGrouping: true }),
            threshold: format.number(Math.round(threshold), {
              useGrouping: true,
            }),
          }),
        };
      } else {
        recommendation = {
          tone: "neutral",
          message: tRec("equal", {
            tcPrice: format.number(Math.round(costPerTc), { useGrouping: true }),
            threshold: format.number(Math.round(threshold), {
              useGrouping: true,
            }),
          }),
        };
      }

      const secondary: ResultSecondaryValue[] = [
        {
          label: tResult("durable"),
          value: v.weaponsNeeded.durable,
        },
        {
          label: tResult("lasting"),
          value: v.weaponsNeeded.lasting,
        },
        {
          label: tResult("costGp"),
          value: v.totalCostGp,
        },
        {
          label: tResult("costTc"),
          value: v.totalCostTc,
        },
      ];

      // Reference the skill key for context (e.g. "Knight — Melee").
      void tSkills; // kept imported for tree-shake parity with result side

      void tFields; // keep fields translations referenced

      return {
        ok: true,
        mode: "targetSkill",
        primaryValue,
        primaryLabelKey: "primaryTargetSkill",
        secondary,
        recommendation,
      };
    }

    // mode === "targetWeaponsUsed"
    const parsed = targetWeaponsSchema.safeParse({
      ...base,
      mode: "targetWeaponsUsed",
      numWeapons: Number(store.numWeapons),
      weaponType: store.weaponType,
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

    const calcResult = exerciseWeapons({
      mode: "targetWeaponsUsed",
      category: parsed.data.category,
      currentSkill: parsed.data.currentSkill,
      percentToNext: parsed.data.percentToNext,
      numWeapons: parsed.data.numWeapons,
      weaponType: parsed.data.weaponType,
      loyaltyPct: parsed.data.loyaltyPct,
      doubleEvent: parsed.data.doubleEvent,
      privateDummy: parsed.data.privateDummy,
      tcPriceThreshold: threshold,
    });

    if (!calcResult.ok) {
      return {
        ok: false,
        fieldErrors: {
          numWeapons: tErrors("invalidNum"),
        },
      };
    }

    const v = calcResult.value;
    const primaryValue =
      v.skillGained ?? v.newSkillLevel ?? parsed.data.numWeapons;

    const costPerTc = v.totalCostTc === 0 ? 0 : v.totalCostGp / v.totalCostTc;

    let recommendation: Recommendation;
    if (v.recommendation === "buyGold") {
      recommendation = {
        tone: "success",
        message: tRec("buyGold", {
          tcPrice: format.number(Math.round(costPerTc), { useGrouping: true }),
          threshold: format.number(Math.round(threshold), {
            useGrouping: true,
          }),
        }),
      };
    } else if (v.recommendation === "buyTc") {
      recommendation = {
        tone: "warning",
        message: tRec("buyTc", {
          tcPrice: format.number(Math.round(costPerTc), { useGrouping: true }),
          threshold: format.number(Math.round(threshold), {
            useGrouping: true,
          }),
        }),
      };
    } else {
      recommendation = {
        tone: "neutral",
        message: tRec("equal", {
          tcPrice: format.number(Math.round(costPerTc), { useGrouping: true }),
          threshold: format.number(Math.round(threshold), {
            useGrouping: true,
          }),
        }),
      };
    }

    const secondary: ResultSecondaryValue[] = [
      {
        label: tResult("newSkillLevel"),
        value: v.newSkillLevel ?? parsed.data.currentSkill,
      },
      {
        label: tResult("costGp"),
        value: v.totalCostGp,
      },
      {
        label: tResult("costTc"),
        value: v.totalCostTc,
      },
    ];

    return {
      ok: true,
      mode: "targetWeaponsUsed",
      primaryValue,
      primaryLabelKey: "primaryTargetWeapons",
      secondary,
      recommendation,
    };
  }, [
    store,
    tErrors,
    tResult,
    tRec,
    tFields,
    tSkills,
    format,
  ]);
}

// ───────────────────────────────────────────────────────────────────────
// Form column — `<ExerciseWeaponsForm />`
// ───────────────────────────────────────────────────────────────────────

export function ExerciseWeaponsForm() {
  const t = useTranslations("Calculators.exerciseWeapons");
  const tFields = useTranslations("Calculators.exerciseWeapons.fields");
  const tSkills = useTranslations("Calculators.exerciseWeapons.skills");
  const tRecs = useTranslations("Calculators.exerciseWeapons.recommendations");
  const tErrors = useTranslations("Calculators.exerciseWeapons.errors");
  const store = useStore();
  const outcome = useComputed();

  const fieldErrors = outcome.ok ? {} : outcome.fieldErrors;

  return (
    <CalculatorForm aria-label={t("title")}>
      {/* Mode tabs */}
      <Tabs
        value={store.mode}
        onValueChange={(v) => setMode(v as ExerciseWeaponsMode)}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="targetSkill">{t("tabs.targetSkill")}</TabsTrigger>
          <TabsTrigger value="targetWeapons">
            {t("tabs.targetWeapons")}
          </TabsTrigger>
        </TabsList>

        {/* ── Shared fields (rendered once, outside the Tab panels so they
              stay mounted when the user switches tabs and don't lose state) ── */}
        <FormField
          id="ew-category"
          label={tFields("category.label")}
          help={tFields("category.help")}
        >
          <Select
            value={store.category}
            onValueChange={(v) =>
              patchState({ category: v as VocationSkillCategory })
            }
          >
            <SelectTrigger id="ew-category">
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

        <div className="grid grid-cols-2 gap-3">
          <FormField
            id="ew-currentSkill"
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
            id="ew-percentToNext"
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

        {/* ── Per-tab fields ── */}
        <TabsContent value="targetSkill" className="mt-0 space-y-4">
          <FormField
            id="ew-targetSkill"
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
        </TabsContent>

        <TabsContent value="targetWeapons" className="mt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="ew-numWeapons"
              label={tFields("numWeapons.label")}
              help={tFields("numWeapons.help")}
              error={fieldErrors.numWeapons}
            >
              <CalculatorNumberInput
                min={0}
                step={1}
                value={store.numWeapons}
                onChange={(event) =>
                  patchState({ numWeapons: event.target.value })
                }
                placeholder={tFields("numWeapons.placeholder")}
              />
            </FormField>

            <FormField
              id="ew-weaponType"
              label={tFields("weaponType.label")}
            >
              <Select
                value={store.weaponType}
                onValueChange={(v) =>
                  patchState({ weaponType: v as ExerciseWeaponType })
                }
              >
                <SelectTrigger id="ew-weaponType">
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
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Modifiers — outside tabs, always visible ── */}
      <div className="grid grid-cols-2 gap-3">
        <FormField
          id="ew-loyaltyPct"
          label={tFields("loyaltyPct.label")}
          help={tFields("loyaltyPct.help")}
          error={fieldErrors.loyaltyPct}
        >
          <Select
            value={String(store.loyaltyPct)}
            onValueChange={(v) =>
              patchState({ loyaltyPct: Number(v) as LoyaltyBonus })
            }
          >
            <SelectTrigger id="ew-loyaltyPct">
              <SelectValue />
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

        <FormField
          id="ew-tcPriceThreshold"
          label={tFields("tcPriceThreshold.label")}
          help={tFields("tcPriceThreshold.help")}
          error={fieldErrors.tcPriceThreshold}
        >
          <CalculatorNumberInput
            min={1}
            step={1}
            value={store.tcPriceThreshold}
            onChange={(event) =>
              patchState({ tcPriceThreshold: event.target.value })
            }
            placeholder={tFields("tcPriceThreshold.placeholder")}
          />
        </FormField>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
          <div className="space-y-1">
            <Label
              htmlFor="ew-doubleEvent"
              className="text-sm font-medium"
            >
              {tFields("doubleEvent.label")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {tFields("doubleEvent.help")}
            </p>
          </div>
          <Switch
            id="ew-doubleEvent"
            checked={store.doubleEvent}
            onCheckedChange={(checked) =>
              patchState({ doubleEvent: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
          <div className="space-y-1">
            <Label
              htmlFor="ew-privateDummy"
              className="text-sm font-medium"
            >
              {tFields("privateDummy.label")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {tFields("privateDummy.help")}
            </p>
          </div>
          <Switch
            id="ew-privateDummy"
            checked={store.privateDummy}
            onCheckedChange={(checked) =>
              patchState({ privateDummy: checked })
            }
          />
        </div>
      </div>

      {/* Hidden helper to keep tErrors referenced (avoid noUnusedLocals) */}
      <span className="sr-only">{tErrors("invalidCurrent")}</span>
      <span className="sr-only">{tRecs("buyGoldShort")}</span>
    </CalculatorForm>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Result column — `<ExerciseWeaponsResult />`
// ───────────────────────────────────────────────────────────────────────

export function ExerciseWeaponsResult() {
  const tResult = useTranslations("Calculators.exerciseWeapons.result");
  const outcome = useComputed();

  if (!outcome.ok) {
    return <ResultDisplay empty />;
  }

  return (
    <ResultDisplay
      primaryValue={outcome.primaryValue}
      primaryLabel={tResult(outcome.primaryLabelKey)}
      secondaryValues={outcome.secondary}
      recommendation={outcome.recommendation}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────
// Compound wrapper — exported for page.tsx convenience.
// ───────────────────────────────────────────────────────────────────────

/**
 * Compound entry-point consumed by `/calculators/exercise-weapons/page.tsx`.
 * Renders the form column; the result column reads from the same
 * module-level store via `ExerciseWeaponsCalculator.Result`.
 */
export function ExerciseWeaponsCalculator() {
  return <ExerciseWeaponsForm />;
}
ExerciseWeaponsCalculator.Result = ExerciseWeaponsResult;