/**
 * Valuation Engine — szacowanie wartości postaci w TC na podstawie aukcji Bazaar (task 35).
 *
 * Architektura:
 *   - §8.4 (algorytm) — 6 komponentów: BASE, SKILLS, FEATURES, PROGRESSION,
 *     COSMETICS, ASSETS.
 *   - §15.1 (freemium) — szacowana wartość widoczna dla wszystkich
 *     (sama liczba), breakdown widoczny tylko dla premium.
 *   - §7.2 (`valuation_rules`) — wagi w seedzie `packages/db/src/seed/valuation-rules.ts`.
 *
 * Cel: transparentność > precyzja. Każdy wynik ma rozwijalny breakdown —
 * gracz widzi z czego składa się wycena.
 *
 * Wzorzec: **czysta funkcja**. Zero I/O, zero `Date.now()`,
 * zero `Math.random()`. Deterministyczna — ten sam input daje ten sam output.
 *
 * @see packages/calc/src/formulas/character-value.ts — T22 referencyjna implementacja
 *      na `CharacterSnapshot` (inna warstwa, ale ten sam algorytm).
 *      valuation.ts operuje na `Auction` (denormalizowany wiersz z bazaar detail page).
 */
import {
  AUCTION_SKILL_KEYS,
  type Auction,
  type AuctionSkillKey,
  type Vocation,
} from "@tibians/shared/auction";

/**
 * Lokalna definicja typu `ValuationRule` (mirror DB schema z
 * `packages/db/src/schema/valuation.ts`).
 *
 * **Czemu lokalna?** Scheduler (T36) przyjmuje identyczne podejście —
 * unika importu runtime z `@tibians/db` w `apps/scraper`, bo:
 *   1. db ma side-effects (lazy `pg.Pool` init przez `import 'dotenv/config'`),
 *   2. scraper nie potrzebuje pełnego schema DB — tylko wagę po `ruleKey`.
 *
 * Jeśli schema `valuation_rules` się zmieni (nowe pole), ten typ trzeba
 * zsynchronizować z `packages/db/src/schema/valuation.ts` (ValidationError
 * w runtime wychwyci różnicę wag `numeric`).
 */
export interface ValuationRule {
  readonly id: number;
  readonly ruleKey: string;
  readonly category: "base" | "feature" | "skill" | "item" | "cosmetic" | "progression" | "asset";
  /** numeric(10,4) — string dla precyzji. */
  readonly weight: string;
  readonly formula: string | null;
  readonly isActive: boolean;
  readonly updatedAt: Date;
}

// ──────────────────────────────────────────────────────────────────────────
// Publiczne typy — breakdown algorytmu (arch §8.4)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Komponent algorytmu z labelką + sumaryczną wartością w TC (bigint).
 *
 * Pattern: każdy z 6 komponentów ma `label` (PL — widoczne w UI breakdownu)
 * + `value` (bigint, bezpieczna precyzja dla dużych sum) + opcjonalne
 * pod-elementy (`items` / `perSkill`).
 */
export interface ValuationComponent {
  /** Etykieta PL — widoczna w UI breakdownu. */
  readonly label: string;
  /** Suma komponentu w TC (bigint). */
  readonly value: bigint;
}

/**
 * Komponent SKILLS — dodatkowo mapa per-skill (8 kluczy).
 *
 * Pozwala UI wyświetlić "sword: +60 TC, shielding: +20 TC" bez
 * konieczności parsowania breakdownu.
 */
export interface ValuationSkillsComponent extends ValuationComponent {
  /** Per-skill rozbicie (0n jeśli skill nieistotny dla vocation / < 100). */
  readonly perSkill: Readonly<Record<AuctionSkillKey, bigint>>;
}

/**
 * Komponent z listą pod-elementów (np. features, progression).
 *
 * Pattern: `items[]` dla UI (lista "+12000 Soul War", "+15000 World Transfer"),
 * `value` to suma wszystkich items.
 */
export interface ValuationListComponent extends ValuationComponent {
  /** Pod-elementy składowe (do UI breakdownu). */
  readonly items: ReadonlyArray<{ readonly key: string; readonly value: bigint }>;
}

export interface ValuationBreakdown {
  /** BASE — `level × base_weight`. */
  readonly base: ValuationComponent;
  /** SKILLS — per vocation relevance, nonlinear powyżej 100. */
  readonly skills: ValuationSkillsComponent;
  /** FEATURES — stałe kwoty per flaga (Soul War, Primal, ...). */
  readonly features: ValuationListComponent;
  /** PROGRESSION — liniowe (charms × waga, boss × waga, ...). */
  readonly progression: ValuationListComponent;
  /** COSMETICS — store + gemy. */
  readonly cosmetics: ValuationListComponent;
  /** ASSETS — gold/tc_invested. */
  readonly assets: ValuationListComponent;
}

/**
 * Wynik `estimateValue` — szacowana wartość + rozwijalny breakdown.
 *
 * Wartość TC jest w **bigint** (Tibia Coins to uint64, nie mieszczą się
 * w `number` dla najdroższych postaci).
 */
export interface ValuationResult {
  /** Szacowana wartość w TC (bigint). */
  readonly estimatedValue: bigint;
  /** Per-komponent breakdown (arch §8.4 — 6 komponentów). */
  readonly breakdown: ValuationBreakdown;
}

// ──────────────────────────────────────────────────────────────────────────
// Vocation → relevant skills (arch §2.1 + §8.4)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Mapowanie vocation (bazowa) → klucze skilli, które mają wartość handlową.
 *
 * Reguła (arch §8.4):
 *   - Knight: sword/axe/club (melee) + shielding
 *   - Paladin: distance + shielding
 *   - Druid/Sorcerer: magic
 *   - Monk: fist + magic
 *   - None: fist (postacie bez profesji — challenge/Rookgaard; realny
 *     przypadek z tibia.com, np. „Digi mortal" lvl 207)
 *   - fishing: NIGDY (brak wartości handlowej)
 *
 * Skille **irrelewantne** zwracają 0n w `perSkill` (NIE są pomijane w mapie —
 * UI wymaga pełnych 8 kluczy).
 */
const VOCATION_RELEVANT_SKILLS: Readonly<Record<Vocation, ReadonlyArray<AuctionSkillKey>>> = {
  Knight: ["sword", "axe", "club", "shielding"],
  Paladin: ["distance", "shielding"],
  Druid: ["magic"],
  Sorcerer: ["magic"],
  Monk: ["fist", "magic"],
  None: ["fist"],
};

/**
 * Czy skill jest relewantny dla danego vocation.
 *
 * @param vocation - bazowa klasa (6 wartości: Knight/Paladin/Druid/Sorcerer/Monk/None)
 * @param skill    - klucz skilla (8 wartości: magic/club/fist/sword/axe/distance/shielding/fishing)
 */
function isRelevantSkill(vocation: Vocation, skill: AuctionSkillKey): boolean {
  if (skill === "fishing") return false; // nigdy nie ma wartości handlowej
  return VOCATION_RELEVANT_SKILLS[vocation].includes(skill);
}

// ──────────────────────────────────────────────────────────────────────────
// Lookup wag — z ValuationRule[] (czytane z DB / seed T16)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Wymagane klucze reguł — T35 (arch §8.4). Algorytm nie może działać
 * bez któregokolwiek z nich.
 */
export const REQUIRED_RULE_KEYS = [
  // BASE
  "base_level_weight",
  // SKILLS
  "skill_above_100_weight",
  // FEATURES
  "feature_soul_war",
  "feature_primal_ordeal",
  "feature_world_transfer",
  "feature_prey_slot",
  "feature_charm_expansion",
  "feature_weekly_task_expansion",
  "feature_twist_of_fate",
  // PROGRESSION
  "progression_charm_points_weight",
  "progression_boss_points_weight",
  "progression_quests_weight",
  "progression_imbuements_weight",
  "progression_achievement_points_weight",
  "progression_animus_weight",
  // COSMETICS
  "cosmetic_store_outfit_weight",
  "cosmetic_store_mount_weight",
  "cosmetic_gem_lesser_weight",
  "cosmetic_gem_regular_weight",
  "cosmetic_gem_greater_weight",
  // ASSETS
  "asset_gold_to_tc",
] as const;

export type RequiredRuleKey = (typeof REQUIRED_RULE_KEYS)[number];

/**
 * Słownik `ruleKey → weight (number)`. Numerik z DB jest w formacie
 * `numeric(10,4)` — precyzja 4 miejsc po przecinku wystarcza dla TC
 * (rzędy wielkości 10⁵).
 */
export interface RuleWeights {
  readonly [key: string]: number;
}

/**
 * Zbuduj lookup wag z tablicy `ValuationRule[]` (DB rows).
 *
 * @throws Error jeśli brakuje któregoś z `REQUIRED_RULE_KEYS`
 *         (algorytm nie może działać bez kompletu wag).
 */
export function buildWeights(rules: readonly ValuationRule[]): RuleWeights {
  const weights: Record<string, number> = {};
  for (const rule of rules) {
    if (!rule.isActive) continue; // pomijamy wyłączone reguły
    const num = Number(rule.weight);
    if (!Number.isFinite(num)) {
      throw new Error(
        `[@tibians/scraper/valuation] rule "${rule.ruleKey}" ma nieprawidłową wagę: ${rule.weight}`,
      );
    }
    weights[rule.ruleKey] = num;
  }
  // Sprawdź wymagane klucze.
  const missing: string[] = [];
  for (const key of REQUIRED_RULE_KEYS) {
    if (!(key in weights)) missing.push(key);
  }
  if (missing.length > 0) {
    throw new Error(
      `[@tibians/scraper/valuation] Brakuje reguł w valuation_rules: ${missing.join(", ")}. ` +
        `Uruchom seed: packages/db/src/seed/valuation-rules.ts`,
    );
  }
  return weights as RuleWeights;
}

/**
 * Liczba TC per skill point powyżej progu 100 (z wag seed).
 *
 * Specjalny klucz do odczytu — przydatne też w UI tooltipach.
 */
export function getSkillWeight(w: RuleWeights): number {
  return w["skill_above_100_weight"]!;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers — konwersja skill z Auction (denormalizowane kolumny)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pobiera bazową wartość skilla z denormalizowanych kolumn Auction.
 *
 * Auction ma 8 osobnych kolumn `skillMagic`..`skillFishing` (arch §7.1
 * pkt 1 — wydajność filtrów). Ta funkcja mapuje klucz → odpowiednia kolumna.
 */
function getAuctionSkill(snapshot: Auction, skill: AuctionSkillKey): number {
  switch (skill) {
    case "magic":
      return snapshot.skillMagic;
    case "club":
      return snapshot.skillClub;
    case "fist":
      return snapshot.skillFist;
    case "sword":
      return snapshot.skillSword;
    case "axe":
      return snapshot.skillAxe;
    case "distance":
      return snapshot.skillDistance;
    case "shielding":
      return snapshot.skillShielding;
    case "fishing":
      return snapshot.skillFishing;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Algorytm — 6 komponentów (arch §8.4)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Nieliniowa transformacja skilla powyżej progu 100.
 *
 * Reguła (arch §8.4 + task 35 MUST DO):
 *   ```
 *   skill_value_above_100 = floor((skill - 100) ^ 1.05)
 *   ```
 *
 * Dla skill = 100: 0 (zero wartości dodanej)
 * Dla skill = 110: floor(10^1.05) = floor(11.22) = 11
 * Dla skill = 113: floor(13^1.05) = floor(14.13) = 14
 * Dla skill = 120: floor(20^1.05) = floor(21.93) = 21
 * Dla skill = 150: floor(50^1.05) = floor(56.23) = 56
 *
 * Czysta funkcja matematyczna (determinizm — zero randomizacji).
 */
export function nonlinearSkillBoost(skill: number): bigint {
  if (skill <= 100) return 0n;
  const delta = skill - 100;
  const boosted = Math.floor(Math.pow(delta, 1.05));
  return BigInt(Math.max(0, boosted));
}

/**
 * TC za pojedynczy skill relewantny (po zastosowaniu nonlinear).
 *
 * @returns TC za skill (bigint), 0n jeśli skill ≤ 100 lub irrelewantny.
 */
function skillValue(snapshot: Auction, skill: AuctionSkillKey, weight: number): bigint {
  if (!isRelevantSkill(snapshot.vocation, skill)) return 0n;
  const base = getAuctionSkill(snapshot, skill);
  const boost = nonlinearSkillBoost(base);
  // TC = boost (pkt nieliniowe) × weight (TC/pkt)
  return boost * BigInt(Math.round(weight));
}

/**
 * Główna funkcja — szacuje wartość aukcji w TC (arch §8.4).
 *
 * @param snapshot - pełny `Auction` (Zod-walidowany, z denormalizowanymi skille).
 * @param rules    - aktywne reguły z `valuation_rules` (DB / seed).
 * @returns        - `ValuationResult` z `estimatedValue` (bigint) + breakdownem.
 *
 * @throws Error gdy brakuje wymaganych kluczy w `rules` (użyj `buildWeights()`).
 *
 * @example
 * ```ts
 * import { db } from "@tibians/db";
 * import { valuationRules } from "@tibians/db/schema";
 * import { estimateValue } from "@tibians/scraper/valuation";
 *
 * const rules = await db.select().from(valuationRules).where(eq(valuationRules.isActive, true));
 * const result = estimateValue(auctionRow, rules);
 * console.log(result.estimatedValue); // 31_200n (TC, bigint)
 * console.log(result.breakdown.base.value); // 30_950n (619 × 50)
 * ```
 */
export function estimateValue(snapshot: Auction, rules: readonly ValuationRule[]): ValuationResult {
  const w = buildWeights(rules);

  // ── 1. BASE — `level × base_weight` ─────────────────────────────────
  const baseValue =
    BigInt(Math.max(8, snapshot.level)) * BigInt(Math.round(w["base_level_weight"]!));

  // ── 2. SKILLS — nonlinear powyżej 100, per vocation relevance ───────
  const perSkill = {} as Record<AuctionSkillKey, bigint>;
  let skillsTotal = 0n;
  const skillWeight = w["skill_above_100_weight"]!;
  for (const key of AUCTION_SKILL_KEYS) {
    const v = skillValue(snapshot, key, skillWeight);
    perSkill[key] = v;
    skillsTotal += v;
  }

  // ── 3. FEATURES — stałe kwoty za posiadanie flagi ──────────────────
  const featureMap: ReadonlyArray<readonly [string, boolean, number]> = [
    ["feature_soul_war", snapshot.hasSoulWar, w["feature_soul_war"]!],
    ["feature_primal_ordeal", snapshot.hasPrimalOrdeal, w["feature_primal_ordeal"]!],
    ["feature_world_transfer", snapshot.hasWorldTransfer, w["feature_world_transfer"]!],
    ["feature_prey_slot", snapshot.hasPreySlot, w["feature_prey_slot"]!],
    ["feature_charm_expansion", snapshot.hasCharmExpansion, w["feature_charm_expansion"]!],
    [
      "feature_weekly_task_expansion",
      snapshot.hasWeeklyTaskExpansion,
      w["feature_weekly_task_expansion"]!,
    ],
    ["feature_twist_of_fate", snapshot.hasTwistOfFate, w["feature_twist_of_fate"]!],
  ];
  const featureItems: Array<{ key: string; value: bigint }> = [];
  let featuresTotal = 0n;
  for (const [key, has, weight] of featureMap) {
    if (has) {
      const v = BigInt(Math.round(weight));
      featureItems.push({ key, value: v });
      featuresTotal += v;
    }
  }

  // ── 4. PROGRESSION — liniowe wagi za metryki (arch §8.4) ───────────
  const progressionItems: Array<{ key: string; value: bigint }> = [];
  let progressionTotal = 0n;
  {
    const v =
      BigInt(Math.max(0, snapshot.charmPoints)) *
      BigInt(Math.round(w["progression_charm_points_weight"]!));
    progressionItems.push({ key: "progression_charm_points", value: v });
    progressionTotal += v;
  }
  {
    const v =
      BigInt(Math.max(0, snapshot.bossPoints)) *
      BigInt(Math.round(w["progression_boss_points_weight"]!));
    progressionItems.push({ key: "progression_boss_points", value: v });
    progressionTotal += v;
  }
  {
    const v =
      BigInt(Math.max(0, snapshot.questsCompleted)) *
      BigInt(Math.round(w["progression_quests_weight"]!));
    progressionItems.push({ key: "progression_quests", value: v });
    progressionTotal += v;
  }
  {
    const v =
      BigInt(Math.max(0, snapshot.imbuementsUnlocked)) *
      BigInt(Math.round(w["progression_imbuements_weight"]!));
    progressionItems.push({ key: "progression_imbuements", value: v });
    progressionTotal += v;
  }
  {
    const v =
      BigInt(Math.max(0, snapshot.achievementPoints)) *
      BigInt(Math.round(w["progression_achievement_points_weight"]!));
    progressionItems.push({ key: "progression_achievement_points", value: v });
    progressionTotal += v;
  }
  {
    const v =
      BigInt(Math.max(0, snapshot.animusMasteries)) *
      BigInt(Math.round(w["progression_animus_weight"]!));
    progressionItems.push({ key: "progression_animus", value: v });
    progressionTotal += v;
  }

  // ── 5. COSMETICS — store counts + gemy (arch §8.4) ─────────────────
  const cosmeticsItems: Array<{ key: string; value: bigint }> = [];
  let cosmeticsTotal = 0n;
  {
    const v =
      BigInt(Math.max(0, snapshot.storeOutfitsCount)) *
      BigInt(Math.round(w["cosmetic_store_outfit_weight"]!));
    cosmeticsItems.push({ key: "cosmetic_store_outfits", value: v });
    cosmeticsTotal += v;
  }
  {
    const v =
      BigInt(Math.max(0, snapshot.storeMountsCount)) *
      BigInt(Math.round(w["cosmetic_store_mount_weight"]!));
    cosmeticsItems.push({ key: "cosmetic_store_mounts", value: v });
    cosmeticsTotal += v;
  }
  {
    const v =
      BigInt(Math.max(0, snapshot.gemsLesser)) *
      BigInt(Math.round(w["cosmetic_gem_lesser_weight"]!));
    cosmeticsItems.push({ key: "cosmetic_gem_lesser", value: v });
    cosmeticsTotal += v;
  }
  {
    const v =
      BigInt(Math.max(0, snapshot.gemsRegular)) *
      BigInt(Math.round(w["cosmetic_gem_regular_weight"]!));
    cosmeticsItems.push({ key: "cosmetic_gem_regular", value: v });
    cosmeticsTotal += v;
  }
  {
    const v =
      BigInt(Math.max(0, snapshot.gemsGreater)) *
      BigInt(Math.round(w["cosmetic_gem_greater_weight"]!));
    cosmeticsItems.push({ key: "cosmetic_gem_greater", value: v });
    cosmeticsTotal += v;
  }

  // ── 6. ASSETS — gold → TC + tc_invested direct ─────────────────────
  const assetsItems: Array<{ key: string; value: bigint }> = [];
  let assetsTotal = 0n;
  {
    const goldDivisor = Math.max(1, Math.round(w["asset_gold_to_tc"]!));
    const v = snapshot.goldTotal > 0n ? snapshot.goldTotal / BigInt(goldDivisor) : 0n;
    assetsItems.push({ key: "asset_gold_to_tc", value: v });
    assetsTotal += v;
  }
  {
    const invested = snapshot.tcInvested ?? 0;
    const v = BigInt(Math.max(0, invested));
    assetsItems.push({ key: "asset_tc_invested", value: v });
    assetsTotal += v;
  }

  // ── 7. AGGREGATE — suma komponentów ─────────────────────────────────
  const estimatedValue =
    baseValue + skillsTotal + featuresTotal + progressionTotal + cosmeticsTotal + assetsTotal;

  return {
    estimatedValue,
    breakdown: {
      base: {
        label: "Bazowa wartość (level)",
        value: baseValue,
      },
      skills: {
        label: "Skille (powyżej 100, nieliniowo)",
        value: skillsTotal,
        perSkill,
      },
      features: {
        label: "Features (Soul War, Primal Ordeal, ...)",
        value: featuresTotal,
        items: featureItems,
      },
      progression: {
        label: "Progresja (charms, boss, questy, imbue, ...)",
        value: progressionTotal,
        items: progressionItems,
      },
      cosmetics: {
        label: "Kosmetyki (store + gemy)",
        value: cosmeticsTotal,
        items: cosmeticsItems,
      },
      assets: {
        label: "Zasoby (gold → TC, tc_invested)",
        value: assetsTotal,
        items: assetsItems,
      },
    },
  };
}
