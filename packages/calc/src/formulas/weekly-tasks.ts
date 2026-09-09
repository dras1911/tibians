/**
 * weekly-tasks — maksymalne XP za weekly task (task 21, arch. §2.1, §13.1).
 *
 * TibiaWiki (BR) Weekly_Tasks (Update de Inverno 2025):
 *   - **Bazowy wzór**: `XP = 1_995 × poziom_postaci` (CipSoft nie ujawnił
 *     dokładnego wzoru, ale community reverse-engineered `~1995 × L` i
 *     TibiaWiki BR to potwierdza).
 *   - **Cap per trudność** (XP limit per task):
 *       - Beginner → 200 000
 *       - Adept    → 800 000
 *       - Expert   → 3 000 000
 *       - Master   → brak limitu
 *   - **Wymagany level per trudność** (TibiaWiki BR):
 *       - Beginner → od 1
 *       - Adept    → od 30
 *       - Expert   → od 150
 *       - Master   → od 400
 *   - **Typy tasków**: `kill` i `delivery` mają tę samą formułę XP
 *     (TibiaWiki BR — „A experiência recebida por cada tarefa é calculada
 *     utilizando a fórmula: 1.995 × Nível do Personagem"). Jedyna różnica
 *     to difficulty cap i kryterium unlock (cap dotyczy obu typów).
 *
 * **Czysta funkcja**: deterministyczna, brak I/O, brak `Date.now()`.
 *
 * **Założenia / ograniczenia** (udokumentowane w testach):
 *   - CipSoft NIE ujawnił dokładnego wzoru — przyjęliśmy `1995 × level`
 *     zgodnie z TibiaWiki BR i community reverse-engineeringiem.
 *   - TibiaPal benchmark (arch. §2.1) używa tego samego wzoru dla obu
 *     typów tasków, więc `kill` i `delivery` zwracają tę samą wartość
 *     bazową — różnią się tylko kontekstem (kill z cap, delivery z cap,
 *     ale cap jest per-difficulty).
 *   - Minimalny level postaci to 8 (CipSoft legal limit).
 *
 * Source: https://tibiawiki.com.br/wiki/Weekly_Tasks
 *         https://tibia.fandom.com/wiki/Weekly_Tasks
 *         https://tibiaqa.com/38173/how-much-experience-do-weekly-tasks-award
 */

import {
  err,
  ok,
  validationError,
  type CalculatorResult,
} from "../types.js";

// ──────────────────────────────────────────────────────────────────────────
// Stałe domenowe (TibiaWiki BR + TibiaPal benchmark)
// ──────────────────────────────────────────────────────────────────────────

/** Minimalny level postaci w Tibii (CipSoft legal limit). */
export const MIN_LEVEL = 8;

/** Maksymalny level postaci w Tibii (TibiaWiki). */
export const MAX_LEVEL = 2500;

/** Bazowy mnożnik XP za weekly task (TibiaWiki BR). */
export const WEEKLY_TASK_XP_PER_LEVEL = 1995;

/**
 * Progi doświadczenia per trudność (cap). CipSoft oficjalne wartości.
 *
 * @see https://tibiawiki.com.br/wiki/Weekly_Tasks
 */
export const WEEKLY_TASK_XP_CAP = {
  beginner: 200_000,
  adept: 800_000,
  expert: 3_000_000,
  master: Number.POSITIVE_INFINITY, // brak limitu
} as const;

/**
 * Minimalny level wymagany do odblokowania danej trudności.
 *
 * @see https://tibiawiki.com.br/wiki/Weekly_Tasks
 */
export const WEEKLY_TASK_MIN_LEVEL: Readonly<Record<WeeklyTaskDifficulty, number>> =
  {
    beginner: 1,
    adept: 30,
    expert: 150,
    master: 400,
  };

// ──────────────────────────────────────────────────────────────────────────
// Typy domenowe
// ──────────────────────────────────────────────────────────────────────────

/**
 * Cztery trudności weekly task (TibiaWiki BR).
 *
 * `beginner` < 50 (arch. §2.1 — TibiaPal benchmark)
 * `adept`    50-100
 * `expert`   100-200
 * `master`   200+
 */
export type WeeklyTaskDifficulty = "beginner" | "adept" | "expert" | "master";

export const WEEKLY_TASK_DIFFICULTIES = [
  "beginner",
  "adept",
  "expert",
  "master",
] as const;

/** Typ weekly task: kill lub delivery (TibiaWiki BR — ta sama formuła XP). */
export type WeeklyTaskType = "kill" | "delivery";

export const WEEKLY_TASK_TYPES = ["kill", "delivery"] as const;

// ──────────────────────────────────────────────────────────────────────────
// Wynik
// ──────────────────────────────────────────────────────────────────────────

export interface WeeklyTaskResult {
  /** Bazowe XP (bez cap) = 1_995 × level. */
  readonly baseXp: bigint;
  /** XP po nałożeniu cap danej trudności. */
  readonly xpAfterCap: bigint;
  /** Cap użyty (dla UI — pokazujemy "capped at X"). */
  readonly capXp: bigint;
  /** Czy cap został osiągnięty. */
  readonly wasCapped: boolean;
  /** Trudność (po ewentualnej walidacji). */
  readonly difficulty: WeeklyTaskDifficulty;
  /** Typ taska. */
  readonly taskType: WeeklyTaskType;
  /** Poziom postaci. */
  readonly level: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Walidacja typów
// ──────────────────────────────────────────────────────────────────────────

function isValidDifficulty(value: unknown): value is WeeklyTaskDifficulty {
  return (
    typeof value === "string" &&
    (WEEKLY_TASK_DIFFICULTIES as readonly string[]).includes(value)
  );
}

function isValidTaskType(value: unknown): value is WeeklyTaskType {
  return (
    typeof value === "string" &&
    (WEEKLY_TASK_TYPES as readonly string[]).includes(value)
  );
}

// ──────────────────────────────────────────────────────────────────────────
// weeklyTaskReward(level, difficulty, taskType) → CalculatorResult<WeeklyTaskResult>
// ──────────────────────────────────────────────────────────────────────────

/**
 * Maksymalne XP za weekly task na zadanym poziomie i trudności.
 *
 * Wzór CipSoft (TibiaWiki BR): `XP = 1_995 × level`, ograniczone capem
 * per trudność. Zarówno `kill` jak i `delivery` używają tego samego
 * wzoru (TibiaWiki BR — nieudokumentowane rozróżnienie formuły).
 *
 * @param level - poziom postaci (integer ∈ [8, 2500])
 * @param difficulty - trudność: `beginner` / `adept` / `expert` / `master`
 * @param taskType - typ taska: `kill` / `delivery` (ta sama formuła XP)
 * @returns `CalculatorResult<WeeklyTaskResult>`
 *
 * @example
 * ```ts
 * weeklyTaskReward(200, "expert", "kill");
 * //   baseXp = 399_000n, xpAfterCap = 399_000n, wasCapped = false
 *
 * weeklyTaskReward(200, "beginner", "kill");
 * //   baseXp = 399_000n, xpAfterCap = 200_000n, wasCapped = true
 *
 * weeklyTaskReward(8, "master", "delivery");
 * //   error MASTER_REQUIRES_LEVEL_400 (level 8 < 400 wymaganego dla Master)
 * ```
 *
 * **Edge cases**:
 *   - `level` < 8 → błąd `WEEKLY_TASK_INVALID_LEVEL`
 *   - `level` > 2500 → błąd `WEEKLY_TASK_INVALID_LEVEL`
 *   - Non-integer → błąd `WEEKLY_TASK_INVALID_LEVEL`
 *   - `level` < `WEEKLY_TASK_MIN_LEVEL[difficulty]` →
 *     `WEEKLY_TASK_LEVEL_TOO_LOW` (CipSoft: nie można wybrać trudności
 *     bez odblokowania jej poziomem)
 *   - `difficulty` / `taskType` spoza enum → błąd walidacji
 *
 * Source: https://tibiawiki.com.br/wiki/Weekly_Tasks
 */
export function weeklyTaskReward(
  level: number,
  difficulty: WeeklyTaskDifficulty,
  taskType: WeeklyTaskType,
): CalculatorResult<WeeklyTaskResult> {
  // ── Walidacja level ──────────────────────────────────────────────────
  if (!Number.isFinite(level) || !Number.isInteger(level)) {
    return err(
      validationError(
        "WEEKLY_TASK_INVALID_LEVEL",
        `level musi być integerem, otrzymano ${level}`,
      ),
    );
  }
  if (level < MIN_LEVEL) {
    return err(
      validationError(
        "WEEKLY_TASK_INVALID_LEVEL",
        `level musi być ≥ ${MIN_LEVEL} (CipSoft legal limit), otrzymano ${level}`,
      ),
    );
  }
  if (level > MAX_LEVEL) {
    return err(
      validationError(
        "WEEKLY_TASK_INVALID_LEVEL",
        `level musi być ≤ ${MAX_LEVEL} (TibiaWiki cap), otrzymano ${level}`,
      ),
    );
  }

  // ── Walidacja difficulty / taskType (defensive — TS już to sprawdza,
  //    ale wzory z `unknown` z URL mógłby to pominąć) ──────────────────
  if (!isValidDifficulty(difficulty)) {
    return err(
      validationError(
        "WEEKLY_TASK_INVALID_DIFFICULTY",
        `difficulty musi być jednym z: ${WEEKLY_TASK_DIFFICULTIES.join(", ")}, otrzymano ${String(difficulty)}`,
      ),
    );
  }
  if (!isValidTaskType(taskType)) {
    return err(
      validationError(
        "WEEKLY_TASK_INVALID_TASK_TYPE",
        `taskType musi być jednym z: ${WEEKLY_TASK_TYPES.join(", ")}, otrzymano ${String(taskType)}`,
      ),
    );
  }

  // ── Walidacja unlock (CipSoft: wymagany level per difficulty) ──────
  const minLevel = WEEKLY_TASK_MIN_LEVEL[difficulty];
  if (level < minLevel) {
    return err(
      validationError(
        "WEEKLY_TASK_LEVEL_TOO_LOW",
        `Trudność '${difficulty}' wymaga level ≥ ${minLevel}, postać ma ${level}`,
      ),
    );
  }

  // ── Obliczenie ──────────────────────────────────────────────────────
  // Bigint dla XP (level 2500 → ~5 mln XP — mieści się w number, ale
  // bigint gwarantuje brak IEEE-754 zaokrągleń przy mnożeniu).
  const baseXp = BigInt(WEEKLY_TASK_XP_PER_LEVEL) * BigInt(level);

  const capNumber = WEEKLY_TASK_XP_CAP[difficulty];
  // BigInt(capNumber) dla bezpieczeństwa; Number.POSITIVE_INFINITY → bignum
  // wybucha, więc traktujemy Infinity osobno (Master = brak limitu).
  let xpAfterCap: bigint;
  let capXp: bigint;
  let wasCapped: boolean;
  if (!Number.isFinite(capNumber)) {
    // Master: bez limitu.
    xpAfterCap = baseXp;
    capXp = baseXp;
    wasCapped = false;
  } else {
    const capBig = BigInt(capNumber);
    capXp = capBig;
    if (baseXp <= capBig) {
      xpAfterCap = baseXp;
      wasCapped = false;
    } else {
      xpAfterCap = capBig;
      wasCapped = true;
    }
  }

  return ok({
    baseXp,
    xpAfterCap,
    capXp,
    wasCapped,
    difficulty,
    taskType,
    level,
  });
}
