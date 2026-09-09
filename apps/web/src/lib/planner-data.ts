/**
 * Domain data dla planerów (T23, arch §2.1 TibiaPal benchmark).
 *
 * Single source of truth:
 *   - lista charmów (15+ charmów Tibia) z max punktami per charm,
 *   - 5 curatowanych presetów Wheel of Destiny per vocation.
 *
 * Dlaczego const arrays a nie DB/config:
 *   - to są **stałe domenowe**, nie parametry balansu (które są w T16
 *     `charm.max_points=9000`).
 *   - 5 presetów Wheel of Destiny to **rekomendacje społeczności** (TibiaPal
 *     "Wheel Builds"), nie wartości obliczane.
 *   - trzymanie tego w pliku TS = prostsze i18n (per-vocation teksty
 *     w messages/, nie w DB).
 *
 * Arch. §2.1 (TibiaPal Wheel of Destiny benchmark):
 *   - "Wheel of Destiny" = system z update 12.51 (luty 2022), max ~1000 pkt
 *   - 3 kategorie per vocation: offensive / defensive / support
 *   - 30+ nodes (5 tier) per kategoria
 *   - Presety ręczne z community — różnią się per voc
 */

import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────
// Charm list — 22 charmy Tibia (15+ z T23 spec)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pełna lista charmów w Tibia. Kolejność zachowana z TibiaWiki/Intibia
 * (PL/EN). Każdy ma `maxPointsPerCharm` — górny limit inwestycji w pojedynczy
 * charm (suma per postać jest ograniczona przez `charm.max_points=9000`).
 *
 * `category` określa przynależność do grupy efektów (używane w rekomendacjach).
 */
export type CharmCategory =
  | "leech"        // Vampirism, Void
  | "combat"       // Strike, Scorch, Venom, Frost, Electrify
  | "movement"     // Swiftness, Featherweight
  | "protection"   // Vibrancy, Lich Shroud, Snake Skin, Dragon Hide, Quara Scale, Cloud Fabric, Demon Presence
  | "precision"    // Precision, Epiphany
  | "offensive"    // Reap, Chop, Slash, Bash, Blockade
  | "none";        // brak (fallback)

export interface CharmDefinition {
  /** Locale-independent ID (klucz w i18n + URL state). */
  readonly id: string;
  /** Grupa efektów (używana w rekomendacjach). */
  readonly category: CharmCategory;
  /**
   * Max punktów do zainwestowania w pojedynczy charm.
   * Większość charmów: 7 (TibiaWiki ground truth).
   * Niektóre (Vampirism, Void, Strike): 7. Niektóre amplification: 5.
   */
  readonly maxPointsPerCharm: number;
}

export const CHARM_DEFINITIONS: readonly CharmDefinition[] = [
  // ── Leech ─────────────────────────────────────────────────────────────
  { id: "vampirism", category: "leech", maxPointsPerCharm: 7 },
  { id: "void", category: "leech", maxPointsPerCharm: 7 },
  // ── Combat (elemental amplification) ───────────────────────────────────
  { id: "strike", category: "combat", maxPointsPerCharm: 7 },
  { id: "scorch", category: "combat", maxPointsPerCharm: 7 },
  { id: "venom", category: "combat", maxPointsPerCharm: 7 },
  { id: "frost", category: "combat", maxPointsPerCharm: 7 },
  { id: "electrify", category: "combat", maxPointsPerCharm: 7 },
  // ── Movement ──────────────────────────────────────────────────────────
  { id: "swiftness", category: "movement", maxPointsPerCharm: 7 },
  { id: "featherweight", category: "movement", maxPointsPerCharm: 7 },
  // ── Protection (damage reduction amplification) ────────────────────────
  { id: "vibrancy", category: "protection", maxPointsPerCharm: 7 },
  { id: "lichShroud", category: "protection", maxPointsPerCharm: 7 },
  { id: "snakeSkin", category: "protection", maxPointsPerCharm: 7 },
  { id: "dragonHide", category: "protection", maxPointsPerCharm: 7 },
  { id: "quaraScale", category: "protection", maxPointsPerCharm: 7 },
  { id: "cloudFabric", category: "protection", maxPointsPerCharm: 7 },
  { id: "demonPresence", category: "protection", maxPointsPerCharm: 7 },
  // ── Precision (skill amplification) ────────────────────────────────────
  { id: "precision", category: "precision", maxPointsPerCharm: 7 },
  { id: "epiphany", category: "precision", maxPointsPerCharm: 7 },
  // ── Offensive (sword/club/axe/distance amplification) ──────────────────
  { id: "reap", category: "offensive", maxPointsPerCharm: 7 },
  { id: "chop", category: "offensive", maxPointsPerCharm: 7 },
  { id: "slash", category: "offensive", maxPointsPerCharm: 7 },
  { id: "bash", category: "offensive", maxPointsPerCharm: 7 },
  { id: "blockade", category: "offensive", maxPointsPerCharm: 7 },
] as const;

/** Domyślny cap punktów charm per postać (z T16 `charm.max_points=9000`). */
export const DEFAULT_CHARM_MAX_POINTS = 9000;

/** Max punktów inwestowanych w jeden charm (heurystycznie: 7). */
export const DEFAULT_CHARM_PER_SLOT = 7;

/** Lista ID charmów (dla Zod enum / type guards). */
export const CHARM_IDS = CHARM_DEFINITIONS.map((c) => c.id) as unknown as readonly [
  string,
  ...string[],
];

/**
 * Helper: max punktów per charm (fallback gdy ID nieznany).
 * Używane przez UI do konfiguracji `<Slider max={…}>`.
 */
export function getMaxPointsPerCharm(charmId: string): number {
  const def = CHARM_DEFINITIONS.find((c) => c.id === charmId);
  return def?.maxPointsPerCharm ?? DEFAULT_CHARM_PER_SLOT;
}

// ──────────────────────────────────────────────────────────────────────────
// Vocation-specific charm recommendations
// ──────────────────────────────────────────────────────────────────────────

/**
 * Heurystyczne rekomendacje per vocation (TibiaPal benchmark + community
 * guides). Są to **top-3** charmy per vocation — używane do badge'a
 * "Polecane dla {vocation}".
 *
 * Reguły:
 *   - Knight   → Vampirism (leech HP) + Strike (combat amp) + Bash (melee amp)
 *   - Paladin  → Void (mana leech) + Distance + Reap (distance amp)
 *   - Druid    → Void + Frost (ice) + Epiphany (ML amplify)
 *   - Sorcerer → Void + Scorch (fire) + Epiphany
 *   - Monk     → Vampirism + Strike + Chop (fist amp)
 */
export type VocationId = "Knight" | "Paladin" | "Druid" | "Sorcerer" | "Monk";

export const VOCATION_IDS: readonly VocationId[] = [
  "Knight",
  "Paladin",
  "Druid",
  "Sorcerer",
  "Monk",
] as const;

export interface CharmRecommendation {
  readonly vocation: VocationId;
  readonly recommendedCharmIds: readonly string[];
}

export const CHARM_RECOMMENDATIONS: readonly CharmRecommendation[] = [
  { vocation: "Knight", recommendedCharmIds: ["vampirism", "strike", "bash"] },
  { vocation: "Paladin", recommendedCharmIds: ["void", "reap", "strike"] },
  { vocation: "Druid", recommendedCharmIds: ["void", "frost", "epiphany"] },
  { vocation: "Sorcerer", recommendedCharmIds: ["void", "scorch", "epiphany"] },
  { vocation: "Monk", recommendedCharmIds: ["vampirism", "strike", "chop"] },
] as const;

export function getRecommendedCharms(vocation: VocationId): readonly string[] {
  return (
    CHARM_RECOMMENDATIONS.find((r) => r.vocation === vocation)
      ?.recommendedCharmIds ?? []
  );
}

/** Zod schema dla charm planner state. */
export const CharmPlannerStateSchema = z.object({
  /** Total cap punktów (z T16 `charm.max_points=9000`). */
  maxPoints: z.number().int().min(0).max(50_000),
  /** Wybrana vocation (wpływa na rekomendacje). */
  vocation: z.enum(["Knight", "Paladin", "Druid", "Sorcerer", "Monk"]),
  /** Per-charm allocation: Record<charmId, points>. */
  allocation: z.record(z.string(), z.number().int().min(0).max(7)),
});

export type CharmPlannerState = z.infer<typeof CharmPlannerStateSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Wheel of Destiny — 5 curatowanych presetów per vocation
// ──────────────────────────────────────────────────────────────────────────

/**
 * Wheel of Destiny ma 3 kategorie (offensive / defensive / support).
 * Każda kategoria ma 30+ nodes. Budżet: max ~1000 pkt (TibiaPal benchmark:
 * "Wheel of Destiny" update 12.51, lvl 200+ postać).
 *
 * Prezentujemy użytkownikowi **uproszczony model**: 3 suwaki per vocation
 * (offensive / defensive / support) z procentowym rozkładem 0-100% w ramach
 * budżetu. To jest zgodne z TibiaPal "Wheel Builds" patternem i wystarczające
 * dla community planningu.
 */
export type WheelCategoryId = "offensive" | "defensive" | "support";

export const WHEEL_CATEGORY_IDS: readonly WheelCategoryId[] = [
  "offensive",
  "defensive",
  "support",
] as const;

/** Max budżet Wheel of Destiny (TibiaWiki: ~1000 pkt na max lvl). */
export const DEFAULT_WHEEL_MAX_POINTS = 1000;

export interface WheelCuratedBuild {
  /** Locale-independent ID. */
  readonly id: string;
  readonly vocation: VocationId;
  /** Czytelna nazwa buildu (PL/EN via i18n key). */
  readonly nameKey: string;
  /** Rozkład punktów per kategoria (suma = totalPoints). */
  readonly allocation: Record<WheelCategoryId, number>;
  /** Krótki opis co build robi (i18n key). */
  readonly descriptionKey: string;
}

/**
 * 5 curatowanych buildów — jeden per vocation. Wartości na bazie TibiaPal
 * "Wheel Builds" (community-tested). Budżet: 600 pkt (typowy mid-game build;
 * pełny 1000 pkt to late-game min-max).
 */
export const WHEEL_CURATED_BUILDS: readonly WheelCuratedBuild[] = [
  {
    id: "knight-tank",
    vocation: "Knight",
    nameKey: "knightTank",
    descriptionKey: "knightTankDesc",
    allocation: { offensive: 120, defensive: 380, support: 100 },
  },
  {
    id: "paladin-balanced",
    vocation: "Paladin",
    nameKey: "paladinBalanced",
    descriptionKey: "paladinBalancedDesc",
    allocation: { offensive: 220, defensive: 180, support: 200 },
  },
  {
    id: "druid-support",
    vocation: "Druid",
    nameKey: "druidSupport",
    descriptionKey: "druidSupportDesc",
    allocation: { offensive: 150, defensive: 130, support: 320 },
  },
  {
    id: "sorcerer-damage",
    vocation: "Sorcerer",
    nameKey: "sorcererDamage",
    descriptionKey: "sorcererDamageDesc",
    allocation: { offensive: 380, defensive: 90, support: 130 },
  },
  {
    id: "monk-hybrid",
    vocation: "Monk",
    nameKey: "monkHybrid",
    descriptionKey: "monkHybridDesc",
    allocation: { offensive: 260, defensive: 200, support: 140 },
  },
] as const;

export function getCuratedBuildsForVocation(
  vocation: VocationId,
): readonly WheelCuratedBuild[] {
  return WHEEL_CURATED_BUILDS.filter((b) => b.vocation === vocation);
}

/** Zod schema dla wheel planner state. */
export const WheelPlannerStateSchema = z.object({
  vocation: z.enum(["Knight", "Paladin", "Druid", "Sorcerer", "Monk"]),
  level: z.number().int().min(8).max(2500),
  maxPoints: z.number().int().min(0).max(2000),
  allocation: z.object({
    offensive: z.number().int().min(0).max(2000),
    defensive: z.number().int().min(0).max(2000),
    support: z.number().int().min(0).max(2000),
  }),
});

export type WheelPlannerState = z.infer<typeof WheelPlannerStateSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Default states (zero-config / first paint)
// ──────────────────────────────────────────────────────────────────────────

/** Pusty stan charm planner — wszystkie slidery na 0. */
export function getDefaultCharmState(maxPoints = DEFAULT_CHARM_MAX_POINTS): CharmPlannerState {
  const allocation: Record<string, number> = {};
  for (const c of CHARM_DEFINITIONS) {
    allocation[c.id] = 0;
  }
  return { maxPoints, vocation: "Knight", allocation };
}

/** Domyślny stan wheel planner. */
export function getDefaultWheelState(
  vocation: VocationId = "Knight",
  maxPoints = DEFAULT_WHEEL_MAX_POINTS,
): WheelPlannerState {
  return {
    vocation,
    level: 200,
    maxPoints,
    allocation: { offensive: 0, defensive: 0, support: 0 },
  };
}
