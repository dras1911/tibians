/**
 * getCurrentSkill — pobiera bazowy skill (bez loyalty) ze snapshotu.
 *
 * Helper wyciągający `snapshot.skills[skillKey].base` dla danej
 * pary vocation/skill (arch. §2.1). Używany przez kalkulatory operujące
 * na snapshocie (Exercise Weapons, Training/Skills, True Skill, ...).
 *
 * **Czysta funkcja**: nie mutuje snapshotu, deterministyczna.
 */

import type { CharacterSnapshot } from "@tibians/character-context";
import { getRelevantSkill } from "./get-relevant-skill.js";
import type { VocationSkillCategory } from "../types.js";

// ──────────────────────────────────────────────────────────────────────────
// getCurrentSkill(snapshot, category) → number
// ──────────────────────────────────────────────────────────────────────────

/**
 * Zwraca bazowy skill (bez bonusu lojalności) dla danej pary
 * vocation/skill. Reprezentuje to, co Tibia raportuje w Bazaarze
 * (arch. §13.1 — `Loyalty bonus not included`).
 *
 * @param snapshot - pełny CharacterSnapshot (arch. §13.1)
 * @param category - jedna z 8 par vocation/skill (arch. §2.1)
 * @returns bazowy skill jako `number` (integer ≥ 0)
 *
 * @example
 * ```ts
 * const swordBase = getCurrentSkill(snapshot, "knightMelee");
 * // → np. 120  (snapshot.skills.sword.base)
 * ```
 */
export function getCurrentSkill(
  snapshot: CharacterSnapshot,
  category: VocationSkillCategory,
): number {
  const skillKey = getRelevantSkill(snapshot, category);
  return snapshot.skills[skillKey].base;
}
