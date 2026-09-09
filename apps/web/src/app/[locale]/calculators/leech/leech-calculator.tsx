"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { z } from "zod";
import {
  LEECH_REDUCTION_PER_LEVEL_DEFAULT,
  leechPercent,
  type LeechResult as LeechCalcResult,
  type LeechVocation,
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * `LeechCalculator` — interactive form + result for `/calculators/leech`
 * (T19, Leech share calculator, arch §13).
 *
 * Computes the % XP your character receives from each member of a party.
 * For 2-member parties this is the canonical "leech share" (Tibia equal
 * split 50/50, then a community-convention reduction per level diff).
 *
 * Architecture:
 *   - Module-level store (`useSyncExternalStore`) so form + result share
 *     state without React context (CalculatorLayout renders them as
 *     siblings).
 *   - Zod validates inputs locally before calling the pure formula.
 *   - Dynamic party members (add/remove) — Tibia allows up to 4 members
 *     in a party; the player is the 5th, so total 5 → we cap at 4 inputs.
 *
 * Edge cases surfaced via Zod:
 *   - Empty party → "Solo, no leech" (no other members to leech from)
 *   - `reductionPerLevel` < 0 or > 1 → validation error
 *   - Levels outside Tibia range [8, 2500] → validation error
 *   - Levels outside Tibia legal range (ratio > 1.5) → 0% (CipSoft rule)
 *   - `characterLevel` < `partyMemberLevel` → 0% (community convention)
 */

const MIN_LEVEL = 8;
const MAX_LEVEL = 2500;
const MAX_PARTY_SIZE = 4;

const VOCATIONS: readonly LeechVocation[] = [
  "Knight",
  "Paladin",
  "Druid",
  "Sorcerer",
  "Monk",
] as const;

const partyMemberSchema = z.object({
  name: z
    .string()
    .min(1, "invalidName")
    .max(20, "invalidName"),
  level: z
    .number({ invalid_type_error: "invalidLevel" })
    .int("invalidLevel")
    .min(MIN_LEVEL, "invalidLevel")
    .max(MAX_LEVEL, "invalidLevel"),
  vocation: z.enum([
    "Knight",
    "Paladin",
    "Druid",
    "Sorcerer",
    "Monk",
  ]),
});

const formSchema = z
  .object({
    characterLevel: z
      .number({ invalid_type_error: "invalidLevel" })
      .int("invalidLevel")
      .min(MIN_LEVEL, "invalidLevel")
      .max(MAX_LEVEL, "invalidLevel"),
    characterVocation: z.enum([
      "Knight",
      "Paladin",
      "Druid",
      "Sorcerer",
      "Monk",
    ]),
    partyMembers: z.array(partyMemberSchema).max(MAX_PARTY_SIZE),
    reductionPerLevel: z
      .number({ invalid_type_error: "invalidReduction" })
      .min(0, "invalidReduction")
      .max(1, "invalidReduction"),
  });

// ───────────────────────────────────────────────────────────────────────
// Module-level store.
// ───────────────────────────────────────────────────────────────────────

interface PartyMemberDraft {
  name: string;
  level: string;
  vocation: LeechVocation;
}

interface LeechStoreState {
  characterLevel: string;
  characterVocation: LeechVocation;
  partyMembers: PartyMemberDraft[];
  reductionPerLevel: string;
}

const initialState: LeechStoreState = {
  characterLevel: "100",
  characterVocation: "Knight",
  partyMembers: [
    { name: "Carrier", level: "120", vocation: "Paladin" },
  ],
  reductionPerLevel: "0.05",
};

let state: LeechStoreState = initialState;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): LeechStoreState {
  return state;
}

function getServerSnapshot(): LeechStoreState {
  return initialState;
}

function emit(next: LeechStoreState): void {
  state = next;
  listeners.forEach((l) => l());
}

function setCharacterLevel(value: string): void {
  if (state.characterLevel === value) return;
  emit({ ...state, characterLevel: value });
}

function setCharacterVocation(value: LeechVocation): void {
  if (state.characterVocation === value) return;
  emit({ ...state, characterVocation: value });
}

function setReductionPerLevel(value: string): void {
  if (state.reductionPerLevel === value) return;
  emit({ ...state, reductionPerLevel: value });
}

function setPartyMember(idx: number, patch: Partial<PartyMemberDraft>): void {
  const members = state.partyMembers.slice();
  const existing = members[idx];
  if (!existing) return;
  members[idx] = { ...existing, ...patch, name: existing.name ?? patch.name ?? "" };
  emit({ ...state, partyMembers: members });
}

function addPartyMember(): void {
  if (state.partyMembers.length >= MAX_PARTY_SIZE) return;
  const i = state.partyMembers.length;
  emit({
    ...state,
    partyMembers: [
      ...state.partyMembers,
      {
        name: `Carrier${i + 1}`,
        level: String(Math.max(Number(state.characterLevel), MIN_LEVEL) + 20),
        vocation: VOCATIONS[(i + 1) % VOCATIONS.length]!,
      },
    ],
  });
}

function removePartyMember(idx: number): void {
  if (state.partyMembers.length === 0) return;
  emit({
    ...state,
    partyMembers: state.partyMembers.filter((_, i) => i !== idx),
  });
}

function useLeechState(): LeechStoreState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ───────────────────────────────────────────────────────────────────────
// Shared computation.
// ───────────────────────────────────────────────────────────────────────

interface MemberLeech {
  name: string;
  level: number;
  vocation: LeechVocation;
  sharePct: number;
  levelDiff: number;
  withinLegalRange: boolean;
  isLeechUpward: boolean;
}

interface LeechOk {
  ok: true;
  characterLevel: number;
  characterVocation: LeechVocation;
  partySize: number;
  /** Average leech % across party (equal split). */
  avgLeechPct: number;
  /** Best (max) leech share the character can get. */
  maxLeechPct: number;
  members: MemberLeech[];
  reductionPerLevel: number;
  isSolo: boolean;
}

interface LeechErr {
  ok: false;
  fieldErrors: {
    characterLevel?: string;
    reductionPerLevel?: string;
    partyMembers?: { [idx: number]: { level?: string; name?: string } };
  };
}

type LeechOutcome = LeechOk | LeechErr;

function useComputed(): LeechOutcome {
  const tErrors = useTranslations("Calculators.leech.errors");
  const store = useLeechState();

  return React.useMemo<LeechOutcome>(() => {
    const parsedMembers = store.partyMembers.map((m) => ({
      name: m.name,
      level: Number(m.level),
      vocation: m.vocation,
    }));

    const parsed = formSchema.safeParse({
      characterLevel: Number(store.characterLevel),
      characterVocation: store.characterVocation,
      partyMembers: parsedMembers,
      reductionPerLevel: Number(store.reductionPerLevel),
    });

    if (!parsed.success) {
      const fieldErrors: LeechErr["fieldErrors"] = {
        partyMembers: {},
      };
      for (const issue of parsed.error.issues) {
        const path = issue.path;
        if (path[0] === "characterLevel") {
          fieldErrors.characterLevel = tErrors("invalidLevel", {
            min: MIN_LEVEL,
            max: MAX_LEVEL,
          });
        } else if (path[0] === "reductionPerLevel") {
          fieldErrors.reductionPerLevel = tErrors("invalidReduction");
        } else if (path[0] === "partyMembers") {
          const idx = path[1];
          const field = path[2];
          if (typeof idx === "number") {
            const slot = (fieldErrors.partyMembers![idx] ??= {});
            if (field === "level") {
              slot.level = tErrors("invalidLevel", {
                min: MIN_LEVEL,
                max: MAX_LEVEL,
              });
            } else if (field === "name") {
              slot.name = tErrors("invalidName");
            }
          }
        }
      }
      // Strip empty slots
      if (fieldErrors.partyMembers) {
        for (const key of Object.keys(fieldErrors.partyMembers)) {
          const k = key as unknown as number;
          const slot = fieldErrors.partyMembers[k];
          if (slot && Object.keys(slot).length === 0) {
            delete fieldErrors.partyMembers[k];
          }
        }
        if (Object.keys(fieldErrors.partyMembers).length === 0) {
          delete fieldErrors.partyMembers;
        }
      }
      return { ok: false, fieldErrors };
    }

    const {
      characterLevel,
      characterVocation,
      partyMembers: validMembers,
      reductionPerLevel,
    } = parsed.data;

    // Solo: empty party → no leech.
    if (validMembers.length === 0) {
      return {
        ok: true,
        characterLevel,
        characterVocation,
        partySize: 0,
        avgLeechPct: 100,
        maxLeechPct: 100,
        members: [],
        reductionPerLevel,
        isSolo: true,
      };
    }

    const memberResults: MemberLeech[] = [];
    for (const m of validMembers) {
      const calc = leechPercent(
        characterLevel,
        m.level,
        characterVocation,
        { reductionPerLevel },
      );
      if (!calc.ok) {
        return {
          ok: false,
          fieldErrors: {
            partyMembers: { 0: { level: tErrors("invalidLevel", { min: MIN_LEVEL, max: MAX_LEVEL }) } },
          },
        };
      }
      const v: LeechCalcResult = calc.value;
      memberResults.push({
        name: m.name,
        level: m.level,
        vocation: m.vocation,
        sharePct: v.sharePct,
        levelDiff: v.levelDiff,
        withinLegalRange: v.withinLegalRange,
        isLeechUpward: v.isLeechUpward,
      });
    }

    const avgLeechPct =
      memberResults.reduce((sum, m) => sum + m.sharePct, 0) / memberResults.length;
    const maxLeechPct = Math.max(...memberResults.map((m) => m.sharePct));

    return {
      ok: true,
      characterLevel,
      characterVocation,
      partySize: validMembers.length,
      avgLeechPct,
      maxLeechPct,
      members: memberResults,
      reductionPerLevel,
      isSolo: false,
    };
  }, [store, tErrors]);
}

// ───────────────────────────────────────────────────────────────────────
// Form column — `<LeechForm />`
// ───────────────────────────────────────────────────────────────────────

export function LeechForm() {
  const t = useTranslations("Calculators.leech");
  const store = useLeechState();
  const outcome = useComputed();

  const fieldErrors = outcome.ok ? null : outcome.fieldErrors;
  const memberErrors =
    fieldErrors?.partyMembers ??
    ({} as Record<number, { level?: string; name?: string }>);

  return (
    <CalculatorForm aria-label={t("title")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="l-characterLevel"
          label={t("labels.characterLevel")}
          help={t("labels.characterLevelHelp", { min: MIN_LEVEL, max: MAX_LEVEL })}
          error={fieldErrors?.characterLevel}
        >
          <CalculatorNumberInput
            id="l-characterLevel"
            min={MIN_LEVEL}
            max={MAX_LEVEL}
            step={1}
            value={store.characterLevel}
            onChange={(event) => setCharacterLevel(event.target.value)}
            placeholder={t("labels.characterLevelPlaceholder")}
          />
        </FormField>

        <FormField
          id="l-characterVocation"
          label={t("labels.characterVocation")}
          help={t("labels.characterVocationHelp")}
        >
          <Select
            value={store.characterVocation}
            onValueChange={(value) =>
              setCharacterVocation(value as LeechVocation)
            }
          >
            <SelectTrigger id="l-characterVocation">
              <SelectValue
                placeholder={t("labels.characterVocationPlaceholder")}
              />
            </SelectTrigger>
            <SelectContent>
              {VOCATIONS.map((v) => (
                <SelectItem key={v} value={v}>
                  {t(`vocations.${v}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField
        id="l-reductionPerLevel"
        label={t("labels.reductionPerLevel")}
        help={t("labels.reductionPerLevelHelp")}
        error={fieldErrors?.reductionPerLevel}
      >
        <CalculatorNumberInput
          id="l-reductionPerLevel"
          min={0}
          max={1}
          step={0.01}
          value={store.reductionPerLevel}
          onChange={(event) => setReductionPerLevel(event.target.value)}
          placeholder={t("labels.reductionPerLevelPlaceholder")}
        />
      </FormField>

      {/* Party members — dynamic list. */}
      <div className="rounded-md border border-dashed bg-muted/30 p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            {t("labels.partyMembers")}
          </p>
          <span className="text-xs font-medium text-muted-foreground numeric tabular-nums">
            {t("labels.partyMembersCount", {
              count: store.partyMembers.length,
              max: MAX_PARTY_SIZE,
            })}
          </span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          {t("labels.partyMembersHelp")}
        </p>

        <ul className="flex flex-col gap-3">
          {store.partyMembers.map((m, idx) => {
            const errs = memberErrors[idx];
            return (
              <li
                key={`leech-member-${idx}`}
                className={cn(
                  "rounded-md border bg-card p-3",
                  errs && "border-destructive",
                )}
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_5rem_8rem_auto]">
                  <FormField
                    id={`leech-member-${idx}-name`}
                    label={t("labels.memberName")}
                    error={errs?.name}
                  >
                    <Input
                      id={`leech-member-${idx}-name`}
                      value={m.name}
                      maxLength={20}
                      onChange={(event) =>
                        setPartyMember(idx, { name: event.target.value })
                      }
                      placeholder={t("labels.memberNamePlaceholder")}
                      aria-label={t("labels.memberNameAria", {
                        index: idx + 1,
                      })}
                    />
                  </FormField>

                  <FormField
                    id={`leech-member-${idx}-level`}
                    label={t("labels.memberLevel")}
                    error={errs?.level}
                  >
                    <CalculatorNumberInput
                      id={`leech-member-${idx}-level`}
                      min={MIN_LEVEL}
                      max={MAX_LEVEL}
                      step={1}
                      value={m.level}
                      onChange={(event) =>
                        setPartyMember(idx, { level: event.target.value })
                      }
                      placeholder={String(MIN_LEVEL)}
                      aria-label={t("labels.memberLevelAria", {
                        index: idx + 1,
                      })}
                    />
                  </FormField>

                  <FormField
                    id={`leech-member-${idx}-vocation`}
                    label={t("labels.memberVocation")}
                  >
                    <Select
                      value={m.vocation}
                      onValueChange={(value) =>
                        setPartyMember(idx, {
                          vocation: value as LeechVocation,
                        })
                      }
                    >
                      <SelectTrigger
                        id={`leech-member-${idx}-vocation`}
                        aria-label={t("labels.memberVocationAria", {
                          index: idx + 1,
                        })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VOCATIONS.map((v) => (
                          <SelectItem key={v} value={v}>
                            {t(`vocations.${v}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removePartyMember(idx)}
                      aria-label={t("labels.removeMember", {
                        name: m.name,
                      })}
                      className="h-11 w-11 shrink-0"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addPartyMember}
          disabled={store.partyMembers.length >= MAX_PARTY_SIZE}
          className="mt-3 inline-flex h-11 items-center gap-1.5"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("labels.addMember")}
        </Button>
      </div>
    </CalculatorForm>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Result column — `<LeechResult />`
// ───────────────────────────────────────────────────────────────────────

export function LeechResult() {
  const t = useTranslations("Calculators.leech");
  const format = useFormatter();
  const outcome = useComputed();

  if (!outcome.ok) {
    return <ResultDisplay empty />;
  }

  const {
    avgLeechPct,
    maxLeechPct,
    members,
    characterLevel,
    partySize,
    isSolo,
  } = outcome;

  // Recommendation
  let recommendation: Recommendation;
  if (isSolo) {
    recommendation = {
      tone: "info",
      message: t("recommendations.solo"),
    };
  } else if (maxLeechPct === 0) {
    recommendation = {
      tone: "negative",
      message: t("recommendations.illegal"),
    };
  } else if (maxLeechPct >= 50) {
    recommendation = {
      tone: "success",
      message: t("recommendations.equal"),
    };
  } else if (maxLeechPct >= 25) {
    recommendation = {
      tone: "info",
      message: t("recommendations.ok"),
    };
  } else {
    recommendation = {
      tone: "warning",
      message: t("recommendations.low"),
    };
  }

  const secondary: ResultSecondaryValue[] = [
    {
      label: t("result.partySize"),
      value: format.number(partySize, { useGrouping: true }),
    },
    {
      label: t("result.characterLevel"),
      value: format.number(characterLevel, { useGrouping: true }),
    },
    {
      label: t("result.avgLeech"),
      value: `${format.number(avgLeechPct, {
        useGrouping: true,
        maximumFractionDigits: 1,
      })}%`,
    },
  ];

  // Per-member breakdown
  return (
    <div className="flex flex-col gap-4">
      <ResultDisplay
        primaryValue={maxLeechPct}
        unit="%"
        primaryLabel={t("result.maxLeechLabel")}
        secondaryValues={secondary}
        recommendation={recommendation}
      />

      {/* Per-member breakdown */}
      {members.length > 0 ? (
        <div className="rounded-lg border bg-card text-sm shadow-sm">
          <div className="border-b p-4 sm:p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("result.tableTitle")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("result.tableSubtitle", {
                count: partySize,
              })}
            </p>
          </div>
          <div className="divide-y">
              {members.map((m, idx) => (
                <div
                  key={`leech-row-${idx}`}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(`vocations.${m.vocation}`)} · lvl {format.number(m.level, { useGrouping: true })}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground numeric tabular-nums">
                    Δ {format.number(m.levelDiff, { useGrouping: true })}
                  </span>
                  <span className="text-sm font-medium numeric tabular-nums">
                    {format.number(m.sharePct, {
                      useGrouping: true,
                      maximumFractionDigits: 1,
                    })}%
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                      m.withinLegalRange
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {m.withinLegalRange
                      ? t("result.legal")
                      : t("result.illegal")}
                  </span>
                </div>
              ))}
            </div>
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Compound wrapper
// ───────────────────────────────────────────────────────────────────────

/**
 * Compound entry-point consumed by `/calculators/leech/page.tsx`.
 * The form column is `<LeechForm />`; the result column reads from the
 * same module-level store via `LeechCalculator.Result`.
 */
export function LeechCalculator() {
  return <LeechForm />;
}

LeechCalculator.Result = LeechResult;

// Re-export constants for tests / external consumers
export { LEECH_REDUCTION_PER_LEVEL_DEFAULT };