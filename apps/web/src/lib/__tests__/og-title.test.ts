import { describe, expect, it } from "vitest";

import { humanizeSlugSegment, resolveOgTitle } from "../og-title";

/**
 * Testy logiki OG-image. Każdy slug pochodzi z REALNEJ referencji w metadata
 * stron (zweryfikowane grepem po `apps/web/src`), żeby test pilnował
 * faktycznego kontraktu, a nie wymyślonych przypadków.
 */
describe("resolveOgTitle", () => {
  it("rozwiązuje dokładne tytuły z metadata", () => {
    expect(resolveOgTitle("bazaar.png")).toEqual({
      title: "Char Bazaar",
      section: "Char Bazaar",
    });
    expect(resolveOgTitle("bazaar-history.png")).toEqual({
      title: "Historia aukcji",
      section: "Char Bazaar",
    });
    expect(resolveOgTitle("bazaar-statistics.png")).toEqual({
      title: "Statystyki rynku",
      section: "Char Bazaar",
    });
    expect(resolveOgTitle("workspace.png")).toEqual({
      title: "Workspace",
      section: "Workspace",
    });
    expect(resolveOgTitle("calculators.png")).toEqual({
      title: "Kalkulatory",
      section: "Kalkulatory",
    });
  });

  it("składa tytuł kalkulatora z prefiksu i sluga", () => {
    expect(resolveOgTitle("calculators-exercise-weapons.png")).toEqual({
      title: "Exercise Weapons",
      section: "Kalkulatory",
    });
    expect(resolveOgTitle("calculators-character-value.png")).toEqual({
      title: "Character Value",
      section: "Kalkulatory",
    });
  });

  it("składa tytuł plannera", () => {
    expect(resolveOgTitle("planners-wheel.png")).toEqual({
      title: "Wheel",
      section: "Plannery",
    });
  });

  it("ignoruje rozszerzenie i wielkość liter", () => {
    expect(resolveOgTitle("BAZAAR.PNG").title).toBe("Char Bazaar");
    expect(resolveOgTitle("bazaar.webp").title).toBe("Char Bazaar");
    expect(resolveOgTitle("bazaar.jpeg").title).toBe("Char Bazaar");
  });

  it("nie rzuca dla nieznanego prefiksu — sekcją zostaje nazwa serwisu", () => {
    const result = resolveOgTitle("nieznane-cos.png");
    expect(result.section).toBe("Tibians");
    expect(result.title).toBe("Cos");
  });

  it("nie rzuca dla sluga bez myślnika", () => {
    expect(resolveOgTitle("promocja.png")).toEqual({
      title: "Promocja",
      section: "Tibians",
    });
  });

  it("nie rzuca dla pustego wejścia", () => {
    // Kontrakt: podgląd w social media MUSI zawsze coś zwrócić.
    expect(() => resolveOgTitle("")).not.toThrow();
    expect(resolveOgTitle("").title.length).toBeGreaterThan(0);
  });

  it("nie rzuca dla samego rozszerzenia", () => {
    expect(() => resolveOgTitle(".png")).not.toThrow();
    expect(resolveOgTitle(".png").title.length).toBeGreaterThan(0);
  });
});

describe("humanizeSlugSegment", () => {
  it("zamienia kebab-case na Title Case", () => {
    expect(humanizeSlugSegment("exercise-weapons")).toBe("Exercise Weapons");
    expect(humanizeSlugSegment("true-skill")).toBe("True Skill");
  });

  it("zwraca pusty string dla pustego wejścia", () => {
    expect(humanizeSlugSegment("")).toBe("");
  });

  it("ignoruje puste segmenty po myślnikach", () => {
    // "a--b" → ["a", "", "b"] → filtr → ["a","b"] → "A B"
    expect(humanizeSlugSegment("a--b")).toBe("A B");
  });
});
