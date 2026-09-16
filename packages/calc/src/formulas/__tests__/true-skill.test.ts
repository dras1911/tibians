/**
 * Testy `trueSkill` — odwrotność bonusu lojalności.
 *
 * ── HISTORIA (2026-09-16) ────────────────────────────────────────────
 * Poprzednia wersja testów utrwalała BŁĘDNĄ formułę:
 *
 *   it("displayed = 100, loyalty = 5% → base = 100/1.05 = 95.24")
 *
 * Traktowała bonus jako procent POZIOMU skilla. W rzeczywistości bonus mnoży
 * PUNKTY skilla (TibiaWiki: „modifies the underlying skill point value rather
 * than the displayed skill level"), a punkty rosną wykładniczo. Test
 * przechodził, bo implementacja i test miały ten sam błąd.
 *
 * Zgłoszone przez użytkownika na realnej postaci: Knight ze Sword 123
 * i 40% lojalności dawał 90,71 zamiast 123.
 *
 * Nowa formuła (TibiaWiki Formulae §Skills + Loyalty_System):
 *   base = log_b( (b^(displayed − c) − 1) / (1 + bonus) + 1 ) + c
 *
 * Testy są w większości PROPERTY-BASED (round-trip, monotoniczność), a nie
 * na zahardkodowanych liczbach — żeby zmiana stałych z Wiki nie wymagała
 * przepisywania ich po raz kolejny.
 *
 * **Ground truth**:
 *   - https://tibia.fandom.com/wiki/Loyalty_System (progi 360 pkt = 5%)
 *   - https://tibia.fandom.com/wiki/Formulae (§Skills — stałe A i b)
 */
import { describe, expect, it } from "vitest";

import {
  displayedSkill,
  trueSkill,
  TRUE_SKILL_VOCATIONS,
} from "../true-skill.js";

// ──────────────────────────────────────────────────────────────────────
// Przypadek referencyjny — REALNE DANE UŻYTKOWNIKA
// ──────────────────────────────────────────────────────────────────────

describe("trueSkill — przypadek referencyjny z realnej postaci", () => {
  it("Knight, Sword: displayed 127 + 40% lojalności → base ≈ 123", () => {
    // Bug zgłoszony przez użytkownika. Stara formuła dawała 90,71.
    // Postać ma bazowy Sword 123 (potwierdzone w grze/Bazaar).
    const r = trueSkill(127, 40, "sword", "knight");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(123, 0);
    // Sanity: na pewno NIE wynik starej, błędnej formuły (90,71)
    expect(r.value).toBeGreaterThan(120);
  });

  it("Knight ze Sword 100 + 30% lojalności → displayed ~103 (przykład z TibiaWiki)", () => {
    // TibiaWiki, Loyalty_System: „a knight with a base sword fighting skill
    // of 100 (103 after applying the loyalty bonus)". To NIE jest +30 poziomów
    // — bonus punktowy daje tylko ~3 poziomy. Odwracamy:
    const r = trueSkill(103, 30, "sword", "knight");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeGreaterThan(99);
    expect(r.value).toBeLessThan(101.5);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Właściwości formuły
// ──────────────────────────────────────────────────────────────────────

describe("trueSkill — właściwości", () => {
  it("loyaltyPct = 0 → base = displayed (brak transformacji)", () => {
    for (const s of [10, 50, 100, 200, 250]) {
      const r = trueSkill(s, 0, "sword", "knight");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(s);
    }
  });

  it("base jest ZAWSZE mniejsze niż displayed dla loyalty > 0", () => {
    for (const loy of [5, 10, 25, 50] as const) {
      for (const s of [50, 100, 150, 200]) {
        const r = trueSkill(s, loy, "sword", "knight");
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toBeLessThan(s);
      }
    }
  });

  it("wynik jest monotoniczny względem displayed", () => {
    let prev = -Infinity;
    for (const s of [50, 75, 100, 125, 150, 175, 200]) {
      const r = trueSkill(s, 25, "sword", "knight");
      if (!r.ok) throw new Error("walidacja odrzuciła poprawne wejście");
      expect(r.value).toBeGreaterThan(prev);
      prev = r.value;
    }
  });

  it("wyższy bonus → niższa baza przy tym samym displayed", () => {
    let prev = Infinity;
    for (const loy of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const) {
      const r = trueSkill(150, loy, "sword", "knight");
      if (!r.ok) throw new Error("walidacja odrzuciła poprawne wejście");
      expect(r.value).toBeLessThan(prev);
      prev = r.value;
    }
  });

  it("round-trip: displayedSkill(trueSkill(s)) ≈ s", () => {
    for (const loy of [5, 20, 40, 50] as const) {
      for (const s of [30, 60, 90, 120, 160, 200]) {
        const back = trueSkill(s, loy, "sword", "knight");
        if (!back.ok) throw new Error("walidacja odrzuciła poprawne wejście");

        // Bierzemy integer — gra wyświetla zaokrągloną wartość
        const redisplayed = displayedSkill(
          Math.round(back.value),
          loy,
          "sword",
          "knight",
        );
        if (!redisplayed.ok)
          throw new Error("walidacja odrzuciła poprawne wejście");

        // Tolerancja 1.5 poziomu: zaokrąglenie `base` do integera gubi
        // informację (odwrotność funkcji wykładniczej).
        expect(Math.abs(redisplayed.value - s)).toBeLessThan(1.5);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// Profesje i skille — stałe `b` z TibiaWiki
// ──────────────────────────────────────────────────────────────────────

describe("trueSkill — profesje i skille", () => {
  it("ta sama wartość displayed daje RÓŻNE bazy dla różnych profesji", () => {
    // Knight ma b = 1.1 (wolny wzrost) → niższa baza niż Paladin (b = 1.2).
    const knight = trueSkill(127, 40, "sword", "knight");
    const paladin = trueSkill(127, 40, "sword", "paladin");
    if (!knight.ok || !paladin.ok)
      throw new Error("walidacja odrzuciła poprawne wejście");

    expect(paladin.value).toBeGreaterThan(knight.value);
  });

  it("obsługuje wszystkie profesje bez rzucania", () => {
    for (const voc of TRUE_SKILL_VOCATIONS) {
      const r = trueSkill(100, 25, "sword", voc);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(Number.isFinite(r.value)).toBe(true);
        expect(r.value).toBeGreaterThan(0);
      }
    }
  });

  it("Magic Level (offset c = 0) daje inną bazę niż melee (c = 10)", () => {
    const magic = trueSkill(100, 25, "magic", "sorcerer");
    const sword = trueSkill(100, 25, "sword", "sorcerer");
    if (!magic.ok || !sword.ok)
      throw new Error("walidacja odrzuciła poprawne wejście");

    // Offset `c` i stała `b` są różne dla Magic (0; 1.1) i Sword (10; 2.0),
    // więc wyniki MUSZĄ się różnić — to wykrywa pomylenie stałych.
    expect(magic.value).not.toBeCloseTo(sword.value, 0);

    // Konkret: dla tego samego displayed wynik jest różny na tyle, że nie
    // da się go pomylić z tym samym wejściem.
    expect(Math.abs(magic.value - sword.value)).toBeGreaterThan(0.5);

    // Oba są mniejsze niż displayed (bonus zawsze obniża bazę).
    expect(magic.value).toBeLessThan(100);
    expect(sword.value).toBeLessThan(100);
  });

  it("wysokie skille (250) nie tracą precyzji", () => {
    const r = trueSkill(250, 50, "sword", "knight");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Number.isFinite(r.value)).toBe(true);
      expect(r.value).toBeGreaterThan(200);
      expect(r.value).toBeLessThan(250);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// Walidacja
// ──────────────────────────────────────────────────────────────────────

describe("trueSkill — walidacja wejścia", () => {
  it("odrzuca nie-integer displayed", () => {
    const r = trueSkill(100.5, 10, "sword", "knight");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("TRUE_SKILL_INVALID_INPUT");
  });

  it("odrzuca ujemny displayed", () => {
    const r = trueSkill(-1, 10, "sword", "knight");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("TRUE_SKILL_INVALID_INPUT");
  });

  it("odrzuca NaN / Infinity", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = trueSkill(bad, 10, "sword", "knight");
      expect(r.ok).toBe(false);
    }
  });

  it("odrzuca loyaltyPct spoza {0,5,…,50}", () => {
    for (const bad of [1, 7, 55, -5, 12.5]) {
      const r = trueSkill(100, bad, "sword", "knight");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("TRUE_SKILL_INVALID_LOYALTY");
    }
  });

  it("akceptuje wszystkie progi lojalności", () => {
    for (const loy of [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const) {
      const r = trueSkill(100, loy, "sword", "knight");
      expect(r.ok).toBe(true);
    }
  });

  it("jest deterministyczny (ten sam input → ten sam output)", () => {
    const a = trueSkill(137, 35, "axe", "knight");
    const b = trueSkill(137, 35, "axe", "knight");
    expect(a).toEqual(b);
  });
});
