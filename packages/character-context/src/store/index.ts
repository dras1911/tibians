/**
 * @tibians/character-context — store barrel.
 *
 * Publiczne API reaktywnego store'a nad `CharacterSnapshot`.
 * Konsumenci (apps/web, kalkulatory, valuation, what-if) importują z tego
 * pliku, żeby nie zależeć od wewnętrznej struktury katalogów.
 */

// ──────────────────────────────────────────────────────────────────────────
// Store — vanilla (bez React)
// ──────────────────────────────────────────────────────────────────────────

export {
  characterStore,
  createCharacterStore,
  CorruptedSnapshotUrlError,
  type CharacterStore,
  type CharacterStoreState,
  type CharacterStoreActions,
  type NestedPath,
  type ResolvePath,
} from "./character-store.js";

// ──────────────────────────────────────────────────────────────────────────
// Hook — React wrapper (SSR-safe)
// ──────────────────────────────────────────────────────────────────────────

export {
  useCharacterStore,
  useCharacterStoreShallow,
  useCharacterStoreFromInstance,
  useShallow,
} from "./use-character-store.js";

// ──────────────────────────────────────────────────────────────────────────
// Selektory
// ──────────────────────────────────────────────────────────────────────────

export {
  // Single-skill
  selectSkill,
  selectSkillBase,
  selectSkillLoyalty,
  selectSkillPercentToNext,
  // Aggregate skills
  selectAllSkillBases,
  selectTotalSkillBase,
  // Flags
  selectHasFlag,
  selectBlessingsActive,
  // Progress
  selectQuestsProgressPercent,
  selectImbuementsProgressPercent,
  selectProgressPercentages,
  type ProgressPercentages,
  // Identity
  selectLevel,
  selectName,
  selectVocation,
  // Assets
  selectItemCount,
  selectOutfitCount,
  selectMountCount,
  selectTotalGems,
  selectGoldTotal,
  // Aggregate / derived
  selectValueConfidence,
  selectHasAuctionContext,
  selectHoursUntilAuctionEnd,
  selectAuctionHighlights,
  type AuctionHighlights,
} from "./selectors.js";
