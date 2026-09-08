/**
 * computeValueConfidence — pewność wyceny postaci.
 *
 * Arch. §8.4 definiuje confidence jako funkcję kompletności snapshotu.
 * Tutaj używamy **jawnego mapowania wg źródła** (nie heurystyki „ile pól
 * wypełnionych") — bo heurystyka nie rozróżnia jakości pól (skille z ręcznego
 * formularza są dokładniejsze niż 100 pustych itemów z aukcji, ale oba
 * „zwiększają" kompletność).
 *
 * Progi (z task 9):
 *   - auction + items + tcInvested + achievements > 0  → 1.0
 *   - auction + brak items + brak tcInvested           → 0.8
 *   - manual / imported + items wypełnione             → 0.7
 *   - manual / imported + brak items                   → 0.4
 *   - cokolwiek innego / niekompletne                  → 0.2
 *
 * UI (arch. §8.4): `~` dla ≥ 0.8, `≈` dla niższych.
 */
import type { CharacterSnapshot } from "./schema.js";

export function computeValueConfidence(snapshot: CharacterSnapshot): number {
  const source = snapshot.source;

  // ── Aukcja — pełny detal z Bazaara ────────────────────────────────────
  if (source.kind === "auction") {
    const hasItems = snapshot.assets.items.length > 0;
    const hasTc = snapshot.assets.tcInvested !== undefined;
    const hasAchievements = snapshot.progression.achievementPoints > 0;

    // Najlepszy przypadek: wszystkie kluczowe sekcje obecne.
    if (hasItems && hasTc && hasAchievements) {
      return 1.0;
    }

    // Najgorszy przypadek aukcji: strona detail bez rozwinięcia sekcji.
    if (!hasItems && !hasTc) {
      return 0.8;
    }

    // Częściowy detal — gdzieś między 0.8 a 1.0. Przyjmujemy 0.9 jako
    // konserwatywny środek, żeby UI dalej pokazywał `~` (≥ 0.8).
    return 0.9;
  }

  // ── Ręczny / import — dane pochodzą od gracza lub z tibia.com/community
  if (source.kind === "manual" || source.kind === "imported") {
    return snapshot.assets.items.length > 0 ? 0.7 : 0.4;
  }

  // ── Fallback (nie powinno wystąpić — schema pilnuje kind) ─────────────
  return 0.2;
}
