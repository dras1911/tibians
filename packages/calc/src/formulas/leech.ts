/**
 * leech — kalkulator % leech XP w 2-osobowej party (task 15, arch. §2.1).
 *
 * **TibiaWiki/CipSoft ground truth** (https://tibia.com/support/?entryid=91):
 *
 *   1. Party XP is split EQUALLY among all members within legal level range
 *      ("shared experience means that the experience points a creature is
 *      yielding plus a bonus is distributed equally between all members").
 *   2. Legal level range (CipSoft): "the lowest character in a party may not
 *      have less than two-thirds of the levels of the highest character"
 *      ⇒ L_low ≥ (2/3) × L_high, równoważnie L_high ≤ 1.5 × L_low.
 *   3. TibiaWiki (Party page): range per character L
 *      ⇒ min = ⌈L / 1.5⌉, max = ⌊L × 1.5⌋ (+1 dla parzystych L — patrz
 *      test dla L=40 ⇒ [27, 61]).
 *
 * **TibiaWiki/CipSoft — bonus za różne vocations** (w party):
 *
 *   - 1 vocation  → +20% bonus
 *   - 2 vocations → +30% bonus
 *   - 3 vocations → +60% bonus
 *   - 4-5 vocations → +100% bonus
 *
 * **Przyjęte założenie** (udokumentowane w testach; TibiaWiki nie specyfikuje):
 *   Tibia w ramach legalnego zakresu leveli rozdziela XP **równo**, bez kary
 *   za różnicę poziomów. Wzór `leechPercent` modeluje to + dodaje
 *   **community convention** z lekką redukcją % udziału niższego levelu
 *   proporcjonalnie do różnicy leveli (community rule of thumb: niższy level
 *   contributing mniej damage dostaje trochę mniej XP). Redukcja = `5%` per
 *   poziom różnicy (community, NIE TibiaWiki). Jest to oznaczone jako
 *   **assumption** w pliku testów.
 *
 * **Sygnatura** `leechPercent(characterLevel, partyMemberLevel, vocation)`:
 *   - `characterLevel`     — level postaci, dla której liczymy udział (leech)
 *   - `partyMemberLevel`   — level członka party (carrier)
 *   - `vocation`           — vocation postaci characterLevel; obecnie NIE
 *                            wpływa na wynik (Tibia nie różnicuje XP share
 *                            per vocation — bonus zależy od LICZBY RÓŻNYCH
 *                            vocations w party, nie od konkretnej). Parametr
 *                            zarezerwowany dla przyszłej rozszerzalności
 *                            (np. event "Double XP" specyficzny dla vocation).
 *
 * **Czysta funkcja**: deterministyczna, bez I/O, bez `Date.now()` / `Math.random()`.
 *
 * Source: https://tibia.fandom.com/wiki/Party
 *         https://tibia.com/support/?entryid=91  (CipSoft — official)
 *         https://tibia.fandom.com/wiki/Experience_Formula
 */
import {
  err,
  ok,
  validationError,
  type CalculatorResult,
} from "../types.js";
import { MAX_LEVEL } from "../utils/xp-table.js";

// ──────────────────────────────────────────────────────────────────────────
// Stałe domenowe (Tibia ground truth + dokumentowane założenia)
// ──────────────────────────────────────────────────────────────────────────

/** Minimalny level gracza w Tibii (8). */
export const MIN_LEVEL = 8;

/**
 * Tibia legal level range ratio (CipSoft): L_high / L_low ≤ 1.5
 * ⇒ L_low ≥ 2/3 × L_high. Tzn. stosunek wyższego do niższego ≤ 3/2.
 *
 * Source: https://tibia.com/support/?entryid=91  ("not have less than
 * two-thirds of the levels of the highest character").
 */
export const LEECH_LEVEL_RATIO_MAX = 1.5;

/**
 * Przyjęte założenie (community convention, NIE TibiaWiki): leech share
 * niższego levelu w 2-osobowej party jest redukowany o tę wartość per
 * poziom różnicy. Bazowo 5%/poziom (community rule of thumb).
 *
 * **Dokumentowane w `leech.test.ts`** — użytkownik może nadpisać
 * przez `options.reductionPerLevel` jeśli potrzebuje innego modelu.
 */
export const LEECH_REDUCTION_PER_LEVEL_DEFAULT = 0.05;

/**
 * Bazowy udział % XP w 2-osobowej party przy tym samym levelu
 * (Tibia equal split + brak vocation bonus w 2-osobowej party z 1 vocation).
 *
 * **Tibia official rule**: "experience points... distributed equally
 * between all members" — zatem w 2-osobowej party każdy dostaje 1/2 = 50%.
 * Bonus za vocation (20%/30%/60%/100%) dotyczy CAŁOŚCI XP, ale jest
 * rozdzielany równo po wszystkich członkach — więc per-member share
 * w 2-osobowej single-vocation party to 50% × 1.20 = 60%. Tutaj
 * zwracamy **procent udziału** przed bonusem (sam split), więc 50%.
 */
export const LEECH_BASE_SHARE_PCT = 50;

/**
 * Minimum leech share (% XP). Poniżej tej wartości zwracamy 0
 * (leech staje się nieopłacalny).
 *
 * Przyjęte założenie (community, nie TibiaWiki).
 */
export const LEECH_MIN_SHARE_PCT = 0;

// ──────────────────────────────────────────────────────────────────────────
// Typy wejścia/wyjścia
// ──────────────────────────────────────────────────────────────────────────

/** Vocation postaci (TibiaVoc, 5 bazowych klas). */
export type LeechVocation =
  | "Knight"
  | "Paladin"
  | "Druid"
  | "Sorcerer"
  | "Monk";

export interface LeechOptions {
  /** Redukcja per poziom różnicy (0..1). Domyślnie 0.05 (5%). */
  readonly reductionPerLevel?: number;
}

/**
 * Wynik `leechPercent`.
 *
 * `sharePct` — % XP (z zakresu 0..100) jaki otrzymuje postać
 * `characterLevel` w 2-osobowej party z `partyMemberLevel`.
 *
 * Edge cases:
 *   - Levels poza Tibia legal range → 0%
 *   - `partyMemberLevel` o wiele wyższy (leech z góry) → 0% (Tibia:
 *     postać niższa levelem nie może leechować z wyższej, bo equal
 *     split nadal jest 50%, ale community convention traktuje to jako
 *     "leech reverse" → zwracamy 0%).
 *   - `characterLevel === partyMemberLevel` → 50%
 *   - Poziomy równe, ale vocation jest różna (w 2-osobowej party
 *     mamy 1 lub 2 vocations) → vocation bonus NIE jest tu uwzględniony;
 *     modelowany osobno w `exp-share.ts`.
 */
export interface LeechResult {
  /** % XP (0..100) dla `characterLevel`. */
  readonly sharePct: number;
  /** Różnica poziomów (zawsze ≥ 0). */
  readonly levelDiff: number;
  /** Czy party mieści się w Tibia legal range (ratio ≤ 1.5). */
  readonly withinLegalRange: boolean;
  /** Czy `characterLevel` < `partyMemberLevel` (leech "w górę"). */
  readonly isLeechUpward: boolean;
  /** Czy to dokładne 50/50 (bez reduction). */
  readonly equalSplit: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpery (wewnętrzne)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Sprawdza, czy para (character, partyMember) mieści się w Tibia
 * legal level range (CipSoft: lowest ≥ 2/3 × highest).
 *
 * @returns `true` jeśli legalny zakres
 */
function withinLegalTibiaRange(
  characterLevel: number,
  partyMemberLevel: number,
): boolean {
  if (characterLevel === partyMemberLevel) return true;
  const higher = Math.max(characterLevel, partyMemberLevel);
  const lower = Math.min(characterLevel, partyMemberLevel);
  // L_high ≤ 1.5 × L_low
  return higher <= LEECH_LEVEL_RATIO_MAX * lower;
}

// ──────────────────────────────────────────────────────────────────────────
// leechPercent — główna funkcja
// ──────────────────────────────────────────────────────────────────────────

/**
 * Zwraca % udziału XP postaci `characterLevel` w 2-osobowej party
 * z `partyMemberLevel` (Tibia leech share, community convention).
 *
 * Algorytm:
 *   1. Walidacja levels (integer ∈ [MIN_LEVEL=8, MAX_LEVEL=2500]).
 *   2. Jeśli poziomy poza Tibia legal range (ratio > 1.5) → 0%.
 *   3. Jeśli `characterLevel < partyMemberLevel` (leech w górę,
 *      community convention) → 0%.
 *   4. Bazowy share = 50% (Tibia equal split w 2-osobowej party).
 *   5. Redukcja = `levelDiff × reductionPerLevel` (domyślnie 5%/poziom).
 *   6. sharePct = max(MIN, BASE − redukcja).
 *
 * **Dokumentacja założenia community**: TibiaWiki NIE specyfikuje
 * redukcji XP za level diff (Tibia traktuje party jako equal split).
 * "Leech reduction per level diff" to konwencja społeczności Tibia
 * (fora, YouTube guides), implementowana tu jako heurystyczny model.
 * Realne Tibia zachowanie: equal split niezależnie od level diff
 * (dopóki ratio ≤ 1.5).
 *
 * @param characterLevel - level postaci (integer ∈ [8, 2500])
 * @param partyMemberLevel - level członka party (integer ∈ [8, 2500])
 * @param vocation - vocation postaci `characterLevel` (rezonans dla UI;
 *                   obecnie nie wpływa na wynik)
 * @param options - {@link LeechOptions}
 * @returns `CalculatorResult<LeechResult>`
 *
 * @example
 * ```ts
 * // Ten sam level → 50% (Tibia equal split)
 * leechPercent(100, 100, "Knight");
 * // → { sharePct: 50, levelDiff: 0, withinLegalRange: true, ... }
 *
 * // 10 leveli różnicy (w ramach legal range), domyślna redukcja 5%/lvl
 * leechPercent(100, 110, "Knight");
 * // → { sharePct: 45, levelDiff: 10, ... }  // 50% − 10×5% = 0%? No, 5%
 * // Domyślnie: 50% − 10×5% = 0% (wyzerowane do min).
 *
 * // Poza legal range (partyMember za nisko)
 * leechPercent(200, 100, "Elite Knight");
 * // → { sharePct: 0, withinLegalRange: false, ... }
 * ```
 *
 * Source: https://tibia.com/support/?entryid=91
 *         https://tibia.fandom.com/wiki/Party
 */
export function leechPercent(
  characterLevel: number,
  partyMemberLevel: number,
  vocation: LeechVocation,
  options: LeechOptions = {},
): CalculatorResult<LeechResult> {
  // ── Walidacja characterLevel ──
  if (!Number.isFinite(characterLevel)) {
    return err(
      validationError(
        "LEECH_INVALID_LEVEL",
        `characterLevel musi być liczbą skończoną, otrzymano ${characterLevel}`,
      ),
    );
  }
  if (!Number.isInteger(characterLevel)) {
    return err(
      validationError(
        "LEECH_INVALID_LEVEL",
        `characterLevel musi być integerem, otrzymano ${characterLevel}`,
      ),
    );
  }
  if (characterLevel < MIN_LEVEL) {
    return err(
      validationError(
        "LEECH_INVALID_LEVEL",
        `characterLevel < ${MIN_LEVEL} (minimalny level gracza), otrzymano ${characterLevel}`,
      ),
    );
  }
  if (characterLevel > MAX_LEVEL) {
    return err(
      validationError(
        "LEECH_INVALID_LEVEL",
        `characterLevel > ${MAX_LEVEL} poza zakresem Tibii, otrzymano ${characterLevel}`,
      ),
    );
  }

  // ── Walidacja partyMemberLevel ──
  if (!Number.isFinite(partyMemberLevel)) {
    return err(
      validationError(
        "LEECH_INVALID_LEVEL",
        `partyMemberLevel musi być liczbą skończoną, otrzymano ${partyMemberLevel}`,
      ),
    );
  }
  if (!Number.isInteger(partyMemberLevel)) {
    return err(
      validationError(
        "LEECH_INVALID_LEVEL",
        `partyMemberLevel musi być integerem, otrzymano ${partyMemberLevel}`,
      ),
    );
  }
  if (partyMemberLevel < MIN_LEVEL) {
    return err(
      validationError(
        "LEECH_INVALID_LEVEL",
        `partyMemberLevel < ${MIN_LEVEL} (minimalny level gracza), otrzymano ${partyMemberLevel}`,
      ),
    );
  }
  if (partyMemberLevel > MAX_LEVEL) {
    return err(
      validationError(
        "LEECH_INVALID_LEVEL",
        `partyMemberLevel > ${MAX_LEVEL} poza zakresem Tibii, otrzymano ${partyMemberLevel}`,
      ),
    );
  }

  // ── Walidacja opcji ──
  const reductionPerLevel = options.reductionPerLevel ?? LEECH_REDUCTION_PER_LEVEL_DEFAULT;
  if (!Number.isFinite(reductionPerLevel) || reductionPerLevel < 0 || reductionPerLevel > 1) {
    return err(
      validationError(
        "LEECH_INVALID_OPTIONS",
        `reductionPerLevel musi być ∈ [0, 1], otrzymano ${reductionPerLevel}`,
      ),
    );
  }

  // vocation jest parametrem zarezerwowanym (Tibia nie różnicuje
  // XP share per konkretna vocation). Wymuszamy unused-check przez void.
  void vocation;

  // ── Obliczenia ──
  const levelDiff = Math.abs(characterLevel - partyMemberLevel);
  const withinLegalRange = withinLegalTibiaRange(characterLevel, partyMemberLevel);
  const isLeechUpward = characterLevel < partyMemberLevel;

  // Poza legal range → Tibia nie pozwala na party XP share.
  if (!withinLegalRange) {
    return ok({
      sharePct: 0,
      levelDiff,
      withinLegalRange: false,
      isLeechUpward,
      equalSplit: false,
    });
  }

  // Leech w górę (characterLevel < partyMemberLevel, ale w ramach
  // legal range) → community convention: leech w górę to "reverse
  // leech", zwykle niedopuszczalny w Tibia community. Zwracamy 0.
  if (isLeechUpward) {
    return ok({
      sharePct: 0,
      levelDiff,
      withinLegalRange: true,
      isLeechUpward: true,
      equalSplit: false,
    });
  }

  // Równe poziomy → 50/50 split.
  if (levelDiff === 0) {
    return ok({
      sharePct: LEECH_BASE_SHARE_PCT,
      levelDiff: 0,
      withinLegalRange: true,
      isLeechUpward: false,
      equalSplit: true,
    });
  }

  // Redukcja community convention: per level diff.
  const reduction = levelDiff * reductionPerLevel * LEECH_BASE_SHARE_PCT;
  let sharePct = LEECH_BASE_SHARE_PCT - reduction;

  // Zabezpieczenie: floor do 0 jeśli redukcja przekracza BASE.
  if (sharePct < LEECH_MIN_SHARE_PCT) sharePct = LEECH_MIN_SHARE_PCT;

  return ok({
    sharePct,
    levelDiff,
    withinLegalRange: true,
    isLeechUpward: false,
    equalSplit: false,
  });
}