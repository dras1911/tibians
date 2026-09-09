/**
 * Testy weekly-tasks — task 21, ground truth TibiaWiki BR.
 *
 * **Ground truth**:
 *   - Bazowy wzór: `1_995 × level` (TibiaWiki BR, CipSoft nie ujawnił
 *     dokładnego wzoru; community reverse-engineered to w TibiaQA).
 *   - Cap per trudność (CipSoft oficjalne):
 *     - Beginner → 200 000
 *     - Adept    → 800 000
 *     - Expert   → 3 000 000
 *     - Master   → bez limitu
 *   - Unlock level:
 *     - Beginner → 1
 *     - Adept    → 30
 *     - Expert   → 150
 *     - Master   → 400
 *
 * **Strategia testów**:
 *   - Cap math (4 trudności × 3 poziomy: poniżej / w cap / powyżej).
 *   - Unlock validation (4 trudności × minimalny level).
 *   - Edge: level 8 (min CipSoft), level 2500 (max Tibia), level 1 (invalid).
 *   - Walidacja (negative, non-integer, enum spoza listy).
 *   - Deterministyczność.
 *
 * Source: https://tibiawiki.com.br/wiki/Weekly_Tasks
 */
import { describe, expect, it } from "vitest";

import {
  MAX_LEVEL,
  MIN_LEVEL,
  WEEKLY_TASK_DIFFICULTIES,
  WEEKLY_TASK_MIN_LEVEL,
  WEEKLY_TASK_XP_CAP,
  WEEKLY_TASK_XP_PER_LEVEL,
  weeklyTaskReward,
} from "../weekly-tasks.js";

// ───────────────────────────────────────────────────────────────────────
// Acceptance criteria T21 — level 200 Expert kill task → max XP
// ───────────────────────────────────────────────────────────────────────

describe("weeklyTaskReward — ground truth fixtures (TibiaWiki BR)", () => {
  it("level 200, Expert, kill → baseXp = 399_000, no cap (Expert cap = 3M)", () => {
    const r = weeklyTaskReward(200, "expert", "kill");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.baseXp).toBe(399_000n);
    expect(r.value.xpAfterCap).toBe(399_000n);
    expect(r.value.wasCapped).toBe(false);
    expect(r.value.difficulty).toBe("expert");
    expect(r.value.taskType).toBe("kill");
    expect(r.value.level).toBe(200);
  });

  it("level 200, Beginner, kill → baseXp = 399_000, capped at 200_000", () => {
    const r = weeklyTaskReward(200, "beginner", "kill");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.baseXp).toBe(399_000n);
    expect(r.value.xpAfterCap).toBe(200_000n);
    expect(r.value.capXp).toBe(200_000n);
    expect(r.value.wasCapped).toBe(true);
  });

  it("level 200, Adept, kill → baseXp = 399_000, no cap (Adept cap = 800k)", () => {
    const r = weeklyTaskReward(200, "adept", "kill");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.baseXp).toBe(399_000n);
    expect(r.value.xpAfterCap).toBe(399_000n);
    expect(r.value.wasCapped).toBe(false);
  });

  it("level 500, Master, kill → no cap (master = unlimited)", () => {
    // Master requires level ≥ 400.
    const r = weeklyTaskReward(500, "master", "kill");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.baseXp).toBe(997_500n);
    expect(r.value.xpAfterCap).toBe(997_500n);
    expect(r.value.wasCapped).toBe(false);
  });

  it("level 200, Expert, kill → baseXp = 399_000, no cap (Expert cap = 3M)", () => {
    // Expert requires level ≥ 150.
    const r = weeklyTaskReward(200, "expert", "kill");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.baseXp).toBe(399_000n);
    expect(r.value.xpAfterCap).toBe(399_000n);
  });

  it("level 100, Beginner, kill → baseXp = 199_500, no cap (Beginner cap = 200k)", () => {
    const r = weeklyTaskReward(100, "beginner", "kill");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.baseXp).toBe(199_500n);
    // 199_500 < 200_000 → brak capa
    expect(r.value.xpAfterCap).toBe(199_500n);
    expect(r.value.wasCapped).toBe(false);
  });

  it("level 100, Beginner, kill — delivery variant returns identical XP (TibiaWiki BR)", () => {
    const kill = weeklyTaskReward(100, "beginner", "kill");
    const delivery = weeklyTaskReward(100, "beginner", "delivery");
    expect(kill.ok).toBe(true);
    expect(delivery.ok).toBe(true);
    if (!kill.ok || !delivery.ok) return;
    expect(kill.value.baseXp).toBe(delivery.value.baseXp);
    expect(kill.value.xpAfterCap).toBe(delivery.value.xpAfterCap);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Cap boundaries — dokładne progi (Beginner 200k, Adept 800k, Expert 3M)
// ───────────────────────────────────────────────────────────────────────

describe("weeklyTaskReward — cap boundaries", () => {
  it("Beginner cap reached exactly at level 101 (199_995 < 200_000 = no cap, 200_990 > cap)", () => {
    // level 100 → 199_500 (< 200k, brak cap)
    const at100 = weeklyTaskReward(100, "beginner", "kill");
    expect(at100.ok && at100.value.xpAfterCap).toBe(199_500n);
    // level 101 → 201_495 (> 200k, cap = 200_000)
    const at101 = weeklyTaskReward(101, "beginner", "kill");
    expect(at101.ok && at101.value.xpAfterCap).toBe(200_000n);
    expect(at101.ok && at101.value.wasCapped).toBe(true);
  });

  it("Adept cap reached at level 402 (level 401 = 800_595, level 402 = 801_990 → cap 800k)", () => {
    // level 401 → 1995 * 401 = 799_995 (< 800k, brak cap)
    const at401 = weeklyTaskReward(401, "adept", "kill");
    expect(at401.ok && at401.value.xpAfterCap).toBe(799_995n);
    expect(at401.ok && at401.value.wasCapped).toBe(false);
    // level 402 → 1995 * 402 = 801_990 (> 800k, cap = 800_000)
    const at402 = weeklyTaskReward(402, "adept", "kill");
    expect(at402.ok && at402.value.xpAfterCap).toBe(800_000n);
    expect(at402.ok && at402.value.wasCapped).toBe(true);
  });

  it("Expert cap reached at level 1504 (level 1503 = 2_998_485, level 1504 = 3_000_480 → cap 3M)", () => {
    const at1503 = weeklyTaskReward(1503, "expert", "kill");
    expect(at1503.ok && at1503.value.xpAfterCap).toBe(2_998_485n);
    expect(at1503.ok && at1503.value.wasCapped).toBe(false);
    const at1504 = weeklyTaskReward(1504, "expert", "kill");
    expect(at1504.ok && at1504.value.xpAfterCap).toBe(3_000_000n);
    expect(at1504.ok && at1504.value.wasCapped).toBe(true);
  });

  it("Master never caps (level 2500 → 4_987_500 XP, no cap)", () => {
    const r = weeklyTaskReward(2500, "master", "delivery");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.baseXp).toBe(4_987_500n);
    expect(r.value.xpAfterCap).toBe(4_987_500n);
    expect(r.value.wasCapped).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Unlock level (CipSoft: minimalny level per difficulty)
// ───────────────────────────────────────────────────────────────────────

describe("weeklyTaskReward — unlock level validation", () => {
  it.each(WEEKLY_TASK_DIFFICULTIES)(
    "difficulty '%s' rejects level one below minimum (when within CipSoft legal range)",
    (diff) => {
      const min = WEEKLY_TASK_MIN_LEVEL[diff];
      // Beginner ma unlock level 1, ale CipSoft wymaga level ≥ 8.
      // Dla beginner testujemy unlock validation inaczej — patrz niżej.
      if (min <= MIN_LEVEL) {
        // Dla beginner: skip (oba warunki overlap)
        return;
      }
      const r = weeklyTaskReward(min - 1, diff, "kill");
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe("WEEKLY_TASK_LEVEL_TOO_LOW");
    },
  );

  it.each(WEEKLY_TASK_DIFFICULTIES)(
    "difficulty '%s' accepts level at minimum CipSoft legal (>= 8)",
    (diff) => {
      const effectiveMin = Math.max(WEEKLY_TASK_MIN_LEVEL[diff], MIN_LEVEL);
      const r = weeklyTaskReward(effectiveMin, diff, "kill");
      expect(r.ok).toBe(true);
    },
  );

  it("beginner at level 8 succeeds (CipSoft legal minimum)", () => {
    const r = weeklyTaskReward(8, "beginner", "kill");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.baseXp).toBe(BigInt(WEEKLY_TASK_XP_PER_LEVEL) * 8n);
    expect(r.value.xpAfterCap).toBe(15_960n); // < 200k, no cap
  });

  it("adept at level 29 fails (1 below required 30)", () => {
    const r = weeklyTaskReward(29, "adept", "delivery");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_LEVEL_TOO_LOW");
  });

  it("adept at level 30 succeeds", () => {
    const r = weeklyTaskReward(30, "adept", "kill");
    expect(r.ok).toBe(true);
  });

  it("expert at level 149 fails (1 below required 150)", () => {
    const r = weeklyTaskReward(149, "expert", "delivery");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_LEVEL_TOO_LOW");
  });

  it("master at level 399 fails (1 below required 400)", () => {
    const r = weeklyTaskReward(399, "master", "kill");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_LEVEL_TOO_LOW");
  });

  it("master at level 400 succeeds", () => {
    const r = weeklyTaskReward(400, "master", "kill");
    expect(r.ok).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Edge cases — poziomy graniczne (CipSoft + TibiaWiki)
// ───────────────────────────────────────────────────────────────────────

describe("weeklyTaskReward — level edge cases", () => {
  it("level 1 → invalid (below CipSoft legal minimum 8)", () => {
    const r = weeklyTaskReward(1, "beginner", "kill");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_INVALID_LEVEL");
  });

  it("level 7 → invalid (below CipSoft legal minimum 8)", () => {
    const r = weeklyTaskReward(7, "beginner", "delivery");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_INVALID_LEVEL");
  });

  it("level 8 → valid (CipSoft minimum)", () => {
    const r = weeklyTaskReward(8, "beginner", "kill");
    expect(r.ok).toBe(true);
  });

  it("level 2500 → valid (TibiaWiki max)", () => {
    const r = weeklyTaskReward(2500, "master", "delivery");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.baseXp).toBe(4_987_500n);
  });

  it("level 2501 → invalid (above TibiaWiki cap 2500)", () => {
    const r = weeklyTaskReward(2501, "master", "kill");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_INVALID_LEVEL");
  });

  it("level -1 → invalid (negative)", () => {
    const r = weeklyTaskReward(-1, "beginner", "kill");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_INVALID_LEVEL");
  });

  it("level 0 → invalid (below CipSoft legal minimum)", () => {
    const r = weeklyTaskReward(0, "beginner", "kill");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_INVALID_LEVEL");
  });

  it("level NaN → invalid", () => {
    const r = weeklyTaskReward(Number.NaN, "beginner", "kill");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_INVALID_LEVEL");
  });

  it("level Infinity → invalid", () => {
    const r = weeklyTaskReward(Number.POSITIVE_INFINITY, "beginner", "kill");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_INVALID_LEVEL");
  });

  it("level 100.5 → invalid (non-integer)", () => {
    const r = weeklyTaskReward(100.5, "beginner", "kill");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_INVALID_LEVEL");
  });
});

// ───────────────────────────────────────────────────────────────────────
// Walidacja enum (difficulty / taskType)
// ───────────────────────────────────────────────────────────────────────

describe("weeklyTaskReward — enum validation", () => {
  it("invalid difficulty string → WEEKLY_TASK_INVALID_DIFFICULTY", () => {
    const r = weeklyTaskReward(
      100,
      "impossible" as unknown as "beginner",
      "kill",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_INVALID_DIFFICULTY");
  });

  it("invalid taskType string → WEEKLY_TASK_INVALID_TASK_TYPE", () => {
    const r = weeklyTaskReward(
      100,
      "beginner",
      "challenge" as unknown as "kill",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_INVALID_TASK_TYPE");
  });

  it("empty string difficulty → invalid", () => {
    const r = weeklyTaskReward(
      100,
      "" as unknown as "beginner",
      "kill",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("WEEKLY_TASK_INVALID_DIFFICULTY");
  });
});

// ───────────────────────────────────────────────────────────────────────
// Determinizm (arch. §13.1)
// ───────────────────────────────────────────────────────────────────────

describe("weeklyTaskReward — determinism", () => {
  it("returns identical result on 100 sequential calls (zero Date.now/Math.random)", () => {
    const first = weeklyTaskReward(200, "expert", "kill");
    for (let i = 0; i < 100; i++) {
      const next = weeklyTaskReward(200, "expert", "kill");
      expect(next).toEqual(first);
    }
  });

  it("formula exposes deterministic constants (no floating point drift)", () => {
    expect(WEEKLY_TASK_XP_PER_LEVEL).toBe(1995);
    expect(WEEKLY_TASK_XP_CAP.beginner).toBe(200_000);
    expect(WEEKLY_TASK_XP_CAP.adept).toBe(800_000);
    expect(WEEKLY_TASK_XP_CAP.expert).toBe(3_000_000);
    expect(WEEKLY_TASK_XP_CAP.master).toBe(Number.POSITIVE_INFINITY);
    expect(MIN_LEVEL).toBe(8);
    expect(MAX_LEVEL).toBe(2500);
  });
});
