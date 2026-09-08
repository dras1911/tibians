/**
 * @tibians/character-context — memoized selectors.
 *
 * Selektory zwracają **wyprowadzone** dane ze snapshota — używane przez
 * kalkulatory i panele UI, żeby nie powtarzać logiki „wyciągnij X ze
 * snapshota" w wielu miejscach. Same selektory są **czystymi funkcjami**;
 * memoizacja dzieje się po stronie Reacta (`useShallow` z Zustand 5).
 *
 * Zasada (arch. §13.4):
 *   - „Nie trzymaj w store danych pochodnych (computed values) — licz na
 *      bieżąco". Te selektory są **leniwe** i **bezstanowe** — konsument
 *      woła je w `useMemo` lub `useCharacterStore(useShallow(selector))`.
 */
import type { CharacterSnapshot, SkillKey } from "../schema.js";
import { computeValueConfidence } from "../value-confidence.js";

// ──────────────────────────────────────────────────────────────────────────
// Single-skill selectors
// ──────────────────────────────────────────────────────────────────────────

/**
 * Selektor pojedynczego skilla (np. `selectSkill('magic')`).
 * Zwraca `SkillEntry` — pełny obiekt z `base`, `loyaltyPct`, `percentToNext`.
 */
export const selectSkill =
  (key: SkillKey) =>
  (snapshot: CharacterSnapshot) =>
    snapshot.skills[key];

/**
 * Wyciąga `base` pojedynczego skilla (najczęściej potrzebna wartość
 * w kalkulatorach — zwykle pomijamy loyalty, bo Bazaar je pokazuje bez).
 */
export const selectSkillBase =
  (key: SkillKey) =>
  (snapshot: CharacterSnapshot): number =>
    snapshot.skills[key].base;

/** Wyciąga `loyaltyPct` skilla (albo `undefined` gdy brak). */
export const selectSkillLoyalty =
  (key: SkillKey) =>
  (snapshot: CharacterSnapshot): number | undefined =>
    snapshot.skills[key].loyaltyPct;

/** Wyciąga `percentToNext` skilla (albo `undefined` gdy brak). */
export const selectSkillPercentToNext =
  (key: SkillKey) =>
  (snapshot: CharacterSnapshot): number | undefined =>
    snapshot.skills[key].percentToNext;

// ──────────────────────────────────────────────────────────────────────────
// Aggregate skill selectors
// ──────────────────────────────────────────────────────────────────────────

/**
 * Mapa `Record<SkillKey, number>` — same `base` wszystkich skilli.
 * Wygodne dla widoków radar chart (Recharts) i tabel skróconych.
 */
export function selectAllSkillBases(
  snapshot: CharacterSnapshot,
): Record<SkillKey, number> {
  const out = {} as Record<SkillKey, number>;
  for (const key of Object.keys(snapshot.skills) as SkillKey[]) {
    out[key] = snapshot.skills[key].base;
  }
  return out;
}

/**
 * Suma bazowych skilli (suma wszystkich 8 baz).
 * Przydatna do szybkiego „siła postaci" w UI.
 */
export function selectTotalSkillBase(snapshot: CharacterSnapshot): number {
  let total = 0;
  for (const key of Object.keys(snapshot.skills) as SkillKey[]) {
    total += snapshot.skills[key].base;
  }
  return total;
}

// ──────────────────────────────────────────────────────────────────────────
// Flag selectors
// ──────────────────────────────────────────────────────────────────────────

/**
 * Sprawdza czy flaga boolean jest ustawiona (np. Soul War, Primal Ordeal).
 * Type-safe — `flag` musi być kluczem boola w `flags`.
 */
export function selectHasFlag<K extends "soulWar" | "primalOrdeal" | "worldTransfer" | "preySlot" | "charmExpansion" | "weeklyTaskExpansion" | "twistOfFate">(
  flag: K,
) {
  return (snapshot: CharacterSnapshot): boolean => snapshot.flags[flag];
}

/**
 * Liczba aktywnych błogosławieństw (0..7).
 */
export const selectBlessingsActive = (snapshot: CharacterSnapshot): number =>
  snapshot.flags.blessingsActive;

// ──────────────────────────────────────────────────────────────────────────
// Progress selectors
// ──────────────────────────────────────────────────────────────────────────

/**
 * Procent ukończenia questów (0..100). Zwraca 0 gdy total=0 (dzielnik zero).
 */
export function selectQuestsProgressPercent(snapshot: CharacterSnapshot): number {
  const { questsCompleted, questsTotal } = snapshot.progression;
  if (questsTotal === 0) return 0;
  return Math.min(100, (questsCompleted / questsTotal) * 100);
}

/**
 * Procent ukończenia imbuementów (0..100). Zwraca 0 gdy total=0.
 */
export function selectImbuementsProgressPercent(
  snapshot: CharacterSnapshot,
): number {
  const { imbuementsUnlocked, imbuementsTotal } = snapshot.progression;
  if (imbuementsTotal === 0) return 0;
  return Math.min(100, (imbuementsUnlocked / imbuementsTotal) * 100);
}

/**
 * Batch wszystkich procentów ukończenia (do wyświetlania w jednym
 * progress barze). Memoizacja po stronie Reacta (`useShallow`).
 */
export interface ProgressPercentages {
  quests: number;
  imbuements: number;
}

export function selectProgressPercentages(
  snapshot: CharacterSnapshot,
): ProgressPercentages {
  return {
    quests: selectQuestsProgressPercent(snapshot),
    imbuements: selectImbuementsProgressPercent(snapshot),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Identity selectors
// ──────────────────────────────────────────────────────────────────────────

/** Poziom postaci. */
export const selectLevel = (snapshot: CharacterSnapshot): number =>
  snapshot.identity.level;

/** Nazwa postaci. */
export const selectName = (snapshot: CharacterSnapshot): string =>
  snapshot.identity.name;

/** Bazowa klasa (Knight, Paladin, …). */
export const selectVocation = (snapshot: CharacterSnapshot) =>
  snapshot.identity.vocation;

// ──────────────────────────────────────────────────────────────────────────
// Assets selectors
// ──────────────────────────────────────────────────────────────────────────

/** Ile itemów w inventory. */
export const selectItemCount = (snapshot: CharacterSnapshot): number =>
  snapshot.assets.items.length;

/** Ile posiadanych outfitów. */
export const selectOutfitCount = (snapshot: CharacterSnapshot): number =>
  snapshot.assets.outfits.length;

/** Ile posiadanych mountów. */
export const selectMountCount = (snapshot: CharacterSnapshot): number =>
  snapshot.assets.mounts.length;

/** Łączna liczba gemów (lesser+regular+greater). */
export function selectTotalGems(snapshot: CharacterSnapshot): number {
  const { lesser, regular, greater } = snapshot.assets.gems;
  return lesser + regular + greater;
}

/** Łączna wartość gold (inventory + bank + depot). */
export const selectGoldTotal = (snapshot: CharacterSnapshot): number =>
  snapshot.assets.goldTotal;

// ──────────────────────────────────────────────────────────────────────────
// Aggregate / derived
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pewność wyceny (0..1). Re-eksport z `value-confidence.ts` dla wygody
 * komponentów, które nie chcą importować z wielu miejsc.
 */
export const selectValueConfidence = (snapshot: CharacterSnapshot): number =>
  computeValueConfidence(snapshot);

/**
 * Czy snapshot ma kontekst aukcji (szybka flaga dla UI).
 */
export const selectHasAuctionContext = (snapshot: CharacterSnapshot): boolean =>
  snapshot.source.kind === "auction" && snapshot.auction !== undefined;

/**
 * Ile godzin do końca aukcji (albo `null` gdy brak aukcji / zakończona).
 * Używa `Date.now()` — **nie jest czysta** (zależy od czasu systemowego).
 * Traktuj jako helper UI, nie jako funkcję kalkulacyjną.
 */
export function selectHoursUntilAuctionEnd(
  snapshot: CharacterSnapshot,
): number | null {
  if (snapshot.auction === undefined) return null;
  const end = Date.parse(snapshot.auction.auctionEnd);
  if (Number.isNaN(end)) return null;
  const diff = end - Date.now();
  return diff / 3_600_000;
}

/**
 * Batch wszystkich „highlightowanych" pól dla karty aukcji UI.
 * Memoizowany po stronie Reacta (`useShallow` z Zustand 5).
 */
export interface AuctionHighlights {
  level: number;
  vocation: CharacterSnapshot["identity"]["vocation"];
  soulWar: boolean;
  primalOrdeal: boolean;
  totalGems: number;
  imbuementsPercent: number;
  charmPoints: number;
  bossPoints: number;
}

export function selectAuctionHighlights(
  snapshot: CharacterSnapshot,
): AuctionHighlights {
  return {
    level: snapshot.identity.level,
    vocation: snapshot.identity.vocation,
    soulWar: snapshot.flags.soulWar,
    primalOrdeal: snapshot.flags.primalOrdeal,
    totalGems: selectTotalGems(snapshot),
    imbuementsPercent: selectImbuementsProgressPercent(snapshot),
    charmPoints: snapshot.progression.charmPoints,
    bossPoints: snapshot.progression.bossPoints,
  };
}
