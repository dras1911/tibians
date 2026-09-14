/**
 * Testy pętli kalibracji (task 57 — arch §8.4 + §10 R3).
 *
 * Pokrycie (12 testów):
 *   1.  Mock DB z 10 próbkami → poprawna agregacja (avg/median/MAPE)
 *   2.  Edge: brak zakończonych aukcji (totalSamples=0, perVocation={…0…})
 *   3.  Edge: final_price=0 → pominięte w errorPct
 *   4.  Edge: ujemne errorPct (estimated < final — undervaluation OK)
 *   5.  MAPE calculation — verify formuły
 *   6.  Median — nieparzysta liczba (środkowy element)
 *   7.  Median — parzysta liczba (średnia z dwóch środkowych)
 *   8.  Per-vocation grouping — 5 grup + count/avg/MAPE
 *   9.  Worst cases — sortowanie malejąco + top N
 *   10. recordCalibrationRun wywoływane RAZ z pełnym raportem
 *   11. Okno kalibracji (windowHours) przekazywane do DB
 *   12. computeErrorPct — edge finalPrice<=0 → 0 (defensive)
 *
 * Filozofia: pełny determinizm (mock DB z `vi.fn()`, seeded samples).
 */

import { describe, expect, it } from "vitest";

import {
  computeErrorPct,
  DEFAULT_CALIBRATION_WINDOW_HOURS,
  DEFAULT_WORST_CASES_LIMIT,
  mean,
  median,
  runCalibration,
  type CalibrationDb,
  type CalibrationSample,
} from "./calibration.js";

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/** Buduje `CalibrationSample` z wartości TC. */
function makeSample(opts: {
  id: bigint;
  estimated: bigint | number;
  final: bigint | number;
  vocation?: CalibrationSample["vocation"];
}): CalibrationSample {
  return {
    auctionId: opts.id,
    estimatedValue: BigInt(opts.estimated),
    finalPrice: BigInt(opts.final),
    vocation: opts.vocation ?? "Knight",
  };
}

/** Tworzy mock `CalibrationDb` z możliwością ustawienia zwracanych próbek. */
function makeMockDb(samples: readonly CalibrationSample[]): CalibrationDb & {
  fetchCalls: Array<{ windowHours: number }>;
  recordCalls: Array<{ report: unknown; generatedAt: string }>;
} {
  const fetchCalls: Array<{ windowHours: number }> = [];
  const recordCalls: Array<{ report: unknown; generatedAt: string }> = [];

  return {
    fetchCalls,
    recordCalls,
    async fetchCalibrationSamples({ windowHours }) {
      fetchCalls.push({ windowHours });
      return samples;
    },
    async recordCalibrationRun({ report, generatedAt }) {
      recordCalls.push({ report, generatedAt });
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Testy
// ──────────────────────────────────────────────────────────────────────────

describe("runCalibration — happy path", () => {
  it("10 próbek → poprawna agregacja (avg/median/MAPE) + worstCases + persist", async () => {
    // 10 próbek — 2× per vocation (Knight, Paladin, Druid, Sorcerer, Monk).
    // Łatwe do weryfikacji "z ręki":
    //   Knight #1: est=100, final=100 → 0%
    //   Knight #2: est=120, final=100 → +20%
    //   Paladin #3: est=80,  final=100 → -20%
    //   Paladin #4: est=100, final=100 → 0%
    //   Druid #5:  est=150, final=100 → +50%
    //   Druid #6:  est=70,  final=100 → -30%
    //   Sorc #7:   est=110, final=100 → +10%
    //   Sorc #8:   est=90,  final=100 → -10%
    //   Monk #9:   est=200, final=100 → +100%
    //   Monk #10:  est=50,  final=100 → -50%
    const samples: CalibrationSample[] = [
      makeSample({ id: 1n, estimated: 100, final: 100, vocation: "Knight" }),
      makeSample({ id: 2n, estimated: 120, final: 100, vocation: "Knight" }),
      makeSample({ id: 3n, estimated: 80, final: 100, vocation: "Paladin" }),
      makeSample({ id: 4n, estimated: 100, final: 100, vocation: "Paladin" }),
      makeSample({ id: 5n, estimated: 150, final: 100, vocation: "Druid" }),
      makeSample({ id: 6n, estimated: 70, final: 100, vocation: "Druid" }),
      makeSample({ id: 7n, estimated: 110, final: 100, vocation: "Sorcerer" }),
      makeSample({ id: 8n, estimated: 90, final: 100, vocation: "Sorcerer" }),
      makeSample({ id: 9n, estimated: 200, final: 100, vocation: "Monk" }),
      makeSample({ id: 10n, estimated: 50, final: 100, vocation: "Monk" }),
    ];
    const db = makeMockDb(samples);

    const report = await runCalibration(db);

    // Total
    expect(report.totalSamples).toBe(10);
    // avg = (0 + 20 + -20 + 0 + 50 + -30 + 10 + -10 + 100 + -50) / 10 = 7.0
    expect(report.avgErrorPct).toBeCloseTo(7.0, 5);
    // Median: posortowane [-50, -30, -20, -10, 0, 0, 10, 20, 50, 100]
    //   parzyste → średnia z 5. i 6. = (0 + 0) / 2 = 0
    expect(report.medianErrorPct).toBeCloseTo(0, 5);
    // MAPE = (0 + 20 + 20 + 0 + 50 + 30 + 10 + 10 + 100 + 50) / 10 = 29.0
    expect(report.mape).toBeCloseTo(29.0, 5);

    // Per vocation — sprawdźmy jedną grupę (Knight: 0%, +20%).
    const knight = report.perVocation.Knight;
    expect(knight.count).toBe(2);
    expect(knight.avgErrorPct).toBeCloseTo(10.0, 5); // (0+20)/2
    expect(knight.mape).toBeCloseTo(10.0, 5); // (0+20)/2
    expect(knight.medianAbsErrorPct).toBeCloseTo(10.0, 5); // median([0,20])=10

    // Worst cases: top 10 z |err| desc + tie-break auctionId ASC.
    // Monk#9 (+100) → Druid#5 (+50) → Monk#10 (-50) → Druid#6 (-30) →
    // Knight#2 (+20) → Paladin#3 (-20) → Sorcerer#7 (+10) → Sorcerer#8 (-10) →
    // Knight#1 (0) → Paladin#4 (0).
    // Tie-break na |err|=50: id=5 (Druid) < id=10 (Monk) → Druid pierwszy.
    expect(report.worstCases).toHaveLength(10);
    expect(report.worstCases[0]?.errorPct).toBe(100);
    expect(report.worstCases[0]?.auctionId).toBe(9n);
    expect(report.worstCases[1]?.errorPct).toBe(50); // Druid#5 (id=5 < 10)
    expect(report.worstCases[1]?.auctionId).toBe(5n);
    expect(report.worstCases[2]?.errorPct).toBe(-50); // Monk#10
    expect(report.worstCases[2]?.auctionId).toBe(10n);
    // Tie-break: auctionId ASC dla |errorPct|=20 → id=2 (Knight) przed id=3 (Paladin).
    const tied20 = report.worstCases.filter((r) => Math.abs(r.errorPct) === 20);
    expect(tied20).toHaveLength(2);
    expect(tied20[0]?.auctionId).toBeLessThan(tied20[1]!.auctionId);

    // Persistence — RAZ z pełnym raportem.
    expect(db.recordCalls).toHaveLength(1);
    expect(db.recordCalls[0]?.report).toEqual(report);
    expect(typeof db.recordCalls[0]?.generatedAt).toBe("string");
    expect(db.recordCalls[0]?.generatedAt).toBe(report.generatedAt);
  });

  it("fetchCalibrationSamples wywoływane z default windowHours=168 (7 dni)", async () => {
    const db = makeMockDb([]);
    await runCalibration(db);
    expect(db.fetchCalls).toEqual([
      { windowHours: DEFAULT_CALIBRATION_WINDOW_HOURS },
    ]);
    expect(DEFAULT_CALIBRATION_WINDOW_HOURS).toBe(168);
  });

  it("options.windowHours nadpisuje default", async () => {
    const db = makeMockDb([]);
    await runCalibration(db, { windowHours: 24 });
    expect(db.fetchCalls).toEqual([{ windowHours: 24 }]);
    expect(db.recordCalls[0]?.report).toMatchObject({ windowHours: 24 });
  });

  it("options.worstCasesLimit ogranicza listę", async () => {
    const samples: CalibrationSample[] = Array.from({ length: 20 }, (_, i) =>
      makeSample({
        id: BigInt(i + 1),
        estimated: 100 + i,
        final: 100,
        vocation: "Knight",
      }),
    );
    const db = makeMockDb(samples);
    const report = await runCalibration(db, { worstCasesLimit: 3 });
    expect(report.totalSamples).toBe(20); // wszystkie próbki zliczone
    expect(report.worstCases).toHaveLength(3);
  });
});

describe("runCalibration — edge cases", () => {
  it("brak zakończonych aukcji → totalSamples=0, wszystkie statystyki = 0", async () => {
    const db = makeMockDb([]);
    const report = await runCalibration(db);

    expect(report.totalSamples).toBe(0);
    expect(report.avgErrorPct).toBe(0);
    expect(report.medianErrorPct).toBe(0);
    expect(report.mape).toBe(0);
    expect(report.worstCases).toEqual([]);

    // perVocation: wszystkie 5 kluczy obecne z zerami.
    const expectedVocations = ["Knight", "Paladin", "Druid", "Sorcerer", "Monk"];
    for (const v of expectedVocations) {
      const stat = report.perVocation[v as keyof typeof report.perVocation];
      expect(stat).toBeDefined();
      expect(stat.count).toBe(0);
      expect(stat.avgErrorPct).toBe(0);
      expect(stat.mape).toBe(0);
      expect(stat.medianAbsErrorPct).toBe(0);
    }

    // Persistence wywoływane mimo to (z pustym raportem).
    expect(db.recordCalls).toHaveLength(1);
  });

  it("final_price=0 → pominięte w errorPct (nie wliczane do agregacji)", async () => {
    const samples: CalibrationSample[] = [
      makeSample({ id: 1n, estimated: 100, final: 100, vocation: "Knight" }),
      makeSample({ id: 2n, estimated: 100, final: 0, vocation: "Knight" }), // skip
      makeSample({ id: 3n, estimated: 100, final: 50, vocation: "Knight" }),
    ];
    const db = makeMockDb(samples);
    const report = await runCalibration(db);

    expect(report.totalSamples).toBe(2); // id=2 odfiltrowane
    // Knight: errors = [0, +100] → avg=50, mape=50.
    expect(report.perVocation.Knight.count).toBe(2);
    expect(report.perVocation.Knight.avgErrorPct).toBeCloseTo(50, 5);
    expect(report.perVocation.Knight.mape).toBeCloseTo(50, 5);
  });

  it("ujemne errorPct (estimated < final) — undervaluation OK", async () => {
    const samples: CalibrationSample[] = [
      makeSample({ id: 1n, estimated: 50, final: 100, vocation: "Paladin" }),
    ];
    const db = makeMockDb(samples);
    const report = await runCalibration(db);

    expect(report.avgErrorPct).toBeCloseTo(-50, 5);
    expect(report.mape).toBeCloseTo(50, 5); // MAPE to |error|
    expect(report.worstCases[0]?.errorPct).toBeCloseTo(-50, 5);
    // Per-vocation też odzwierciedla znak.
    expect(report.perVocation.Paladin.avgErrorPct).toBeCloseTo(-50, 5);
    expect(report.perVocation.Paladin.mape).toBeCloseTo(50, 5);
  });
});

describe("calibration helpers — math sanity", () => {
  it("computeErrorPct: (est=120, final=100) = +20%", () => {
    expect(computeErrorPct(120n, 100n)).toBeCloseTo(20.0, 5);
  });

  it("computeErrorPct: (est=80, final=100) = -20%", () => {
    expect(computeErrorPct(80n, 100n)).toBeCloseTo(-20.0, 5);
  });

  it("computeErrorPct: defensive — finalPrice=0 → 0 (nie dzielimy)", () => {
    expect(computeErrorPct(100n, 0n)).toBe(0);
  });

  it("mean: średnia z [], [1], [1,2,3,4]", () => {
    expect(mean([])).toBe(0);
    expect(mean([42])).toBe(42);
    expect(mean([1, 2, 3, 4])).toBeCloseTo(2.5, 5);
  });

  it("median: nieparzysta liczba → środkowy element po sort", () => {
    expect(median([3, 1, 2])).toBe(2); // [1,2,3] → mid=1 → 2
    expect(median([5, 1, 3])).toBe(3); // [1,3,5] → mid=1 → 3
    expect(median([])).toBe(0);
    expect(median([42])).toBe(42);
  });

  it("median: parzysta liczba → średnia z dwóch środkowych", () => {
    expect(median([1, 2, 3, 4])).toBeCloseTo(2.5, 5); // mid=2 → (2+3)/2
    expect(median([10, 20, 30, 40])).toBeCloseTo(25, 5); // (20+30)/2
  });

  it("median: stabilna dla unsorted input", () => {
    expect(median([4, 2, 1, 3])).toBeCloseTo(2.5, 5); // sort → [1,2,3,4]
  });
});

describe("runCalibration — aggregation details", () => {
  it("MAPE calculation — verify formuły (średnia z |error|)", async () => {
    const samples: CalibrationSample[] = [
      makeSample({ id: 1n, estimated: 110, final: 100, vocation: "Sorcerer" }), // +10
      makeSample({ id: 2n, estimated: 90, final: 100, vocation: "Sorcerer" }), // -10
      makeSample({ id: 3n, estimated: 130, final: 100, vocation: "Sorcerer" }), // +30
    ];
    const db = makeMockDb(samples);
    const report = await runCalibration(db);
    // errors: [+10, -10, +30] → avg=10, |.|=[10,10,30] → MAPE=50/3≈16.67
    expect(report.avgErrorPct).toBeCloseTo(10, 5);
    expect(report.mape).toBeCloseTo(50 / 3, 5);
  });

  it("Per-vocation grouping — 5 grup + poprawne count", async () => {
    const samples: CalibrationSample[] = [
      // 3× Knight, 2× Paladin, 1× Druid, 0× Sorcerer, 1× Monk.
      makeSample({ id: 1n, estimated: 100, final: 100, vocation: "Knight" }),
      makeSample({ id: 2n, estimated: 100, final: 100, vocation: "Knight" }),
      makeSample({ id: 3n, estimated: 100, final: 100, vocation: "Knight" }),
      makeSample({ id: 4n, estimated: 100, final: 100, vocation: "Paladin" }),
      makeSample({ id: 5n, estimated: 100, final: 100, vocation: "Paladin" }),
      makeSample({ id: 6n, estimated: 100, final: 100, vocation: "Druid" }),
      makeSample({ id: 7n, estimated: 100, final: 100, vocation: "Monk" }),
    ];
    const db = makeMockDb(samples);
    const report = await runCalibration(db);

    expect(report.perVocation.Knight.count).toBe(3);
    expect(report.perVocation.Paladin.count).toBe(2);
    expect(report.perVocation.Druid.count).toBe(1);
    expect(report.perVocation.Sorcerer.count).toBe(0);
    expect(report.perVocation.Monk.count).toBe(1);
    expect(report.totalSamples).toBe(7);
  });

  it("Worst cases — sortowanie malejąco po |errorPct|, limit=top 10 z 12", async () => {
    // 12 próbek z |error| rosnąco: 0, 5, 10, ..., 55.
    const samples: CalibrationSample[] = Array.from({ length: 12 }, (_, i) =>
      makeSample({
        id: BigInt(i + 1),
        // i=0: err=0 (est=100, final=100), i=1: err=+5, ..., i=11: err=+55.
        estimated: 100 + i * 5,
        final: 100,
        vocation: "Knight",
      }),
    );
    const db = makeMockDb(samples);
    const report = await runCalibration(db);

    expect(report.totalSamples).toBe(12);
    expect(report.worstCases).toHaveLength(DEFAULT_WORST_CASES_LIMIT);
    expect(DEFAULT_WORST_CASES_LIMIT).toBe(10);

    // Worst = id=12 (err=+55), id=11 (+50), id=10 (+45), ..., id=3 (+10).
    expect(report.worstCases[0]?.auctionId).toBe(12n);
    expect(report.worstCases[1]?.auctionId).toBe(11n);
    expect(report.worstCases[9]?.auctionId).toBe(3n);
    // Posortowane malejąco po |error|.
    const absErrors = report.worstCases.map((r) => Math.abs(r.errorPct));
    for (let i = 1; i < absErrors.length; i += 1) {
      expect(absErrors[i]!).toBeLessThanOrEqual(absErrors[i - 1]!);
    }
  });

  it("recordCalibrationRun wywoływane RAZ z pełnym raportem + generatedAt", async () => {
    const samples: CalibrationSample[] = [
      makeSample({ id: 1n, estimated: 100, final: 100, vocation: "Monk" }),
    ];
    const db = makeMockDb(samples);
    const report = await runCalibration(db);

    expect(db.recordCalls).toHaveLength(1);
    const call = db.recordCalls[0]!;
    expect(call.report).toBe(report); // ten sam referencyjnie obiekt
    expect(call.generatedAt).toBe(report.generatedAt);
    // generatedAt to ISO string.
    expect(call.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
