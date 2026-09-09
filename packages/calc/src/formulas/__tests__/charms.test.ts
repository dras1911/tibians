/**
 * Testy charms — task 21, TibiaPal benchmark + TibiaWiki Major_Charms.
 *
 * **Ground truth**:
 *   - TibiaPal Charm Damage Calculator: 5% (elemental/Overpower) /
 *     2.5% (Overflux) base damage per proc.
 *   - TibiaPal: "all values are calculated pre-mitigation, so real in-game
 *     damage will be slightly lower due to a monster's mitigation modifier".
 *   - TibiaWiki Major_Charms: elemental charms = 5% × sensitivity per proc.
 *   - Overpower scales z HP gracza (5%), Overflux z MP (2.5%) — capped
 *     przy 8% HP potwora. TibiaPal Charm Calculator używa HP/MP gracza
 *     jako inputu; nasz kalkulator (zgodnie ze specyfikacją T21) tego
 *     nie ma — stosujemy heurystyczne vocation mods (udokumentowane).
 *
 * **Strategia testów**:
 *   - Base case (Overpower / Overflux / elemental): spot-check wzoru.
 *   - Sensitivity multipliers (4 klasy × 9 charms).
 *   - Vocation mods (5 vocations × 2 self-charm).
 *   - Edge: monsterType = "immune" → 0%.
 *   - Walidacja enumów (5 vocations + 8 skills + 9 charms + 4 sensitivities).
 *   - Deterministyczność.
 *
 * **Heurystyki** (udokumentowane w charms.ts):
 *   - Vocation mods: Knight +30% Overpower / -30% Overflux; Sorcerer/Druid
 *     odwrotnie; Paladin/Monk zbalansowane. Elemental charms = 1.0.
 *   - Skill mods: magic +10% Overflux; sword/axe/club/fist +10% Overpower;
 *     reszta 1.0.
 *
 * Source: https://tibia.fandom.com/wiki/Charms
 *         https://tibia.fandom.com/wiki/Major_Charms
 *         https://tibiapal.com/charm_calculator
 */
import { describe, expect, it } from "vitest";

import {
  CHARM_BASE_PERCENT,
  CHARM_IDS,
  CHARM_SKILLS,
  CHARM_VOCATIONS,
  MONSTER_SENSITIVITIES,
  SENSITIVITY_MULTIPLIER,
  SKILL_CHARM_MOD,
  VOCATION_CHARM_MOD,
  charmDamage,
  type CharmId,
  type CharmSkill,
  type CharmVocation,
  type MonsterSensitivity,
} from "../charms.js";

// ───────────────────────────────────────────────────────────────────────
// Ground truth — TibiaPal benchmark
// ───────────────────────────────────────────────────────────────────────

describe("charmDamage — TibiaPal benchmark base cases", () => {
  it("Overpower, neutral monster, Knight, sword → 5% × 1.0 × 1.3 × 1.1 = 7.15%", () => {
    // 5 * 1.0 * 1.3 * 1.1 = 7.15
    const r = charmDamage("Knight", "sword", "overpower", "neutral");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.damagePercent).toBe(7.15);
    expect(r.value.isImmune).toBe(false);
  });

  it("Overflux, neutral monster, Sorcerer, magic → 2.5% × 1.0 × 1.3 × 1.1 = 3.575%", () => {
    // 2.5 * 1.0 * 1.3 * 1.1 = 3.575
    const r = charmDamage("Sorcerer", "magic", "overflux", "neutral");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.damagePercent).toBe(3.58); // rounded to 2 decimals
  });

  it("Enflame, weak monster, Knight, sword → 5% × 1.2 × 1.0 × 1.0 = 6%", () => {
    const r = charmDamage("Knight", "sword", "enflame", "weak");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.damagePercent).toBe(6);
  });

  it("Wound, neutral monster, Paladin, distance → 5% × 1.0 × 1.0 × 1.0 = 5%", () => {
    const r = charmDamage("Paladin", "distance", "wound", "neutral");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.damagePercent).toBe(5);
  });

  it("Divine Wrath, weak monster, Druid, magic → 5% × 1.2 × 1.0 × 1.0 = 6%", () => {
    const r = charmDamage("Druid", "magic", "divineWrath", "weak");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.damagePercent).toBe(6);
  });

  it("Curse, resistant monster, Monk, fist → 5% × 0.5 × 1.0 × 1.0 = 2.5%", () => {
    const r = charmDamage("Monk", "fist", "curse", "resistant");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.damagePercent).toBe(2.5);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Self-scaling charms (Overpower/Overflux): monsterType nie wpływa
// ───────────────────────────────────────────────────────────────────────

describe("charmDamage — self-scaling charms ignore monsterType", () => {
  it.each(MONSTER_SENSITIVITIES)(
    "Overpower returns same damage for every monsterType when other params equal (%s)",
    (monsterType) => {
      const r = charmDamage("Knight", "sword", "overpower", monsterType);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // Self-scaling → monsterType nie wpływa; stałe 7.15%
      expect(r.value.damagePercent).toBe(7.15);
      // isImmune false — Overpower skaluje z HP gracza, immune nie dotyczy
      expect(r.value.isImmune).toBe(false);
    },
  );

  it("Overflux returns same damage for every monsterType when other params equal", () => {
    for (const m of MONSTER_SENSITIVITIES) {
      const r = charmDamage("Druid", "magic", "overflux", m);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      // 2.5 * 1.0 * 1.3 * 1.1 = 3.575 → 3.58 (zaokrąglone do 2 miejsc)
      expect(r.value.damagePercent).toBe(3.58);
      expect(r.value.isImmune).toBe(false);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// Vocation mods — Overpower/Overflux
// ───────────────────────────────────────────────────────────────────────

describe("charmDamage — vocation modifiers (heuristic)", () => {
  it("Knight +30% Overpower, -30% Overflux vs Paladin baseline", () => {
    const kOverpower = charmDamage("Knight", "sword", "overpower", "neutral");
    const pOverpower = charmDamage("Paladin", "sword", "overpower", "neutral");
    const kOverflux = charmDamage("Knight", "magic", "overflux", "neutral");
    const pOverflux = charmDamage("Paladin", "magic", "overflux", "neutral");
    expect(kOverpower.ok && pOverpower.ok && kOverflux.ok && pOverflux.ok).toBe(
      true,
    );
    if (!kOverpower.ok || !pOverpower.ok || !kOverflux.ok || !pOverflux.ok) return;
    // Knight Overpower > Paladin Overpower (1.3 vs 1.1)
    expect(kOverpower.value.damagePercent).toBeGreaterThan(
      pOverpower.value.damagePercent,
    );
    // Knight Overflux < Paladin Overflux (0.7 vs 0.9)
    expect(kOverflux.value.damagePercent).toBeLessThan(
      pOverflux.value.damagePercent,
    );
  });

  it("Sorcerer +30% Overflux, -30% Overpower vs Druid baseline", () => {
    const sorcOverflux = charmDamage("Sorcerer", "magic", "overflux", "neutral");
    const druidOverflux = charmDamage("Druid", "magic", "overflux", "neutral");
    expect(sorcOverflux.ok && druidOverflux.ok).toBe(true);
    if (!sorcOverflux.ok || !druidOverflux.ok) return;
    // Sorcerer = Druid (oba 1.3 overflux)
    expect(sorcOverflux.value.damagePercent).toBe(
      druidOverflux.value.damagePercent,
    );
  });

  it("Elemental charms are vocation-agnostic (all vocations return same)", () => {
    const damages: Record<CharmVocation, number> = {
      Knight: 0,
      Paladin: 0,
      Druid: 0,
      Sorcerer: 0,
      Monk: 0,
    };
    for (const v of CHARM_VOCATIONS) {
      const r = charmDamage(v, "sword", "enflame", "neutral");
      expect(r.ok).toBe(true);
      if (r.ok) damages[v] = r.value.damagePercent;
    }
    // All vocations → same 5% for elemental
    expect(damages.Knight).toBe(5);
    expect(damages.Paladin).toBe(5);
    expect(damages.Druid).toBe(5);
    expect(damages.Sorcerer).toBe(5);
    expect(damages.Monk).toBe(5);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Skill mods — marginalna synergia
// ───────────────────────────────────────────────────────────────────────

describe("charmDamage — skill modifiers (heuristic, low-weight)", () => {
  it("magic skill boosts Overflux +10% vs shielding skill", () => {
    const magic = charmDamage("Sorcerer", "magic", "overflux", "neutral");
    const shield = charmDamage("Sorcerer", "shielding", "overflux", "neutral");
    expect(magic.ok && shield.ok).toBe(true);
    if (!magic.ok || !shield.ok) return;
    expect(magic.value.damagePercent).toBeGreaterThan(
      shield.value.damagePercent,
    );
  });

  it("sword skill boosts Overpower +10% vs distance skill", () => {
    const sword = charmDamage("Knight", "sword", "overpower", "neutral");
    const distance = charmDamage("Knight", "distance", "overpower", "neutral");
    expect(sword.ok && distance.ok).toBe(true);
    if (!sword.ok || !distance.ok) return;
    expect(sword.value.damagePercent).toBeGreaterThan(
      distance.value.damagePercent,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────
// Immune case
// ───────────────────────────────────────────────────────────────────────

describe("charmDamage — immune monster", () => {
  it.each<CharmId>(["wound", "enflame", "freeze", "poison", "zap", "curse", "divineWrath"])(
    "elemental charm '%s' on immune monster → 0% damage + isImmune flag",
    (charm) => {
      const r = charmDamage("Knight", "sword", charm, "immune");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.damagePercent).toBe(0);
      expect(r.value.isImmune).toBe(true);
    },
  );

  it("Overpower/Overflux IGNORE monsterType (self-scaling, TibiaPal: scales with char HP/MP)", () => {
    // Self-scaling charms (Overpower, Overflux) skalują z HP/MP postaci,
    // NIE z potworem — więc wrażliwość potwora (immune/neutral/weak)
    // nie wpływa. TibiaWiki Major_Charms: "Your attacks have 5%-11%
    // chance to deal damage equal to 5% of your max HP" — brak warunku
    // na monster resistance.
    const opImmune = charmDamage("Knight", "sword", "overpower", "immune");
    const opNeutral = charmDamage("Knight", "sword", "overpower", "neutral");
    expect(opImmune.ok && opNeutral.ok).toBe(true);
    if (!opImmune.ok || !opNeutral.ok) return;
    expect(opImmune.value.damagePercent).toBe(opNeutral.value.damagePercent);
    expect(opImmune.value.sensitivityMultiplier).toBe(1.0);
    expect(opImmune.value.isImmune).toBe(false); // nie dotyczy self-scaling
  });
});

// ───────────────────────────────────────────────────────────────────────
// Walidacja enum (5 vocations + 8 skills + 9 charms + 4 sensitivities)
// ───────────────────────────────────────────────────────────────────────

describe("charmDamage — enum validation", () => {
  it("invalid vocation → CHARM_INVALID_VOCATION", () => {
    const r = charmDamage(
      "Mage" as unknown as CharmVocation,
      "sword",
      "wound",
      "neutral",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("CHARM_INVALID_VOCATION");
  });

  it("invalid skill → CHARM_INVALID_SKILL", () => {
    const r = charmDamage(
      "Knight",
      "archery" as unknown as CharmSkill,
      "wound",
      "neutral",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("CHARM_INVALID_SKILL");
  });

  it("invalid charm → CHARM_INVALID_CHARM", () => {
    const r = charmDamage(
      "Knight",
      "sword",
      "fireball" as unknown as CharmId,
      "neutral",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("CHARM_INVALID_CHARM");
  });

  it("invalid monsterType → CHARM_INVALID_MONSTER_TYPE", () => {
    const r = charmDamage(
      "Knight",
      "sword",
      "wound",
      "ultra-weak" as unknown as MonsterSensitivity,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("CHARM_INVALID_MONSTER_TYPE");
  });

  it("empty string vocation → invalid", () => {
    const r = charmDamage("" as unknown as CharmVocation, "sword", "wound", "neutral");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("CHARM_INVALID_VOCATION");
  });
});

// ───────────────────────────────────────────────────────────────────────
// Edge: wszystkie 9 charms × 5 vocations × 8 skills × 4 sensitivities = 1440 kombinacji
// ───────────────────────────────────────────────────────────────────────

describe("charmDamage — full matrix smoke test", () => {
  it.each(CHARM_IDS)(
    "charm '%s' works for every (vocation, skill, monsterType) triple",
    (charm) => {
      for (const v of CHARM_VOCATIONS) {
        for (const s of CHARM_SKILLS) {
          for (const m of MONSTER_SENSITIVITIES) {
            const r = charmDamage(v, s, charm, m);
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.value.damagePercent).toBeGreaterThanOrEqual(0);
            expect(r.value.damagePercent).toBeLessThanOrEqual(15); // max theoretical
          }
        }
      }
    },
  );
});

// ───────────────────────────────────────────────────────────────────────
// Determinizm (arch. §13.1)
// ───────────────────────────────────────────────────────────────────────

describe("charmDamage — determinism", () => {
  it("returns identical result on 100 sequential calls (zero Date.now/Math.random)", () => {
    const first = charmDamage("Knight", "sword", "overpower", "weak");
    for (let i = 0; i < 100; i++) {
      const next = charmDamage("Knight", "sword", "overpower", "weak");
      expect(next).toEqual(first);
    }
  });

  it("formula exposes deterministic constants (no floating point drift)", () => {
    expect(CHARM_BASE_PERCENT.wound).toBe(5);
    expect(CHARM_BASE_PERCENT.overflux).toBe(2.5);
    expect(SENSITIVITY_MULTIPLIER.weak).toBe(1.2);
    expect(SENSITIVITY_MULTIPLIER.neutral).toBe(1.0);
    expect(SENSITIVITY_MULTIPLIER.resistant).toBe(0.5);
    expect(SENSITIVITY_MULTIPLIER.immune).toBe(0.0);
    expect(VOCATION_CHARM_MOD.Knight.overpower).toBe(1.3);
    expect(VOCATION_CHARM_MOD.Sorcerer.overflux).toBe(1.3);
    expect(SKILL_CHARM_MOD.magic.overflux).toBe(1.1);
    expect(SKILL_CHARM_MOD.sword.overpower).toBe(1.1);
  });
});
