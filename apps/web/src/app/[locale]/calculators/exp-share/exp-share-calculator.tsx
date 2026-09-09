"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { z } from "zod";
import {
  expShareSplit,
  type ExpShareResult as ExpShareCalcResult,
  type PartyMember,
  type PartyVocation,
} from "@tibians/calc";
import { useFormatter, useTranslations } from "next-intl";

import {
  CalculatorForm,
  CalculatorNumberInput,
  FormField,
  ResultDisplay,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * `ExpShareCalculator` — interactive form + result for
 * `/calculators/exp-share` (T19, XP split per Tibia's party formula).
 *
 * Architecture:
 *   - The `CalculatorLayout` (T24) renders the form and result as
 *     sibling DOM trees — we share state via a module-level store
 *     (`useSyncExternalStore`). Same pattern as True Skill / Stamina.
 *   - Tibia equal-split + vocation-bonus formula lives in
 *     `@tibians/calc/formulas/exp-share` (T15, CipSoft official rules).
 *
 * UX choices:
 *   - **Dynamic party members**: 0 = solo (gets 100 % XP), max 4.
 *   - **bigint XP**: the calc engine returns bigint for precision.
 *     `useFormatter().number()` accepts bigint natively (next-intl 3.20+).
 *   - **Vocation diversity is auto-detected** from the form state; we
 *     surface the bonus % as a secondary value.
 *   - **Result table** (shadcn `<Table>`) renders per-member XP share
 *     plus the player row — the primary value is the player's share.
 *   - **Recommendation** highlights bonus tiers:
 *       - solo        → info
 *       - 1 vocation  → info (Tibia baseline +20 %)
 *       - 2-3 voc.    → success (CipSoft breakpoint)
 *       - 4-5 voc.    → success (max bonus)
 *       - illegal     → negative (CipSoft prohibits XP share)
 */

// ───────────────────────────────────────────────────────────────────────
// Constants — domain limits.
// ───────────────────────────────────────────────────────────────────────

const MIN_LEVEL = 8;
const MAX_LEVEL = 2500;
const MAX_PARTY_SIZE = 4;

const VOCATIONS: readonly PartyVocation[] = [
  "Knight",
  "Paladin",
  "Druid",
  "Sorcerer",
  "Monk",
] as const;

// ───────────────────────────────────────────────────────────────────────
// Zod schemas.
// ───────────────────────────────────────────────────────────────────────

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
    totalXp: z
      .number({ invalid_type_error: "invalidTotalXp" })
      .int("invalidTotalXp")
      .min(0, "invalidTotalXp")
      .max(1_000_000_000_000, "invalidTotalXp"),
    playerLevel: z
      .number({ invalid_type_error: "invalidLevel" })
      .int("invalidLevel")
      .min(MIN_LEVEL, "invalidLevel")
      .max(MAX_LEVEL, "invalidLevel"),
    playerVocation: z.enum([
      "Knight",
      "Paladin",
      "Druid",
      "Sorcerer",
      "Monk",
    ]),
    partyMembers: z.array(partyMemberSchema).max(MAX_PARTY_SIZE),
  })
  .refine(
    (v) => {
      if (v.partyMembers.length === 0) return true;
      const levels = [v.playerLevel, ...v.partyMembers.map((m) => m.level)];
      const min = Math.min(...levels);
      const max = Math.max(...levels);
      return max <= 1.5 * min;
    },
    {
      message: "illegalPartyRange",
      path: ["partyMembers"],
    },
  );

// ───────────────────────────────────────────────────────────────────────
// Module-level store.
// ───────────────────────────────────────────────────────────────────────

interface PartyMemberDraft {
  name: string;
  level: string;
  vocation: PartyVocation;
}

interface ExpShareStoreState {
  totalXp: string;
  playerLevel: string;
  playerVocation: PartyVocation;
  partyMembers: PartyMemberDraft[];
}

const initialState: ExpShareStoreState = {
  totalXp: "10000",
  playerLevel: "100",
  playerVocation: "Knight",
  partyMembers: [
    { name: "Ally1", level: "100", vocation: "Paladin" },
  ],
};

let state: ExpShareStoreState = initialState;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ExpShareStoreState {
  return state;
}

function getServerSnapshot(): ExpShareStoreState {
  return initialState;
}

function emit(next: ExpShareStoreState): void {
  state = next;
  listeners.forEach((l) => l());
}

function setTotalXp(value: string): void {
  if (state.totalXp === value) return;
  emit({ ...state, totalXp: value });
}

function setPlayerLevel(value: string): void {
  if (state.playerLevel === value) return;
  emit({ ...state, playerLevel: value });
}

function setPlayerVocation(value: PartyVocation): void {
  if (state.playerVocation === value) return;
  emit({ ...state, playerVocation: value });
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
        name: `Ally${i + 1}`,
        level: state.playerLevel,
        // Cycle through vocations not yet used.
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

function useExpShareState(): ExpShareStoreState {
  return React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
}

// ───────────────────────────────────────────────────────────────────────
// Shared computation.
// ───────────────────────────────────────────────────────────────────────

interface MemberRow {
  name: string;
  level: number;
  vocation: PartyVocation;
  xp: bigint;
}

interface ExpShareComputed {
  ok: true;
  totalXp: bigint;
  playerLevel: number;
  playerVocation: PartyVocation;
  playerXp: bigint;
  party: PartyMember[];
  splits: MemberRow[];
  vocationBonus: number;
  distinctVocations: number;
  totalMembers: number;
  isSolo: boolean;
}

interface ExpShareInvalid {
  ok: false;
  fieldErrors: {
    totalXp?: string;
    playerLevel?: string;
    partyMembers?: { [idx: number]: { level?: string; name?: string } };
    partyRange?: string;
  };
}

type ExpShareOutcome = ExpShareComputed | ExpShareInvalid;

function useComputed(): ExpShareOutcome {
  const tErrors = useTranslations("Calculators.expShare.errors");
  const store = useExpShareState();

  return React.useMemo<ExpShareOutcome>(() => {
    const parsedMembers = store.partyMembers.map((m) => ({
      name: m.name,
      level: Number(m.level),
      vocation: m.vocation,
    }));

    const parsed = formSchema.safeParse({
      totalXp: Number(store.totalXp),
      playerLevel: Number(store.playerLevel),
      playerVocation: store.playerVocation,
      partyMembers: parsedMembers,
    });

    if (!parsed.success) {
      const fieldErrors: ExpShareInvalid["fieldErrors"] = {
        partyMembers: {},
      };
      for (const issue of parsed.error.issues) {
        const path = issue.path;
        if (path[0] === "totalXp") {
          fieldErrors.totalXp = tErrors("invalidTotalXp");
        } else if (path[0] === "playerLevel") {
          fieldErrors.playerLevel = tErrors("invalidLevel", {
            min: MIN_LEVEL,
            max: MAX_LEVEL,
          });
        } else if (path[0] === "partyMembers") {
          if (issue.code === "custom") {
            // Refine-level error: party outside legal range.
            fieldErrors.partyRange = tErrors("illegalPartyRange");
          } else {
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
      }
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
      totalXp,
      playerLevel,
      playerVocation,
      partyMembers: validMembers,
    } = parsed.data;

    // BigInt conversion (Zod already validated finiteness).
    const totalXpBig = BigInt(totalXp);

    const calc = expShareSplit(
      totalXpBig,
      playerLevel,
      playerVocation,
      validMembers,
    );

    if (!calc.ok) {
      // Translate common calc-level errors to field errors.
      const code = calc.error.code;
      if (code === "EXP_SHARE_ILLEGAL_LEVEL_RANGE") {
        return {
          ok: false,
          fieldErrors: { partyRange: tErrors("illegalPartyRange") },
        };
      }
      if (code === "EXP_SHARE_DUPLICATE_NAMES") {
        return {
          ok: false,
          fieldErrors: { partyRange: tErrors("duplicateNames") },
        };
      }
      return {
        ok: false,
        fieldErrors: { totalXp: tErrors("invalidTotalXp") },
      };
    }

    const calcValue: ExpShareCalcResult = calc.value;
    const memberRows: MemberRow[] = calcValue.splits.map(
      (s): MemberRow => ({
        name: s.name,
        level: s.level,
        vocation:
          validMembers.find((m) => m.name === s.name)?.vocation ??
          "Knight",
        xp: s.xp,
      }),
    );

    return {
      ok: true,
      totalXp: totalXpBig,
      playerLevel,
      playerVocation,
      playerXp: calcValue.playerXp,
      party: validMembers,
      splits: memberRows,
      vocationBonus: calcValue.vocationBonus,
      distinctVocations: calcValue.distinctVocations,
      totalMembers: calcValue.totalMembers,
      isSolo: validMembers.length === 0,
    };
  }, [store, tErrors]);
}

// ───────────────────────────────────────────────────────────────────────
// Form column — `<ExpShareCalculator />`
// ───────────────────────────────────────────────────────────────────────

export function ExpShareCalculator() {
  const t = useTranslations("Calculators.expShare");
  const store = useExpShareState();
  const outcome = useComputed();

  const fieldErrors = outcome.ok ? null : outcome.fieldErrors;
  const memberErrors =
    fieldErrors?.partyMembers ??
    ({} as Record<number, { level?: string; name?: string }>);

  return (
    <CalculatorForm aria-label={t("title")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="totalXp"
          label={t("labels.totalXp")}
          help={t("labels.totalXpHelp")}
          error={fieldErrors?.totalXp}
        >
          <CalculatorNumberInput
            min={0}
            max={1_000_000_000_000}
            step={1000}
            value={store.totalXp}
            onChange={(event) => setTotalXp(event.target.value)}
            placeholder={t("labels.totalXpPlaceholder")}
          />
        </FormField>

        <FormField
          id="playerLevel"
          label={t("labels.playerLevel")}
          help={t("labels.playerLevelHelp", {
            min: MIN_LEVEL,
            max: MAX_LEVEL,
          })}
          error={fieldErrors?.playerLevel}
        >
          <CalculatorNumberInput
            min={MIN_LEVEL}
            max={MAX_LEVEL}
            step={1}
            value={store.playerLevel}
            onChange={(event) => setPlayerLevel(event.target.value)}
            placeholder={t("labels.playerLevelPlaceholder")}
          />
        </FormField>
      </div>

      <FormField
        id="playerVocation"
        label={t("labels.playerVocation")}
        help={t("labels.playerVocationHelp")}
      >
        <Select
          value={store.playerVocation}
          onValueChange={(value) =>
            setPlayerVocation(value as PartyVocation)
          }
        >
          <SelectTrigger id="playerVocation">
            <SelectValue
              placeholder={t("labels.playerVocationPlaceholder")}
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

      {fieldErrors?.partyRange ? (
        <p
          role="alert"
          aria-live="polite"
          className={cn(
            "rounded-md border border-destructive bg-destructive/10 px-3 py-2",
            "text-xs font-medium text-destructive",
          )}
        >
          {fieldErrors.partyRange}
        </p>
      ) : null}

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
                key={`member-${idx}`}
                className={cn(
                  "rounded-md border bg-card p-3",
                  errs && "border-destructive",
                )}
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_5rem_8rem_auto]">
                  <FormField
                    id={`member-${idx}-name`}
                    label={t("labels.memberName")}
                    error={errs?.name}
                  >
                    <Input
                      id={`member-${idx}-name`}
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
                    id={`member-${idx}-level`}
                    label={t("labels.memberLevel")}
                    error={errs?.level}
                  >
                    <CalculatorNumberInput
                      id={`member-${idx}-level`}
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
                    id={`member-${idx}-vocation`}
                    label={t("labels.memberVocation")}
                  >
                    <Select
                      value={m.vocation}
                      onValueChange={(value) =>
                        setPartyMember(idx, {
                          vocation: value as PartyVocation,
                        })
                      }
                    >
                      <SelectTrigger
                        id={`member-${idx}-vocation`}
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
// Result column — `<ExpShareResult />`
// ───────────────────────────────────────────────────────────────────────

export function ExpShareResult() {
  const t = useTranslations("Calculators.expShare");
  const format = useFormatter();
  const outcome = useComputed();

  if (!outcome.ok) {
    return <ResultDisplay empty />;
  }

  const {
    playerXp,
    splits,
    vocationBonus,
    distinctVocations,
    totalMembers,
    isSolo,
    playerLevel,
    playerVocation,
  } = outcome;

  // ── Recommendation ─────────────────────────────────────────────────
  //   - solo (no party)       → "Solo, all XP to you"
  //   - 1 vocation            → info (Tibia baseline +20 %)
  //   - 2-3 vocations         → success (good bonus)
  //   - 4-5 vocations         → success (max bonus)
  const recommendation = isSolo
    ? {
        tone: "info" as const,
        message: t("recommendations.solo"),
      }
    : distinctVocations <= 1
      ? {
          tone: "info" as const,
          message: t("recommendations.bonusLow", {
            bonus: format.number(Math.round(vocationBonus * 100), {
              useGrouping: true,
            }),
          }),
        }
      : distinctVocations === 5
        ? {
            tone: "success" as const,
            message: t("recommendations.bonusMax", {
              bonus: format.number(Math.round(vocationBonus * 100), {
                useGrouping: true,
              }),
            }),
          }
        : {
            tone: "success" as const,
            message: t("recommendations.bonusOk", {
              bonus: format.number(Math.round(vocationBonus * 100), {
                useGrouping: true,
              }),
              count: distinctVocations,
            }),
          };

  return (
    <div className="flex flex-col gap-4">
      <ResultDisplay
        primaryValue={playerXp}
        primaryLabel={t("result.playerShareLabel")}
        unit="XP"
        secondaryValues={[
          {
            label: t("result.distinctVocations"),
            value: format.number(distinctVocations, { useGrouping: true }),
          },
          {
            label: t("result.vocationBonus"),
            value: `${format.number(Math.round(vocationBonus * 100), {
              useGrouping: true,
            })}%`,
          },
          {
            label: t("result.totalMembers"),
            value: format.number(totalMembers, { useGrouping: true }),
          },
        ]}
        recommendation={recommendation}
      />

      {/* Per-member breakdown table — sibling card below the result. */}
      <div className="rounded-lg border bg-card text-sm shadow-sm">
        <div className="border-b p-4 sm:p-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("result.tableTitle")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("result.tableSubtitle", {
              count: totalMembers,
              level: format.number(playerLevel, { useGrouping: true }),
              vocation: t(`vocations.${playerVocation}`),
            })}
          </p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("result.table.name")}</TableHead>
              <TableHead scope="col" className="text-right">
                {t("result.table.level")}
              </TableHead>
              <TableHead scope="col">{t("result.table.vocation")}</TableHead>
              <TableHead scope="col" className="text-right">
                {t("result.table.xpShare")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-primary/5 font-medium">
              <TableCell>
                <span className="font-semibold text-foreground">
                  {t("result.table.you")}
                </span>
              </TableCell>
              <TableCell className="numeric text-right tabular-nums">
                {format.number(playerLevel, { useGrouping: true })}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t(`vocations.${playerVocation}`)}
              </TableCell>
              <TableCell className="numeric text-right tabular-nums font-semibold">
                {format.number(playerXp, { useGrouping: true })}
              </TableCell>
            </TableRow>
            {splits.map((s, idx) => (
              <TableRow key={`${s.name}-${idx}`}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="numeric text-right tabular-nums">
                  {format.number(s.level, { useGrouping: true })}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t(`vocations.${s.vocation}`)}
                </TableCell>
                <TableCell className="numeric text-right tabular-nums">
                  {format.number(s.xp, { useGrouping: true })}
                </TableCell>
              </TableRow>
            ))}
            {splits.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-xs italic text-muted-foreground"
                >
                  {t("result.table.soloNote")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
