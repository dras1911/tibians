/**
 * getRelevantSkill — mapowanie 8 par vocation/skill (arch. §2.1).
 *
 * Każdy kalkulator operujący na snapshocie musi wiedzieć, który skill
 * z `snapshot.skills` jest „tym właściwym" dla danej postaci. Architektura
 * §2.1 (TibiaPal benchmark) definiuje **8 par** vocation/skill:
 *
 *   - Knight:       Melee (sword), Shielding, Magic
 *   - Paladin:      Magic, Distance
 *   - Druid/Sorcerer: Magic
 *   - Monk:         Magic, Fist
 *
 * Ten plik dostarcza:
 *   - `VOCATION_SKILL_PAIRS` — readonly tablica 8 par (kategoria + vocation + SkillKey)
 *   - `PRIMARY_SKILL_PER_VOCATION` — domyślny skill per promoted vocation
 *   - `getRelevantSkill(snapshot, category)` — wyciąga `SkillKey` dla kategorii
 *   - `getRelevantSkills(snapshot, vocation)` — wszystkie pary dla danej vocacji
 *
 * Wszystkie funkcje są **czyste i deterministyczne** — nie czytają
 * `Date.now()` ani `Math.random()`. Bez I/O.
 */

import type { CharacterSnapshot, SkillKey, VocationPromoted } from "@tibians/character-context";
import type {
  VocationSkillCategory,
  VocationSkillPair,
} from "../types.js";

// ──────────────────────────────────────────────────────────────────────────
// VOCATION_SKILL_PAIRS — pełna tabela 8 par (arch. §2.1)
// ──────────────────────────────────────────────────────────────────────────

/**
 * 8 par vocation/skill w kolejności referencyjnej z TibiaPal (arch. §2.1):
 *
 *   1. Knight       → Melee      (skillKey: sword — główna broń 2H Knighta)
 *   2. Knight       → Shielding  (skillKey: shielding)
 *   3. Knight       → Magic      (skillKey: magic)
 *   4. Paladin      → Magic      (skillKey: magic)
 *   5. Paladin      → Distance   (skillKey: distance)
 *   6. Druid/Sorcerer → Magic    (skillKey: magic)
 *   7. Monk         → Magic      (skillKey: magic)
 *   8. Monk         → Fist       (skillKey: fist)
 *
 * Dla Mage (Druid/Sorcerer) jest jedna para — `mageMagic` — bo Tibia traktuje
 * obie klasy łącznie w kontekście par vocation/skill (ich skill magic jest
 * liczony identycznie w TibiaPal).
 */
export const VOCATION_SKILL_PAIRS: readonly VocationSkillPair[] = Object.freeze([
  // Knight (Elite Knight) — 3 pary: Melee, Shielding, Magic
  { category: "knightMelee",     vocation: "Elite Knight", skillKey: "sword" },
  { category: "knightShielding", vocation: "Elite Knight", skillKey: "shielding" },
  { category: "knightMagic",     vocation: "Elite Knight", skillKey: "magic" },
  // Paladin (Royal Paladin) — 2 pary: Magic, Distance
  { category: "paladinMagic",    vocation: "Royal Paladin", skillKey: "magic" },
  { category: "paladinDistance", vocation: "Royal Paladin", skillKey: "distance" },
  // Mage (Elder Druid + Master Sorcerer) — 1 para: Magic (wspólna)
  { category: "mageMagic",       vocation: "Elder Druid",     skillKey: "magic" },
  { category: "mageMagic",       vocation: "Master Sorcerer", skillKey: "magic" },
  // Monk (Exalted Monk) — 2 pary: Magic, Fist
  { category: "monkMagic",       vocation: "Exalted Monk", skillKey: "magic" },
  { category: "monkFist",        vocation: "Exalted Monk", skillKey: "fist" },
] as const);

/**
 * Indeks `VOCATION_SKILL_PAIRS` po kategorii — O(1) lookup.
 * Prywatny, bo wewnętrzna optymalizacja; API publiczne to `getRelevantSkill`.
 */
const PAIR_BY_CATEGORY: ReadonlyMap<VocationSkillCategory, VocationSkillPair> =
  new Map(VOCATION_SKILL_PAIRS.map((p) => [p.category, p]));

// ──────────────────────────────────────────────────────────────────────────
// PRIMARY_SKILL_PER_VOCATION — domyślny skill per promoted vocation
// ──────────────────────────────────────────────────────────────────────────

/**
 * Domyślny (primary) skill dla każdej promowanej vocacji.
 * Używany, gdy kalkulator potrzebuje „tego jednego właściwego" skilla
 * bez podawania konkretnej kategorii (np. Character Value alg. §8.4
 * „main skill → Knight: sword/axe/club" przyjmuje sword jako domyślny).
 *
 *   - Elite Knight     → sword     (główna broń 2H; alternatywy axe/club
 *                                   są wspierane przez TibiaPal jako osobne
 *                                   pary, ale wartościowo liczy się sword)
 *   - Royal Paladin    → distance
 *   - Elder Druid      → magic
 *   - Master Sorcerer  → magic
 *   - Exalted Monk     → fist
 */
export const PRIMARY_SKILL_PER_VOCATION: Readonly<
  Record<VocationPromoted, SkillKey>
> = Object.freeze({
  "Elite Knight":     "sword",
  "Royal Paladin":    "distance",
  "Elder Druid":      "magic",
  "Master Sorcerer":  "magic",
  "Exalted Monk":     "fist",
} as const);

// ──────────────────────────────────────────────────────────────────────────
// getRelevantSkill(snapshot, category) → SkillKey
// ──────────────────────────────────────────────────────────────────────────

/**
 * Zwraca `SkillKey` odpowiadający danej kategorii vocation/skill
 * (zgodnie z arch. §2.1). Wynik to klucz, pod którym bazowy skill
 * tej pary znajduje się w `snapshot.skills`.
 *
 * @example
 * ```ts
 * const key = getRelevantSkill(snapshot, "knightMelee");
 * // → "sword"
 * const base = snapshot.skills[key].base;
 * ```
 *
 * **Czysta funkcja**: nie mutuje snapshotu, nie ma efektów ubocznych.
 * Deterministyczna — dla tych samych wejść zawsze ten sam wynik.
 */
export function getRelevantSkill(
  _snapshot: CharacterSnapshot,
  category: VocationSkillCategory,
): SkillKey {
  const pair = PAIR_BY_CATEGORY.get(category);
  // `PAIR_BY_CATEGORY` budujemy z `VOCATION_SKILL_PAIRS`, więc każda
  // kategoria z `VocationSkillCategory` musi tam być. Gdyby ktoś
  // dodał kategorię do enum bez pary — błąd jest w budowie tabeli.
  if (pair === undefined) {
    throw new Error(
      `[@tibians/calc] Brak pary VocationSkillPair dla kategorii "${category}". ` +
        `Sprawdź VOCATION_SKILL_PAIRS w packages/calc/src/utils/get-relevant-skill.ts.`,
    );
  }
  return pair.skillKey;
}

// ──────────────────────────────────────────────────────────────────────────
// getRelevantSkills(snapshot, vocation) → readonly SkillKey[]
// ──────────────────────────────────────────────────────────────────────────

/**
 * Zwraca wszystkie pary vocation/skill (arch. §2.1) dla danej promowanej
 * vocacji jako listę `SkillKey`. Użyteczne dla kalkulatorów, które chcą
 * sumować/obliczać po wielu skillach (np. Character Value §8.4 liczy
 * `main skill + shielding` dla Knighta).
 *
 * @example
 * ```ts
 * const keys = getRelevantSkills(snapshot, "Elite Knight");
 * // → ["sword", "shielding", "magic"]  (kolejność z VOCATION_SKILL_PAIRS)
 * const total = keys.reduce((sum, k) => sum + snapshot.skills[k].base, 0);
 * ```
 *
 * **Czysta funkcja**: nie mutuje, deterministyczna.
 */
export function getRelevantSkills(
  snapshot: CharacterSnapshot,
  vocation: VocationPromoted,
): readonly SkillKey[] {
  // Snapshot jest nieużywany w obliczeniach, ale w sygnaturze — sygnalizuje
  // konsumentom, że funkcja operuje na snapshocie (spójność z resztą API).
  void snapshot;
  return VOCATION_SKILL_PAIRS.filter((p) => p.vocation === vocation).map(
    (p) => p.skillKey,
  );
}

// ──────────────────────────────────────────────────────────────────────────
// getPrimarySkill(snapshot) → SkillKey
// ──────────────────────────────────────────────────────────────────────────

/**
 * Zwraca domyślny (primary) skill dla promowanej vocacji ze snapshotu.
 * Wygodny alias dla `PRIMARY_SKILL_PER_VOCATION[snapshot.identity.vocationPromoted]`.
 *
 * @example
 * ```ts
 * const mainKey = getPrimarySkill(snapshot);
 * const mainBase = snapshot.skills[mainKey].base;
 * ```
 *
 * **Czysta funkcja**: deterministyczna, brak I/O.
 */
export function getPrimarySkill(snapshot: CharacterSnapshot): SkillKey {
  return PRIMARY_SKILL_PER_VOCATION[snapshot.identity.vocationPromoted];
}
