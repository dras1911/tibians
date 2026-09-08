/**
 * Testy formatDuration + formatDurationString — task 14.
 *
 * Weryfikacja rozkładu sekund na godziny/minuty/sekundy (arch. §2.4 — Exevo Pan
 * format „5h 46m 22s").
 */
import { describe, expect, it } from "vitest";
import { formatDuration, formatDurationString } from "../../index.js";

// ──────────────────────────────────────────────────────────────────────────
// formatDuration — podstawowe przypadki
// ──────────────────────────────────────────────────────────────────────────

describe("formatDuration — rozkład sekund na h/m/s", () => {
  it("0 sekund → { hours: 0, minutes: 0, seconds: 0 }", () => {
    expect(formatDuration(0)).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  it("1 sekunda → { hours: 0, minutes: 0, seconds: 1 }", () => {
    expect(formatDuration(1)).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 1,
    });
  });

  it("45 sekund → { hours: 0, minutes: 0, seconds: 45 }", () => {
    expect(formatDuration(45)).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 45,
    });
  });

  it("60 sekund → { hours: 0, minutes: 1, seconds: 0 }", () => {
    expect(formatDuration(60)).toEqual({
      hours: 0,
      minutes: 1,
      seconds: 0,
    });
  });

  it("125 sekund → { hours: 0, minutes: 2, seconds: 5 }", () => {
    expect(formatDuration(125)).toEqual({
      hours: 0,
      minutes: 2,
      seconds: 5,
    });
  });

  it("3 600 sekund (= 1h) → { hours: 1, minutes: 0, seconds: 0 }", () => {
    expect(formatDuration(3_600)).toEqual({
      hours: 1,
      minutes: 0,
      seconds: 0,
    });
  });

  it("3 725 sekund (= 1h 2m 5s) → { hours: 1, minutes: 2, seconds: 5 }", () => {
    expect(formatDuration(3_725)).toEqual({
      hours: 1,
      minutes: 2,
      seconds: 5,
    });
  });

  it("86 400 sekund (= 24h) → { hours: 24, minutes: 0, seconds: 0 }", () => {
    expect(formatDuration(86_400)).toEqual({
      hours: 24,
      minutes: 0,
      seconds: 0,
    });
  });

  it("wartość ułamkowa → obcięta (floor, nie round)", () => {
    expect(formatDuration(90.7)).toEqual({
      hours: 0,
      minutes: 1,
      seconds: 30,
    });
  });

  it("bardzo duża wartość → godziny ≥ 24 (nie overflow)", () => {
    const result = formatDuration(604_800); // 7 dni
    expect(result.hours).toBe(168);
    expect(result.minutes).toBe(0);
    expect(result.seconds).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// formatDuration — walidacja
// ──────────────────────────────────────────────────────────────────────────

describe("formatDuration — walidacja inputu", () => {
  it("rzuca RangeError dla ujemnych sekund", () => {
    expect(() => formatDuration(-1)).toThrow(RangeError);
  });

  it("rzuca RangeError dla Infinity", () => {
    expect(() => formatDuration(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("rzuca RangeError dla -Infinity", () => {
    expect(() => formatDuration(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it("rzuca RangeError dla NaN", () => {
    expect(() => formatDuration(Number.NaN)).toThrow(RangeError);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// formatDuration — niezmiennik struktury
// ──────────────────────────────────────────────────────────────────────────

describe("formatDuration — niezmiennik sumy", () => {
  it("hours*3600 + minutes*60 + seconds === floor(totalSeconds)", () => {
    for (const total of [0, 1, 45, 125, 3_725, 86_400, 604_800, 12_345_678]) {
      const { hours, minutes, seconds } = formatDuration(total);
      const reconstructed = hours * 3_600 + minutes * 60 + seconds;
      expect(reconstructed).toBe(Math.floor(total));
    }
  });

  it("minuty i sekundy zawsze w zakresie [0, 59]", () => {
    for (const total of [0, 59, 60, 61, 119, 120, 3_599, 3_600, 7_199]) {
      const { minutes, seconds } = formatDuration(total);
      expect(minutes).toBeGreaterThanOrEqual(0);
      expect(minutes).toBeLessThanOrEqual(59);
      expect(seconds).toBeGreaterThanOrEqual(0);
      expect(seconds).toBeLessThanOrEqual(59);
    }
  });

  it("godziny zawsze ≥ 0", () => {
    for (const total of [0, 1, 3_600, 86_400]) {
      const { hours } = formatDuration(total);
      expect(hours).toBeGreaterThanOrEqual(0);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// formatDurationString — tekst (do testów/logów)
// ──────────────────────────────────────────────────────────────────────────

describe("formatDurationString — tekst w stylu TibiaPal", () => {
  it("tylko sekundy → 'Ns'", () => {
    expect(
      formatDurationString({ hours: 0, minutes: 0, seconds: 45 }),
    ).toBe("45s");
  });

  it("minuty i sekundy → 'Nm Ms'", () => {
    expect(
      formatDurationString({ hours: 0, minutes: 2, seconds: 5 }),
    ).toBe("2m 5s");
  });

  it("godziny, minuty, sekundy → 'Nh Mm Ss'", () => {
    expect(
      formatDurationString({ hours: 5, minutes: 46, seconds: 22 }),
    ).toBe("5h 46m 22s");
  });

  it("zero → '0s'", () => {
    expect(
      formatDurationString({ hours: 0, minutes: 0, seconds: 0 }),
    ).toBe("0s");
  });

  it("godziny bez minut/sekund → 'Nh 0m 0s'", () => {
    expect(
      formatDurationString({ hours: 24, minutes: 0, seconds: 0 }),
    ).toBe("24h 0m 0s");
  });
});
