/**
 * Testy stamina — task 18, ground truth TibiaWiki Stamina.
 *
 * **Ground truth**:
 *   - TibiaWiki Stamina: 3 min offline = 1 min staminy (normal 0-39h).
 *   - Green zone 39-42h: 6 min offline = 1 min staminy (premium only).
 *   - Max: 42h (premium) / 40h (free).
 *
 * **Strategia testów**:
 *   - Real minutes math (premium 0→42, free 0→40, mid-zone split).
 *   - Edge: already full / already in green zone / target > max (clamp).
 *   - Walidacja (negative, non-integer, invalid config).
 *   - Deterministyczność.
 */
import { describe, expect, it } from "vitest";
import { staminaRegen, type StaminaConfig } from "../stamina.js";

// ───────────────────────────────────────────────────────────────────────
// Standardowa konfiguracja (T16 seed)
// ───────────────────────────────────────────────────────────────────────

const STD_CONFIG: StaminaConfig = {
  regenMinutesPerHour: 3,
  regenMinutesPerHourGreenZone: 6,
  greenZoneStartHours: 39,
  maxStaminaHours: 42,
};

const FREE_CONFIG: StaminaConfig = {
  ...STD_CONFIG,
  maxStaminaHours: 40,
};

// ───────────────────────────────────────────────────────────────────────
// Premium — pełne 0 → 42h (acceptance criteria T18)
// ───────────────────────────────────────────────────────────────────────

describe("staminaRegen — premium", () => {
  it("0 → 42h premium: 117 + 18 = 135 minut offline (2h 15m)", () => {
    const r = staminaRegen(0, 42, true, STD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.realMinutes).toBe(135);
    expect(r.value.segments).toEqual([
      { zone: "normal", hours: 39, realMinutes: 117 },
      { zone: "green", hours: 3, realMinutes: 18 },
    ]);
  });

  it("0 → 39h premium: 117 minut offline (tylko strefa normalna)", () => {
    const r = staminaRegen(0, 39, true, STD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.realMinutes).toBe(117);
    expect(r.value.segments).toHaveLength(1);
    expect(r.value.segments[0]?.zone).toBe("normal");
  });

  it("39 → 42h premium: 18 minut offline (tylko strefa zielona)", () => {
    const r = staminaRegen(39, 42, true, STD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.realMinutes).toBe(18);
    expect(r.value.segments).toEqual([
      { zone: "green", hours: 3, realMinutes: 18 },
    ]);
  });

  it("36 → 42h premium (acceptance criteria): 9 normal + 18 green = 27 min", () => {
    // Task 18 acceptance: "Stamina: 36h, 42h, pełna, premium/free → poprawne czasy"
    const r = staminaRegen(36, 42, true, STD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.realMinutes).toBe(27); // 3 × 3 (normal) + 3 × 6 (green)
    expect(r.value.segments).toEqual([
      { zone: "normal", hours: 3, realMinutes: 9 },
      { zone: "green", hours: 3, realMinutes: 18 },
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Free — max 40h (acceptance criteria T18)
// ───────────────────────────────────────────────────────────────────────

describe("staminaRegen — free", () => {
  it("0 → 40h free: 120 minut offline (cały czas w strefie normalnej)", () => {
    const r = staminaRegen(0, 40, false, FREE_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.realMinutes).toBe(120);
    expect(r.value.segments).toEqual([
      { zone: "normal", hours: 40, realMinutes: 120 },
    ]);
  });

  it("36 → 40h free: 12 minut offline (4h × 3 min/h)", () => {
    const r = staminaRegen(36, 40, false, FREE_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.realMinutes).toBe(12);
  });

  it("free z target=50 → clamp do 40h", () => {
    const r = staminaRegen(0, 50, false, FREE_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.target).toBe(40);
    expect(r.value.realMinutes).toBe(120);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Edge cases
// ───────────────────────────────────────────────────────────────────────

describe("staminaRegen — edge cases", () => {
  it("current === target → realMinutes: 0, segments: []", () => {
    const r = staminaRegen(20, 20, true, STD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.realMinutes).toBe(0);
    expect(r.value.segments).toEqual([]);
  });

  it("current > target → realMinutes: 0 (już za celem)", () => {
    const r = staminaRegen(42, 39, true, STD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.realMinutes).toBe(0);
  });

  it("current === max → brak regeneracji", () => {
    const r = staminaRegen(42, 42, true, STD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.realMinutes).toBe(0);
  });

  it("current > max → clamp do max", () => {
    const r = staminaRegen(50, 50, false, FREE_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.current).toBe(40);
    expect(r.value.realMinutes).toBe(0);
  });

  it("current = 0 → pełna regeneracja", () => {
    const r = staminaRegen(0, 42, true, STD_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.hoursGained).toBe(42);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Walidacja
// ───────────────────────────────────────────────────────────────────────

describe("staminaRegen — walidacja", () => {
  it("current ujemny → błąd", () => {
    const r = staminaRegen(-1, 42, true, STD_CONFIG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("STAMINA_INVALID_INPUT");
    }
  });

  it("target ujemny → błąd", () => {
    const r = staminaRegen(0, -1, true, STD_CONFIG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("STAMINA_INVALID_INPUT");
    }
  });

  it("current nie-integer → błąd", () => {
    const r = staminaRegen(0.5, 42, true, STD_CONFIG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("STAMINA_INVALID_INPUT");
    }
  });

  it("regenMinutesPerHour = 0 → błąd konfiguracji", () => {
    const r = staminaRegen(0, 42, true, {
      ...STD_CONFIG,
      regenMinutesPerHour: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("STAMINA_INVALID_CONFIG");
    }
  });

  it("greenZoneStartHours >= maxStaminaHours → błąd konfiguracji", () => {
    const r = staminaRegen(0, 42, true, {
      ...STD_CONFIG,
      greenZoneStartHours: 42,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("STAMINA_INVALID_CONFIG");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// Deterministyczność
// ───────────────────────────────────────────────────────────────────────

describe("staminaRegen — determinizm", () => {
  it("ten sam input → ten sam output", () => {
    const r1 = staminaRegen(20, 42, true, STD_CONFIG);
    const r2 = staminaRegen(20, 42, true, STD_CONFIG);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value.realMinutes).toBe(r2.value.realMinutes);
  });

  it("komutatywność current↔target? NIE — kolejność ma znaczenie (current→target)", () => {
    const r1 = staminaRegen(20, 42, true, STD_CONFIG);
    const r2 = staminaRegen(42, 20, true, STD_CONFIG);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value.realMinutes).toBeGreaterThan(0);
    expect(r2.value.realMinutes).toBe(0);
  });
});