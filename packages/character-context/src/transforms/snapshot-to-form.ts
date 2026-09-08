/**
 * @tibians/character-context — `snapshotToFormData`.
 *
 * Odwrotność `formDataToSnapshot` — konwertuje dowolny `CharacterSnapshot`
 * (auction/manual/imported) na `ManualFormData` gotowy do wypełnienia
 * w formularzu ręcznym Workspace.
 *
 * Użycie (task 11/12):
 *   - Zustand store `loadFromManual(form)` → formularz UI
 *   - Zustand store `loadFromAuction(snapshot)` → snapshot z aukcji
 *     → `snapshotToFormData(snap)` → formularz UI (gracz edytuje,
 *     zmienia poziom itp. → `formDataToSnapshot` → nowy snapshot)
 *   - Edycja "Moje postacie" (localStorage, task 12)
 *
 * Reguły transformacji (odwrotność `formDataToSnapshot`):
 *   1. `vocation` ← `identity.vocation` (bierzemy bazową, promowana
 *      jest wyliczana automatycznie)
 *   2. `skillsBase/skillsLoyaltyPct/skillsPercentToNext` ← spłaszczenie
 *      `Record<SkillKey, SkillEntry>` na 3 mapy
 *   3. `auction` jest IGNOROWANE (formularz ręczny nie ma kontekstu
 *      aukcji — jeśli snapshot pochodzi z aukcji, te pola są tracone)
 *   4. `source` IGNOROWANE (zawsze wyjściowy formularz jest ręczny)
 *   5. opcjonalne pola (`world`, `tcInvested`) pomijane gdy undefined
 *      (zachowanie symetryczne do `formDataToSnapshot`)
 *
 * @throws Error jeśli snapshot nie jest poprawny (nie powinno się zdarzyć
 *   po `CharacterSnapshotSchema.parse`, ale trzymamy asercję dla pewności).
 */
import { SKILL_KEYS, type CharacterSnapshot, type SkillKey } from "../schema.js";
import type { ManualFormData } from "./form-to-snapshot.js";

/**
 * Snapshot → formularz ręczny.
 *
 * **Czemu nie sprawdzamy `source.kind === 'manual'`:**
 *   - Aplikacja może załadować snapshot z aukcji, wyświetlić go jako
 *     formularz ręczny do edycji ("co jeśli kupię i dobiję sword do 120?"
 *     — scenariusze what-if, arch. §13.3 punkt 2). Ignorujemy `source`
 *     i `auction`, traktując dane jak "zwykłe pole do edycji".
 *   - Pola source-specific (`auctionId`, `bid`, `auctionStart`...) są
 *     kontekstowo stracone — i tak nie ma ich w formularzu ręcznym.
 */
export function snapshotToFormData(snapshot: CharacterSnapshot): ManualFormData {
  // ── Skille: Record<SkillKey, SkillEntry> → 3 płaskie mapy ────────
  const skillsBase = {} as Record<SkillKey, number>;
  const skillsLoyaltyPct: Partial<
    Record<SkillKey, 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50>
  > = {};
  const skillsPercentToNext: Partial<Record<SkillKey, number>> = {};

  for (const key of SKILL_KEYS) {
    const entry = snapshot.skills[key];
    skillsBase[key] = entry.base;
    if (entry.loyaltyPct !== undefined) {
      // Zod już gwarantuje że loyaltyPct to jeden z dozwolonych progów.
      skillsLoyaltyPct[key] = entry.loyaltyPct;
    }
    if (entry.percentToNext !== undefined) {
      skillsPercentToNext[key] = entry.percentToNext;
    }
  }

  // ── world: tylko jeśli niepusty (symetrycznie do formDataToSnapshot)
  const world = snapshot.identity.world;

  // ── tcInvested: tylko jeśli obecne (symetrycznie) ────────────────
  const tcInvested = snapshot.assets.tcInvested;

  return {
    name: snapshot.identity.name,
    level: snapshot.identity.level,
    vocation: snapshot.identity.vocation,
    sex: snapshot.identity.sex,
    ...(world !== undefined && world !== "" ? { world } : {}),
    skillsBase,
    ...(Object.keys(skillsLoyaltyPct).length > 0
      ? { skillsLoyaltyPct }
      : {}),
    ...(Object.keys(skillsPercentToNext).length > 0
      ? { skillsPercentToNext }
      : {}),
    charmPoints: snapshot.progression.charmPoints,
    charmPointsUnused: snapshot.progression.charmPointsUnused,
    minorCharmEchoes: snapshot.progression.minorCharmEchoes,
    bossPoints: snapshot.progression.bossPoints,
    questsCompleted: snapshot.progression.questsCompleted,
    questsTotal: snapshot.progression.questsTotal,
    imbuementsUnlocked: snapshot.progression.imbuementsUnlocked,
    imbuementsTotal: snapshot.progression.imbuementsTotal,
    achievementPoints: snapshot.progression.achievementPoints,
    animusMasteries: snapshot.progression.animusMasteries,
    items: snapshot.assets.items.map((item) => {
      const base = { itemId: item.itemId, quantity: item.quantity };
      return item.tier !== undefined ? { ...base, tier: item.tier } : base;
    }),
    outfits: snapshot.assets.outfits.map((o) => ({
      outfitId: o.outfitId,
      addons: o.addons,
    })),
    mounts: [...snapshot.assets.mounts],
    gemsLesser: snapshot.assets.gems.lesser,
    gemsRegular: snapshot.assets.gems.regular,
    gemsGreater: snapshot.assets.gems.greater,
    goldTotal: snapshot.assets.goldTotal,
    ...(tcInvested !== undefined ? { tcInvested } : {}),
    storeOutfits: snapshot.assets.storeCounts.outfits,
    storeMounts: snapshot.assets.storeCounts.mounts,
    storeItems: snapshot.assets.storeCounts.items,
    hirelings: snapshot.assets.hirelings,
    soulWar: snapshot.flags.soulWar,
    primalOrdeal: snapshot.flags.primalOrdeal,
    worldTransfer: snapshot.flags.worldTransfer,
    preySlot: snapshot.flags.preySlot,
    charmExpansion: snapshot.flags.charmExpansion,
    weeklyTaskExpansion: snapshot.flags.weeklyTaskExpansion,
    twistOfFate: snapshot.flags.twistOfFate,
    blessingsActive: snapshot.flags.blessingsActive,
  };
}
