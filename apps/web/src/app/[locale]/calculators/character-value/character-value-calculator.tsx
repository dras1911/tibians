"use client";

import * as React from "react";
import { z } from "zod";
import {
  estimateCharacterValue,
  type CharacterSnapshot,
  type CharacterValueItem,
  type CharacterValueBreakdown,
  type SkillKey,
  type ValuationConfig,
} from "@tibians/calc";
import type { VocationBase, VocationPromoted } from "@tibians/character-context";
import { Coins, Shield, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  CalculatorForm,
  CalculatorNumberInput,
  FormField,
  ResultDisplay,
  type Recommendation,
  type ResultSecondaryValue,
} from "@/components/calculators";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

/**
 * `CharacterValueCalculator` — interaktywny formularz + wynik dla
 * `/calculators/character-value` (T22, arch §8.4 — killer feature).
 *
 * Pełny `CharacterSnapshot` jako input (arch §13.1):
 *   - Identity: name, level, vocation, sex, world
 *   - Skills: 8 (magic, sword, axe, club, distance, shielding, fist, fishing)
 *   - Progression: charmy, boss points, questy, imbuementy, achievementy, animus
 *   - Assets: gold, tcInvested, store outfits/mounts/items, hirelings, gems
 *   - Flags: 7 booleanów + blessingsActive slider 0–7
 *
 * Wskaźnik okazji (free tier): jeśli user poda `marketBid`, obliczamy
 *   `deltaPercent = ((estimatedValue - marketBid) / marketBid) * 100`
 *   - delta < -5% → "underpriced" (okazja, sukces)
 *   - delta > +5% → "overpriced" (przepłacasz, warning)
 *   - inaczej → "fair price" (neutral)
 *
 * Breakdown rozwijalny (Premium): `<Accordion>` z `<PremiumBlur>` — na T22
 * pokazujemy wszystko (realny auth gate w T84/85).
 *
 * Architecture:
 *   - Module-level store (`useSyncExternalStore`) — form + result share state.
 *   - Server-rendered `<CalculatorLayout>` z dwoma client islands.
 *   - Zod validation + `formDataToSnapshot` z `@tibians/character-context`.
 */

const SKILL_KEYS = [
  "magic",
  "club",
  "fist",
  "sword",
  "axe",
  "distance",
  "shielding",
  "fishing",
] as const;

const VOCATIONS = ["Knight", "Paladin", "Druid", "Sorcerer", "Monk"] as const;
const SEXES = ["M", "F"] as const;

// ───────────────────────────────────────────────────────────────────────
// Zod schema — walidacja formularza
// ───────────────────────────────────────────────────────────────────────

// Walidacja per skill — Zod schemas for 8 SkillKey keys (explicit object for
// type inference; `z.record(z.string(), ...)` would lose key types).
const skillEntrySchema = z.coerce.number().int().min(0);
const skillsBaseSchema = z.object({
  magic: skillEntrySchema,
  club: skillEntrySchema,
  fist: skillEntrySchema,
  sword: skillEntrySchema,
  axe: skillEntrySchema,
  distance: skillEntrySchema,
  shielding: skillEntrySchema,
  fishing: skillEntrySchema,
});

const formSchema = z
  .object({
    name: z.string().min(1, "invalidName"),
    level: z.coerce
      .number({ invalid_type_error: "invalidLevel" })
      .int("invalidLevel")
      .min(8, "invalidLevel")
      .max(2_500, "invalidLevel"),
    vocation: z.enum(VOCATIONS),
    sex: z.enum(SEXES),
    world: z.string().optional(),

    skillsBase: skillsBaseSchema,

    charmPoints: z.coerce.number().int().min(0),
    charmPointsUnused: z.coerce.number().int().min(0),
    minorCharmEchoes: z.coerce.number().int().min(0),
    bossPoints: z.coerce.number().int().min(0),
    questsCompleted: z.coerce.number().int().min(0),
    questsTotal: z.coerce.number().int().min(0),
    imbuementsUnlocked: z.coerce.number().int().min(0),
    imbuementsTotal: z.coerce.number().int().min(0),
    achievementPoints: z.coerce.number().int().min(0),
    animusMasteries: z.coerce.number().int().min(0),

    goldTotal: z.coerce
      .number({ invalid_type_error: "invalidGold" })
      .int("invalidGold")
      .min(0, "invalidGold"),
    tcInvested: z
      .union([z.literal(""), z.coerce.number().int().min(0, "invalidTcInvested")])
      .optional(),
    storeOutfits: z.coerce.number().int().min(0),
    storeMounts: z.coerce.number().int().min(0),
    storeItems: z.coerce.number().int().min(0),
    hirelings: z.coerce.number().int().min(0),
    gemsLesser: z.coerce.number().int().min(0),
    gemsRegular: z.coerce.number().int().min(0),
    gemsGreater: z.coerce.number().int().min(0),

    soulWar: z.boolean(),
    primalOrdeal: z.boolean(),
    worldTransfer: z.boolean(),
    preySlot: z.boolean(),
    charmExpansion: z.boolean(),
    weeklyTaskExpansion: z.boolean(),
    twistOfFate: z.boolean(),
    blessingsActive: z.coerce.number().int().min(0, "invalidBlessings").max(7, "invalidBlessings"),

    marketBid: z.union([z.literal(""), z.coerce.number().int().min(0)]).optional(),
  })
  .refine((d) => d.questsCompleted <= d.questsTotal, {
    message: "invalidQuests",
    path: ["questsCompleted"],
  })
  .refine((d) => d.imbuementsUnlocked <= d.imbuementsTotal, {
    message: "invalidImbuements",
    path: ["imbuementsUnlocked"],
  });

type FormData = z.infer<typeof formSchema>;

// ───────────────────────────────────────────────────────────────────────
// Store
// ───────────────────────────────────────────────────────────────────────

interface StoreState {
  name: string;
  level: string;
  vocation: VocationBase;
  sex: "M" | "F";
  world: string;

  skillsBase: Record<SkillKey, string>;

  charmPoints: string;
  charmPointsUnused: string;
  minorCharmEchoes: string;
  bossPoints: string;
  questsCompleted: string;
  questsTotal: string;
  imbuementsUnlocked: string;
  imbuementsTotal: string;
  achievementPoints: string;
  animusMasteries: string;

  goldTotal: string;
  tcInvested: string;
  storeOutfits: string;
  storeMounts: string;
  storeItems: string;
  hirelings: string;
  gemsLesser: string;
  gemsRegular: string;
  gemsGreater: string;

  soulWar: boolean;
  primalOrdeal: boolean;
  worldTransfer: boolean;
  preySlot: boolean;
  charmExpansion: boolean;
  weeklyTaskExpansion: boolean;
  twistOfFate: boolean;
  blessingsActive: number;

  marketBid: string;
}

function skillRecord(initial: Record<SkillKey, string>): Record<SkillKey, string> {
  return { ...initial };
}

const initialState: StoreState = {
  name: "Migzen",
  level: "619",
  vocation: "Knight",
  sex: "M",
  world: "Jadebra",

  skillsBase: skillRecord({
    magic: "47",
    club: "25",
    fist: "113",
    sword: "110",
    axe: "25",
    distance: "110",
    shielding: "105",
    fishing: "20",
  }),

  charmPoints: "7611",
  charmPointsUnused: "0",
  minorCharmEchoes: "0",
  bossPoints: "2340",
  questsCompleted: "28",
  questsTotal: "42",
  imbuementsUnlocked: "11",
  imbuementsTotal: "23",
  achievementPoints: "1000",
  animusMasteries: "180",

  goldTotal: "200000",
  tcInvested: "3900",
  storeOutfits: "3",
  storeMounts: "2",
  storeItems: "5",
  hirelings: "0",
  gemsLesser: "44",
  gemsRegular: "0",
  gemsGreater: "0",

  soulWar: true,
  primalOrdeal: false,
  worldTransfer: false,
  preySlot: true,
  charmExpansion: true,
  weeklyTaskExpansion: false,
  twistOfFate: false,
  blessingsActive: 5,

  marketBid: "25501",
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
// Vocation mapping
// ───────────────────────────────────────────────────────────────────────

const VOCATION_TO_PROMOTED: Readonly<Record<VocationBase, VocationPromoted>> = {
  Knight: "Elite Knight",
  Paladin: "Royal Paladin",
  Druid: "Elder Druid",
  Sorcerer: "Master Sorcerer",
  Monk: "Exalted Monk",
};

// ───────────────────────────────────────────────────────────────────────
// Snapshot builder + computed outcome
// ───────────────────────────────────────────────────────────────────────

interface OkOutcome {
  ok: true;
  estimatedValue: bigint;
  confidence: number;
  confidenceSymbol: "~" | "≈";
  primaryLabel: string;
  recommendation: Recommendation;
  secondary: ResultSecondaryValue[];
  breakdown: CharacterValueBreakdown;
  deltaPercent: number | null;
}

interface ErrOutcome {
  ok: false;
  fieldErrors: Partial<Record<string, string>>;
}

type Outcome = OkOutcome | ErrOutcome;

function useComputed(
  config: ValuationConfig,
  tErrors: ReturnType<typeof useTranslations>,
): Outcome {
  const tResult = useTranslations("Calculators.characterValue.result");
  const tRecs = useTranslations("Calculators.characterValue.recommendations");
  const tBreakdown = useTranslations("Calculators.characterValue.breakdown");
  const format = useFormatter();
  const store = useStore();

  return React.useMemo<Outcome>(() => {
    // ── Parse skillsBase ──
    const skillsBase = {} as Record<SkillKey, number>;
    for (const key of SKILL_KEYS) {
      skillsBase[key] = Number(store.skillsBase[key] ?? 0);
    }

    const parsed = formSchema.safeParse({
      name: store.name,
      level: store.level,
      vocation: store.vocation,
      sex: store.sex,
      world: store.world,
      skillsBase,
      charmPoints: store.charmPoints,
      charmPointsUnused: store.charmPointsUnused,
      minorCharmEchoes: store.minorCharmEchoes,
      bossPoints: store.bossPoints,
      questsCompleted: store.questsCompleted,
      questsTotal: store.questsTotal,
      imbuementsUnlocked: store.imbuementsUnlocked,
      imbuementsTotal: store.imbuementsTotal,
      achievementPoints: store.achievementPoints,
      animusMasteries: store.animusMasteries,
      goldTotal: store.goldTotal,
      tcInvested: store.tcInvested,
      storeOutfits: store.storeOutfits,
      storeMounts: store.storeMounts,
      storeItems: store.storeItems,
      hirelings: store.hirelings,
      gemsLesser: store.gemsLesser,
      gemsRegular: store.gemsRegular,
      gemsGreater: store.gemsGreater,
      soulWar: store.soulWar,
      primalOrdeal: store.primalOrdeal,
      worldTransfer: store.worldTransfer,
      preySlot: store.preySlot,
      charmExpansion: store.charmExpansion,
      weeklyTaskExpansion: store.weeklyTaskExpansion,
      twistOfFate: store.twistOfFate,
      blessingsActive: store.blessingsActive,
      marketBid: store.marketBid,
    });

    if (!parsed.success) {
      const fieldErrors: Partial<Record<string, string>> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === "string") {
          const messageKey = issue.message as Parameters<typeof tErrors>[0];
          fieldErrors[path] = tErrors(messageKey);
        }
      }
      return { ok: false, fieldErrors };
    }

    // Po refine() Zod traci nieco inferencji — rzutujemy na FormData
    // (typ zweryfikowany w runtime przez safeParse).
    const data = parsed.data as unknown as FormData;

    // ── Budowa CharacterSnapshot ──────────────────────────────────────
    const skills = {} as CharacterSnapshot["skills"];
    for (const key of SKILL_KEYS) {
      skills[key] = { base: skillsBase[key] };
    }

    const candidate: CharacterSnapshot = {
      source: { kind: "manual" },
      identity: {
        name: data.name,
        level: data.level,
        vocation: data.vocation,
        vocationPromoted: VOCATION_TO_PROMOTED[data.vocation],
        sex: data.sex,
        ...(data.world && data.world !== "" ? { world: data.world } : {}),
      },
      skills,
      progression: {
        charmPoints: data.charmPoints,
        charmPointsUnused: data.charmPointsUnused,
        minorCharmEchoes: data.minorCharmEchoes,
        bossPoints: data.bossPoints,
        questsCompleted: data.questsCompleted,
        questsTotal: data.questsTotal,
        imbuementsUnlocked: data.imbuementsUnlocked,
        imbuementsTotal: data.imbuementsTotal,
        achievementPoints: data.achievementPoints,
        animusMasteries: data.animusMasteries,
      },
      assets: {
        items: [],
        outfits: [],
        mounts: [],
        gems: {
          lesser: data.gemsLesser,
          regular: data.gemsRegular,
          greater: data.gemsGreater,
        },
        goldTotal: data.goldTotal,
        ...(data.tcInvested !== "" && data.tcInvested !== undefined
          ? { tcInvested: data.tcInvested }
          : {}),
        storeCounts: {
          outfits: data.storeOutfits,
          mounts: data.storeMounts,
          items: data.storeItems,
        },
        hirelings: data.hirelings,
      },
      flags: {
        soulWar: data.soulWar,
        primalOrdeal: data.primalOrdeal,
        worldTransfer: data.worldTransfer,
        preySlot: data.preySlot,
        charmExpansion: data.charmExpansion,
        weeklyTaskExpansion: data.weeklyTaskExpansion,
        twistOfFate: data.twistOfFate,
        blessingsActive: data.blessingsActive,
      },
    };

    const calc = estimateCharacterValue(candidate, config);
    if (!calc.ok) {
      return { ok: false, fieldErrors: { _global: tErrors("invalidVocation") } };
    }

    const { estimatedValue, breakdown, confidence, confidenceSymbol } = calc.value;
    const formattedValue = format.number(estimatedValue, { useGrouping: true });

    // ── Market delta (opcjonalny) ──────────────────────────────────────
    let deltaPercent: number | null = null;
    const marketBid =
      data.marketBid !== "" && data.marketBid !== undefined ? Number(data.marketBid) : null;
    if (marketBid !== null && marketBid > 0) {
      deltaPercent = ((Number(estimatedValue) - marketBid) / marketBid) * 100;
    }

    // ── Rekomendacja ──────────────────────────────────────────────────
    let recommendation: Recommendation;
    if (marketBid !== null && marketBid > 0 && deltaPercent !== null) {
      if (deltaPercent < -5) {
        recommendation = {
          tone: "success",
          message: tRecs("underpriced", {
            bid: format.number(marketBid, { useGrouping: true }),
            value: formattedValue,
            delta: format.number(Math.abs(deltaPercent), {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          }),
        };
      } else if (deltaPercent > 5) {
        recommendation = {
          tone: "warning",
          message: tRecs("overpriced", {
            bid: format.number(marketBid, { useGrouping: true }),
            value: formattedValue,
            delta: format.number(Math.abs(deltaPercent), {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          }),
        };
      } else {
        recommendation = {
          tone: "info",
          message: tRecs("fairPrice", {
            delta: format.number(Math.abs(deltaPercent), {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          }),
        };
      }
    } else {
      recommendation = {
        tone: "success",
        message: tRecs("ok", { value: formattedValue }),
      };
    }

    // ── Secondary values (ResultDisplay) ──────────────────────────────
    const secondary: ResultSecondaryValue[] = [
      {
        label: tResult("confidenceLabel"),
        value: format.number(Math.round(confidence * 100), { useGrouping: true }) + "%",
      },
    ];
    if (marketBid !== null && marketBid > 0 && deltaPercent !== null) {
      secondary.push({
        label: tResult("marketLabel"),
        value: format.number(marketBid, { useGrouping: true }) + " TC",
      });
      secondary.push({
        label: tResult("deltaLabel"),
        value:
          (deltaPercent > 0 ? "+" : "") +
          format.number(deltaPercent, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }) +
          "%",
      });
    }

    return {
      ok: true,
      estimatedValue,
      confidence,
      confidenceSymbol,
      primaryLabel: tResult("estimatedLabel"),
      recommendation,
      secondary,
      breakdown,
      deltaPercent,
    };
  }, [store, config, format, tErrors, tResult, tRecs, tBreakdown]);
}

// ───────────────────────────────────────────────────────────────────────
// Form
// ───────────────────────────────────────────────────────────────────────

interface CharacterValueCalculatorProps {
  config: ValuationConfig;
}

export function CharacterValueForm({ config: _config }: CharacterValueCalculatorProps) {
  const t = useTranslations("Calculators.characterValue");
  const tIdentity = useTranslations("Calculators.characterValue.identity");
  const tProgression = useTranslations("Calculators.characterValue.progression");
  const tAssets = useTranslations("Calculators.characterValue.assets");
  const tSkills = useTranslations("Calculators.characterValue.skills");
  const tFlags = useTranslations("Calculators.characterValue.flags");
  const tMarket = useTranslations("Calculators.characterValue.market");
  const tVocations = useTranslations("Calculators.characterValue.vocations");
  const tSkillKeys = useTranslations("Calculators.characterValue.skillKeys");
  const tSexes = useTranslations("Calculators.characterValue.sexes");
  const tErrors = useTranslations("Calculators.characterValue.errors");
  const store = useStore();
  const outcome = useComputed(_config, tErrors);
  const fieldErrors = outcome.ok ? {} : outcome.fieldErrors;

  return (
    <CalculatorForm aria-label={t("title")}>
      {/* ── IDENTITY ────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {tIdentity("sectionLabel")}
        </legend>
        <FormField id="cv-name" label={tIdentity("name.label")} error={fieldErrors.name}>
          <CalculatorNumberInput
            id="cv-name"
            type="text"
            value={store.name}
            onChange={(e) => patchState({ name: e.target.value })}
            placeholder={tIdentity("name.placeholder")}
            className="numeric"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField
            id="cv-level"
            label={tIdentity("level.label")}
            help={tIdentity("level.help")}
            error={fieldErrors.level}
          >
            <CalculatorNumberInput
              id="cv-level"
              min={8}
              max={2500}
              step={1}
              value={store.level}
              onChange={(e) => patchState({ level: e.target.value })}
              placeholder={tIdentity("level.placeholder")}
            />
          </FormField>

          <FormField
            id="cv-vocation"
            label={tIdentity("vocation.label")}
            help={tIdentity("vocation.help")}
            error={fieldErrors.vocation}
          >
            <Select
              value={store.vocation}
              onValueChange={(v) => patchState({ vocation: v as VocationBase })}
            >
              <SelectTrigger id="cv-vocation">
                <SelectValue placeholder="Vocation" />
              </SelectTrigger>
              <SelectContent>
                {VOCATIONS.map((v) => (
                  <SelectItem key={v} value={v}>
                    {tVocations(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField id="cv-sex" label={tIdentity("sex.label")}>
            <Select value={store.sex} onValueChange={(v) => patchState({ sex: v as "M" | "F" })}>
              <SelectTrigger id="cv-sex">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEXES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tSexes(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField id="cv-world" label={tIdentity("world.label")} help={tIdentity("world.help")}>
            <CalculatorNumberInput
              id="cv-world"
              type="text"
              value={store.world}
              onChange={(e) => patchState({ world: e.target.value })}
              placeholder={tIdentity("world.placeholder")}
              className="numeric"
            />
          </FormField>
        </div>
      </fieldset>

      {/* ── SKILLS (8) ─────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {tSkills("sectionLabel")}
        </legend>
        <p className="text-xs text-muted-foreground">{tSkills("help")}</p>
        <div className="grid grid-cols-2 gap-3">
          {SKILL_KEYS.map((key) => (
            <FormField
              key={key}
              id={`cv-skill-${key}`}
              label={tSkillKeys(key)}
              error={fieldErrors[`skillsBase.${key}`]}
            >
              <CalculatorNumberInput
                id={`cv-skill-${key}`}
                min={0}
                max={250}
                step={1}
                value={store.skillsBase[key]}
                onChange={(e) =>
                  patchState({
                    skillsBase: { ...store.skillsBase, [key]: e.target.value },
                  })
                }
                placeholder="0"
              />
            </FormField>
          ))}
        </div>
      </fieldset>

      {/* ── PROGRESSION ────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {tProgression("sectionLabel")}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            id="cv-charmPoints"
            label={tProgression("charmPoints.label")}
            help={tProgression("charmPoints.help")}
          >
            <CalculatorNumberInput
              id="cv-charmPoints"
              min={0}
              value={store.charmPoints}
              onChange={(e) => patchState({ charmPoints: e.target.value })}
              placeholder={tProgression("charmPoints.placeholder")}
            />
          </FormField>

          <FormField id="cv-charmPointsUnused" label={tProgression("charmPointsUnused.label")}>
            <CalculatorNumberInput
              id="cv-charmPointsUnused"
              min={0}
              value={store.charmPointsUnused}
              onChange={(e) => patchState({ charmPointsUnused: e.target.value })}
              placeholder={tProgression("charmPointsUnused.placeholder")}
            />
          </FormField>

          <FormField id="cv-minorCharmEchoes" label={tProgression("minorCharmEchoes.label")}>
            <CalculatorNumberInput
              id="cv-minorCharmEchoes"
              min={0}
              value={store.minorCharmEchoes}
              onChange={(e) => patchState({ minorCharmEchoes: e.target.value })}
              placeholder={tProgression("minorCharmEchoes.placeholder")}
            />
          </FormField>

          <FormField id="cv-bossPoints" label={tProgression("bossPoints.label")}>
            <CalculatorNumberInput
              id="cv-bossPoints"
              min={0}
              value={store.bossPoints}
              onChange={(e) => patchState({ bossPoints: e.target.value })}
              placeholder={tProgression("bossPoints.placeholder")}
            />
          </FormField>

          <FormField
            id="cv-questsCompleted"
            label={tProgression("questsCompleted.label")}
            error={fieldErrors.questsCompleted}
          >
            <CalculatorNumberInput
              id="cv-questsCompleted"
              min={0}
              value={store.questsCompleted}
              onChange={(e) => patchState({ questsCompleted: e.target.value })}
              placeholder={tProgression("questsCompleted.placeholder")}
            />
          </FormField>

          <FormField id="cv-questsTotal" label={tProgression("questsTotal.label")}>
            <CalculatorNumberInput
              id="cv-questsTotal"
              min={0}
              value={store.questsTotal}
              onChange={(e) => patchState({ questsTotal: e.target.value })}
              placeholder={tProgression("questsTotal.placeholder")}
            />
          </FormField>

          <FormField
            id="cv-imbuementsUnlocked"
            label={tProgression("imbuementsUnlocked.label")}
            error={fieldErrors.imbuementsUnlocked}
          >
            <CalculatorNumberInput
              id="cv-imbuementsUnlocked"
              min={0}
              value={store.imbuementsUnlocked}
              onChange={(e) => patchState({ imbuementsUnlocked: e.target.value })}
              placeholder={tProgression("imbuementsUnlocked.placeholder")}
            />
          </FormField>

          <FormField id="cv-imbuementsTotal" label={tProgression("imbuementsTotal.label")}>
            <CalculatorNumberInput
              id="cv-imbuementsTotal"
              min={0}
              value={store.imbuementsTotal}
              onChange={(e) => patchState({ imbuementsTotal: e.target.value })}
              placeholder={tProgression("imbuementsTotal.placeholder")}
            />
          </FormField>

          <FormField id="cv-achievementPoints" label={tProgression("achievementPoints.label")}>
            <CalculatorNumberInput
              id="cv-achievementPoints"
              min={0}
              value={store.achievementPoints}
              onChange={(e) => patchState({ achievementPoints: e.target.value })}
              placeholder={tProgression("achievementPoints.placeholder")}
            />
          </FormField>

          <FormField id="cv-animusMasteries" label={tProgression("animusMasteries.label")}>
            <CalculatorNumberInput
              id="cv-animusMasteries"
              min={0}
              value={store.animusMasteries}
              onChange={(e) => patchState({ animusMasteries: e.target.value })}
              placeholder={tProgression("animusMasteries.placeholder")}
            />
          </FormField>
        </div>
      </fieldset>

      {/* ── ASSETS ────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {tAssets("sectionLabel")}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            id="cv-goldTotal"
            label={tAssets("goldTotal.label")}
            help={tAssets("goldTotal.help")}
            error={fieldErrors.goldTotal}
          >
            <CalculatorNumberInput
              id="cv-goldTotal"
              min={0}
              value={store.goldTotal}
              onChange={(e) => patchState({ goldTotal: e.target.value })}
              placeholder={tAssets("goldTotal.placeholder")}
            />
          </FormField>

          <FormField
            id="cv-tcInvested"
            label={tAssets("tcInvested.label")}
            help={tAssets("tcInvested.help")}
            error={fieldErrors.tcInvested}
          >
            <CalculatorNumberInput
              id="cv-tcInvested"
              min={0}
              value={store.tcInvested}
              onChange={(e) => patchState({ tcInvested: e.target.value })}
              placeholder={tAssets("tcInvested.placeholder")}
            />
          </FormField>

          <FormField id="cv-storeOutfits" label={tAssets("storeOutfits.label")}>
            <CalculatorNumberInput
              id="cv-storeOutfits"
              min={0}
              value={store.storeOutfits}
              onChange={(e) => patchState({ storeOutfits: e.target.value })}
              placeholder={tAssets("storeOutfits.placeholder")}
            />
          </FormField>

          <FormField id="cv-storeMounts" label={tAssets("storeMounts.label")}>
            <CalculatorNumberInput
              id="cv-storeMounts"
              min={0}
              value={store.storeMounts}
              onChange={(e) => patchState({ storeMounts: e.target.value })}
              placeholder={tAssets("storeMounts.placeholder")}
            />
          </FormField>

          <FormField id="cv-storeItems" label={tAssets("storeItems.label")}>
            <CalculatorNumberInput
              id="cv-storeItems"
              min={0}
              value={store.storeItems}
              onChange={(e) => patchState({ storeItems: e.target.value })}
              placeholder={tAssets("storeItems.placeholder")}
            />
          </FormField>

          <FormField id="cv-hirelings" label={tAssets("hirelings.label")}>
            <CalculatorNumberInput
              id="cv-hirelings"
              min={0}
              value={store.hirelings}
              onChange={(e) => patchState({ hirelings: e.target.value })}
              placeholder={tAssets("hirelings.placeholder")}
            />
          </FormField>

          <FormField id="cv-gemsLesser" label={tAssets("gemsLesser.label")}>
            <CalculatorNumberInput
              id="cv-gemsLesser"
              min={0}
              value={store.gemsLesser}
              onChange={(e) => patchState({ gemsLesser: e.target.value })}
              placeholder={tAssets("gemsLesser.placeholder")}
            />
          </FormField>

          <FormField id="cv-gemsRegular" label={tAssets("gemsRegular.label")}>
            <CalculatorNumberInput
              id="cv-gemsRegular"
              min={0}
              value={store.gemsRegular}
              onChange={(e) => patchState({ gemsRegular: e.target.value })}
              placeholder={tAssets("gemsRegular.placeholder")}
            />
          </FormField>

          <FormField id="cv-gemsGreater" label={tAssets("gemsGreater.label")}>
            <CalculatorNumberInput
              id="cv-gemsGreater"
              min={0}
              value={store.gemsGreater}
              onChange={(e) => patchState({ gemsGreater: e.target.value })}
              placeholder={tAssets("gemsGreater.placeholder")}
            />
          </FormField>
        </div>
      </fieldset>

      {/* ── FLAGS ─────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {tFlags("sectionLabel")}
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              ["soulWar", store.soulWar],
              ["primalOrdeal", store.primalOrdeal],
              ["worldTransfer", store.worldTransfer],
              ["preySlot", store.preySlot],
              ["charmExpansion", store.charmExpansion],
              ["weeklyTaskExpansion", store.weeklyTaskExpansion],
              ["twistOfFate", store.twistOfFate],
            ] as const
          ).map(([key, value]) => (
            <label
              key={key}
              htmlFor={`cv-flag-${key}`}
              className="flex items-center gap-3 rounded-md border border-border/40 bg-muted/30 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                id={`cv-flag-${key}`}
                checked={value}
                onCheckedChange={(checked) =>
                  patchState({ [key]: Boolean(checked) } as Partial<StoreState>)
                }
              />
              <span className="text-sm font-medium leading-none">{tFlags(key)}</span>
            </label>
          ))}
        </div>

        {/* Blessings slider (0-7) */}
        <FormField
          id="cv-blessingsActive"
          label={tFlags("blessingsActive.label")}
          help={tFlags("blessingsActive.help")}
          error={fieldErrors.blessingsActive}
        >
          <div className="flex items-center gap-3">
            <input
              id="cv-blessingsActive"
              type="range"
              min={0}
              max={7}
              step={1}
              value={store.blessingsActive}
              onChange={(e) => patchState({ blessingsActive: Number(e.target.value) })}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              aria-valuemin={0}
              aria-valuemax={7}
              aria-valuenow={store.blessingsActive}
            />
            <span className="numeric min-w-[2.5rem] text-right font-semibold tabular-nums">
              {store.blessingsActive}/7
            </span>
          </div>
        </FormField>
      </fieldset>

      {/* ── MARKET (opcjonalny) ────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {tMarket("sectionLabel")}
        </legend>
        <FormField
          id="cv-marketBid"
          label={tMarket("marketBid.label")}
          help={tMarket("marketBid.help")}
          error={fieldErrors.marketBid}
        >
          <CalculatorNumberInput
            id="cv-marketBid"
            min={0}
            value={store.marketBid}
            onChange={(e) => patchState({ marketBid: e.target.value })}
            placeholder={tMarket("marketBid.placeholder")}
          />
        </FormField>
      </fieldset>
    </CalculatorForm>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Result
// ───────────────────────────────────────────────────────────────────────

export function CharacterValueResult({ config }: CharacterValueCalculatorProps) {
  const t = useTranslations("Calculators.characterValue");
  const tBreakdown = useTranslations("Calculators.characterValue.breakdown");
  const tSkillKeys = useTranslations("Calculators.characterValue.skillKeys");
  const tResult = useTranslations("Calculators.characterValue.result");
  const format = useFormatter();
  const outcome = useComputed(config, t);

  if (!outcome.ok) {
    return <ResultDisplay empty />;
  }

  const {
    estimatedValue,
    confidence,
    confidenceSymbol,
    primaryLabel,
    recommendation,
    secondary,
    breakdown,
    deltaPercent,
  } = outcome;

  const magnitude = estimatedValue > 100_000n;
  const primaryText = magnitude
    ? format.number(estimatedValue, { notation: "compact", maximumFractionDigits: 1 })
    : format.number(estimatedValue, { useGrouping: true });

  return (
    <div className="flex flex-col gap-4">
      {/* ── Primary card with estimated value + delta indicator ── */}
      <Card className="overflow-hidden">
        <CardHeader className="relative gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {tResult("estimatedLabel")}
          </p>
          <CardTitle className="flex items-baseline gap-2">
            <span className="numeric text-3xl font-semibold tabular-nums sm:text-4xl">
              {confidenceSymbol}
              {primaryText}
            </span>
            <span className="numeric text-base font-medium text-muted-foreground tabular-nums">
              TC
            </span>
            {deltaPercent !== null && (
              <Badge
                variant={deltaPercent < -5 ? "success" : deltaPercent > 5 ? "warning" : "secondary"}
                className="ml-2 gap-1"
              >
                {deltaPercent < 0 ? (
                  <TrendingDown className="h-3.5 w-3.5" />
                ) : deltaPercent > 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <Coins className="h-3.5 w-3.5" />
                )}
                <span className="numeric tabular-nums">
                  {(deltaPercent > 0 ? "+" : "") +
                    format.number(deltaPercent, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  %
                </span>
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{primaryLabel}</CardDescription>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Shield className="h-3.5 w-3.5" />
              {tResult("confidenceLabel")}: {Math.round(confidence * 100)}%
            </Badge>
          </div>
        </CardHeader>

        {secondary.length > 0 && (
          <CardContent className="border-t pt-4">
            <dl className="grid gap-2 text-sm">
              {secondary.map((s, idx) => {
                const mag =
                  typeof s.value === "bigint"
                    ? s.value > 100_000n
                    : typeof s.value === "number"
                      ? Math.abs(s.value) >= 100_000
                      : false;
                return (
                  <div
                    key={`${s.label}-${idx}`}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <dt className="text-muted-foreground">{s.label}</dt>
                    <dd className="numeric tabular-nums">
                      <span className="font-medium">
                        {typeof s.value === "string"
                          ? s.value
                          : mag
                            ? format.number(s.value, {
                                notation: "compact",
                                maximumFractionDigits: 1,
                              })
                            : format.number(s.value, { useGrouping: true })}
                      </span>
                      {s.unit ? <span className="ml-1 text-muted-foreground">{s.unit}</span> : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </CardContent>
        )}

        {recommendation && (
          <div className="border-t bg-muted/30 px-6 py-4 text-sm">
            {renderRecommendation(recommendation, t)}
          </div>
        )}
      </Card>

      {/* ── Breakdown accordion (W19: darmowe — bez bramki Premium) ── */}
      <Card className="overflow-hidden">
        <CardHeader className="gap-2 pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              {tResult("breakdownTitle")}
            </CardTitle>
          </div>
          <CardDescription>{tResult("breakdownDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <BreakdownAccordion
            breakdown={breakdown}
            tBreakdown={tBreakdown}
            tSkillKeys={tSkillKeys}
            format={format}
            estimatedValue={estimatedValue}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Breakdown accordion (internal)
// ───────────────────────────────────────────────────────────────────────

interface BreakdownAccordionProps {
  breakdown: CharacterValueBreakdown;
  tBreakdown: ReturnType<typeof useTranslations>;
  tSkillKeys: ReturnType<typeof useTranslations>;
  format: ReturnType<typeof useFormatter>;
  estimatedValue: bigint;
}

function BreakdownAccordion({
  breakdown,
  tBreakdown,
  tSkillKeys,
  format,
  estimatedValue,
}: BreakdownAccordionProps) {
  return (
    <Accordion type="multiple" className="w-full">
      {/* LEVEL */}
      <AccordionItem value="level">
        <AccordionTrigger>
          <span className="flex items-center justify-between gap-2 w-full pr-2">
            <span>{tBreakdown("level")}</span>
            <span className="numeric tabular-nums text-muted-foreground">
              {format.number(breakdown.level.value, { useGrouping: true })} TC
              <span className="ml-2 text-xs text-muted-foreground">
                ({(breakdown.level.weight * 100).toFixed(1)}%)
              </span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
            <p>Bazowa wartość = level × stawka × vocation modifier.</p>
            <p className="mt-2">
              Łączna wycena:{" "}
              <span className="numeric font-semibold text-foreground tabular-nums">
                {format.number(estimatedValue, { useGrouping: true })} TC
              </span>
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* SKILLS */}
      <AccordionItem value="skills">
        <AccordionTrigger>
          <span className="flex items-center justify-between gap-2 w-full pr-2">
            <span>{tBreakdown("skills")}</span>
            <span className="numeric tabular-nums text-muted-foreground">
              {format.number(breakdown.skills.value, { useGrouping: true })} TC
              <span className="ml-2 text-xs text-muted-foreground">
                ({(breakdown.skills.weight * 100).toFixed(1)}%)
              </span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <ul className="space-y-1.5 text-sm">
            {(Object.keys(breakdown.skills.perSkill) as SkillKey[]).map((key) => {
              const value = breakdown.skills.perSkill[key];
              if (value === 0n) return null;
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                >
                  <span className="text-muted-foreground">{tSkillKeys(key)}</span>
                  <span className="numeric tabular-nums font-medium">
                    +{format.number(value, { useGrouping: true })} TC
                  </span>
                </li>
              );
            })}
            {breakdown.skills.value === 0n && (
              <li className="text-xs text-muted-foreground italic">
                Brak relewantnych skilli powyżej 100 dla tej vocation.
              </li>
            )}
          </ul>
        </AccordionContent>
      </AccordionItem>

      {/* FEATURES */}
      <AccordionItem value="features">
        <AccordionTrigger>
          <span className="flex items-center justify-between gap-2 w-full pr-2">
            <span>{tBreakdown("features")}</span>
            <span className="numeric tabular-nums text-muted-foreground">
              {format.number(breakdown.features.value, { useGrouping: true })} TC
              <span className="ml-2 text-xs text-muted-foreground">
                ({(breakdown.features.weight * 100).toFixed(1)}%)
              </span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <ItemsList items={breakdown.features.items} format={format} />
        </AccordionContent>
      </AccordionItem>

      {/* PROGRESSION */}
      <AccordionItem value="progression">
        <AccordionTrigger>
          <span className="flex items-center justify-between gap-2 w-full pr-2">
            <span>{tBreakdown("progression")}</span>
            <span className="numeric tabular-nums text-muted-foreground">
              {format.number(breakdown.progression.value, { useGrouping: true })} TC
              <span className="ml-2 text-xs text-muted-foreground">
                ({(breakdown.progression.weight * 100).toFixed(1)}%)
              </span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <ItemsList items={breakdown.progression.items} format={format} />
        </AccordionContent>
      </AccordionItem>

      {/* COSMETICS */}
      <AccordionItem value="cosmetics">
        <AccordionTrigger>
          <span className="flex items-center justify-between gap-2 w-full pr-2">
            <span>{tBreakdown("cosmetics")}</span>
            <span className="numeric tabular-nums text-muted-foreground">
              {format.number(breakdown.cosmetics.value, { useGrouping: true })} TC
              <span className="ml-2 text-xs text-muted-foreground">
                ({(breakdown.cosmetics.weight * 100).toFixed(1)}%)
              </span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <ItemsList items={breakdown.cosmetics.items} format={format} />
        </AccordionContent>
      </AccordionItem>

      {/* ASSETS */}
      <AccordionItem value="assets">
        <AccordionTrigger>
          <span className="flex items-center justify-between gap-2 w-full pr-2">
            <span>{tBreakdown("assets")}</span>
            <span className="numeric tabular-nums text-muted-foreground">
              {format.number(breakdown.assets.value, { useGrouping: true })} TC
              <span className="ml-2 text-xs text-muted-foreground">
                ({(breakdown.assets.weight * 100).toFixed(1)}%)
              </span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <ItemsList items={breakdown.assets.items} format={format} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function ItemsList({
  items,
  format,
}: {
  items: readonly CharacterValueItem[];
  format: ReturnType<typeof useFormatter>;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Brak pozycji w tej kategorii.</p>;
  }
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((item, idx) => (
        <li
          key={`${item.key}-${idx}`}
          className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
        >
          <span className="font-mono text-xs text-muted-foreground">{item.key}</span>
          <span className="numeric tabular-nums font-medium">
            +{format.number(item.value, { useGrouping: true })} TC
          </span>
        </li>
      ))}
    </ul>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Recommendation renderer (matches result-display tone/structure)
// ───────────────────────────────────────────────────────────────────────

function renderRecommendation(rec: Recommendation, _t: ReturnType<typeof useTranslations>) {
  if (typeof rec === "object" && rec !== null && "tone" in rec) {
    const Icon =
      rec.tone === "success" ? TrendingDown : rec.tone === "warning" ? TrendingUp : Coins;
    return (
      <div className="flex items-start gap-3">
        <Badge
          variant={rec.tone === "success" ? "success" : rec.tone === "warning" ? "warning" : "info"}
          className="shrink-0 gap-1 px-2 py-0.5"
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {rec.tone === "success"
            ? "Okazja"
            : rec.tone === "warning"
              ? "Przepłacasz"
              : "Fair price"}
        </Badge>
        <p className="text-sm leading-relaxed text-foreground">{rec.message}</p>
      </div>
    );
  }
  return <p className="text-sm leading-relaxed text-foreground">{String(rec)}</p>;
}

// ───────────────────────────────────────────────────────────────────────
// Compound export
// ───────────────────────────────────────────────────────────────────────

export function CharacterValueCalculator({ config }: CharacterValueCalculatorProps) {
  return <CharacterValueForm config={config} />;
}

CharacterValueCalculator.Result = CharacterValueResult;
