/**
 * exp-share — kalkulator podziału XP w party (task 15, arch. §2.1, §13).
 *
 * **TibiaWiki/CipSoft ground truth** (https://tibia.com/support/?entryid=91,
 * https://tibia.fandom.com/wiki/Party):
 *
 *   1. "Shared experience means that the experience points a creature is
 *      yielding plus a bonus is distributed equally between all members
 *      of a party."
 *   2. Bonus za różne vocations w party (CipSoft official):
 *        1 vocation  → +20%
 *        2 vocations → +30%
 *        3 vocations → +60%
 *        4-5 vocations → +100%
 *   3. Legal level range (CipSoft official): "the lowest character in a party
 *      may not have less than two-thirds of the levels of the highest
 *      character." ⇒ L_low ≥ 2/3 × L_high, równoważnie L_high ≤ 1.5 × L_low.
 *
 * **Wzór**:
 *
 *   let N = number of distinct vocations in party (1..5)
 *   let bonus = { 1: 0.20, 2: 0.30, 3: 0.60, 4: 1.00, 5: 1.00 }[N]
 *   let totalWithBonus = totalXp × (1 + bonus)
 *   let numMembers = 1 + partyMembers.length  (player + members)
 *   playerXp = floor(totalWithBonus / numMembers)
 *   splits[i].xp = floor(totalWithBonus / numMembers)
 *   // (Równe: każdy członek party dostaje identyczny udział.)
 *
 * Suma udziałów może być mniejsza niż `totalXp` o `bonus × totalXp`
 * (różnica jest "tracona" — Tibia nie rozdysponowuje nadwyżki).
 * Dla 1-vocation 2-osobowej party: `playerXp + memberXp = 2 × totalXp × 1.20 / 2 = totalXp × 1.20`.
 *
 * **Dla level diff** (validation):
 *   - Wszystkie members muszą być w legal Tibia range względem siebie
 *     nawzajem (najniższy ≥ 2/3 × najwyższego). Jeśli nie → błąd.
 *
 * **Wynik** zawiera `playerXp` (udział gracza) i `splits` (per party member).
 *
 * **Czysta funkcja**: deterministyczna, bez I/O, bez `Date.now()`.
 *
 * Source: https://tibia.com/support/?entryid=91 (CipSoft — official)
 *         https://tibia.fandom.com/wiki/Party
 *         https://tibia.fandom.com/wiki/Experience_Formula
 */
import {
  err,
  ok,
  validationError,
  type CalculatorResult,
} from "../types.js";
import { MAX_LEVEL } from "../utils/xp-table.js";

// ──────────────────────────────────────────────────────────────────────────
// Stałe domenowe (Tibia ground truth)
// ──────────────────────────────────────────────────────────────────────────

/** Minimalny level gracza w Tibii (8). */
export const MIN_LEVEL = 8;

/**
 * Tibia legal level range ratio (CipSoft): L_high / L_low ≤ 1.5.
 *
 * Source: https://tibia.com/support/?entryid=91
 */
export const PARTY_LEVEL_RATIO_MAX = 1.5;

/**
 * Mnożniki bonusu za różne vocations w party (Tibia official).
 *   1 vocation  → 0.20 (20%)
 *   2 vocations → 0.30 (30%)
 *   3 vocations → 0.60 (60%)
 *   4 vocations → 1.00 (100%)
 *   5 vocations → 1.00 (100%) — max 5 różnych vocations w Tibii
 *
 * Source: https://tibia.com/support/?entryid=91  ("If party members of 2
 * vocations are involved in the fight, the bonus is raised to 30%;
 * 3 different vocations yield a bonus of 60%; and if party members of
 * all 4 or 5 vocations participate, the bonus will even be raised to 100%").
 */
export const PARTY_VOCATION_BONUS: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> =
  Object.freeze({
    1: 0.2,
    2: 0.3,
    3: 0.6,
    4: 1.0,
    5: 1.0,
  } as const);

// ──────────────────────────────────────────────────────────────────────────
// Typy wejścia/wyjścia
// ──────────────────────────────────────────────────────────────────────────

/** Vocation postaci (5 bazowych klas). */
export type PartyVocation =
  | "Knight"
  | "Paladin"
  | "Druid"
  | "Sorcerer"
  | "Monk";

/** Pojedynczy członek party. */
export interface PartyMember {
  /** Nazwa postaci (do UI/raportu). */
  readonly name: string;
  /** Level członka party (integer ∈ [8, MAX_LEVEL]). */
  readonly level: number;
  /** Vocation członka. */
  readonly vocation: PartyVocation;
}

/** Pojedynczy udział XP członka party. */
export interface PartyMemberSplit {
  readonly name: string;
  readonly level: number;
  /** XP jako bigint (Tibia XP przy level 2500 ≈ 2.6×10¹⁰). */
  readonly xp: bigint;
}

/** Wynik `expShareSplit`. */
export interface ExpShareResult {
  /** Udział gracza (bigint). */
  readonly playerXp: bigint;
  /** Udziały per party member (bez gracza). */
  readonly splits: readonly PartyMemberSplit[];
  /** Ile % bonus doliczono za różne vocations (0..1). */
  readonly vocationBonus: number;
  /** Ile różnych vocations jest w party (1..5). */
  readonly distinctVocations: number;
  /** Ile jest wszystkich członków party (1 = solo). */
  readonly totalMembers: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpery (wewnętrzne)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Walidacja integer level.
 */
function isValidLevel(level: number): boolean {
  return Number.isInteger(level) && level >= MIN_LEVEL && level <= MAX_LEVEL;
}

/**
 * Zwraca liczbę różnych vocations w party (1..5).
 * Jeśli vocation jest spoza dozwolonego zbioru → error.
 */
function distinctVocationCount(
  playerVocation: PartyVocation,
  members: readonly PartyMember[],
): number | { readonly error: string } {
  const set = new Set<PartyVocation>([playerVocation]);
  for (const m of members) {
    if (
      m.vocation !== "Knight" &&
      m.vocation !== "Paladin" &&
      m.vocation !== "Druid" &&
      m.vocation !== "Sorcerer" &&
      m.vocation !== "Monk"
    ) {
      return {
        error: `Nieznana vocation '${String(m.vocation)}' dla ${m.name}`,
      };
    }
    set.add(m.vocation);
  }
  return set.size;
}

/**
 * Sprawdza czy cały party (player + members) mieści się w Tibia legal
 * level range. CipSoft: L_low ≥ (2/3) × L_high.
 */
function isPartyLegal(
  playerLevel: number,
  members: readonly PartyMember[],
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const allLevels = [playerLevel, ...members.map((m) => m.level)];
  const min = Math.min(...allLevels);
  const max = Math.max(...allLevels);
  if (max > PARTY_LEVEL_RATIO_MAX * min) {
    return {
      ok: false,
      reason:
        `Party poza Tibia legal range: min=${min}, max=${max}, ` +
        `max/min ratio ${(max / min).toFixed(3)} > ${PARTY_LEVEL_RATIO_MAX}`,
    };
  }
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// expShareSplit — główna funkcja
// ──────────────────────────────────────────────────────────────────────────

/**
 * Rozdziela `totalXp` między gracza (`playerLevel`, `playerVocation`)
 * i party members (z uwzględnieniem Tibia vocation bonus i legal level range).
 *
 * **Algorytm**:
 *   1. Walidacja: totalXp ≥ 0, playerLevel ∈ [MIN_LEVEL, MAX_LEVEL],
 *      każdy member ma poprawny level i vocation, unikalne name.
 *   2. Sprawdź legal level range (CipSoft: ratio ≤ 1.5).
 *   3. Policz distinct vocations → bonus multiplier.
 *   4. Oblicz każdy udział: floor((totalXp × (1 + bonus)) / numMembers).
 *
 * @param totalXp - suma XP do podziału (bigint ≥ 0)
 * @param playerLevel - level gracza (integer ∈ [8, 2500])
 * @param playerVocation - vocation gracza
 * @param partyMembers - lista członków party (bez gracza)
 * @returns `CalculatorResult<ExpShareResult>`
 *
 * @example
 * ```ts
 * // Solo (brak party members) — pełne XP dla gracza
 * expShareSplit(1000n, 100, "Knight", []);
 * // → { playerXp: 1000n, splits: [], ... }
 *
 * // 2-osobowa party z 2 różnymi vocations → +30% bonus
 * expShareSplit(1000n, 100, "Knight", [
 *   { name: "Pal", level: 110, vocation: "Paladin" },
 * ]);
 * // → { playerXp: 650n, splits: [{ name: "Pal", xp: 650n, ... }], bonus: 0.3 }
 *
 * // 4-osobowa party z 4 różnymi vocations → +100% bonus
 * expShareSplit(1000n, 200, "Knight", [
 *   { name: "Pal", level: 200, vocation: "Paladin" },
 *   { name: "Dru", level: 200, vocation: "Druid" },
 *   { name: "Sor", level: 200, vocation: "Sorcerer" },
 * ]);
 * // → bonus=1.0, każdy dostaje 500n (= 1000×2 / 4)
 * ```
 *
 * Source: https://tibia.com/support/?entryid=91 (CipSoft)
 *         https://tibia.fandom.com/wiki/Party
 */
export function expShareSplit(
  totalXp: bigint,
  playerLevel: number,
  playerVocation: PartyVocation,
  partyMembers: readonly PartyMember[],
): CalculatorResult<ExpShareResult> {
  // ── Walidacja totalXp ──
  if (typeof totalXp !== "bigint") {
    return err(
      validationError(
        "EXP_SHARE_INVALID_XP",
        `totalXp musi być bigintem, otrzymano ${typeof totalXp}`,
      ),
    );
  }
  if (totalXp < 0n) {
    return err(
      validationError(
        "EXP_SHARE_INVALID_XP",
        `totalXp nie może być ujemny, otrzymano ${totalXp}`,
      ),
    );
  }

  // ── Walidacja playerLevel ──
  if (!Number.isFinite(playerLevel) || !Number.isInteger(playerLevel)) {
    return err(
      validationError(
        "EXP_SHARE_INVALID_LEVEL",
        `playerLevel musi być integerem, otrzymano ${playerLevel}`,
      ),
    );
  }
  if (playerLevel < MIN_LEVEL) {
    return err(
      validationError(
        "EXP_SHARE_INVALID_LEVEL",
        `playerLevel < ${MIN_LEVEL} (minimalny level Tibii), otrzymano ${playerLevel}`,
      ),
    );
  }
  if (playerLevel > MAX_LEVEL) {
    return err(
      validationError(
        "EXP_SHARE_INVALID_LEVEL",
        `playerLevel > ${MAX_LEVEL} poza zakresem Tibii, otrzymano ${playerLevel}`,
      ),
    );
  }

  // ── Walidacja playerVocation ──
  if (
    playerVocation !== "Knight" &&
    playerVocation !== "Paladin" &&
    playerVocation !== "Druid" &&
    playerVocation !== "Sorcerer" &&
    playerVocation !== "Monk"
  ) {
    return err(
      validationError(
        "EXP_SHARE_INVALID_VOCATION",
        `Nieznana playerVocation '${String(playerVocation)}'`,
      ),
    );
  }

  // ── Walidacja partyMembers ──
  for (const m of partyMembers) {
    if (typeof m.name !== "string" || m.name.length === 0) {
      return err(
        validationError(
          "EXP_SHARE_INVALID_MEMBER",
          `partyMember.name musi być niepustym stringiem, otrzymano ${typeof m.name}`,
        ),
      );
    }
    if (!isValidLevel(m.level)) {
      return err(
        validationError(
          "EXP_SHARE_INVALID_LEVEL",
          `partyMember.level musi być integerem ∈ [${MIN_LEVEL}, ${MAX_LEVEL}], ` +
            `dla ${m.name} otrzymano ${m.level}`,
        ),
      );
    }
  }

  // ── Walidacja unikalności nazw ──
  const nameSet = new Set(partyMembers.map((m) => m.name));
  if (nameSet.size !== partyMembers.length) {
    return err(
      validationError(
        "EXP_SHARE_DUPLICATE_NAMES",
        `Nazwy członków party muszą być unikalne, znaleziono duplikaty`,
      ),
    );
  }

  // ── Sprawdź Tibia legal level range ──
  const legality = isPartyLegal(playerLevel, partyMembers);
  if (!legality.ok) {
    return err(
      validationError("EXP_SHARE_ILLEGAL_LEVEL_RANGE", legality.reason),
    );
  }

  // ── Policz distinct vocations + bonus ──
  const distinctResult = distinctVocationCount(playerVocation, partyMembers);
  if (typeof distinctResult === "object" && "error" in distinctResult) {
    return err(
      validationError("EXP_SHARE_INVALID_VOCATION", distinctResult.error),
    );
  }
  const distinct = distinctResult as number;
  // Clamp do 5 (max różnych vocations w Tibii)
  const distinctClamped = Math.min(5, Math.max(1, distinct)) as 1 | 2 | 3 | 4 | 5;
  const bonus = PARTY_VOCATION_BONUS[distinctClamped];

  // ── Oblicz udziały ──
  // Total z bonusem: totalXp × (1 + bonus). Używamy bigint do mnożenia.
  // Bonus * 100 (np. 30 → 30) → mnożymy przez (100 + bonus*100) / 100.
  // Aby uniknąć float w mnożeniu: używamy precyzji 1e9 (9 miejsc po przecinku).
  const BONUS_SCALE = 1_000_000_000n; // 1e9
  const bonusScaled = BigInt(Math.round(bonus * 1_000_000_000));
  const totalWithBonusScaled = totalXp * (BONUS_SCALE + bonusScaled);
  const numMembers = BigInt(1 + partyMembers.length);

  // Per-member share (scaled): floor(totalWithBonusScaled / numMembers)
  const perMemberScaled = totalWithBonusScaled / numMembers;
  // Konwersja do "prawdziwego" bigint XP (dzielimy przez BONUS_SCALE).
  const playerXp = perMemberScaled / BONUS_SCALE;
  const splits: PartyMemberSplit[] = partyMembers.map((m) => ({
    name: m.name,
    level: m.level,
    xp: perMemberScaled / BONUS_SCALE,
  }));

  return ok({
    playerXp,
    splits,
    vocationBonus: bonus,
    distinctVocations: distinctClamped,
    totalMembers: 1 + partyMembers.length,
  });
}