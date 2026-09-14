/**
 * Cross-link helper (plan task 49, arch 13.3 / 13.4).
 *
 * Generates URLs to Tibians calculators prefilled with context
 * from the auction. All calculators respect ?auction=ID --
 * SnapshotSourceProvider (T25) auto-loads the full Bazaar
 * snapshot into the Zustand store. Additional ?skill=,
 * ?target= etc. are hints for the calculator components (e.g.
 * expand the right section on landing).
 *
 * Goal: zero manual typing after navigating from an auction
 * detail to a calculator. The player clicks "How much for skill
 * 120?" and lands in Exercise Weapons with skill=sword,
 * current=113, target=120 pre-filled.
 *
 * Convention (arch 13.4):
 *   - /workspace?auction=ID = full Workspace with auction snap.
 *   - /calculators/X?auction=ID&skill=...&current=...&target=...
 *     = single calculator with prefill.
 *
 * Slugs mirror apps/web/src/app/[locale]/calculators/{slug}/page.tsx.
 */

import { SKILL_KEYS, type SkillKey } from "@tibians/character-context";

export const CALCULATOR_SLUGS = {
  exerciseWeapons: "exercise-weapons",
  skills: "skills",
  trueSkill: "true-skill",
  blessings: "blessings",
  stamina: "stamina",
  characterValue: "character-value",
  imbuement: "imbuement",
  weeklyTasks: "weekly-tasks",
  charms: "charms",
  experience: "experience",
  leech: "leech",
  expShare: "exp-share",
} as const;

export type CalculatorSlug =
  (typeof CALCULATOR_SLUGS)[keyof typeof CALCULATOR_SLUGS];

export interface AuctionLinkContext {
  auctionId: string;
  locale: string;
  level: number;
  vocation: string;
}

/**
 * Encodes a `Record<string, string | number | undefined>` as
 * `URLSearchParams`. Skips `undefined` and empty strings. Pure
 * function with deterministic alphabetical key order.
 */
export function encodeSearchParams(
  params: Readonly<Record<string, string | number | undefined>>,
): string {
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const usp = new URLSearchParams();
  for (const [k, v] of sorted) {
    usp.append(k, String(v));
  }
  return usp.toString();
}

/**
 * Skill key passthrough. Asserts the key is in the canonical
 * SKILL_KEYS set; throws otherwise (defensive).
 */
export function skillKeyToSlug(skill: SkillKey): string {
  if (!(SKILL_KEYS as readonly string[]).includes(skill)) {
    throw new Error(
      `[bazaar/cross-link-helpers] Unknown skill key: "${skill}"`,
    );
  }
  return skill;
}

/**
 * Suggested `target` skill (above current). Convention from T49:
 *   - if `current >= 130`: +5 (top-tier grind)
 *   - if `current >= 100`: +10 (mid-game)
 *   - else: +20 (early grind)
 */
export function suggestNextSkillTarget(current: number): number {
  if (current >= 130) return current + 5;
  if (current >= 100) return current + 10;
  return current + 20;
}

export interface SkillCrossLink {
  skill: SkillKey;
  current: number;
  target: number;
}

/**
 * URL to Exercise Weapons (T14) with skill prefill.
 *
 * Example: buildExerciseWeaponsLink(ctx, { skill: "sword", current: 113, target: 120 })
 * returns "/pl/calculators/exercise-weapons?auction=2173376&current=113&skill=sword&target=120".
 */
export function buildExerciseWeaponsLink(
  ctx: AuctionLinkContext,
  link: SkillCrossLink,
): string {
  const qs = encodeSearchParams({
    auction: ctx.auctionId,
    skill: skillKeyToSlug(link.skill),
    current: link.current,
    target: link.target,
  });
  return `/${ctx.locale}/calculators/${CALCULATOR_SLUGS.exerciseWeapons}?${qs}`;
}

/**
 * URL to Training / Skills (T14) -- general training calculator.
 */
export function buildSkillsCalculatorLink(
  ctx: AuctionLinkContext,
  link: SkillCrossLink,
): string {
  const qs = encodeSearchParams({
    auction: ctx.auctionId,
    skill: skillKeyToSlug(link.skill),
    current: link.current,
    target: link.target,
  });
  return `/${ctx.locale}/calculators/${CALCULATOR_SLUGS.skills}?${qs}`;
}

/**
 * URL to True Skill (T21) -- for a skill with `loyaltyPct`.
 */
export function buildTrueSkillLink(
  ctx: AuctionLinkContext,
  link: SkillCrossLink & { loyaltyPct: number },
): string {
  const qs = encodeSearchParams({
    auction: ctx.auctionId,
    skill: skillKeyToSlug(link.skill),
    current: link.current,
    loyalty: link.loyaltyPct,
  });
  return `/${ctx.locale}/calculators/${CALCULATOR_SLUGS.trueSkill}?${qs}`;
}

/**
 * URL to Blessings (T20) -- character level.
 */
export function buildBlessingsLink(ctx: AuctionLinkContext): string {
  const qs = encodeSearchParams({
    auction: ctx.auctionId,
    currentLevel: ctx.level,
  });
  return `/${ctx.locale}/calculators/${CALCULATOR_SLUGS.blessings}?${qs}`;
}

/**
 * URL to Character Value (T22) -- full auction snapshot.
 */
export function buildCharacterValueLink(ctx: AuctionLinkContext): string {
  const qs = encodeSearchParams({
    auction: ctx.auctionId,
  });
  return `/${ctx.locale}/calculators/${CALCULATOR_SLUGS.characterValue}?${qs}`;
}

/**
 * URL to Imbuement cost (T20). Only `auction` prefill -- the
 * calculator reads the rest from the snapshot.
 */
export function buildImbuementLink(ctx: AuctionLinkContext): string {
  const qs = encodeSearchParams({
    auction: ctx.auctionId,
  });
  return `/${ctx.locale}/calculators/${CALCULATOR_SLUGS.imbuement}?${qs}`;
}

/**
 * URL to Workspace loaded with the auction snapshot (T50, integration).
 *
 * `auctionToSnapshot()` (plan T37, arch §13.2) runs client-side in
 * `SnapshotSourceProvider` -- passing `?auction={id}` is enough.
 *
 * The optional `?prefill=true` (T49 MUST HAVE) signals in the UI that
 * the data originated from a specific auction, not from a manual form.
 */
export function buildWorkspaceLink(
  auctionId: string,
  locale: string,
): string {
  const qs = encodeSearchParams({
    auction: auctionId,
    prefill: "true",
  });
  return `/${locale}/workspace?${qs}`;
}
