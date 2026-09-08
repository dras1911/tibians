/**
 * @tibians/character-context — `formDataToSnapshot`.
 *
 * Konwertuje dane z **minimalnego formularza ręcznego** (Workspace,
 * task 10) na pełny `CharacterSnapshot` (Zod-walidowany, arch. §13.1).
 *
 * Dlaczego osobny typ `ManualFormData`:
 *   - Formularz ręczny ma **płaską** strukturę (name, level, vocation, …)
 *     plus powtarzalne sekcje (items, outfits) zdefiniowane jako listy
 *     "pustych rekordów" do wypełnienia w UI.
 *   - Snapshot jest zagnieżdżony (`skills: Record<SkillKey, …>`,
 *     `flags`, `assets`) — nieodpowiedni jako bezpośredni target `<form>`.
 *   - Wspólna płaszczyzna (form) → walidacja Zod → snapshot = jedno
 *     źródło prawdy dla kontraktu UI ↔ core.
 *
 * Arch. §13.2: trzy źródła snapshotu (auction/manual/imported).
 * Formularz ręczny tworzy ZAWSZE `source: { kind: 'manual' }`.
 *
 * Reguły transformacji:
 *   1. `source` ustawione na `manual` (formularz ręczny)
 *   2. `auction` NIE jest ustawiane (manual nie ma kontekstu aukcji)
 *   3. brakujące pola skille = `{ base: 0 }`
 *   4. puste listy (items/outfits/mounts) zachowane jako `[]`
 *   5. `tcInvested` opcjonalne (premium w UI)
 *   6. walidacja Zod w `CharacterSnapshotSchema.parse` — wyjątek
 *      jeśli cokolwiek nie spełnia reguł (np. level < 8, gems < 0).
 */
import { CharacterSnapshotSchema, type CharacterSnapshot } from "../schema.js";
import type { VocationBase, VocationPromoted, SkillKey } from "../schema.js";
import { SKILL_KEYS } from "../schema.js";

// ──────────────────────────────────────────────────────────────────────────
// Typ formularza ręcznego (arch. §13.1 + task 10)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Promowana klasa jest **deterministyczna** z bazowej:
 *   Knight → Elite Knight
 *   Paladin → Royal Paladin
 *   Druid → Elder Druid
 *   Sorcerer → Master Sorcerer
 *   Monk → Exalted Monk
 *
 * Pozwala to formularzowi wybrać `vocation` i wyliczyć `vocationPromoted`
 * automatycznie (bez osobnego selecta) — mniejsza szansa na niezgodność.
 */
export const VOCATION_BASE_TO_PROMOTED = {
  Knight: "Elite Knight",
  Paladin: "Royal Paladin",
  Druid: "Elder Druid",
  Sorcerer: "Master Sorcerer",
  Monk: "Exalted Monk",
} as const satisfies Record<VocationBase, VocationPromoted>;

/**
 * Płaski kształt formularza ręcznego — cel `<form>` w React.
 *
 * Decyzje projektowe:
 *   - wszystkie pola numeryczne jako `number` (input type=number)
 *   - opcjonalne pola (`world`, `tcInvested`) jako `number | undefined`
 *   - skille jako `Record<SkillKey, number>` (spłaszczone — UI nie
 *     musi znać struktury `SkillEntry`, bo loyaltyPct i percentToNext
 *     są dostępne osobno jako opcjonalne pola)
 *   - items/outfits/mounts jako proste listy rekordów
 */
export interface ManualFormData {
  // ── identity ─────────────────────────────────────────────────────────
  /** Nazwa postaci (np. "Migzen"). Wymagane. */
  name: string;
  /** Poziom 8..2500. Wymagane. */
  level: number;
  /** Bazowa klasa (5 opcji). Wymagane. */
  vocation: VocationBase;
  /** Płeć: 'M' | 'F'. Wymagane. */
  sex: "M" | "F";
  /** Świat (np. "Jadebra"). Opcjonalne — gracze prywatni często pomijają. */
  world?: string;

  // ── skills (spłaszczone `base` per skill) ──────────────────────────
  /** Bazowy skill 0..N dla każdego z 8 skilli (bez loyalty bonusu). */
  skillsBase: Record<SkillKey, number>;
  /** Loyalty % dla każdego skilla (0/5/10/.../50). Opcjonalne per skill. */
  skillsLoyaltyPct?: Partial<Record<SkillKey, 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50>>;
  /** Procent do następnego poziomu (0..100) per skill. Opcjonalne. */
  skillsPercentToNext?: Partial<Record<SkillKey, number>>;

  // ── progression ─────────────────────────────────────────────────────
  charmPoints: number;
  charmPointsUnused: number;
  minorCharmEchoes: number;
  bossPoints: number;
  questsCompleted: number;
  questsTotal: number;
  imbuementsUnlocked: number;
  imbuementsTotal: number;
  achievementPoints: number;
  animusMasteries: number;

  // ── assets ──────────────────────────────────────────────────────────
  items: Array<{ itemId: number; quantity: number; tier?: 0 | 1 | 2 | 3 }>;
  outfits: Array<{ outfitId: number; addons: number }>;
  mounts: number[];
  gemsLesser: number;
  gemsRegular: number;
  gemsGreater: number;
  goldTotal: number;
  /** Zainwestowane Tibia Coins. Opcjonalne (premium). */
  tcInvested?: number;
  storeOutfits: number;
  storeMounts: number;
  storeItems: number;
  hirelings: number;

  // ── flags ───────────────────────────────────────────────────────────
  soulWar: boolean;
  primalOrdeal: boolean;
  worldTransfer: boolean;
  preySlot: boolean;
  charmExpansion: boolean;
  weeklyTaskExpansion: boolean;
  twistOfFate: boolean;
  /** Liczba aktywnych błogosławieństw 0..7. */
  blessingsActive: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Transformacja rdzeniowa
// ──────────────────────────────────────────────────────────────────────────

/**
 * Formularz ręczny → `CharacterSnapshot`.
 *
 * **Zachowanie:**
 *   - `source` → `{ kind: 'manual' }` (formularz ręczny, arch. §13.2)
 *   - `identity.vocationPromoted` wyliczane z `vocation`
 *     (brak pola w formularzu — mniejsza szansa na niezgodność)
 *   - `skills` składane z 3 płaskich map (`skillsBase`, `skillsLoyaltyPct`,
 *     `skillsPercentToNext`) w `Record<SkillKey, SkillEntry>`
 *   - `auction` NIE ustawiane (manual = brak kontekstu aukcji)
 *   - walidacja Zod przez `CharacterSnapshotSchema.parse` —
 *     wyjątek jeśli cokolwiek jest niepoprawne
 *
 * **Czemu używamy `parse` (nie `safeParse`):**
 *   - task 10 mówi "scheme validation" — nie chcemy silent fail
 *   - UI formularza powinien pokazać błąd konkretnego pola
 *     (a formularz NIE powinien dopuszczać wysłania invalid danych)
 *
 * @throws {z.ZodError} gdy formularz zawiera niepoprawne dane.
 */
export function formDataToSnapshot(form: ManualFormData): CharacterSnapshot {
  // ── Skille: składanie 3 map → Record<SkillKey, SkillEntry> ────────
  const skills = {} as CharacterSnapshot["skills"];
  for (const key of SKILL_KEYS) {
    const base = form.skillsBase[key] ?? 0;
    const loyaltyPct = form.skillsLoyaltyPct?.[key];
    const percentToNext = form.skillsPercentToNext?.[key];
    skills[key] = {
      base,
      ...(loyaltyPct !== undefined ? { loyaltyPct } : {}),
      ...(percentToNext !== undefined ? { percentToNext } : {}),
    };
  }

  // ── Budowa kandydata snapshotu ────────────────────────────────────
  // `exactOptionalPropertyTypes: true` w tsconfig wymaga, żeby pola
  // opcjonalne były pomijane (nie ustawiane na undefined) — stąd
  // conditional spread `...(x !== undefined ? { x } : {})`.
  const candidate: CharacterSnapshot = {
    source: { kind: "manual" },
    identity: {
      name: form.name,
      level: form.level,
      vocation: form.vocation,
      vocationPromoted: VOCATION_BASE_TO_PROMOTED[form.vocation],
      sex: form.sex,
      ...(form.world !== undefined && form.world !== ""
        ? { world: form.world }
        : {}),
    },
    skills,
    progression: {
      charmPoints: form.charmPoints,
      charmPointsUnused: form.charmPointsUnused,
      minorCharmEchoes: form.minorCharmEchoes,
      bossPoints: form.bossPoints,
      questsCompleted: form.questsCompleted,
      questsTotal: form.questsTotal,
      imbuementsUnlocked: form.imbuementsUnlocked,
      imbuementsTotal: form.imbuementsTotal,
      achievementPoints: form.achievementPoints,
      animusMasteries: form.animusMasteries,
    },
    assets: {
      items: form.items,
      outfits: form.outfits,
      mounts: form.mounts,
      gems: {
        lesser: form.gemsLesser,
        regular: form.gemsRegular,
        greater: form.gemsGreater,
      },
      goldTotal: form.goldTotal,
      ...(form.tcInvested !== undefined ? { tcInvested: form.tcInvested } : {}),
      storeCounts: {
        outfits: form.storeOutfits,
        mounts: form.storeMounts,
        items: form.storeItems,
      },
      hirelings: form.hirelings,
    },
    flags: {
      soulWar: form.soulWar,
      primalOrdeal: form.primalOrdeal,
      worldTransfer: form.worldTransfer,
      preySlot: form.preySlot,
      charmExpansion: form.charmExpansion,
      weeklyTaskExpansion: form.weeklyTaskExpansion,
      twistOfFate: form.twistOfFate,
      blessingsActive: form.blessingsActive,
    },
    // auction: NIE ustawione (manual nie ma kontekstu aukcji)
  };

  // ── Walidacja Zod (ostateczna bramka) ────────────────────────────
  return CharacterSnapshotSchema.parse(candidate);
}
