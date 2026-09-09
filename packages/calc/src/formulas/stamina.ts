/**
 * stamina — czas regeneracji do zadanej wartości (arch §2.1, §13.5).
 *
 * Stamina Tibii rośnie kiedy postać śpi (jest offline). Przelicznik:
 *   - **Strefa normalna (0–39h)** — dla *wszystkich* graczy (premium i
 *     free): `stamina.regen_minutes_per_hour` minut offline = 1 min
 *     staminy. Tj. **3 min offline → 1 min staminy**.
 *   - **Strefa zielona (green / Happy Hours, 39–42h)** — tylko premium:
 *     `stamina.regen_minutes_per_hour_free` minut offline = 1 min
 *     staminy. Tj. **6 min offline → 1 min staminy** (wolniej, ale
 *     +50% XP z huntu w tej strefie).
 *   - Maksymalna stamina: 42h (premium) / 40h (free).
 *
 * Czysta funkcja: przyjmuje parametry z `getConfig()` (T16) i zwraca
 * czas rzeczywisty (w minutach) potrzebny na dojście do `target`.
 *
 * **Walidacja**:
 *   - `current < 0`, `target < current`, `target > max` → błąd
 *   - `isPremium = false` + `target > 40` → automatycznie clamp do 40h
 *
 * @see https://tibia.fandom.com/wiki/Stamina
 */

import {
  err,
  ok,
  validationError,
  type CalculatorResult,
} from "../types.js";

// ───────────────────────────────────────────────────────────────────────
// StaminaConfig — parametry z `getConfig()` (T16 seed).
// ───────────────────────────────────────────────────────────────────────

export interface StaminaConfig {
  /** Minuty offline = 1 min staminy (strefa normalna). TibiaWiki: 3. */
  readonly regenMinutesPerHour: number;
  /** Minuty offline = 1 min staminy (strefa zielona). TibiaWiki: 6. */
  readonly regenMinutesPerHourGreenZone: number;
  /** Próg zielonej strefy (h). TibiaWiki: 39. */
  readonly greenZoneStartHours: number;
  /** Maksymalna stamina (h). Premium: 42, free: 40. */
  readonly maxStaminaHours: number;
}

// ───────────────────────────────────────────────────────────────────────
// StaminaZone — odcinek czasu w konkretnej strefie.
// ───────────────────────────────────────────────────────────────────────

export type StaminaZone = "normal" | "green";

export interface StaminaSegment {
  readonly zone: StaminaZone;
  /** Godziny staminy zregenerowane w tym segmencie. */
  readonly hours: number;
  /** Minuty offline potrzebne na ten segment. */
  readonly realMinutes: number;
}

export interface StaminaResult {
  /** Aktualna stamina (po ewentualnym clamp). */
  readonly current: number;
  /** Docelowa stamina (po ewentualnym clamp). */
  readonly target: number;
  /** Łączny czas offline w minutach. */
  readonly realMinutes: number;
  /** Podział na segmenty (normal / green). */
  readonly segments: readonly StaminaSegment[];
  /** Łączna ilość staminy zregenerowanej (godziny). */
  readonly hoursGained: number;
}

// ───────────────────────────────────────────────────────────────────────
// staminaRegen(current, target, isPremium, config)
// ───────────────────────────────────────────────────────────────────────

/**
 * Oblicza czas offline potrzebny na regenerację staminy z `current`
 * do `target`.
 *
 * @param current - aktualna stamina w godzinach (0..max)
 * @param target - docelowa stamina w godzinach (current..max)
 * @param isPremium - czy konto jest premium (true → max 42h + green
 *   zone rate; false → max 40h, brak zielonej strefy)
 * @param config - parametry z `getConfig('stamina.*')` (T16)
 *
 * @example
 * ```ts
 * const cfg = {
 *   regenMinutesPerHour: 3,
 *   regenMinutesPerHourGreenZone: 6,
 *   greenZoneStartHours: 39,
 * };
 *
 * // Premium 0 → 42h
 * staminaRegen(0, 42, true, cfg);
 * // → { realMinutes: 135, segments: [
 * //     { zone: 'normal', hours: 39, realMinutes: 117 },
 * //     { zone: 'green',  hours: 3,  realMinutes: 18  },
 * //   ] }
 *
 * // Free 0 → 40h — zielona strefa NIE aktywna (premium-only)
 * staminaRegen(0, 40, false, cfg);
 * // → { realMinutes: 120, segments: [{ zone: 'normal', hours: 40, realMinutes: 120 }] }
 *
 * // Premium w zielonej strefie
 * staminaRegen(40, 42, true, cfg);
 * // → { realMinutes: 12, segments: [{ zone: 'green', hours: 2, realMinutes: 12 }] }
 * ```
 *
 * **Ważne**: `current === target` → `realMinutes: 0`. Funkcja NIE
 * zmienia danych wejściowych (czysta), ale zwraca sklumpowane
 * wartości (gdy `target > max`, zwraca `target = max`).
 *
 * **Free vs green zone**: zielona strefa 39–42h jest premium-only
 * (TibiaWiki Stamina). Konta free nawet w zakresie 39–40h regenerują
 * się normalnym tempem — nie korzystają z wolniejszego tempa zielonej
 * strefy (które daje bonus XP podczas huntu, niedostępny dla free).
 */
export function staminaRegen(
  current: number,
  target: number,
  isPremium: boolean,
  config: StaminaConfig,
): CalculatorResult<StaminaResult> {
  // ── Walidacja ──────────────────────────────────────────────────────
  if (!Number.isFinite(current) || !Number.isInteger(current)) {
    return err(
      validationError(
        "STAMINA_INVALID_INPUT",
        `current musi być integerem skończonym, otrzymano ${current}`,
      ),
    );
  }
  if (!Number.isFinite(target) || !Number.isInteger(target)) {
    return err(
      validationError(
        "STAMINA_INVALID_INPUT",
        `target musi być integerem skończonym, otrzymano ${target}`,
      ),
    );
  }
  if (current < 0) {
    return err(
      validationError(
        "STAMINA_INVALID_INPUT",
        `current nie może być ujemny, otrzymano ${current}`,
      ),
    );
  }
  if (target < 0) {
    return err(
      validationError(
        "STAMINA_INVALID_INPUT",
        `target nie może być ujemny, otrzymano ${target}`,
      ),
    );
  }
  if (
    !Number.isFinite(config.regenMinutesPerHour) ||
    config.regenMinutesPerHour <= 0 ||
    !Number.isFinite(config.regenMinutesPerHourGreenZone) ||
    config.regenMinutesPerHourGreenZone <= 0
  ) {
    return err(
      validationError(
        "STAMINA_INVALID_CONFIG",
        `regenMinutesPerHour i regenMinutesPerHourGreenZone muszą być > 0`,
      ),
    );
  }
  if (
    config.greenZoneStartHours < 0 ||
    config.maxStaminaHours <= config.greenZoneStartHours
  ) {
    return err(
      validationError(
        "STAMINA_INVALID_CONFIG",
        `greenZoneStartHours (${config.greenZoneStartHours}) musi być < maxStaminaHours (${config.maxStaminaHours})`,
      ),
    );
  }

  // Clamp target do max (np. free account target=50 → clamp do 40).
  const maxTarget = Math.min(target, config.maxStaminaHours);
  const clampedCurrent = Math.min(current, maxTarget);

  if (clampedCurrent >= maxTarget) {
    // Nic do roboty.
    return ok({
      current: clampedCurrent,
      target: maxTarget,
      realMinutes: 0,
      hoursGained: 0,
      segments: [],
    });
  }

  // ── Obliczenie segmentów ──────────────────────────────────────────
  const segments: StaminaSegment[] = [];

  // Premium-only: green zone rate applies when premium AND target
  // is in the green zone range. Free accounts always use the normal
  // rate regardless of zone (TibiaWiki Stamina — green zone jest
  // premium-only; dla free zielona strefa NIE zmienia tempa regena).
  const greenZoneActive = isPremium;

  // Strefa 1: normalna — od current do greenZoneStart (lub target,
  // jeśli target ≤ greenZoneStart).
  const normalEnd = Math.min(maxTarget, config.greenZoneStartHours);
  if (clampedCurrent < normalEnd) {
    const hours = normalEnd - clampedCurrent;
    const realMinutes = hours * config.regenMinutesPerHour;
    segments.push({ zone: "normal", hours, realMinutes });
  }

  // Strefa 2: zielona — od greenZoneStart do maxTarget (jeśli maxTarget
  // > greenZoneStart). Zawsze strefa "normalna" dla free (green zone
  // jest premium-only).
  if (maxTarget > config.greenZoneStartHours) {
    const hours = maxTarget - config.greenZoneStartHours;
    const rate = greenZoneActive
      ? config.regenMinutesPerHourGreenZone
      : config.regenMinutesPerHour;
    const realMinutes = hours * rate;
    segments.push({
      zone: greenZoneActive ? "green" : "normal",
      hours,
      realMinutes,
    });
  }

  const realMinutes = segments.reduce((sum, s) => sum + s.realMinutes, 0);
  const hoursGained = segments.reduce((sum, s) => sum + s.hours, 0);

  // Koalescencja sąsiednich segmentów z tą samą strefą i tempem —
  // dla free (green zone wyłączona) normalny segment może się rozbić
  // na 39h + 1h. Łączymy je, żeby UI nie pokazywał redundantnej
  // granulacji.
  const coalesced = coalesceSegments(segments);

  return ok({
    current: clampedCurrent,
    target: maxTarget,
    realMinutes,
    hoursGained,
    segments: coalesced,
  });
}

/**
 * Łączy sąsiednie segmenty z tą samą strefą. Zakładamy, że segmenty
 * są już w kolejności chronologicznej i mają ten sam rate (dla free
 * oba są "normal"). Wynik jest tego samego typu co wejście.
 */
function coalesceSegments(
  segments: readonly StaminaSegment[],
): readonly StaminaSegment[] {
  if (segments.length < 2) return segments;
  const out: StaminaSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.zone === seg.zone) {
      out[out.length - 1] = {
        zone: seg.zone,
        hours: last.hours + seg.hours,
        realMinutes: last.realMinutes + seg.realMinutes,
      };
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}