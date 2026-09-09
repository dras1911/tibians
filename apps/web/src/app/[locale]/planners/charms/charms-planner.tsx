"use client";

import * as React from "react";
import { Sparkles, Star, Trophy } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  CalculatorForm,
  FormField,
  ResultDisplay,
  type Recommendation,
  type ResultSecondaryValue,
} from "@/components/calculators";
import { Badge } from "@/components/ui/badge";
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
  CHARM_DEFINITIONS,
  CharmPlannerStateSchema,
  DEFAULT_CHARM_MAX_POINTS,
  DEFAULT_CHARM_PER_SLOT,
  VOCATION_IDS,
  getRecommendedCharms,
  type CharmCategory,
  type CharmPlannerState,
  type VocationId,
} from "@/lib/planner-data";
import {
  CorruptedPlannerUrlError,
  buildPlannerUrl,
  formatPlannerUrlSize,
  parsePlannerState,
} from "@/lib/planner-url-state";

/**
 * `CharmsPlanner` — interactive planner for `/planners/charms` (T23).
 *
 * Planer (NIE kalkulator): wynik to stan do zapisania/udostępnienia
 * (allocation per charm + vocation), nie obliczenie formuły.
 *
 * Pattern (T10 mirror — lekki helper):
 *   - Module-level store (`useSyncExternalStore`) — form + result share state.
 *   - `?snapshot=<base64url>` w URL zawiera pełen stan (arch §13.4)
 *   - Copy-link button (na `<ResultDisplay/>`) → regeneruje URL z aktualnym
 *     stanem i kopiuje do schowka.
 *   - Reload URL → `parsePlannerState` odtwarza sliders.
 *
 * UI:
 *   - **Total points used** badge (color: green/amber/red w zależności od cap)
 *   - Per-charm sliders (0-7) z nazwą PL/EN i **recommendation badge**
 *     jeśli charm jest w top-3 dla wybranej vocation
 *   - Vocation selector (5 vocations) — zmienia rekomendacje
 *   - Custom maxPoints (z T16 `charm.max_points=9000`)
 *
 * Edge cases:
 *   - 0 points (basic config) → "Brak rekomendacji" recommendation
 *   - cap exceeded → red badge + Zod error
 *   - corrupted `?snapshot=` → graceful fallback (pokazujemy warning, init empty)
 */

const CATEGORY_ORDER: readonly CharmCategory[] = [
  "leech",
  "combat",
  "movement",
  "protection",
  "precision",
  "offensive",
  "none",
] as const;

// ───────────────────────────────────────────────────────────────────────
// Module-level store
// ───────────────────────────────────────────────────────────────────────

let state: CharmPlannerState = {
  maxPoints: DEFAULT_CHARM_MAX_POINTS,
  vocation: "Knight",
  allocation: Object.fromEntries(
    CHARM_DEFINITIONS.map((c) => [c.id, 0]),
  ),
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CharmPlannerState {
  return state;
}

function getServerSnapshot(): CharmPlannerState {
  return state;
}

function patchState(patch: Partial<CharmPlannerState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function setCharmAllocation(charmId: string, value: number): void {
  state = {
    ...state,
    allocation: { ...state.allocation, [charmId]: value },
  };
  listeners.forEach((l) => l());
}

function useStore(): CharmPlannerState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ───────────────────────────────────────────────────────────────────────
// Computed totals
// ───────────────────────────────────────────────────────────────────────

interface ComputedTotals {
  totalUsed: number;
  remaining: number;
  overCapBy: number;
  atCap: boolean;
  hasAnyAllocation: boolean;
}

function useTotals(): ComputedTotals {
  const store = useStore();
  return React.useMemo(() => {
    const totalUsed = Object.values(store.allocation).reduce(
      (sum, n) => sum + n,
      0,
    );
    const remaining = Math.max(0, store.maxPoints - totalUsed);
    const overCapBy = Math.max(0, totalUsed - store.maxPoints);
    return {
      totalUsed,
      remaining,
      overCapBy,
      atCap: totalUsed === store.maxPoints && store.maxPoints > 0,
      hasAnyAllocation: totalUsed > 0,
    };
  }, [store.allocation, store.maxPoints]);
}

// ───────────────────────────────────────────────────────────────────────
// URL state hydration (T10 mirror)
// ───────────────────────────────────────────────────────────────────────

/**
 * Hydruje stan z `?snapshot=<base64url>` PRZY PIERWSZYM RENDERZE.
 *
 * Strategia (T10 mirror):
 *   - mount w useEffect → czyta window.location.search
 *   - parsePlannerState → jeśli OK, nadpisuje store + URL (bez query)
 *   - corrupted URL → inline warning + init z pustego stanu (nie throw)
 */
function useUrlStateHydration(): {
  warning: string | null;
} {
  const [warning, setWarning] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search;
    if (!search) return;

    try {
      const parsed = parsePlannerState(search, CharmPlannerStateSchema);
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
// useShareUrl — derives current share URL from store
// ───────────────────────────────────────────────────────────────────────

function useShareUrl(): {
  url: string | null;
  sizeLabel: string | null;
  error: string | null;
} {
  const store = useStore();
  const [result, setResult] = React.useState<{
    url: string | null;
    sizeLabel: string | null;
    error: string | null;
  }>({ url: null, sizeLabel: null, error: null });

  React.useEffect(() => {
    if (typeof window === "undefined") {
      setResult({ url: null, sizeLabel: null, error: null });
      return;
    }
    try {
      const encoded = buildPlannerUrl(store, CharmPlannerStateSchema, {
        baseUrl: window.location.pathname,
      });
      setResult({
        url: encoded.url,
        sizeLabel: formatPlannerUrlSize(encoded.urlBytes),
        error: null,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Encoding error";
      setResult({ url: null, sizeLabel: null, error: msg });
    }
  }, [store]);

  return result;
}

// ───────────────────────────────────────────────────────────────────────
// Form column — `<CharmsPlannerForm />`
// ───────────────────────────────────────────────────────────────────────

export function CharmsPlannerForm() {
  const t = useTranslations("Calculators.plannersCharms");
  const tFields = useTranslations("Calculators.plannersCharms.fields");
  const tCharms = useTranslations("Calculators.plannersCharms.charms");
  const tCategories = useTranslations("Calculators.plannersCharms.categories");
  const tRecs = useTranslations("Calculators.plannersCharms.recommendations");
  const format = useFormatter();
  const store = useStore();
  const totals = useTotals();
  const recommendedIds = React.useMemo(
    () => new Set(getRecommendedCharms(store.vocation)),
    [store.vocation],
  );

  // Group charms by category for clean rendering
  const groupedCharms = React.useMemo(() => {
    const groups: Record<CharmCategory, Array<(typeof CHARM_DEFINITIONS)[number]>> = {
      leech: [],
      combat: [],
      movement: [],
      protection: [],
      precision: [],
      offensive: [],
      none: [],
    };
    for (const charm of CHARM_DEFINITIONS) {
      groups[charm.category].push(charm);
    }
    return groups;
  }, []);

  const capState = totals.overCapBy > 0 ? "danger" : totals.atCap ? "success" : "info";
  const capBadgeVariant =
    capState === "danger"
      ? "destructive"
      : capState === "success"
        ? "success"
        : "secondary";

  return (
    <CalculatorForm aria-label={t("title")} className="gap-5">
      {/* Vocation + maxPoints */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          id="pl-ch-vocation"
          label={tFields("vocation.label")}
          help={tFields("vocation.help")}
        >
          <Select
            value={store.vocation}
            onValueChange={(value) =>
              patchState({ vocation: value as VocationId })
            }
          >
            <SelectTrigger id="pl-ch-vocation">
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
          id="pl-ch-maxpoints"
          label={tFields("maxPoints.label")}
          help={tFields("maxPoints.help", {
            default: format.number(DEFAULT_CHARM_MAX_POINTS, {
              useGrouping: true,
            }),
          })}
        >
          <input
            id="pl-ch-maxpoints"
            type="number"
            min={0}
            max={50000}
            step={100}
            value={store.maxPoints}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next >= 0) {
                patchState({ maxPoints: Math.floor(next) });
              }
            }}
            className={cn(
              "flex h-11 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm",
              "ring-offset-background placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "numeric tabular-nums",
            )}
          />
        </FormField>
      </div>

      {/* Total points used badge */}
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">
            {tRecs("pointsUsed", {
              used: format.number(totals.totalUsed, { useGrouping: true }),
              max: format.number(store.maxPoints, { useGrouping: true }),
            })}
          </span>
        </div>
        <Badge variant={capBadgeVariant} className="tabular-nums">
          {capState === "danger"
            ? tRecs("overCap", {
                over: format.number(totals.overCapBy, { useGrouping: true }),
              })
            : capState === "success"
              ? "✓"
              : tRecs("pointsRemaining", {
                  remaining: format.number(totals.remaining, {
                    useGrouping: true,
                  }),
                })}
        </Badge>
      </div>

      <Separator />

      {/* Per-charm sliders grouped by category */}
      <div className="space-y-5">
        {CATEGORY_ORDER.map((category) => {
          const charms = groupedCharms[category];
          if (charms.length === 0) return null;
          return (
            <div key={category} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {tCategories(category)}
              </h3>
              <div className="space-y-2.5">
                {charms.map((charm) => {
                  const value = store.allocation[charm.id] ?? 0;
                  const max = charm.maxPointsPerCharm ?? DEFAULT_CHARM_PER_SLOT;
                  const isRecommended = recommendedIds.has(charm.id);
                  const pointsAboveMax = value > max;
                  return (
                    <CharmRow
                      key={charm.id}
                      charmId={charm.id}
                      name={tCharms(charm.id)}
                      value={value}
                      max={max}
                      isRecommended={isRecommended}
                      pointsAboveMax={pointsAboveMax}
                      onChange={(v) => setCharmAllocation(charm.id, v)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </CalculatorForm>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Per-charm row: name + recommendation badge + slider
// ───────────────────────────────────────────────────────────────────────

interface CharmRowProps {
  charmId: string;
  name: string;
  value: number;
  max: number;
  isRecommended: boolean;
  pointsAboveMax: boolean;
  onChange: (value: number) => void;
}

function CharmRow({
  name,
  value,
  max,
  isRecommended,
  pointsAboveMax,
  onChange,
}: CharmRowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {name}
        </span>
        {isRecommended ? (
          <Badge
            variant="warning"
            className="shrink-0 gap-1 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider"
            aria-label="Recommended charm"
          >
            <Star className="h-3 w-3" aria-hidden="true" />
            ★
          </Badge>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "w-7 text-right text-sm font-semibold tabular-nums",
            pointsAboveMax
              ? "text-destructive"
              : value > 0
                ? "text-primary"
                : "text-muted-foreground",
          )}
        >
          {value}
        </span>
        <span className="text-xs text-muted-foreground">/ {max}</span>
        <Slider
          value={[value]}
          min={0}
          max={max}
          step={1}
          onValueChange={(values) => {
            const next = values[0] ?? 0;
            onChange(next);
          }}
          className="w-28 sm:w-32"
          aria-label={`${name} allocation`}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Result column — `<CharmsPlannerResult />`
// ───────────────────────────────────────────────────────────────────────

export function CharmsPlannerResult() {
  const t = useTranslations("Calculators.plannersCharms");
  const tRecs = useTranslations("Calculators.plannersCharms.recommendations");
  const tCharms = useTranslations("Calculators.plannersCharms.charms");
  const format = useFormatter();
  const store = useStore();
  const totals = useTotals();
  const { warning } = useUrlStateHydration();
  const share = useShareUrl();

  // ── Top-3 recommended charms with current allocation ────────────────
  const topRecommended = React.useMemo(() => {
    return getRecommendedCharms(store.vocation)
      .map((id) => {
        const def = CHARM_DEFINITIONS.find((c) => c.id === id);
        if (!def) return null;
        return {
          id,
          name: tCharms(id),
          max: def.maxPointsPerCharm,
          points: store.allocation[id] ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [store.vocation, store.allocation, tCharms]);

  // ── Secondary values for ResultDisplay ──────────────────────────────
  const secondary: ResultSecondaryValue[] = React.useMemo(() => {
    const topAllocation = topRecommended
      .filter((c) => c.points > 0)
      .slice(0, 3)
      .map((c) => ({
        label: c.name,
        value: `${format.number(c.points)} / ${format.number(c.max)}`,
      }));
    return [
      ...topAllocation,
      {
        label: t("fields.maxPoints.label"),
        value: format.number(store.maxPoints, { useGrouping: true }),
      },
      {
        label: tRecs("pointsRemainingLabel"),
        value: format.number(
          Math.max(0, store.maxPoints - totals.totalUsed),
          { useGrouping: true },
        ),
        unit: "pkt",
      },
    ];
  }, [
    topRecommended,
    format,
    t,
    tRecs,
    store.maxPoints,
    totals.totalUsed,
  ]);

  // ── Recommendation ──────────────────────────────────────────────────
  const recommendation: Recommendation = React.useMemo(() => {
    if (warning) {
      return {
        tone: "warning",
        message: `⚠ ${warning}`,
      };
    }
    if (totals.overCapBy > 0) {
      return {
        tone: "negative",
        message: tRecs("overCap", {
          over: format.number(totals.overCapBy, { useGrouping: true }),
        }),
      };
    }
    if (!totals.hasAnyAllocation) {
      return {
        tone: "info",
        message: tRecs("empty"),
      };
    }
    if (totals.atCap) {
      return {
        tone: "success",
        message: tRecs("ready"),
      };
    }
    return {
      tone: "neutral",
      message: tRecs("recommendedFor", { vocation: store.vocation }),
    };
  }, [warning, totals, store.vocation, tRecs, format]);

  return (
    <div className="space-y-3">
      <ResultDisplay
        primaryValue={totals.totalUsed}
        unit="pkt"
        primaryLabel={t("title")}
        secondaryValues={secondary}
        recommendation={recommendation}
      />

      {/* Top-3 recommended charms */}
      {topRecommended.length > 0 ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-foreground">
              {tRecs("recommendedFor", { vocation: store.vocation })}
            </h3>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {topRecommended.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-foreground">{c.name}</span>
                <span
                  className={cn(
                    "numeric tabular-nums",
                    c.points > 0 ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {c.points} / {c.max}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Share URL footer */}
      {share.url ? (
        <p className="text-center text-xs text-muted-foreground">
          {t("title")} · URL {share.sizeLabel ?? "—"}
        </p>
      ) : null}
    </div>
  );
}
