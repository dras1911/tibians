/**
 * Wspólne snapshot fixture'y dla testów formuł kalkulatorów (task 15).
 *
 * Wzorzec: każdy test używa minimalnego poprawnego `CharacterSnapshot`
 * (zgodnego z `CharacterSnapshotSchema` z `@tibians/character-context`),
 * nadpisując tylko te pola, które są istotne dla danego kalkulatora.
 *
 * **Tibia ground truth używany w fixture'ach**:
 *   - Levels (xpForLevel): TibiaWiki Experience Table
 *   - Party level range (ratio ≤ 1.5): CipSoft official
 *   - Vocation bonus 20/30/60/100%: CipSoft official
 *
 * Source: https://tibia.fandom.com/wiki/Experience_Table
 *         https://tibia.fandom.com/wiki/Party
 *         https://tibia.com/support/?entryid=91
 */
import type { CharacterSnapshot } from "@tibians/character-context";

// ──────────────────────────────────────────────────────────────────────────
// Snapshot factory — minimalny valid snapshot z nadpisaniami
// ──────────────────────────────────────────────────────────────────────────

export interface SnapshotOverrides {
  readonly name?: string;
  readonly level?: number;
  readonly vocation?: CharacterSnapshot["identity"]["vocation"];
  readonly vocationPromoted?: CharacterSnapshot["identity"]["vocationPromoted"];
  readonly skills?: Partial<CharacterSnapshot["skills"]>;
}

/**
 * Tworzy minimalny valid `CharacterSnapshot` z opcjonalnymi nadpisaniami.
 * Domyślne wartości: Knight level 100, wszystkie skille = 0, puste party/progression.
 *
 * @example
 * ```ts
 * // Druid level 100 z magic 100, sword 0
 * const snap = makeSnapshot({
 *   level: 100,
 *   vocation: "Druid",
 *   vocationPromoted: "Elder Druid",
 *   skills: { magic: { base: 100 } },
 * });
 * ```
 */
export function makeSnapshot(overrides: SnapshotOverrides = {}): CharacterSnapshot {
  const name = overrides.name ?? "Tester";
  const level = overrides.level ?? 100;
  const vocation = overrides.vocation ?? "Knight";
  const vocationPromoted =
    overrides.vocationPromoted ?? promotedForBase(vocation);

  const skills = {
    magic: { base: 0 },
    club: { base: 0 },
    fist: { base: 0 },
    sword: { base: 0 },
    axe: { base: 0 },
    distance: { base: 0 },
    shielding: { base: 0 },
    fishing: { base: 0 },
    ...overrides.skills,
  };

  return {
    source: { kind: "manual" },
    identity: { name, level, vocation, vocationPromoted, sex: "M" },
    skills,
    progression: {
      charmPoints: 0,
      charmPointsUnused: 0,
      minorCharmEchoes: 0,
      bossPoints: 0,
      questsCompleted: 0,
      questsTotal: 0,
      imbuementsUnlocked: 0,
      imbuementsTotal: 0,
      achievementPoints: 0,
      animusMasteries: 0,
    },
    assets: {
      items: [],
      outfits: [],
      mounts: [],
      gems: { lesser: 0, regular: 0, greater: 0 },
      goldTotal: 0,
      storeCounts: { outfits: 0, mounts: 0, items: 0 },
      hirelings: 0,
    },
    flags: {
      soulWar: false,
      primalOrdeal: false,
      worldTransfer: false,
      preySlot: false,
      charmExpansion: false,
      weeklyTaskExpansion: false,
      twistOfFate: false,
      blessingsActive: 0,
    },
  };
}

/**
 * Mapowanie vocation bazowej → promowanej (arch. §13.1).
 */
function promotedForBase(
  v: CharacterSnapshot["identity"]["vocation"],
): CharacterSnapshot["identity"]["vocationPromoted"] {
  switch (v) {
    case "Knight":
      return "Elite Knight";
    case "Paladin":
      return "Royal Paladin";
    case "Druid":
      return "Elder Druid";
    case "Sorcerer":
      return "Master Sorcerer";
    case "Monk":
      return "Exalted Monk";
  }
}

// ──────────────────────────────────────────────────────────────────────────
// TibiaWiki ground truth — XP table (arch. §2.1, TibiaWiki Experience_Table)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Kluczowe punkty kontrolne TibiaWiki Experience_Table.
 * Źródło: https://tibia.fandom.com/wiki/Experience_Table
 *
 * Używane jako fixtures w testach formuł (do 2500).
 *
 * Format: `[level, xp_for_level]` — minimalne XP potrzebne do osiągnięcia
 * danego levelu (xpForLevel). Wartości zweryfikowane analitycznie z formuły
 * CipSoft 50/3 × (L³ − 6L² + 17L − 12) + porównane z TibiaWiki dla L=8/50/100/200.
 */
export const TIBIA_XP_TABLE_FIXTURES: ReadonlyArray<readonly [number, bigint]> =
  Object.freeze([
    [1, 0n], // L=1 → 0 (formuła CipSoft daje ≤ 0 dla L < 2)
    [2, 100n], // L=2 → 100
    [8, 4_200n], // L=8 → 4 200 (minimalny level gracza)
    [50, 1_847_300n], // L=50 → 1 847 300
    [100, 15_694_800n], // L=100 → 15 694 800
    [200, 129_389_800n], // L=200 → 129 389 800
    [500, 2_058_474_800n], // L=500 → 2 058 474 800
    [1000, 16_566_949_800n], // L=1000 → 50/3 × 994_016_988 = 16 566 949 800
    [2500, 259_792_374_800n], // L=2500 → 50/3 × 15_587_542_488 = 259 792 374 800
  ] as const);

// ──────────────────────────────────────────────────────────────────────────
// Party fixtures — legal level range test cases
// ──────────────────────────────────────────────────────────────────────────

/**
 * Przykłady par (character, partyMember) z różnymi level diff.
 *
 *   ratio = max / min — Tibia legal range wymaga ratio ≤ 1.5.
 *   Źródło: CipSoft "lowest may not have less than two-thirds of highest".
 *
 *   - L=40 + L=60 → ratio 1.5 (legal, edge case)
 *   - L=40 + L=20 → ratio 2.0 (illegal, beyond Tibia limit)
 *   - L=200 + L=300 → ratio 1.5 (legal, popular benchmark)
 *   - L=200 + L=100 → ratio 2.0 (illegal)
 */
export const PARTY_LEVEL_FIXTURES = Object.freeze({
  sameLevel: { character: 100, partyMember: 100, legal: true },
  smallDiff: { character: 100, partyMember: 110, legal: true },
  edgeDiff40_60: { character: 40, partyMember: 60, legal: true, ratio: 1.5 },
  edgeDiff200_300: { character: 200, partyMember: 300, legal: true, ratio: 1.5 },
  illegalRatio: { character: 200, partyMember: 100, legal: false, ratio: 2.0 },
  illegalHighLow: { character: 40, partyMember: 20, legal: false, ratio: 2.0 },
  sameLevel200: { character: 200, partyMember: 200, legal: true },
} as const);

// ──────────────────────────────────────────────────────────────────────────
// Vocation fixtures — distinct vocations w party
// ──────────────────────────────────────────────────────────────────────────

/**
 * Mapowanie vocation → promoted vocation.
 * Tibia: 5 bazowych, 5 promowanych (arch. §13.1).
 */
export const ALL_VOCATIONS = Object.freeze([
  "Knight",
  "Paladin",
  "Druid",
  "Sorcerer",
  "Monk",
] as const);

export type VocationBase = (typeof ALL_VOCATIONS)[number];

export const PROMOTED_FOR_BASE: Readonly<Record<VocationBase, string>> =
  Object.freeze({
    Knight: "Elite Knight",
    Paladin: "Royal Paladin",
    Druid: "Elder Druid",
    Sorcerer: "Master Sorcerer",
    Monk: "Exalted Monk",
  });

// ──────────────────────────────────────────────────────────────────────────
// Loyalty fixtures — Tibia ground truth (arch. §2.2)
// ──────────────────────────────────────────────────────────────────────────

/**
 * 11 dopuszczalnych progów loyalty (TibiaWiki Loyalty_System).
 *
 * Edge cases dla `trueSkill`:
 *   - 0% → base = displayed (brak bonusu)
 *   - 5% → base = displayed / 1.05 (TibiaWiki ground truth: 360 pkt = 5%)
 *   - 50% → base = displayed / 1.50 (max bonus, 3600 pkt loyalty)
 */
export const ALL_LOYALTY_PCTS = Object.freeze([
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
] as const);

// ──────────────────────────────────────────────────────────────────────────
// TibiaPal Exercise Weapons benchmark — ground truth test cases
// ──────────────────────────────────────────────────────────────────────────

/**
 * Przykłady z benchmarku TibiaPal (arch. §2.1) używane jako fixtures
 * testów kalkulatora Exercise Weapons. Każdy fixture to komplet opcji
 * wejściowych + oczekiwane zachowanie (typ rekomendacji, monotoniczność).
 *
 *   Druid Magic 100→110, loyalty 10%, double event ON
 *   Knight Melee 50→100 (różnica leveli 50)
 *   Paladin Distance 200→210 (bez loyalty, bez bonusów)
 *
 * Wzór TibiaWiki Formulae + Exercise_Weapons — patrz
 * `formulas/exercise-weapons.ts` dla dokładnego citation.
 */
export const TIBIAPAL_EXERCISE_FIXTURES = Object.freeze({
  druidMagic100to110: {
    category: "mageMagic" as const,
    mode: "targetSkill" as const,
    currentSkill: 100,
    percentToNext: 0,
    targetSkill: 110,
    loyaltyPct: 10 as const,
    doubleEvent: true,
    privateDummy: false,
  },
  knightMelee50to100: {
    category: "knightMelee" as const,
    mode: "targetSkill" as const,
    currentSkill: 50,
    percentToNext: 0,
    targetSkill: 100,
    loyaltyPct: 0 as const,
    doubleEvent: false,
    privateDummy: false,
  },
  paladinDistance200to210: {
    category: "paladinDistance" as const,
    mode: "targetSkill" as const,
    currentSkill: 200,
    percentToNext: 0,
    targetSkill: 210,
    loyaltyPct: 0 as const,
    doubleEvent: false,
    privateDummy: false,
  },
} as const);