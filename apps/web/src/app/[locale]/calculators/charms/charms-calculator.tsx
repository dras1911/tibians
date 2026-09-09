"use client";

import * as React from "react";
import { z } from "zod";
import {
  charmDamage,
  type CharmId,
  type CharmSkill,
  type CharmVocation,
  type MonsterSensitivity,
} from "@tibians/calc";
import { useFormatter, useTranslations } from "next-intl";

import {
  CalculatorForm,
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
 * `CharmsCalculator` — interactive form + result for
 * `/calculators/charms` (T21, TibiaPal benchmark + TibiaWiki Major_Charms,
 * arch §2.1).
 *
 * Computes the damage % per proc for a charm on a monster with a given
 * sensitivity, for a specific vocation/skill.
 *
 * Architecture:
 *   - Module-level store (`useSyncExternalStore`) so form + result share
 *     state without React context (CalculatorLayout renders them as siblings).
 *   - Zod validates enum values locally before calling the pure formula.
 *
 * Edge cases surfaced via Zod + pure formula:
 *   - Invalid enum values → enum validation errors
 *   - Monster immune (elemental charm) → 0% damage + isImmune flag
 *   - Self-scaling charms (Overpower/Overflux) → monsterType ignored
 */

const VOCATIONS: readonly CharmVocation[] = [
  "Knight",
  "Paladin",
  "Druid",
  "Sorcerer",
  "Monk",
];

const SKILLS: readonly CharmSkill[] = [
  "sword",
  "axe",
  "club",
  "distance",
  "magic",
  "shielding",
  "fist",
  "none",
];

const CHARMS: readonly CharmId[] = [
  "wound",
  "enflame",
  "freeze",
  "poison",
  "zap",
  "curse",
  "divineWrath",
  "overpower",
  "overflux",
];

const MONSTER_TYPES: readonly MonsterSensitivity[] = [
  "weak",
  "neutral",
  "resistant",
  "immune",
];

const formSchema = z.object({
  vocation: z.enum(["Knight", "Paladin", "Druid", "Sorcerer", "Monk"]),
  skill: z.enum([
    "sword",
    "axe",
    "club",
    "distance",
    "magic",
    "shielding",
    "fist",
    "none",
  ]),
  charm: z.enum([
    "wound",
    "enflame",
    "freeze",
    "poison",
    "zap",
    "curse",
    "divineWrath",
    "overpower",
    "overflux",
  ]),
  monsterType: z.enum(["weak", "neutral", "resistant", "immune"]),
});

// ───────────────────────────────────────────────────────────────────────
// Module-level store
// ───────────────────────────────────────────────────────────────────────

interface StoreState {
  vocation: CharmVocation;
  skill: CharmSkill;
  charm: CharmId;
  monsterType: MonsterSensitivity;
}

const initialState: StoreState = {
  vocation: "Knight",
  skill: "sword",
  charm: "overpower",
  monsterType: "neutral",
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

interface OkOutcome {
  ok: true;
  damagePercent: number;
  basePercent: number;
  sensitivityMultiplier: number;
  vocationModifier: number;
  skillModifier: number;
  isImmune: boolean;
  charm: CharmId;
  vocation: CharmVocation;
  skill: CharmSkill;
  monsterType: MonsterSensitivity;
  recommendation: Recommendation;
  secondary: ResultSecondaryValue[];
}

interface ErrOutcome {
  ok: false;
  fieldErrors: Partial<Record<keyof StoreState, string>>;
}

type Outcome = OkOutcome | ErrOutcome;

function useComputed(): Outcome {
  const tErrors = useTranslations("Calculators.charms.errors");
  const tResult = useTranslations("Calculators.charms.result");
  const tRecs = useTranslations("Calculators.charms.recommendations");
  const tCharms = useTranslations("Calculators.charms.charms");
  const tSkills = useTranslations("Calculators.charms.skills");
  const format = useFormatter();
  const store = useStore();

  return React.useMemo<Outcome>(() => {
    const parsed = formSchema.safeParse({
      vocation: store.vocation,
      skill: store.skill,
      charm: store.charm,
      monsterType: store.monsterType,
    });

    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof StoreState, string>> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === "string") {
          const key = path as keyof StoreState;
          const messageKey = issue.message as Parameters<typeof tErrors>[0];
          fieldErrors[key] = tErrors(messageKey);
        }
      }
      return { ok: false, fieldErrors };
    }

    const { vocation, skill, charm, monsterType } = parsed.data;

    const calcResult = charmDamage(vocation, skill, charm, monsterType);
    if (!calcResult.ok) {
      return {
        ok: false,
        fieldErrors: { charm: tErrors("invalidCharm") },
      };
    }

    const {
      damagePercent,
      basePercent,
      sensitivityMultiplier,
      vocationModifier,
      skillModifier,
      isImmune,
    } = calcResult.value;

    // Recommendation logic — context-aware
    let recommendation: Recommendation;
    if (isImmune) {
      recommendation = {
        tone: "warning",
        message: tRecs("immune"),
      };
    } else if (monsterType === "resistant") {
      recommendation = {
        tone: "warning",
        message: tRecs("resistant"),
      };
    } else if (monsterType === "weak") {
      recommendation = {
        tone: "success",
        message: tRecs("weakAgainst"),
      };
    } else if (damagePercent >= 6) {
      recommendation = {
        tone: "success",
        message: tRecs("goodDmg"),
      };
    } else if (charm === "overpower" && vocation === "Knight") {
      recommendation = {
        tone: "info",
        message: tRecs("knightOverpower"),
      };
    } else if (charm === "overflux" && (vocation === "Druid" || vocation === "Sorcerer")) {
      recommendation = {
        tone: "info",
        message: tRecs("mageOverflux"),
      };
    } else if (charm === "overflux" && skill === "magic") {
      recommendation = {
        tone: "info",
        message: tRecs("magicSkillBonus"),
      };
    } else if (
      charm === "overpower" &&
      (skill === "sword" || skill === "axe" || skill === "club" || skill === "fist")
    ) {
      recommendation = {
        tone: "info",
        message: tRecs("meleeSkillBonus"),
      };
    } else {
      recommendation = {
        tone: "neutral",
        message: "",
      };
    }

    return {
      ok: true,
      damagePercent,
      basePercent,
      sensitivityMultiplier,
      vocationModifier,
      skillModifier,
      isImmune,
      charm,
      vocation,
      skill,
      monsterType,
      recommendation,
      secondary: [
        {
          label: tResult("charm"),
          value: tCharms(charm),
        },
        {
          label: tResult("skill"),
          value: tSkills(skill),
        },
        {
          label: tResult("basePercent"),
          value: format.number(basePercent, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
          unit: "%",
        },
        {
          label: tResult("sensitivityMultiplier"),
          value: format.number(sensitivityMultiplier, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
          }),
          unit: "×",
        },
        {
          label: tResult("vocationModifier"),
          value: format.number(vocationModifier, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
          }),
          unit: "×",
        },
        {
          label: tResult("skillModifier"),
          value: format.number(skillModifier, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
          }),
          unit: "×",
        },
      ],
    };
  }, [store, format, tErrors, tResult, tRecs, tCharms, tSkills]);
}

// ───────────────────────────────────────────────────────────────────────
// Form column — `<CharmsForm />`
// ───────────────────────────────────────────────────────────────────────

export function CharmsForm() {
  const t = useTranslations("Calculators.charms");
  const tFields = useTranslations("Calculators.charms.fields");
  const tVoc = useTranslations("Calculators.charms.vocations");
  const tSkills = useTranslations("Calculators.charms.skills");
  const tCharms = useTranslations("Calculators.charms.charms");
  const tMonster = useTranslations("Calculators.charms.monsterTypes");
  const store = useStore();
  const outcome = useComputed();
  const fieldErrors = outcome.ok ? {} : outcome.fieldErrors;

  return (
    <CalculatorForm aria-label={t("title")}>
      <FormField
        id="ch-vocation"
        label={tFields("vocation.label")}
        help={tFields("vocation.help")}
        error={fieldErrors.vocation}
      >
        <Select
          value={store.vocation}
          onValueChange={(value) =>
            patchState({ vocation: value as CharmVocation })
          }
        >
          <SelectTrigger id="ch-vocation">
            <SelectValue placeholder={tFields("vocation.placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {VOCATIONS.map((v) => (
              <SelectItem key={v} value={v}>
                {tVoc(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        id="ch-skill"
        label={tFields("skill.label")}
        help={tFields("skill.help")}
        error={fieldErrors.skill}
      >
        <Select
          value={store.skill}
          onValueChange={(value) =>
            patchState({ skill: value as CharmSkill })
          }
        >
          <SelectTrigger id="ch-skill">
            <SelectValue placeholder={tFields("skill.placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {SKILLS.map((s) => (
              <SelectItem key={s} value={s}>
                {tSkills(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        id="ch-charm"
        label={tFields("charm.label")}
        help={tFields("charm.help")}
        error={fieldErrors.charm}
      >
        <Select
          value={store.charm}
          onValueChange={(value) =>
            patchState({ charm: value as CharmId })
          }
        >
          <SelectTrigger id="ch-charm">
            <SelectValue placeholder={tFields("charm.placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {CHARMS.map((c) => (
              <SelectItem key={c} value={c}>
                {tCharms(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        id="ch-monsterType"
        label={tFields("monsterType.label")}
        help={tFields("monsterType.help")}
        error={fieldErrors.monsterType}
      >
        <Select
          value={store.monsterType}
          onValueChange={(value) =>
            patchState({ monsterType: value as MonsterSensitivity })
          }
        >
          <SelectTrigger id="ch-monsterType">
            <SelectValue placeholder={tFields("monsterType.placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {MONSTER_TYPES.map((m) => (
              <SelectItem key={m} value={m}>
                {tMonster(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </CalculatorForm>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Result column — `<CharmsResult />`
// ───────────────────────────────────────────────────────────────────────

export function CharmsResult() {
  const tResult = useTranslations("Calculators.charms.result");
  const outcome = useComputed();

  if (!outcome.ok) {
    return <ResultDisplay empty />;
  }

  return (
    <ResultDisplay
      primaryValue={outcome.damagePercent}
      primaryLabel={tResult("damageLabel")}
      unit="%"
      secondaryValues={outcome.secondary}
      recommendation={outcome.recommendation}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────
// Compound wrapper
// ───────────────────────────────────────────────────────────────────────

/**
 * Compound entry-point consumed by `/calculators/charms/page.tsx`.
 * The form column is `<CharmsCalculator />`; the result column reads
 * from the same module-level store via `CharmsCalculator.Result`.
 */
export function CharmsCalculator() {
  return <CharmsForm />;
}

CharmsCalculator.Result = CharmsResult;
