/**
 * time-format — konwersja sekund na godziny/minuty/sekundy.
 *
 * Używane przez kalkulatory prezentujące czas treningu, regeneracji
 * staminy, countdown aukcji (arch. §2.4 — Exevo Pan format „5h 46m").
 *
 * **Czysta funkcja**: deterministyczna, brak I/O, brak locale.
 * Formatowanie i18n (ICU plurals PL) jest w warstwie UI, nie tutaj.
 *
 * Uwaga: funkcja **nie** używa `Date` — operuje na liczbie sekund
 * (liczba całkowita lub ułamkowa). Dla aukcji Tibia różnica między
 * `Date.now()` a startem aukcji liczona w sekundach (bigint lub number).
 */

// ──────────────────────────────────────────────────────────────────────────
// DurationParts — wyjście formatDuration
// ──────────────────────────────────────────────────────────────────────────

/**
 * Rozłożony czas na części:
 *   - `hours`   — pełne godziny (0..∞)
 *   - `minutes` — pełne minuty (0..59)
 *   - `seconds` — pełne sekundy (0..59)
 *
 * Suma `hours*3600 + minutes*60 + seconds === floor(totalSeconds)`.
 * Części ułamkowe (np. 90.7s) są obcinane (→ 90s).
 *
 * Wszystkie pola są `readonly number` — struktury immutable (spójnie
 * z resztą `@tibians/calc`).
 */
export interface DurationParts {
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Stałe konwersji
// ──────────────────────────────────────────────────────────────────────────

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;

// ──────────────────────────────────────────────────────────────────────────
// formatDuration(totalSeconds) → DurationParts
// ──────────────────────────────────────────────────────────────────────────

/**
 * Rozkłada liczbę sekund na godziny/minuty/sekundy.
 *
 * @param totalSeconds - nieujemna liczba sekund (integer lub float)
 * @returns DurationParts z godzinami, minutami, sekundami (wszystkie ≥ 0)
 * @throws RangeError gdy `totalSeconds` jest ujemne, NaN lub Infinity
 *
 * @example
 * ```ts
 * formatDuration(0);        // → { hours: 0, minutes: 0, seconds: 0 }
 * formatDuration(45);       // → { hours: 0, minutes: 0, seconds: 45 }
 * formatDuration(125);      // → { hours: 0, minutes: 2, seconds: 5 }
 * formatDuration(3_725);    // → { hours: 1, minutes: 2, seconds: 5 }
 * formatDuration(86_400);   // → { hours: 24, minutes: 0, seconds: 0 }
 * formatDuration(90.7);     // → { hours: 0, minutes: 1, seconds: 30 } (floor)
 * ```
 *
 * **Edge case**: wartości ułamkowe (np. `90.7`) są **obcinane** do `90`,
 * nie zaokrąglane. To spójne z Tibią, gdzie czas wyrażamy w pełnych
 * sekundach w UI.
 */
export function formatDuration(totalSeconds: number): DurationParts {
  if (!Number.isFinite(totalSeconds)) {
    throw new RangeError(
      `[@tibians/calc] formatDuration: totalSeconds musi być liczbą skończoną, ` +
        `otrzymano ${totalSeconds}`,
    );
  }
  if (totalSeconds < 0) {
    throw new RangeError(
      `[@tibians/calc] formatDuration: totalSeconds nie może być ujemne, ` +
        `otrzymano ${totalSeconds}`,
    );
  }

  // Math.floor obcina część ułamkową (nie zaokrągla).
  const total = Math.floor(totalSeconds);
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = total % SECONDS_PER_MINUTE;

  return { hours, minutes, seconds };
}

// ──────────────────────────────────────────────────────────────────────────
// Helper do formatowania tekstowego (en locale, dla testów/CLI)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Formatuje DurationParts do krótkiego tekstu w stylu TibiaPal
 * (np. „5h 46m 22s", „1h 0m 5s"). Pomocne przy testach + logach.
 *
 * Zero-padding **nie** jest stosowany (czytelniejsze dla krótkich czasów);
 * UI może sam dodać padding jeśli potrzebuje `tabular-nums`.
 *
 * @example
 * ```ts
 * formatDurationString({ hours: 5, minutes: 46, seconds: 22 });
 * // → "5h 46m 22s"
 * formatDurationString({ hours: 0, minutes: 0, seconds: 0 });
 * // → "0s"
 * ```
 */
export function formatDurationString(parts: DurationParts): string {
  const { hours, minutes, seconds } = parts;
  if (hours === 0 && minutes === 0) return `${seconds}s`;
  if (hours === 0) return `${minutes}m ${seconds}s`;
  return `${hours}h ${minutes}m ${seconds}s`;
}
