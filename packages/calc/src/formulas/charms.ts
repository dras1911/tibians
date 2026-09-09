/**
 * charms — obrażenia procentowe z charmów per vocation/skill (task 21,
 * arch. §2.1 TibiaPal benchmark + §13.1).
 *
 * TibiaPal Charm Damage Calculator (https://tibiapal.com/charm_calculator):
 *   - **Elemental charms** (Wound / Enflame / Freeze / Poison / Zap /
 *     Curse / Divine Wrath): zadają `5% × sensitivity` obrażeń od max HP
 *     potwora przy każdym proc. Sensitivity zależy od słabości potwora
 *     na dany element (np. 112% → 5.6%, 50% → 2.5%, 0% → 0%).
 *   - **Overpower**: `5% × HP_postaci` (capped przy `8% × HP_potwora`).
 *     Skaluje z HP postaci → faworyzuje Knightów.
 *   - **Overflux**: `2.5% × MP_postaci` (capped przy `8% × HP_potwora`).
 *     Skaluje z MP postaci → faworyzuje Sorcererów / Druidów.
 *
 * **Brak precyzyjnej formuły CipSoft** dla damage scaling per vocation/skill
 * — TibiaWiki dokumentuje tylko base case. TibiaPal benchmark używa HP/MP
 * postaci jako inputu, ale nasz kalkulator (zgodnie ze specyfikacją T21)
 * przyjmuje `vocation, skill, charm, monsterType` — bez HP/MP.
 *
 * **Przyjęte założenie** (udokumentowane w testach):
 *   1. **Base percent per charm**: Overpower=5%, Overflux=2.5%, wszystkie
 *      7 elemental charms = 5% (TibiaPal: "5% of max HP per proc").
 *   2. **Monster sensitivity multiplier**: modelujemy 5 poziomów wrażliwości
 *      per element (weak → 1.5, neutral → 1.0, resistant → 0.5, immune → 0).
 *      TibiaWiki opisuje to jako "5% × sensitivity" (TibiaAnalyzer).
 *   3. **Vocation factor** (0.7..1.3): przybliżenie HP/MP postaci per
 *      klasa bazowa (Knight 1.3 Overpower / 0.7 Overflux; Sorcerer/Druid
 *      0.7 Overpower / 1.3 Overflux; reszta 1.0). To jest **heurystyka**
 *      — TibiaWiki nie dokumentuje bezpośredniego wzoru; TibiaPal liczy
 *      z rzeczywistego HP/MP gracza (którego my nie mamy).
 *   4. **Skill factor** (0.9..1.1): marginalna korekta dla synergii skill
 *      z charm (np. magic→Overflux +10%, melee→Overpower +10%). **Niska
 *      waga** — TibiaWiki tego nie definiuje.
 *   5. **Proc chance**: pomijamy — TibiaPal pokazuje ją osobno; damage %
 *      to oczekiwana wartość per proc, nie per atak.
 *
 * Formuła finalna (TibiaPal benchmark + heuristic):
 *
 *   `damagePercent = BASE[charm] × sensitivity[charm][monsterType] × vocationMod × skillMod`
 *
 * **Czysta funkcja**: deterministyczna, brak I/O, brak `Date.now()`.
 *
 * Source: https://tibia.fandom.com/wiki/Charms
 *         https://tibia.fandom.com/wiki/Major_Charms
 *         https://tibia.fandom.com/wiki/Minor_Charms
 *         https://tibiapal.com/charm_calculator
 *         https://www.tibiaanalyzer.com.br/en/charm-guide
 */

import {
  err,
  ok,
  validationError,
  type CalculatorResult,
} from "../types.js";

// ──────────────────────────────────────────────────────────────────────────
// Typy domenowe
// ──────────────────────────────────────────────────────────────────────────

/**
 * 9 charmów branych pod uwagę w naszym kalkulatorze (Major + Overpower/Overflux):
 *   - 7 elemental charms (Wound / Enflame / Freeze / Poison / Zap / Curse /
 *     Divine Wrath) — damage oparty na HP potwora × wrażliwość na element.
 *   - 2 self-scaling (Overpower / Overflux) — damage oparty na HP/MP postaci.
 *
 * Pomijamy Minor charms (Adrenaline, Bless, Cleanse, …) — TibiaWiki/Ninja
 * Loz dokumentuje je jako utility, nie damage. TibiaPal Charm Calculator
 * również pokazuje tylko 9 powyższych.
 */
export type CharmId =
  | "wound"
  | "enflame"
  | "freeze"
  | "poison"
  | "zap"
  | "curse"
  | "divineWrath"
  | "overpower"
  | "overflux";

export const CHARM_IDS = [
  "wound",
  "enflame",
  "freeze",
  "poison",
  "zap",
  "curse",
  "divineWrath",
  "overpower",
  "overflux",
] as const;

/** Element skojarzony z charmem (TibiaWiki Major_Charms). */
export type CharmElement =
  | "physical"
  | "fire"
  | "ice"
  | "earth"
  | "energy"
  | "death"
  | "holy"
  | "self-hp"
  | "self-mp";

export const CHARM_ELEMENTS = [
  "physical",
  "fire",
  "ice",
  "earth",
  "energy",
  "death",
  "holy",
  "self-hp",
  "self-mp",
] as const;

/** Vocation (TibiaVoc, 5 bazowych klas). */
export type CharmVocation =
  | "Knight"
  | "Paladin"
  | "Druid"
  | "Sorcerer"
  | "Monk";

export const CHARM_VOCATIONS = [
  "Knight",
  "Paladin",
  "Druid",
  "Sorcerer",
  "Monk",
] as const;

/**
 * 7 skillów z `CharacterSnapshot.skills` (arch. §13.1) + 1 dodatkowy
 * (`shielding`) — TibiaPal benchmark (arch. §2.1) używa tego zestawu.
 *
 * Specjalny skill: `none` — dla charmów niezależnych od skilla
 * (Overpower/Overflux triggerują się z każdego ataku).
 */
export type CharmSkill =
  | "sword"
  | "axe"
  | "club"
  | "distance"
  | "magic"
  | "shielding"
  | "fist"
  | "none";

export const CHARM_SKILLS = [
  "sword",
  "axe",
  "club",
  "distance",
  "magic",
  "shielding",
  "fist",
  "none",
] as const;

/**
 * Poziom wrażliwości potwora na dany element.
 *
 * TibiaWiki Major_Charms: monstery mają różne "sensitivity" na każdy
 * element (typowo 100% neutral, 110-130% weak, 50-80% resistant, 0%
 * immune). TibiaPal traktuje to jako ciągłą wartość, ale uprościmy do
 * 4 dyskretnych klas dla UI.
 */
export type MonsterSensitivity = "weak" | "neutral" | "resistant" | "immune";

export const MONSTER_SENSITIVITIES = [
  "weak",
  "neutral",
  "resistant",
  "immune",
] as const;

// ──────────────────────────────────────────────────────────────────────────
// Stałe domenowe (TibiaPal benchmark + TibiaWiki Major_Charms)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Bazowy % damage per charm per proc (TibiaPal: "5% of max HP per proc"
 * dla elemental/Overpower, "2.5% of max MP per proc" dla Overflux).
 *
 * **Assumption** (udokumentowane): TibiaPal zwraca te wartości jako
 * "damage before mitigation" — real in-game damage będzie niższy o
 * monster mitigation modifier (TibiaPal tooltip).
 */
export const CHARM_BASE_PERCENT: Readonly<Record<CharmId, number>> = {
  wound: 5,
  enflame: 5,
  freeze: 5,
  poison: 5,
  zap: 5,
  curse: 5,
  divineWrath: 5,
  overpower: 5,
  overflux: 2.5,
};

/**
 * Element każdego charmu (TibiaWiki Major_Charms).
 *
 * Overpower/Overflux to "self" (damage skaluje z postaci, nie potwora),
 * więc ich monster-sensitivity jest zawsze neutral (1.0).
 */
export const CHARM_ELEMENT_MAP: Readonly<Record<CharmId, CharmElement>> = {
  wound: "physical",
  enflame: "fire",
  freeze: "ice",
  poison: "earth",
  zap: "energy",
  curse: "death",
  divineWrath: "holy",
  overpower: "self-hp",
  overflux: "self-mp",
};

/**
 * Sensitivity multiplier per element × monster sensitivity.
 *
 * TibiaPal: "5% × sensitivity" — typowe sensitivity (TibiaAnalyzer):
 *   - weak     → ~1.0–1.5 (średnio 1.2 w przybliżeniu; przyjmujemy 1.2)
 *   - neutral  → 1.0 (domyślna)
 *   - resistant → 0.5 (silna odporność)
 *   - immune   → 0.0 (brak obrażeń)
 *
 * **Assumption**: dyskretyzujemy do 4 klas (TibiaPal traktuje to jako
 * ciągłą wartość). Overpower/Overflux (self) mają zawsze 1.0 —
 * skalowanie z postaci, nie potwora.
 */
export const SENSITIVITY_MULTIPLIER: Readonly<
  Record<MonsterSensitivity, number>
> = {
  weak: 1.2,
  neutral: 1.0,
  resistant: 0.5,
  immune: 0.0,
};

/**
 * Vocation modifier per charm — przybliża efekt HP/MP postaci na damage.
 *
 * Logika (heurystyka, nie CipSoft ground truth):
 *   - Knight (wysokie HP, niskie MP) → +30% na Overpower, -30% na Overflux.
 *   - Sorcerer / Druid (niskie HP, wysokie MP) → odwrotnie.
 *   - Paladin / Monk (zbalansowane) → 1.0 dla obu.
 *   - Elemental charms → 1.0 (damage skaluje z HP potwora, nie postaci).
 *
 * TibiaPal Charm Calculator używa **rzeczywistego HP/MP gracza** jako
 * inputu — nasz kalkulator (zgodnie ze specyfikacją T21) tego nie ma,
 * więc stosujemy przybliżone vocation mods. **Heurystyka** —
 * udokumentowana w testach jako `// Assumption`.
 */
export const VOCATION_CHARM_MOD: Readonly<
  Record<CharmVocation, Readonly<Record<CharmId, number>>>
> = {
  Knight: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 1.3,
    overflux: 0.7,
  },
  Paladin: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 1.1,
    overflux: 0.9,
  },
  Druid: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 0.7,
    overflux: 1.3,
  },
  Sorcerer: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 0.7,
    overflux: 1.3,
  },
  Monk: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 1.1,
    overflux: 0.9,
  },
};

/**
 * Skill modifier per charm — marginalna synergia (heurystyka).
 *
 * Logika (heurystyka):
 *   - magic skill → Overflux +10% (mana-leech synergy).
 *   - sword/axe/club/fist → Overpower +10% (physical synergy).
 *   - distance → brak synergii (distance weapon physical, ale nie tak
 *     blisko jak melee; 1.0).
 *   - shielding → brak synergii (defensywny skill).
 *   - Elemental charms → 1.0 (nie zależą od skilla postaci).
 *   - "none" (Overpower/Overflux trigger z każdego ataku) → 1.0 dla
 *     kompatybilności z UI.
 *
 * **Low-weight heuristic** — TibiaWiki nie definiuje tej korelacji.
 * TibiaPal Charm Calculator nie ma takiego pola.
 */
export const SKILL_CHARM_MOD: Readonly<
  Record<CharmSkill, Readonly<Record<CharmId, number>>>
> = {
  sword: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 1.1,
    overflux: 1.0,
  },
  axe: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 1.1,
    overflux: 1.0,
  },
  club: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 1.1,
    overflux: 1.0,
  },
  distance: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 1.0,
    overflux: 1.0,
  },
  magic: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 1.0,
    overflux: 1.1,
  },
  shielding: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 1.0,
    overflux: 1.0,
  },
  fist: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 1.1,
    overflux: 1.0,
  },
  none: {
    wound: 1.0,
    enflame: 1.0,
    freeze: 1.0,
    poison: 1.0,
    zap: 1.0,
    curse: 1.0,
    divineWrath: 1.0,
    overpower: 1.0,
    overflux: 1.0,
  },
};

/**
 * Mapowanie sensitivity → efektowny komunikat dla UI (TibiaPal benchmark).
 */
export const SENSITIVITY_LABEL_KEY: Readonly<
  Record<MonsterSensitivity, "weak" | "neutral" | "resistant" | "immune">
> = {
  weak: "weak",
  neutral: "neutral",
  resistant: "resistant",
  immune: "immune",
};

// ──────────────────────────────────────────────────────────────────────────
// Wynik
// ──────────────────────────────────────────────────────────────────────────

export interface CharmDamageResult {
  /** Obrażenia procentowe z charmu per proc (round to 2 decimal places). */
  readonly damagePercent: number;
  /** Bazowy % per charm (przed modyfikatorami). */
  readonly basePercent: number;
  /** Sensitivity multiplier (0.0–1.2). */
  readonly sensitivityMultiplier: number;
  /** Vocation modifier (0.7–1.3). */
  readonly vocationModifier: number;
  /** Skill modifier (0.9–1.1). */
  readonly skillModifier: number;
  /** Czy potwór jest immune (damagePercent = 0). */
  readonly isImmune: boolean;
  /** Echo: oryginalne parametry (dla UI). */
  readonly charm: CharmId;
  readonly vocation: CharmVocation;
  readonly skill: CharmSkill;
  readonly monsterType: MonsterSensitivity;
}

// ──────────────────────────────────────────────────────────────────────────
// Walidacja typów (defensive — TS pilnuje, ale URL mógłby to obejść)
// ──────────────────────────────────────────────────────────────────────────

function isValidCharm(value: unknown): value is CharmId {
  return (
    typeof value === "string" && (CHARM_IDS as readonly string[]).includes(value)
  );
}

function isValidVocation(value: unknown): value is CharmVocation {
  return (
    typeof value === "string" &&
    (CHARM_VOCATIONS as readonly string[]).includes(value)
  );
}

function isValidSkill(value: unknown): value is CharmSkill {
  return (
    typeof value === "string" &&
    (CHARM_SKILLS as readonly string[]).includes(value)
  );
}

function isValidSensitivity(value: unknown): value is MonsterSensitivity {
  return (
    typeof value === "string" &&
    (MONSTER_SENSITIVITIES as readonly string[]).includes(value)
  );
}

// ──────────────────────────────────────────────────────────────────────────
// charmDamage(vocation, skill, charm, monsterType)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Oblicza oczekiwane obrażenia procentowe z charmu per proc.
 *
 * Formuła (TibiaPal benchmark + heurystyki):
 *   `damagePercent = base × sensitivity × vocationMod × skillMod`
 *
 * @param vocation - klasa postaci (Knight / Paladin / Druid / Sorcerer / Monk)
 * @param skill - skill ataku (sword / axe / club / distance / magic /
 *   shielding / fist / none)
 * @param charm - identyfikator charmu (9 opcji — patrz `CharmId`)
 * @param monsterType - wrażliwość potwora na element charmu (weak /
 *   neutral / resistant / immune)
 *
 * @example
 * ```ts
 * // Overpower vs neutral monster, Knight, sword → 5% × 1.0 × 1.3 × 1.1 = 7.15%
 * charmDamage("Knight", "sword", "overpower", "neutral");
 * //   damagePercent ≈ 7.15
 *
 * // Wound vs fire-weak monster (incorrect monsterType — wrażliwość na
 * // element 'physical', więc neutral), Sorcerer, magic → 5% × 1.0 × 1.0 × 1.0 = 5%
 * charmDamage("Sorcerer", "magic", "wound", "neutral");
 *
 * // Enflame vs ice-weak monster → immune (inny element)
 * charmDamage("Knight", "sword", "enflame", "immune");
 * //   damagePercent = 0, isImmune = true
 * ```
 *
 * **Edge cases**:
 *   - `monsterType = immune` → `damagePercent = 0`, `isImmune = true`.
 *   - Overpower/Overflux (self-scaling) → `sensitivityMultiplier = 1.0`
 *     (zawsze — skalowanie z postaci, nie potwora).
 *   - Dowolny enum spoza listy → błąd `CHARM_INVALID_*`.
 *
 * Source: https://tibia.fandom.com/wiki/Major_Charms
 *         https://tibiapal.com/charm_calculator
 */
export function charmDamage(
  vocation: CharmVocation,
  skill: CharmSkill,
  charm: CharmId,
  monsterType: MonsterSensitivity,
): CalculatorResult<CharmDamageResult> {
  // ── Walidacja enumów ────────────────────────────────────────────────
  if (!isValidVocation(vocation)) {
    return err(
      validationError(
        "CHARM_INVALID_VOCATION",
        `vocation musi być jednym z: ${CHARM_VOCATIONS.join(", ")}, otrzymano ${String(vocation)}`,
      ),
    );
  }
  if (!isValidSkill(skill)) {
    return err(
      validationError(
        "CHARM_INVALID_SKILL",
        `skill musi być jednym z: ${CHARM_SKILLS.join(", ")}, otrzymano ${String(skill)}`,
      ),
    );
  }
  if (!isValidCharm(charm)) {
    return err(
      validationError(
        "CHARM_INVALID_CHARM",
        `charm musi być jednym z: ${CHARM_IDS.join(", ")}, otrzymano ${String(charm)}`,
      ),
    );
  }
  if (!isValidSensitivity(monsterType)) {
    return err(
      validationError(
        "CHARM_INVALID_MONSTER_TYPE",
        `monsterType musi być jednym z: ${MONSTER_SENSITIVITIES.join(", ")}, otrzymano ${String(monsterType)}`,
      ),
    );
  }

  // ── Obliczenie ──────────────────────────────────────────────────────
  const basePercent = CHARM_BASE_PERCENT[charm];
  const element = CHARM_ELEMENT_MAP[charm];

  // Overpower/Overflux (self-scaling): monster sensitivity jest zawsze neutral.
  // TibiaWiki: damage skaluje z HP/MP gracza, nie HP potwora — wrażliwość
  // potwora nie wpływa.
  let sensitivityMultiplier: number;
  if (element === "self-hp" || element === "self-mp") {
    sensitivityMultiplier = SENSITIVITY_MULTIPLIER.neutral;
  } else {
    sensitivityMultiplier = SENSITIVITY_MULTIPLIER[monsterType];
  }

  const vocationModifier = VOCATION_CHARM_MOD[vocation][charm];
  const skillModifier = SKILL_CHARM_MOD[skill][charm];

  const raw = basePercent * sensitivityMultiplier * vocationModifier * skillModifier;
  // Round to 2 decimal places (TibiaPal: 2 decimals; standard w UI).
  const damagePercent = Math.round(raw * 100) / 100;

  // `isImmune` ma sens tylko dla elemental charms (skalowanych potworem).
  // Self-scaling (Overpower/Overflux) ignorują monsterType — `isImmune` to
  // semantyczny sygnał "ten potwór jest odporny" — nie dotyczy self-scaling.
  const isImmune =
    element !== "self-hp" &&
    element !== "self-mp" &&
    monsterType === "immune";

  return ok({
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
  });
}
