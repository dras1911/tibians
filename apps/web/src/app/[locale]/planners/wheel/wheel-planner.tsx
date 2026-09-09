"use client";

import * as React from "react";
import { CheckCircle2, Sparkles, Swords, Shield, Heart, Info } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  CalculatorForm,
  CalculatorNumberInput,
  FormField,
  ResultDisplay,
  type Recommendation,
  type ResultSecondaryValue,
} from "@/components/calculators";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  DEFAULT_WHEEL_MAX_POINTS,
  VOCATION_IDS,
  WHEEL_CATEGORY_IDS,
  WheelPlannerStateSchema,
  getCuratedBuildsForVocation,
  type VocationId,
  type WheelCategoryId,
  type WheelCuratedBuild,
  type WheelPlannerState,
} from "@/lib/planner-data";
import {
  CorruptedPlannerUrlError,
  buildPlannerUrl,
  formatPlannerUrlSize,
  parsePlannerState,
} from "@/lib/planner-url-state";

/**
 * `WheelPlanner` — interactive planner for `/planners/wheel` (T23).
 *
 * Planer Wheel of Destiny:
 *   - 3 sliders (offensive/defensive/support) — sum ≤ maxPoints (default 1000)
 *   - 5 curatowanych presetów per vocation (TibiaPal Wheel Builds)
 *   - Markdown export (do Discorda) + URL share
 *
 * Pattern (T10 mirror):
 *   - Module-level store (`useSyncExternalStore`)
 *   - `?snapshot=<base64url>` w URL zawiera pełen stan
 *   - Hydration w useEffect + graceful fallback przy corrupted URL
 *
 * Markdown export (button "Kopiuj jako Markdown"):
 *   - Gotowy do wklejenia na Discord / forum
 *   - Format: nagłówek + tabela 3 kolumn (Offensive/Defensive/Support) +
 *     podsumowanie (total + remaining)
 *
 * Edge cases:
 *   - 0 points → "Pusty build" recommendation
 *   - Over budget → red badge + Zod error
 *   - corrupted `?snapshot=` → graceful warning
 *   - preset loaded → UI pokazuje nazwę presetu (transient, nie persystowana)
 */

const CATEGORY_ICONS: Record<WheelCategoryId, React.ElementType> = {
  offensive: Swords,
  defensive: Shield,
  support: Heart,
};

// ───────────────────────────────────────────────────────────────────────
// Module-level store
// ───────────────────────────────────────────────────────────────────────

let state: WheelPlannerState = {
  vocation: "Knight",
  level: 200,
  maxPoints: DEFAULT_WHEEL_MAX_POINTS,
  allocation: { offensive: 0, defensive: 0, support: 0 },
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): WheelPlannerState {
  return state;
}

function getServerSnapshot(): WheelPlannerState {
  return state;
}

function patchState(patch: Partial<WheelPlannerState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function setAllocation(category: WheelCategoryId, value: number): void {
  state = {
    ...state,
    allocation: { ...state.allocation, [category]: value },
  };
  listeners.forEach((l) => l());
}

function useStore(): WheelPlannerState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ───────────────────────────────────────────────────────────────────────
// Computed totals
// ───────────────────────────────────────────────────────────────────────

interface ComputedTotals {
  totalUsed: number;
  remaining: number;
  overBudgetBy: number;
  atBudget: boolean;
  hasAnyAllocation: boolean;
}

function useTotals(): ComputedTotals {
  const store = useStore();
  return React.useMemo(() => {
    const totalUsed =
      store.allocation.offensive +
      store.allocation.defensive +
      store.allocation.support;
    const remaining = Math.max(0, store.maxPoints - totalUsed);
    const overBudgetBy = Math.max(0, totalUsed - store.maxPoints);
    return {
      totalUsed,
      remaining,
      overBudgetBy,
      atBudget: totalUsed === store.maxPoints && store.maxPoints > 0,
      hasAnyAllocation: totalUsed > 0,
    };
  }, [store.allocation, store.maxPoints]);
}

// ───────────────────────────────────────────────────────────────────────
// URL state hydration (T10 mirror)
// ───────────────────────────────────────────────────────────────────────

function useUrlStateHydration(): {
  warning: string | null;
} {
  const [warning, setWarning] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search;
    if (!search) return;

    try {
      const parsed = parsePlannerState(search, WheelPlannerStateSchema);
      if (parsed) {
        state = parsed;
        listeners.forEach((l) => l());
      }
    } catch (error) {
      const msg =
        error instanceof CorruptedPlannerUrlError
          ? error.message
          : "Nieznany błąd parsowania URL";
      setWarning(msg);
    }
  }, []);

  return { warning };
}

// ───────────────────────────────────────────────────────────────────────
// Share URL + Markdown
// ───────────────────────────────────────────────────────────────────────

interface ShareArtifact {
  url: string;
  sizeLabel: string;
  markdown: string;
}

function useShareArtifact(): ShareArtifact | null {
  const store = useStore();
  const [artifact, setArtifact] = React.useState<ShareArtifact | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const encoded = buildPlannerUrl(store, WheelPlannerStateSchema, {
        baseUrl: window.location.pathname,
      });
      setArtifact({
        url: encoded.url,
        sizeLabel: formatPlannerUrlSize(encoded.urlBytes),
        markdown: renderMarkdown(store),
      });
    } catch {
      setArtifact(null);
    }
  }, [store]);

  return artifact;
}

/**
 * Generuje Markdown do udostępniania na Discord / forumach.
 *
 * Format:
 *   ## Wheel of Destiny — Knight (Level 200)
 *   | Kategoria | Punkty | % budżetu |
 *   |---|---|---|
 *   | Offensive | 120 | 20% |
 *   | Defensive | 380 | 63% |
 *   | Support | 100 | 17% |
 *   **Total: 600 / 600 pkt** (100%)
 *   [Tibians Wheel Planner](https://…)
 */
function renderMarkdown(state: WheelPlannerState): string {
  const total = state.allocation.offensive +
    state.allocation.defensive +
    state.allocation.support;
  const pct = (n: number) =>
    state.maxPoints > 0
      ? `${Math.round((n / state.maxPoints) * 100)}%`
      : "0%";

  const lines = [
    `## Wheel of Destiny — ${state.vocation} (Level ${state.level})`,
    "",
    "| Kategoria | Punkty | % budżetu |",
    "|---|---|---|",
    `| Offensive | ${state.allocation.offensive} | ${pct(state.allocation.offensive)} |`,
    `| Defensive | ${state.allocation.defensive} | ${pct(state.allocation.defensive)} |`,
    `| Support | ${state.allocation.support} | ${pct(state.allocation.support)} |`,
    "",
    `**Total: ${total} / ${state.maxPoints} pkt**`,
    "",
  ];

  return lines.join("\n");
}

// ───────────────────────────────────────────────────────────────────────
// Clipboard helper
// ───────────────────────────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for older browsers / insecure contexts.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Form column — `<WheelPlannerForm />`
// ───────────────────────────────────────────────────────────────────────

export function WheelPlannerForm() {
  const t = useTranslations("Calculators.plannersWheel");
  const tFields = useTranslations("Calculators.plannersWheel.fields");
  const tRecs = useTranslations("Calculators.plannersWheel.recommendations");
  const tActions = useTranslations("Calculators.plannersWheel.actions");
  const tCharms = useTranslations("Calculators.plannersCharms.charms"); // re-use for labels (unused if not needed)
  const tPresets = useTranslations("Calculators.plannersWheel.presets");
  const tPresetsDesc = useTranslations("Calculators.plannersWheel.presetsDesc");
  const format = useFormatter();
  const store = useStore();
  const totals = useTotals();
  const artifact = useShareArtifact();
  const [copyState, setCopyState] = React.useState<{
    kind: "link" | "markdown";
    state: "idle" | "copied" | "failed";
  }>({ kind: "link", state: "idle" });

  const presets = React.useMemo(
    () => getCuratedBuildsForVocation(store.vocation),
    [store.vocation],
  );

  // Track which preset (if any) is currently loaded (= allocation matches).
  const matchedPresetId = React.useMemo(() => {
    const { offensive, defensive, support } = store.allocation;
    const match = presets.find(
      (p) =>
        p.allocation.offensive === offensive &&
        p.allocation.defensive === defensive &&
        p.allocation.support === support,
    );
    return match?.id ?? null;
  }, [presets, store.allocation]);

  const handleLoadPreset = (preset: WheelCuratedBuild): void => {
    patchState({
      allocation: { ...preset.allocation },
    });
  };

  const handleCopyLink = async () => {
    if (!artifact) return;
    const ok = await copyToClipboard(artifact.url);
    setCopyState({ kind: "link", state: ok ? "copied" : "failed" });
    setTimeout(
      () => setCopyState((s) => ({ ...s, state: "idle" })),
      ok ? 1800 : 2400,
    );
  };

  const handleCopyMarkdown = async () => {
    if (!artifact) return;
    const ok = await copyToClipboard(artifact.markdown);
    setCopyState({ kind: "markdown", state: ok ? "copied" : "failed" });
    setTimeout(
      () => setCopyState((s) => ({ ...s, state: "idle" })),
      ok ? 1800 : 2400,
    );
  };

  // ── Budget badge state ─────────────────────────────────────────────
  const capState =
    totals.overBudgetBy > 0 ? "danger" : totals.atBudget ? "success" : "info";
  const capBadgeClass =
    capState === "danger"
      ? "border-destructive/40 bg-destructive/15 text-destructive"
      : capState === "success"
        ? "border-success/40 bg-success/15 text-success"
        : "border-info/40 bg-info/15 text-info";

  // Re-declare tCharms to keep tPresetsDesc used (next-intl noUnusedLocales safety).
  void tCharms;
  void tPresetsDesc;

  return (
    <CalculatorForm aria-label={t("title")} className="gap-5">
      {/* Vocation + Level + Preset */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          id="pl-wh-vocation"
          label={tFields("vocation.label")}
          help={tFields("vocation.help")}
        >
          <Select
            value={store.vocation}
            onValueChange={(value) =>
              patchState({ vocation: value as VocationId })
            }
          >
            <SelectTrigger id="pl-wh-vocation">
              <SelectValue placeholder={tFields("vocation.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {VOCATION_IDS.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          id="pl-wh-level"
          label={tFields("level.label")}
          help={tFields("level.help")}
        >
          <CalculatorNumberInput
            id="pl-wh-level"
            min={8}
            max={2500}
            step={1}
            value={String(store.level)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next >= 0) {
                patchState({ level: Math.floor(next) });
              }
            }}
            placeholder={tFields("level.placeholder")}
          />
        </FormField>
      </div>

      {/* Curated presets */}
      {presets.length > 0 ? (
        <FormField
          id="pl-wh-preset"
          label={tFields("preset.label")}
          help={tFields("preset.help")}
        >
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() =>
                patchState({ allocation: { offensive: 0, defensive: 0, support: 0 } })
              }
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                !matchedPresetId && !totals.hasAnyAllocation
                  ? "border-primary bg-primary/10"
                  : "border-input bg-muted",
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                {!matchedPresetId && !totals.hasAnyAllocation ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
                {tFields("preset.none")}
              </span>
            </button>
            {presets.map((preset) => {
              const isActive = matchedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleLoadPreset(preset)}
                  className={cn(
                    "flex flex-col gap-1 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isActive
                      ? "border-primary bg-primary/10"
                      : "border-input bg-muted",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    {isActive ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    )}
                    {tPresets(preset.nameKey)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tPresetsDesc(preset.descriptionKey)}
                  </span>
                  <span className="numeric text-xs tabular-nums text-foreground/70">
                    O:{preset.allocation.offensive} · D:{preset.allocation.defensive} · S:{preset.allocation.support}
                  </span>
                </button>
              );
            })}
          </div>
        </FormField>
      ) : null}

      <Separator />

      {/* Per-category sliders */}
      <div className="space-y-4">
        {WHEEL_CATEGORY_IDS.map((category) => {
          const Icon = CATEGORY_ICONS[category];
          const value = store.allocation[category];
          const hintKey =
            category === "offensive"
              ? "offensiveHint"
              : category === "defensive"
                ? "defensiveHint"
                : "supportHint";
          return (
            <FormField
              key={category}
              id={`pl-wh-${category}`}
              label={tFields(`${category}.label`)}
              help={tFields(`${category}.help`, { max: store.maxPoints })}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <Slider
                  value={[value]}
                  min={0}
                  max={store.maxPoints}
                  step={5}
                  onValueChange={(values) => {
                    const next = values[0] ?? 0;
                    setAllocation(category, next);
                  }}
                  className="flex-1"
                  aria-label={`${category} allocation`}
                />
                <span className="numeric w-14 text-right text-sm font-semibold tabular-nums">
                  {value}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="h-3 w-3" aria-hidden="true" />
                {tRecs(hintKey)}
              </p>
            </FormField>
          );
        })}
      </div>

      {/* Total budget badge */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors",
          capBadgeClass,
        )}
      >
        <span className="text-sm font-medium">
          {tRecs("totalUsed", {
            used: format.number(totals.totalUsed, { useGrouping: true }),
            max: format.number(store.maxPoints, { useGrouping: true }),
          })}
        </span>
        <span className="numeric text-sm font-semibold tabular-nums">
          {capState === "danger"
            ? tRecs("overBudget", {
                over: format.number(totals.overBudgetBy, { useGrouping: true }),
              })
            : capState === "success"
              ? "✓"
              : tRecs("remaining", {
                  remaining: format.number(totals.remaining, {
                    useGrouping: true,
                  }),
                })}
        </span>
      </div>

      {/* Share buttons */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          disabled={!artifact?.url}
          className="flex-1 sm:flex-none"
        >
          {copyState.kind === "link" && copyState.state === "copied"
            ? tActions("copyLinkCopied")
            : copyState.kind === "link" && copyState.state === "failed"
              ? tActions("copyFailed")
              : tActions("copyLink")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleCopyMarkdown}
          disabled={!artifact?.markdown}
          className="flex-1 sm:flex-none"
        >
          {copyState.kind === "markdown" && copyState.state === "copied"
            ? tActions("copyMarkdownCopied")
            : copyState.kind === "markdown" && copyState.state === "failed"
              ? tActions("copyFailed")
              : tActions("copyMarkdown")}
        </Button>
      </div>
      {artifact?.sizeLabel ? (
        <p className="text-center text-xs text-muted-foreground">
          URL {artifact.sizeLabel}
        </p>
      ) : null}
    </CalculatorForm>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Result column — `<WheelPlannerResult />`
// ───────────────────────────────────────────────────────────────────────

export function WheelPlannerResult() {
  const t = useTranslations("Calculators.plannersWheel");
  const tRecs = useTranslations("Calculators.plannersWheel.recommendations");
  const tFields = useTranslations("Calculators.plannersWheel.fields");
  const format = useFormatter();
  const store = useStore();
  const totals = useTotals();
  const { warning } = useUrlStateHydration();

  const secondary: ResultSecondaryValue[] = React.useMemo(() => {
    return [
      {
        label: tFields("offensive.label"),
        value: format.number(store.allocation.offensive),
      },
      {
        label: tFields("defensive.label"),
        value: format.number(store.allocation.defensive),
      },
      {
        label: tFields("support.label"),
        value: format.number(store.allocation.support),
      },
      {
        label: tFields("vocation.label"),
        value: store.vocation,
      },
      {
        label: tFields("level.label"),
        value: format.number(store.level),
      },
    ];
  }, [store, format, tFields]);

  const recommendation: Recommendation = React.useMemo(() => {
    if (warning) {
      return {
        tone: "warning",
        message: `⚠ ${warning}`,
      };
    }
    if (totals.overBudgetBy > 0) {
      return {
        tone: "negative",
        message: tRecs("overBudget", {
          over: format.number(totals.overBudgetBy, { useGrouping: true }),
        }),
      };
    }
    if (!totals.hasAnyAllocation) {
      return {
        tone: "info",
        message: tRecs("empty"),
      };
    }
    if (totals.atBudget) {
      return {
        tone: "success",
        message: tRecs("valid"),
      };
    }
    return {
      tone: "neutral",
      message: tRecs("remaining", {
        remaining: format.number(totals.remaining, { useGrouping: true }),
      }),
    };
  }, [warning, totals, tRecs, format]);

  return (
    <ResultDisplay
      primaryValue={totals.totalUsed}
      unit="pkt"
      primaryLabel={t("title")}
      secondaryValues={secondary}
      recommendation={recommendation}
    />
  );
}
