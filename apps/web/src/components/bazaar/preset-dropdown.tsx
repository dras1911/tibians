"use client";

/**
 * PresetDropdown — "Załaduj preset" + "Zapisz aktualne" (plan T44).
 *
 * Arch §6.4 pkt 5: zapisane kwerendy jak "Knight 300-600 EU <15k". Klik
 * w pełny stan filtrów, bez ręcznego ustawiania każdego pola.
 *
 * Źródła presetów:
 *   - **Wbudowane** (`BAZAAR_PRESETS` z `@tibians/shared/bazaar`) — 6
 *     hardcoded presetów, readonly.
 *   - **Własne** — localStorage, max 3 (free tier), dodawane inline w
 *     dropdownie przez `<Input>` + Enter.
 *
 * UX:
 *   - DropdownMenu z dwiema sekcjami (Wbudowane / Własne).
 *   - Per-preset: nazwa + preview filtrów + apply (✓) + delete (🗑 tylko custom).
 *   - "Zapisz aktualne" inline input z walidacją (1-50 znaków, limit 3).
 *   - Limit-reached state: input + przycisk disabled + tooltip.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  BookmarkPlus,
  Check,
  ChevronDown,
  Star,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import {
  PRESETS_LIMIT,
  useFilterPresets,
  validatePresetName,
} from "@/lib/hooks/use-filter-presets";
import {
  useBazaarFilters,
  type BazaarFiltersUi,
} from "@/lib/hooks/use-bazaar-filters";
import type { BazaarPreset, BazaarPresetFilters } from "@tibians/shared/bazaar";

// ───────────────────────────────────────────────────────────────────────
// Komponent
// ───────────────────────────────────────────────────────────────────────

export interface PresetDropdownProps {
  /** Dodatkowa klasa. */
  className?: string;
}

export function PresetDropdown({ className }: PresetDropdownProps) {
  const t = useTranslations("Bazaar.filters");
  const tVocation = useTranslations("Bazaar.filters.vocation");
  const tRegions = useTranslations("Bazaar.filters.regions");
  const { toast } = useToast();

  const { filters, setFilters } = useBazaarFilters();
  const {
    presets,
    customPresets,
    isAtLimit,
    addPreset,
    deletePreset,
    applyPreset,
  } = useFilterPresets();

  const [open, setOpen] = React.useState(false);
  const [savingName, setSavingName] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null,
  );

  const builtInPresets = React.useMemo(
    () => presets.filter((p) => p.builtIn === true),
    [presets],
  );

  // ── Apply preset ───────────────────────────────────────────────────
  const handleApply = React.useCallback(
    (presetId: string) => {
      const presetFilters = applyPreset(presetId);
      if (!presetFilters) return;
      // Merge: tylko pola z presetu nadpisują istniejące. Paginacja reset.
      setFilters((prev) => {
        const merged: BazaarFiltersUi = { ...prev };
        for (const [key, value] of Object.entries(presetFilters)) {
          if (value !== undefined && value !== null) {
            (merged as Record<string, unknown>)[key] = value;
          }
        }
        return merged;
      });
      setOpen(false);
    },
    [applyPreset, setFilters],
  );

  // ── Save preset ────────────────────────────────────────────────────
  const handleSave = React.useCallback(() => {
    if (isAtLimit) {
      setSaveError(t("presets.limitReached", { max: PRESETS_LIMIT }));
      return;
    }
    const validation = validatePresetName(savingName);
    if (!validation.ok) {
      setSaveError(validation.error ?? "Błąd walidacji");
      return;
    }
    // Wyciągnij tylko niepuste filtry (czystszy preset).
    const cleanFilters = cleanActiveFilters(filters);
    const id = addPreset({
      name: savingName,
      filters: cleanFilters,
    });
    if (!id) {
      setSaveError(t("presets.saveError"));
      return;
    }
    setSavingName("");
    setSaveError(null);
    setOpen(false);
    toast({ message: t("presets.saved"), variant: "success" });
  }, [isAtLimit, savingName, addPreset, filters, t, toast]);

  // ── Delete preset ──────────────────────────────────────────────────
  const handleDelete = React.useCallback(
    (id: string) => {
      const ok = deletePreset(id);
      if (ok) {
        toast({ message: t("presets.removed"), variant: "info" });
        setConfirmDeleteId(null);
      }
    },
    [deletePreset, t, toast],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-9 gap-1.5 text-xs", className)}
            aria-label={t("presets.title")}
          >
            <Star className="h-3.5 w-3.5" aria-hidden="true" />
            {t("presets.title")}
            <ChevronDown className="h-3 w-3 opacity-70" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="w-80 max-h-[min(80vh,32rem)] overflow-y-auto"
        >
          {/* ── Limit info ────────────────────────────────────────── */}
          <DropdownMenuLabel className="flex items-center justify-between gap-2 text-xs">
            <span>{t("presets.title")}</span>
            <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[0.65rem] tabular-nums">
              {t("presets.limit", {
                count: customPresets.length,
                max: PRESETS_LIMIT,
              })}
            </Badge>
          </DropdownMenuLabel>

          {/* ── Wbudowane presety ─────────────────────────────────── */}
          {builtInPresets.length > 0 ? (
            <>
              <DropdownMenuLabel className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                {t("presets.hardcoded")}
              </DropdownMenuLabel>
              {builtInPresets.map((preset) => (
                <PresetRow
                  key={preset.id}
                  preset={preset}
                  preview={formatPresetPreview(preset, t, tVocation, tRegions)}
                  t={t}
                  onApply={() => handleApply(preset.id)}
                  onDelete={null}
                />
              ))}
            </>
          ) : null}

          {/* ── Własne presety ────────────────────────────────────── */}
          {customPresets.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                {t("presets.custom")}
              </DropdownMenuLabel>
              {customPresets.map((preset) => (
                <PresetRow
                  key={preset.id}
                  preset={preset}
                  preview={formatPresetPreview(preset, t, tVocation, tRegions)}
                  t={t}
                  onApply={() => handleApply(preset.id)}
                  onDelete={
                    confirmDeleteId === preset.id
                      ? () => handleDelete(preset.id)
                      : () => setConfirmDeleteId(preset.id)
                  }
                  confirmDelete={confirmDeleteId === preset.id}
                />
              ))}
            </>
          ) : null}

          {/* ── Pusty state dla własnych ─────────────────────────── */}
          {customPresets.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t("presets.loadEmpty")}
            </div>
          ) : null}

          <DropdownMenuSeparator />

          {/* ── Zapisz aktualne ──────────────────────────────────── */}
          <div className="space-y-2 p-3">
            <label
              htmlFor="preset-name"
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
              {t("presets.save")}
            </label>
            <div className="flex items-center gap-1">
              <Input
                id="preset-name"
                type="text"
                inputMode="text"
                value={savingName}
                onChange={(e) => {
                  setSavingName(e.target.value);
                  if (saveError) setSaveError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                placeholder={t("presets.savePrompt")}
                maxLength={50}
                disabled={isAtLimit}
                className="h-9 text-xs"
                aria-label={t("presets.savePrompt")}
                aria-invalid={saveError !== null}
              />
              <Tooltip open={isAtLimit ? false : false}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={handleSave}
                    disabled={isAtLimit || savingName.trim().length === 0}
                    className="h-9 shrink-0 px-3 text-xs"
                  >
                    {t("presets.saveConfirm")}
                  </Button>
                </TooltipTrigger>
                {isAtLimit ? (
                  <TooltipContent side="bottom">
                    <p className="max-w-xs text-xs">
                      {t("presets.limitReached", { max: PRESETS_LIMIT })}
                    </p>
                  </TooltipContent>
                ) : null}
              </Tooltip>
            </div>
            {saveError ? (
              <p
                role="alert"
                className="text-xs text-destructive"
              >
                {saveError}
              </p>
            ) : null}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}

// ───────────────────────────────────────────────────────────────────────
// PresetRow
// ───────────────────────────────────────────────────────────────────────

interface PresetRowProps {
  preset: BazaarPreset;
  preview: string;
  t: ReturnType<typeof useTranslations>;
  onApply: () => void;
  /** null = brak delete (wbudowane). */
  onDelete: (() => void) | null;
  confirmDelete?: boolean;
}

function PresetRow({
  preset,
  preview,
  t,
  onApply,
  onDelete,
  confirmDelete,
}: PresetRowProps) {
  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        onApply();
      }}
      className="flex cursor-pointer items-start gap-2 py-2"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{preset.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {preview}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onApply();
          }}
          aria-label={`${t("presets.apply")}: ${preset.name}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {onDelete ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={
              confirmDelete
                ? `${t("presets.deleteConfirm")} ${preset.name}`
                : `${t("presets.delete")}: ${preset.name}`
            }
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              confirmDelete
                ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                : "text-muted-foreground hover:bg-accent hover:text-destructive",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </DropdownMenuItem>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

/**
 * Filtruje `BazaarFiltersUi` do kluczy z `BazaarPresetFilters`
 * (czystszy obiekt zapisywany w localStorage). Pomija sortowanie,
 * paginację, puste/undefined pola.
 */
function cleanActiveFilters(f: BazaarFiltersUi): BazaarPresetFilters {
  const allowedKeys: (keyof BazaarPresetFilters)[] = [
    "vocation",
    "levelMin",
    "levelMax",
    "bidMin",
    "bidMax",
    "region",
    "world",
    "pvpType",
    "battleye",
    "search",
    "hasSoulWar",
    "hasPrimalOrdeal",
    "hasWorldTransfer",
    "skillType",
    "skillMin",
    "hasPreySlot",
    "hasCharmExpansion",
    "hasWeeklyTaskExp",
    "hasTwistOfFate",
    "imbuesFull",
    "mustHaveItemId",
    "mustHaveItemName",
    "gemsMinLesser",
    "gemsMinRegular",
    "gemsMinGreater",
    "storeMinOutfits",
    "storeMinMounts",
    "storeMinItems",
    "overpriced",
  ];
  const out: BazaarPresetFilters = {};
  for (const key of allowedKeys) {
    const value = f[key];
    if (value !== undefined && value !== null && value !== "") {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// filtersPreview — formatuje skrót filtrów presetu (max ~50 znaków)
// ───────────────────────────────────────────────────────────────────────

/**
 * Formatuje skrót filtrów presetu, np. "Knight 300-600 EU <15k".
 * Wolna funkcja zamiast metody na interfejsie (TS nie pozwala na
 * `interface.method()` w runtime).
 */
export function formatPresetPreview(
  preset: BazaarPreset,
  t: ReturnType<typeof useTranslations>,
  tVocation: ReturnType<typeof useTranslations>,
  tRegions: ReturnType<typeof useTranslations>,
): string {
  const parts: string[] = [];
  const f = preset.filters;
  if (f.vocation) {
    try {
      parts.push(tVocation(f.vocation.toLowerCase()));
    } catch {
      parts.push(f.vocation);
    }
  }
  if (f.levelMin !== undefined && f.levelMax !== undefined) {
    parts.push(`${f.levelMin}-${f.levelMax}`);
  } else if (f.levelMin !== undefined) {
    parts.push(`≥${f.levelMin}`);
  } else if (f.levelMax !== undefined) {
    parts.push(`≤${f.levelMax}`);
  }
  if (f.region) {
    try {
      parts.push(tRegions(f.region));
    } catch {
      parts.push(f.region);
    }
  }
  if (f.bidMax !== undefined) parts.push(`<${f.bidMax}`);
  if (f.skillType && f.skillMin !== undefined) {
    parts.push(`${f.skillType}≥${f.skillMin}`);
  }
  if (f.hasSoulWar) parts.push("💀");
  if (f.hasPrimalOrdeal) parts.push("🦖");
  if (f.overpriced) parts.push("⚠ overpriced");
  if (parts.length === 0) return "—";
  return parts.join(" · ");
}
