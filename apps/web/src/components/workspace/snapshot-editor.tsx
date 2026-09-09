"use client";

/**
 * @file snapshot-editor.tsx
 *
 * Edytowalny snapshot w /workspace — "Scenariusze what-if" (plan T26,
 * arch. §13.3, §13.4). Pozwala graczowi modyfikować dowolne pole
 * snapshota i obserwować, jak WSZYSTKIE panele (T25) przeliczają się
 * na żywo w <16 ms.
 *
 * Architektura:
 *   - Store: `useCharacterStore` z T11 (jedyne źródło prawdy). Edycja
 *     mutuje `snapshot` przez `updateNestedField` — Zustand notyfikuje
 *     subskrybentów (panele T25), którzy przeliczają się same.
 *   - Edit mode: stan lokalny w `SnapshotEditorProvider`. W trybie edycji
 *     zapamiętujemy `baseSnapshot` (pierwotny snapshot). Przycisk
 *     "Zastosuj" commituje (nowy base), "Cofnij" przywraca.
 *   - Undo/Redo: stos 10 snapshotów (Ctrl+Z / Ctrl+Shift+Z).
 *   - Walidacja: per pole (zakresy z schema.ts — IdentitySchema itd.).
 *
 * Design (zachowuje spójność z design-systemem):
 *   - Badge `variant="warning"` w nagłówku (badge w kolorze amber).
 *   - Slider dla pól numerycznych (8-2500 dla levelu, 0-200/300 dla skili).
 *   - Select dla vocation (5 bazowych klas).
 *   - Radio-group dla sex (M / F).
 *   - Input dla world (z opcjonalną listą Select popularnych światów).
 *   - Każde pole ma `<Label>` + opcjonalny `<p>` dla błędów.
 *
 * Performance:
 *   - Każde wywołanie `updateNestedField` → nowy immutable snapshot
 *     → tylko subskrybenci zmienionych ścieżek re-renderują.
 *   - T11 zmierzył 100 aktualizacji w ~22 ms (śr. 0.22 ms/update) —
 *     bench jest OK dla wymogu <16 ms / zmiana.
 *   - Brak debounce — użytkownik oczekuje instant feedback (arch §13.3).
 */

import * as React from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Pencil,
  PencilOff,
  RotateCcw,
  Save,
  Sparkles,
  Undo2,
  Redo2,
} from "lucide-react";

import {
  characterStore,
  useCharacterStore,
  useCharacterStoreShallow,
  VocationBaseSchema,
  SexSchema,
  SKILL_KEYS,
  type CharacterSnapshot,
  type SkillKey,
  type VocationBase,
  type VocationPromoted,
  type Sex,
} from "@tibians/character-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────
// Field ranges — mirrors Zod schema z packages/character-context
// ───────────────────────────────────────────────────────────────────────

/** Boundy dla sliderów pól numerycznych (single source of truth). */
const FIELD_RANGES = {
  level: { min: 8, max: 2500, step: 1 },
  charmPoints: { min: 0, max: 9000, step: 10 },
  bossPoints: { min: 0, max: 100000, step: 50 },
  questsCompleted: { min: 0, max: 42, step: 1 },
  imbuementsUnlocked: { min: 0, max: 23, step: 1 },
  goldTotal: { min: 0, max: 99_999_999, step: 1000 },
  storeOutfitsCount: { min: 0, max: 999, step: 1 },
  storeMountsCount: { min: 0, max: 999, step: 1 },
} as const;

/** Skille: 0–200 domyślnie, ale magic/shielding mają wyższy cap (Tibia cap). */
const SKILL_RANGES: Record<SkillKey, { min: number; max: number }> = {
  magic: { min: 0, max: 300 },
  shielding: { min: 0, max: 300 },
  club: { min: 0, max: 200 },
  fist: { min: 0, max: 200 },
  sword: { min: 0, max: 200 },
  axe: { min: 0, max: 200 },
  distance: { min: 0, max: 200 },
  fishing: { min: 0, max: 200 },
};

/** Max. snapshotów w historii undo/redo. */
const HISTORY_LIMIT = 10;

/** Bazowa vocation → promowana para (muszą być zgodne — schema.refine). */
const VOCATION_PROMOTION: Record<VocationBase, VocationPromoted> = {
  Knight: "Elite Knight",
  Paladin: "Royal Paladin",
  Druid: "Elder Druid",
  Sorcerer: "Master Sorcerer",
  Monk: "Exalted Monk",
};

/** 20 najpopularniejszych światów (do Select "World"). Reszta = Input. */
const COMMON_WORLDS: readonly string[] = [
  "Antica",
  "Astera",
  "Belobra",
  "Calmera",
  "Carnera",
  "Fidera",
  "Funera",
  "Garnera",
  "Harmonia",
  "Helia",
  "Honera",
  "Impera",
  "Jadebra",
  "Kandara",
  "Luminera",
  "Monstera",
  "Nefera",
  "Pacera",
  "Premia",
  "Secura",
] as const;

/** Sentinel w Select dla "Inny / wpisz własny". */
const WORLD_CUSTOM_VALUE = "__custom__";

// ───────────────────────────────────────────────────────────────────────
// Context — shared edit-mode state
// ───────────────────────────────────────────────────────────────────────

/** Stan edytora udostępniany przez Context. */
export interface SnapshotEditorState {
  /** Czy tryb edycji jest włączony. */
  editMode: boolean;
  /** Włącz / wyłącz tryb edycji. */
  setEditMode: (on: boolean) => void;
  /** Pierwotny snapshot (z momentu wejścia w tryb edycji / ostatniego Apply). */
  baseSnapshot: CharacterSnapshot | null;
  /** True gdy aktualny snapshot !== baseSnapshot. */
  isDirty: boolean;
  /** Commit: obecny snapshot staje się nowym base. Czyści historię. */
  apply: () => void;
  /** Przywróć baseSnapshot do store. Czyści historię. */
  revert: () => void;
  /** Cofnij ostatnią zmianę (Ctrl+Z). */
  undo: () => void;
  /** Ponów ostatnią zmianę (Ctrl+Shift+Z). */
  redo: () => void;
  /** Czy undo/redo są dostępne. */
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Wrapper dla mutacji z auto-commit (push undo przed zmianą).
   * Każda funkcja pushuje poprzedni snapshot na undo stack, potem
   * wywołuje odpowiedni `updateNestedField`.
   */
  setSkillBase: (skill: SkillKey, value: number) => void;
  setLevel: (value: number) => void;
  setVocation: (value: VocationBase) => void;
  setSex: (value: Sex) => void;
  setWorld: (value: string | undefined) => void;
  setCharmPoints: (value: number) => void;
  setBossPoints: (value: number) => void;
  setQuestsCompleted: (value: number) => void;
  setImbuementsUnlocked: (value: number) => void;
  setGoldTotal: (value: number) => void;
  setStoreOutfitsCount: (value: number) => void;
  setStoreMountsCount: (value: number) => void;
}

const EditorContext = React.createContext<SnapshotEditorState | null>(null);

/**
 * Hook consumer'a wewnątrz `<SnapshotEditorProvider>`. Rzuca jeśli użyty
 * poza providerem — developer error, nie silent fallback.
 */
function useSnapshotEditorContext(): SnapshotEditorState {
  const ctx = React.useContext(EditorContext);
  if (ctx === null) {
    throw new Error(
      "useSnapshotEditor must be used inside <SnapshotEditorProvider>",
    );
  }
  return ctx;
}

// ───────────────────────────────────────────────────────────────────────
// Provider
// ───────────────────────────────────────────────────────────────────────

export interface SnapshotEditorProviderProps {
  children: React.ReactNode;
}

/**
 * Provider — trzyma `editMode`, `baseSnapshot`, `undo/redo` stosy.
 * Nie subskrybuje store'a (zero re-renderów przy edycji) — `isDirty`
 * oblicza subskrybent przez `useSnapshotEditor()`.
 */
export function SnapshotEditorProvider({
  children,
}: SnapshotEditorProviderProps) {
  // ── Edit mode ─────────────────────────────────────────────────────
  const [editMode, setEditModeState] = React.useState<boolean>(false);

  // ── Base snapshot (original) ──────────────────────────────────────
  const [baseSnapshot, setBaseSnapshot] =
    React.useState<CharacterSnapshot | null>(null);

  // ── Undo / Redo stacks ────────────────────────────────────────────
  const [undoStack, setUndoStack] = React.useState<readonly CharacterSnapshot[]>(
    [],
  );
  const [redoStack, setRedoStack] = React.useState<readonly CharacterSnapshot[]>(
    [],
  );

  // Ref do śledzenia aktualnego `baseSnapshot` w `setEditMode` (closure
  // przechwytuje wartość startową; potrzebujemy najnowszej).
  const baseSnapshotRef = React.useRef<CharacterSnapshot | null>(null);
  React.useEffect(() => {
    baseSnapshotRef.current = baseSnapshot;
  }, [baseSnapshot]);

  // ── Store actions (stabilne referencje z Zustand) ─────────────────
  const setSnapshot = useCharacterStore((s) => s.setSnapshot);
  const updateNestedField = useCharacterStore((s) => s.updateNestedField);

  /** Weź aktualny snapshot ze store (poza subskrypcją — bez re-renderu). */
  const readSnapshot = React.useCallback(() => {
    return characterStore.getState().snapshot;
  }, []);

  /** Push poprzedniego snapshota na undo i czyść redo. */
  const pushUndo = React.useCallback((previous: CharacterSnapshot) => {
    setUndoStack((stack) => {
      const next = [...stack, previous];
      return next.length > HISTORY_LIMIT
        ? next.slice(next.length - HISTORY_LIMIT)
        : next;
    });
    setRedoStack([]);
  }, []);

  // ── Entering edit mode: snapshot base + reset history ─────────────
  const setEditMode = React.useCallback(
    (on: boolean) => {
      setEditModeState(on);
      if (on) {
        // Wchodząc w tryb edycji, zamrażamy oryginał.
        setBaseSnapshot(readSnapshot());
        setUndoStack([]);
        setRedoStack([]);
      } else {
        // Wychodząc z trybu edycji, jeśli są niezatwierdzone zmiany,
        // przywracamy oryginał (użytkownik wyłączył edycję → "cancel").
        const base = baseSnapshotRef.current;
        if (base !== null) {
          const live = readSnapshot();
          if (live !== base) {
            setSnapshot(base);
          }
        }
        setBaseSnapshot(null);
        setUndoStack([]);
        setRedoStack([]);
      }
    },
    [readSnapshot, setSnapshot],
  );

  // ── Apply (commit) ────────────────────────────────────────────────
  const apply = React.useCallback(() => {
    const current = readSnapshot();
    setBaseSnapshot(current);
    setUndoStack([]);
    setRedoStack([]);
  }, [readSnapshot]);

  // ── Revert (przywróć oryginał) ────────────────────────────────────
  const revert = React.useCallback(() => {
    const base = baseSnapshotRef.current;
    if (base !== null) {
      setSnapshot(base);
    }
    setUndoStack([]);
    setRedoStack([]);
  }, [setSnapshot]);

  // ── Undo ──────────────────────────────────────────────────────────
  const undo = React.useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      if (previous === undefined) return stack;
      const current = readSnapshot();
      setRedoStack((redo) => {
        const next = [...redo, current];
        return next.length > HISTORY_LIMIT
          ? next.slice(next.length - HISTORY_LIMIT)
          : next;
      });
      setSnapshot(previous);
      return stack.slice(0, -1);
    });
  }, [readSnapshot, setSnapshot]);

  // ── Redo ──────────────────────────────────────────────────────────
  const redo = React.useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      if (next === undefined) return stack;
      const current = readSnapshot();
      setUndoStack((undo) => {
        const updated = [...undo, current];
        return updated.length > HISTORY_LIMIT
          ? updated.slice(updated.length - HISTORY_LIMIT)
          : updated;
      });
      setSnapshot(next);
      return stack.slice(0, -1);
    });
  }, [readSnapshot, setSnapshot]);

  // ── Commit-wrapped mutators (push undo przed zmianą) ──────────────
  const mutateSkillBase = React.useCallback(
    (skill: SkillKey, value: number) => {
      pushUndo(readSnapshot());
      updateNestedField(`skills.${skill}.base`, value);
    },
    [pushUndo, readSnapshot, updateNestedField],
  );

  const mutateLevel = React.useCallback(
    (value: number) => {
      pushUndo(readSnapshot());
      updateNestedField("identity.level", value);
    },
    [pushUndo, readSnapshot, updateNestedField],
  );

  const mutateVocation = React.useCallback(
    (value: VocationBase) => {
      pushUndo(readSnapshot());
      updateNestedField("identity.vocation", value);
      updateNestedField("identity.vocationPromoted", VOCATION_PROMOTION[value]);
    },
    [pushUndo, readSnapshot, updateNestedField],
  );

  const mutateSex = React.useCallback(
    (value: Sex) => {
      pushUndo(readSnapshot());
      updateNestedField("identity.sex", value);
    },
    [pushUndo, readSnapshot, updateNestedField],
  );

  const mutateWorld = React.useCallback(
    (value: string | undefined) => {
      pushUndo(readSnapshot());
      updateNestedField("identity.world", value);
    },
    [pushUndo, readSnapshot, updateNestedField],
  );

  const mutateCharmPoints = React.useCallback(
    (value: number) => {
      pushUndo(readSnapshot());
      updateNestedField("progression.charmPoints", value);
    },
    [pushUndo, readSnapshot, updateNestedField],
  );

  const mutateBossPoints = React.useCallback(
    (value: number) => {
      pushUndo(readSnapshot());
      updateNestedField("progression.bossPoints", value);
    },
    [pushUndo, readSnapshot, updateNestedField],
  );

  const mutateQuestsCompleted = React.useCallback(
    (value: number) => {
      pushUndo(readSnapshot());
      updateNestedField("progression.questsCompleted", value);
    },
    [pushUndo, readSnapshot, updateNestedField],
  );

  const mutateImbuementsUnlocked = React.useCallback(
    (value: number) => {
      pushUndo(readSnapshot());
      updateNestedField("progression.imbuementsUnlocked", value);
    },
    [pushUndo, readSnapshot, updateNestedField],
  );

  const mutateGoldTotal = React.useCallback(
    (value: number) => {
      pushUndo(readSnapshot());
      updateNestedField("assets.goldTotal", value);
    },
    [pushUndo, readSnapshot, updateNestedField],
  );

  const mutateStoreOutfitsCount = React.useCallback(
    (value: number) => {
      pushUndo(readSnapshot());
      updateNestedField("assets.storeCounts.outfits", value);
    },
    [pushUndo, readSnapshot, updateNestedField],
  );

  const mutateStoreMountsCount = React.useCallback(
    (value: number) => {
      pushUndo(readSnapshot());
      updateNestedField("assets.storeCounts.mounts", value);
    },
    [pushUndo, readSnapshot, updateNestedField],
  );

  // ── Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z) ───────────────────
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!editMode) return;
    const handler = (event: KeyboardEvent) => {
      // Pomijamy gdy focus jest w input/textarea/select/contenteditable.
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      const ctrl = event.ctrlKey || event.metaKey;
      if (!ctrl) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [editMode, undo, redo]);

  // ── Context value ─────────────────────────────────────────────────
  // `isDirty` jest leniwie obliczane przez `useSnapshotEditor` —
  // tu zwracamy `false` jako placeholder.
  const value = React.useMemo<SnapshotEditorState>(
    () => ({
      editMode,
      setEditMode,
      baseSnapshot,
      isDirty: false,
      apply,
      revert,
      undo,
      redo,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      setSkillBase: mutateSkillBase,
      setLevel: mutateLevel,
      setVocation: mutateVocation,
      setSex: mutateSex,
      setWorld: mutateWorld,
      setCharmPoints: mutateCharmPoints,
      setBossPoints: mutateBossPoints,
      setQuestsCompleted: mutateQuestsCompleted,
      setImbuementsUnlocked: mutateImbuementsUnlocked,
      setGoldTotal: mutateGoldTotal,
      setStoreOutfitsCount: mutateStoreOutfitsCount,
      setStoreMountsCount: mutateStoreMountsCount,
    }),
    [
      editMode,
      setEditMode,
      baseSnapshot,
      apply,
      revert,
      undo,
      redo,
      undoStack.length,
      redoStack.length,
      mutateSkillBase,
      mutateLevel,
      mutateVocation,
      mutateSex,
      mutateWorld,
      mutateCharmPoints,
      mutateBossPoints,
      mutateQuestsCompleted,
      mutateImbuementsUnlocked,
      mutateGoldTotal,
      mutateStoreOutfitsCount,
      mutateStoreMountsCount,
    ],
  );

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Public hook — exposes edit-mode API + flagę isDirty
// ───────────────────────────────────────────────────────────────────────

/**
 * Publiczny hook dla komponentów w obrębie `<SnapshotEditorProvider>`.
 * Zwraca `isDirty` obliczoną przez selektor Zustand (subskrybuje tylko
 * na `snapshot` gdy `editMode === true`).
 */
export function useSnapshotEditor(): SnapshotEditorState {
  const ctx = useSnapshotEditorContext();
  const baseSnapshot = ctx.baseSnapshot;
  const currentSnapshot = useCharacterStore((s) =>
    ctx.editMode ? s.snapshot : null,
  );
  const isDirty = React.useMemo(() => {
    if (!ctx.editMode || baseSnapshot === null || currentSnapshot === null) {
      return false;
    }
    // Płytkie porównanie NIE wystarczy — snapshot ma zagnieżdżone obiekty.
    // Używamy JSON compare (snapshot jest mały, < 1 KB).
    return JSON.stringify(currentSnapshot) !== JSON.stringify(baseSnapshot);
  }, [ctx.editMode, baseSnapshot, currentSnapshot]);
  return React.useMemo(
    () => ({ ...ctx, isDirty }),
    [ctx, isDirty],
  );
}

// ───────────────────────────────────────────────────────────────────────
// Header UI — Badge + Apply/Revert (do nagłówka Workspace)
// ───────────────────────────────────────────────────────────────────────

/**
 * Badge statusu edycji (dla nagłówka /workspace):
 *   - OFF  → null (ukryty)
 *   - ON + clean → "Tryb edycji — zmiany nie zapisane" (warning)
 *   - ON + dirty → "Niezapisane zmiany" (destructive)
 */
export function SnapshotEditorBadge() {
  const t = useTranslations("Workspace.editor");
  const { editMode, isDirty } = useSnapshotEditor();
  if (!editMode) return null;
  return (
    <Badge
      variant={isDirty ? "destructive" : "warning"}
      className="gap-1.5 font-semibold"
      role="status"
      aria-live="polite"
    >
      {isDirty ? <Sparkles className="h-3 w-3" aria-hidden="true" /> : null}
      {isDirty ? t("header.dirtyBadge") : t("header.badge")}
    </Badge>
  );
}

/**
 * Przyciski Apply / Revert / Undo / Redo (widoczne TYLKO gdy editMode === true).
 * Używane w nagłówku /workspace obok Switch.
 */
export function SnapshotEditorActions() {
  const t = useTranslations("Workspace.editor");
  const { editMode, isDirty, apply, revert, undo, redo, canUndo, canRedo } =
    useSnapshotEditor();
  if (!editMode) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="toolbar"
      aria-label={t("toggle.label")}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={undo}
        disabled={!canUndo}
        aria-label={t("undo.ariaLabel")}
        title={t("undo.label")}
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={redo}
        disabled={!canRedo}
        aria-label={t("undo.redoAriaLabel")}
        title={t("undo.redo")}
      >
        <Redo2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Separator orientation="vertical" className="h-6" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={revert}
        disabled={!isDirty}
        aria-label={t("revert.ariaLabel")}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        <span>{t("revert.label")}</span>
      </Button>
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={apply}
        disabled={!isDirty}
        aria-label={t("apply.ariaLabel")}
      >
        <Save className="h-4 w-4" aria-hidden="true" />
        <span>{t("apply.label")}</span>
      </Button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Field-level validator (range)
// ───────────────────────────────────────────────────────────────────────

/** Walidacja pojedynczego pola numerycznego (range). */
function validateRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

// ───────────────────────────────────────────────────────────────────────
// Panel — pełny edytor
// ───────────────────────────────────────────────────────────────────────

/**
 * Pełny panel edytora. Renderuje TYLKO gdy `editMode === true` —
 * w trybie podglądu zwraca `null` (komponenty T25 pokazują statyczny
 * widok snapshota).
 *
 * Wydajność:
 *   - Każde pole subskrybuje TYLKO swój wycinek store'a (selektory).
 *   - Zmiana levelu NIE powoduje re-renderu skill sliderów.
 *   - `useFormatter` dla liczb (grouping, locale-aware).
 */
export function SnapshotEditor() {
  const t = useTranslations("Workspace.editor");
  const { editMode } = useSnapshotEditor();
  if (!editMode) return null;

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-6"
      aria-label={t("toggle.label")}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Pencil className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">
          {t("toggle.label")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("toggle.description")}
        </p>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <IdentitySection />
        <SkillsSection />
        <ProgressionSection />
        <AssetsSection />
      </div>

      {/* Footer hint */}
      <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <PencilOff className="h-3 w-3" aria-hidden="true" />
        <span>{t("header.dirtyDescription")}</span>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Sub-sections
// ───────────────────────────────────────────────────────────────────────

function IdentitySection() {
  const t = useTranslations("Workspace.editor");
  const tFields = useTranslations("Workspace.editor.fields");
  const { setLevel, setVocation, setSex, setWorld } = useSnapshotEditor();

  const level = useCharacterStore((s) => s.snapshot.identity.level);
  const vocation = useCharacterStore((s) => s.snapshot.identity.vocation);
  const sex = useCharacterStore((s) => s.snapshot.identity.sex);
  const world = useCharacterStore((s) => s.snapshot.identity.world);

  const levelValid = validateRange(
    level,
    FIELD_RANGES.level.min,
    FIELD_RANGES.level.max,
  );

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t("sections.identity")}
      </legend>

      {/* Level slider */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="snap-editor-level">{tFields("level.label")}</Label>
          <span className="numeric text-sm font-semibold tabular-nums">
            {level}
          </span>
        </div>
        <Slider
          id="snap-editor-level"
          value={[level]}
          min={FIELD_RANGES.level.min}
          max={FIELD_RANGES.level.max}
          step={FIELD_RANGES.level.step}
          onValueChange={(values) => {
            const next = values[0] ?? FIELD_RANGES.level.min;
            setLevel(next);
          }}
          aria-describedby="snap-editor-level-help"
        />
        <p
          id="snap-editor-level-help"
          className="text-xs text-muted-foreground"
        >
          {tFields("level.help")}
        </p>
        {!levelValid ? (
          <p className="text-xs font-medium text-destructive" role="alert">
            {t("errors.levelRange")}
          </p>
        ) : null}
      </div>

      {/* Vocation select */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="snap-editor-vocation">
          {tFields("vocation.label")}
        </Label>
        <Select
          value={vocation}
          onValueChange={(value) => {
            if (
              (VocationBaseSchema.options as readonly string[]).includes(value)
            ) {
              setVocation(value as VocationBase);
            }
          }}
        >
          <SelectTrigger id="snap-editor-vocation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VocationBaseSchema.options.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {tFields("vocation.help")}
        </p>
      </div>

      {/* Sex radio (M / F) — accessible radio group */}
      <div
        className="flex flex-col gap-1.5"
        role="radiogroup"
        aria-labelledby="snap-editor-sex-label"
      >
        <span
          id="snap-editor-sex-label"
          className="text-sm font-medium leading-none"
        >
          {tFields("sex.label")}
        </span>
        <div className="flex items-center gap-2">
          {SexSchema.options.map((option) => {
            const checked = sex === option;
            const id = `snap-editor-sex-${option}`;
            return (
              <label
                key={option}
                htmlFor={id}
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border bg-muted px-4 text-sm font-medium transition-colors",
                  "hover:bg-muted/70",
                  "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                  checked
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-foreground",
                )}
              >
                <input
                  id={id}
                  type="radio"
                  name="snap-editor-sex"
                  value={option}
                  checked={checked}
                  onChange={() => {
                    setSex(option);
                  }}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                    checked
                      ? "border-primary bg-primary"
                      : "border-input bg-background",
                  )}
                  aria-hidden="true"
                >
                  {checked ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  ) : null}
                </span>
                <span>
                  {option === "M"
                    ? tFields("sex.male")
                    : tFields("sex.female")}
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{tFields("sex.help")}</p>
      </div>

      {/* World input + Select dla popularnych */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="snap-editor-world">{tFields("world.label")}</Label>
        <div className="flex items-center gap-2">
          <Input
            id="snap-editor-world"
            type="text"
            placeholder={tFields("world.placeholder")}
            value={world ?? ""}
            onChange={(event) => {
              const next = event.target.value;
              setWorld(next.length === 0 ? undefined : next);
            }}
            className="flex-1"
            maxLength={32}
          />
          <Select
            value={
              world !== undefined && COMMON_WORLDS.includes(world)
                ? world
                : WORLD_CUSTOM_VALUE
            }
            onValueChange={(value) => {
              if (value === WORLD_CUSTOM_VALUE) {
                setWorld(undefined);
              } else {
                setWorld(value);
              }
            }}
          >
            <SelectTrigger
              className="w-[160px] shrink-0"
              aria-label={tFields("world.label")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WORLD_CUSTOM_VALUE}>
                {tFields("world.unknown")}
              </SelectItem>
              {COMMON_WORLDS.map((w) => (
                <SelectItem key={w} value={w}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          {tFields("world.help")}
        </p>
      </div>
    </fieldset>
  );
}

function SkillsSection() {
  const t = useTranslations("Workspace.editor");
  const tFields = useTranslations("Workspace.editor.fields");
  const { setSkillBase } = useSnapshotEditor();
  const format = useFormatter();

  // Subskrybuj WSZYSTKIE skille naraz — taniej niż 8 subskrypcji.
  const skills = useCharacterStoreShallow((s) => s.snapshot.skills);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t("sections.skills")}
      </legend>

      {SKILL_KEYS.map((skillKey) => {
        const range = SKILL_RANGES[skillKey];
        const value = skills[skillKey].base;
        const valid = validateRange(value, range.min, range.max);
        const helpKey =
          skillKey === "magic"
            ? "magicHelp"
            : skillKey === "shielding"
              ? "shieldingHelp"
              : "help";
        return (
          <div key={skillKey} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`snap-editor-skill-${skillKey}`}>
                {tFields("skill.label", { skill: skillKey })}
              </Label>
              <span className="numeric text-sm font-semibold tabular-nums">
                {format.number(value, { useGrouping: false })}
              </span>
            </div>
            <Slider
              id={`snap-editor-skill-${skillKey}`}
              value={[value]}
              min={range.min}
              max={range.max}
              step={1}
              onValueChange={(values) => {
                const next = values[0] ?? range.min;
                setSkillBase(skillKey, next);
              }}
              aria-describedby={`snap-editor-skill-${skillKey}-help`}
            />
            <p
              id={`snap-editor-skill-${skillKey}-help`}
              className="text-xs text-muted-foreground"
            >
              {tFields(`skill.${helpKey}`)}
            </p>
            {!valid ? (
              <p className="text-xs font-medium text-destructive" role="alert">
                {t("errors.skillRange", {
                  skill: skillKey,
                  min: range.min,
                  max: range.max,
                })}
              </p>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}

function ProgressionSection() {
  const t = useTranslations("Workspace.editor");
  const tFields = useTranslations("Workspace.editor.fields");
  const format = useFormatter();
  const {
    setCharmPoints,
    setBossPoints,
    setQuestsCompleted,
    setImbuementsUnlocked,
  } = useSnapshotEditor();

  type ProgKey =
    | "charmPoints"
    | "bossPoints"
    | "questsCompleted"
    | "imbuementsUnlocked";

  // Subskrybuj cały progression jednym selektorem (taniej niż 4 subskrypcje).
  const progression = useCharacterStoreShallow(
    (s) => s.snapshot.progression,
  );

  const fields: ReadonlyArray<{
    key: ProgKey;
    range: { min: number; max: number; step: number };
    errorKey:
      | "charmPointsRange"
      | "bossPointsRange"
      | "questsRange"
      | "imbuementsRange";
  }> = [
    {
      key: "charmPoints",
      range: FIELD_RANGES.charmPoints,
      errorKey: "charmPointsRange",
    },
    {
      key: "bossPoints",
      range: FIELD_RANGES.bossPoints,
      errorKey: "bossPointsRange",
    },
    {
      key: "questsCompleted",
      range: FIELD_RANGES.questsCompleted,
      errorKey: "questsRange",
    },
    {
      key: "imbuementsUnlocked",
      range: FIELD_RANGES.imbuementsUnlocked,
      errorKey: "imbuementsRange",
    },
  ];

  const dispatchers: Record<ProgKey, (v: number) => void> = {
    charmPoints: setCharmPoints,
    bossPoints: setBossPoints,
    questsCompleted: setQuestsCompleted,
    imbuementsUnlocked: setImbuementsUnlocked,
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t("sections.progression")}
      </legend>

      {fields.map(({ key, range, errorKey }) => {
        const value = progression[key];
        const valid = validateRange(value, range.min, range.max);
        return (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`snap-editor-${key}`}>
                {tFields(`${key}.label`)}
              </Label>
              <span className="numeric text-sm font-semibold tabular-nums">
                {format.number(value, { useGrouping: true })}
              </span>
            </div>
            <Slider
              id={`snap-editor-${key}`}
              value={[value]}
              min={range.min}
              max={range.max}
              step={range.step}
              onValueChange={(values) => {
                const next = values[0] ?? range.min;
                dispatchers[key](next);
              }}
              aria-describedby={`snap-editor-${key}-help`}
            />
            <p
              id={`snap-editor-${key}-help`}
              className="text-xs text-muted-foreground"
            >
              {tFields(`${key}.help`)}
            </p>
            {!valid ? (
              <p className="text-xs font-medium text-destructive" role="alert">
                {t(`errors.${errorKey}`, { max: range.max })}
              </p>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}

function AssetsSection() {
  const t = useTranslations("Workspace.editor");
  const tFields = useTranslations("Workspace.editor.fields");
  const format = useFormatter();
  const { setGoldTotal, setStoreOutfitsCount, setStoreMountsCount } =
    useSnapshotEditor();

  const goldTotal = useCharacterStore((s) => s.snapshot.assets.goldTotal);
  const storeOutfitsCount = useCharacterStore(
    (s) => s.snapshot.assets.storeCounts.outfits,
  );
  const storeMountsCount = useCharacterStore(
    (s) => s.snapshot.assets.storeCounts.mounts,
  );

  type AssetKey =
    | "goldTotal"
    | "storeOutfitsCount"
    | "storeMountsCount";

  const fields: ReadonlyArray<{
    key: AssetKey;
    value: number;
    range: { min: number; max: number; step: number };
    labelKey: AssetKey;
    errorKey: "goldRange" | "storeRange";
  }> = [
    {
      key: "goldTotal",
      value: goldTotal,
      range: FIELD_RANGES.goldTotal,
      labelKey: "goldTotal",
      errorKey: "goldRange",
    },
    {
      key: "storeOutfitsCount",
      value: storeOutfitsCount,
      range: FIELD_RANGES.storeOutfitsCount,
      labelKey: "storeOutfitsCount",
      errorKey: "storeRange",
    },
    {
      key: "storeMountsCount",
      value: storeMountsCount,
      range: FIELD_RANGES.storeMountsCount,
      labelKey: "storeMountsCount",
      errorKey: "storeRange",
    },
  ];

  const dispatchers: Record<AssetKey, (v: number) => void> = {
    goldTotal: setGoldTotal,
    storeOutfitsCount: setStoreOutfitsCount,
    storeMountsCount: setStoreMountsCount,
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t("sections.assets")}
      </legend>

      {fields.map(({ key, value, range, labelKey, errorKey }) => {
        const valid = validateRange(value, range.min, range.max);
        return (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`snap-editor-${key}`}>
                {tFields(`${labelKey}.label`)}
              </Label>
              <span className="numeric text-sm font-semibold tabular-nums">
                {format.number(value, { useGrouping: true })}
              </span>
            </div>
            <Slider
              id={`snap-editor-${key}`}
              value={[value]}
              min={range.min}
              max={range.max}
              step={range.step}
              onValueChange={(values) => {
                const next = values[0] ?? range.min;
                dispatchers[key](next);
              }}
              aria-describedby={`snap-editor-${key}-help`}
            />
            <p
              id={`snap-editor-${key}-help`}
              className="text-xs text-muted-foreground"
            >
              {tFields(`${labelKey}.help`)}
            </p>
            {!valid ? (
              <p className="text-xs font-medium text-destructive" role="alert">
                {errorKey === "storeRange"
                  ? t(`errors.${errorKey}`, {
                      label: tFields(`${labelKey}.label`),
                    })
                  : t(`errors.${errorKey}`)}
              </p>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}