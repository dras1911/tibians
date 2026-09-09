"use client";

/**
 * ActiveFiltersBar — sticky rząd aktywnych chipów + "Kopiuj link" (plan T43).
 *
 * Arch §6.4 pkt 6: sticky "Aktywne filtry" jako rząd usuwalnych chipów nad
 * listą — zawsze widoczny stan, niezależnie od pozycji scrolla i zwinięcia
 * sidebara.
 *
 * Komponent kliencki — czyta filtry z `useBazaarFilters()` (URL state).
 * Renderuje:
 *   1. Sticky rząd pod toolbar (mobile: pełna szerokość; desktop: inline).
 *   2. Chip per aktywny filtr z × (klik usuwa dany filtr).
 *   3. "Wyczyść wszystko" button.
 *   4. "📋 Kopiuj link" button → navigator.clipboard + toast.
 *
 * Dostępność (arch §6.5):
 *   - Touch targets ≥ 44 px (h-11 / h-7 dla chipów zgodnie z mobile-first).
 *   - `aria-live="polite"` na liczniku (komunikat "X filtrów aktywnych").
 *   - Każdy chip ma `aria-label` opisujący co usuwa.
 */

import * as React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Clipboard, Link2, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import {
  useBazaarFilters,
  type BazaarFiltersUi,
} from "@/lib/hooks/use-bazaar-filters";

// ───────────────────────────────────────────────────────────────────────
// Typy
// ───────────────────────────────────────────────────────────────────────

export interface ActiveFiltersBarProps {
  /** Sticky offset (top w px) — domyślnie 64 px (header h-16). */
  stickyOffsetClass?: string;
  /** Dodatkowa klasa. */
  className?: string;
}

// ───────────────────────────────────────────────────────────────────────
// Komponent
// ───────────────────────────────────────────────────────────────────────

export function ActiveFiltersBar({
  stickyOffsetClass = "top-16",
  className,
}: ActiveFiltersBarProps) {
  const t = useTranslations("Bazaar.filters");
  const format = useFormatter();
  const { toast } = useToast();
  const { filters, setFilters, reset } = useBazaarFilters();

  const activeCount = countActiveFilters(filters);

  const handleCopyLink = React.useCallback(async () => {
    const url =
      typeof window !== "undefined" ? window.location.href : "";
    if (!url) return;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback dla przeglądarek bez Clipboard API (rzadkie).
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast({
        message: t("active.linkCopied"),
        variant: "success",
      });
    } catch {
      toast({
        message: t("active.linkCopyFailed"),
        variant: "error",
      });
    }
  }, [t, toast]);

  if (activeCount === 0) {
    // Brak aktywnych filtrów — nie renderuj (sticky pusty pasek jest szumem).
    return null;
  }

  return (
    <div
      role="region"
      aria-label={t("active.title")}
      aria-live="polite"
      aria-atomic="false"
      className={cn(
        "sticky z-30 -mx-4 border-b bg-background/85 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:-mx-6 sm:px-6",
        stickyOffsetClass,
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("active.title")} ({format.number(activeCount)})
        </span>

        {/* ── Chipy ───────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {filters.vocation ? (
            <ActiveChip
              label={t(`vocation.${filters.vocation.toLowerCase()}`)}
              onRemove={() =>
                setFilters((prev) => {
                  const { vocation: _v, ...rest } = prev;
                  void _v;
                  return rest;
                })
              }
              ariaLabel={`${t("active.title")}: ${filters.vocation}`}
            />
          ) : null}

          {filters.skillType && filters.skillMin !== undefined ? (
            <ActiveChip
              label={t("activeChip.skillType", {
                value: t(`advanced.skills.${filters.skillType}`),
                min: filters.skillMin,
              })}
              onRemove={() =>
                setFilters((prev) => {
                  const { skillType: _t, skillMin: _m, ...rest } = prev;
                  void _t;
                  void _m;
                  return rest;
                })
              }
              ariaLabel={`${t("advanced.skillMin.label")} ${filters.skillType}`}
            />
          ) : null}

          {filters.region ? (
            <ActiveChip
              label={t(`regions.${filters.region}`)}
              onRemove={() =>
                setFilters((prev) => {
                  const { region: _r, ...rest } = prev;
                  void _r;
                  return rest;
                })
              }
              ariaLabel={`${t("activeChip.region")} ${filters.region}`}
            />
          ) : null}

          {filters.world ? (
            <ActiveChip
              label={t("activeChip.world", { value: filters.world })}
              onRemove={() =>
                setFilters((prev) => {
                  const { world: _w, ...rest } = prev;
                  void _w;
                  return rest;
                })
              }
              ariaLabel={`World ${filters.world}`}
            />
          ) : null}

          {filters.levelMin !== undefined || filters.levelMax !== undefined ? (
            <ActiveChip
              label={
                filters.levelMin !== undefined && filters.levelMax !== undefined
                  ? t("activeChip.level", {
                      min: filters.levelMin,
                      max: filters.levelMax,
                    })
                  : filters.levelMin !== undefined
                    ? t("activeChip.levelOpen", { min: filters.levelMin })
                    : t("activeChip.levelCapped", { max: filters.levelMax })
              }
              onRemove={() =>
                setFilters((prev) => {
                  const { levelMin: _l, levelMax: _m, ...rest } = prev;
                  void _l;
                  void _m;
                  return rest;
                })
              }
              ariaLabel={`Level ${filters.levelMin ?? ""}–${filters.levelMax ?? ""}`}
            />
          ) : null}

          {filters.bidMax !== undefined ? (
            <ActiveChip
              label={t("activeChip.bidMax", { value: filters.bidMax })}
              onRemove={() =>
                setFilters((prev) => {
                  const { bidMax: _b, ...rest } = prev;
                  void _b;
                  return rest;
                })
              }
              ariaLabel={`Max bid ${filters.bidMax}`}
            />
          ) : null}

          {filters.bidMin !== undefined ? (
            <ActiveChip
              label={t("activeChip.bidMin", { value: filters.bidMin })}
              onRemove={() =>
                setFilters((prev) => {
                  const { bidMin: _b, ...rest } = prev;
                  void _b;
                  return rest;
                })
              }
              ariaLabel={`Min bid ${filters.bidMin}`}
            />
          ) : null}

          {filters.pvpType ? (
            <ActiveChip
              label={t(`pvpType.${filters.pvpType}`)}
              onRemove={() =>
                setFilters((prev) => {
                  const { pvpType: _p, ...rest } = prev;
                  void _p;
                  return rest;
                })
              }
              ariaLabel={`PvP ${filters.pvpType}`}
            />
          ) : null}

          {filters.battleye ? (
            <ActiveChip
              label={t(`battleye.${filters.battleye}`)}
              onRemove={() =>
                setFilters((prev) => {
                  const { battleye: _b, ...rest } = prev;
                  void _b;
                  return rest;
                })
              }
              ariaLabel={`BattlEye ${filters.battleye}`}
            />
          ) : null}

          {filters.hasSoulWar ? (
            <ActiveChip
              label={t("activeChip.hasSoulWar")}
              onRemove={() =>
                setFilters((prev) => {
                  const { hasSoulWar: _s, ...rest } = prev;
                  void _s;
                  return rest;
                })
              }
              ariaLabel="Soul War"
            />
          ) : null}

          {filters.hasPrimalOrdeal ? (
            <ActiveChip
              label={t("activeChip.hasPrimalOrdeal")}
              onRemove={() =>
                setFilters((prev) => {
                  const { hasPrimalOrdeal: _p, ...rest } = prev;
                  void _p;
                  return rest;
                })
              }
              ariaLabel="Primal Ordeal"
            />
          ) : null}

          {filters.hasWorldTransfer ? (
            <ActiveChip
              label={t("activeChip.hasWorldTransfer")}
              onRemove={() =>
                setFilters((prev) => {
                  const { hasWorldTransfer: _w, ...rest } = prev;
                  void _w;
                  return rest;
                })
              }
            />
          ) : null}

          {filters.hasPreySlot ? (
            <ActiveChip
              label={t("activeChip.hasPreySlot")}
              onRemove={() =>
                setFilters((prev) => {
                  const { hasPreySlot: _p, ...rest } = prev;
                  void _p;
                  return rest;
                })
              }
            />
          ) : null}

          {filters.hasCharmExpansion ? (
            <ActiveChip
              label={t("activeChip.hasCharmExpansion")}
              onRemove={() =>
                setFilters((prev) => {
                  const { hasCharmExpansion: _c, ...rest } = prev;
                  void _c;
                  return rest;
                })
              }
            />
          ) : null}

          {filters.hasWeeklyTaskExp ? (
            <ActiveChip
              label={t("activeChip.hasWeeklyTaskExp")}
              onRemove={() =>
                setFilters((prev) => {
                  const { hasWeeklyTaskExp: _w, ...rest } = prev;
                  void _w;
                  return rest;
                })
              }
            />
          ) : null}

          {filters.hasTwistOfFate ? (
            <ActiveChip
              label={t("activeChip.hasTwistOfFate")}
              onRemove={() =>
                setFilters((prev) => {
                  const { hasTwistOfFate: _t, ...rest } = prev;
                  void _t;
                  return rest;
                })
              }
            />
          ) : null}

          {filters.imbuesFull ? (
            <ActiveChip
              label={t("activeChip.imbuesFull")}
              onRemove={() =>
                setFilters((prev) => {
                  const { imbuesFull: _i, ...rest } = prev;
                  void _i;
                  return rest;
                })
              }
            />
          ) : null}

          {filters.mustHaveItemId !== undefined ? (
            <ActiveChip
              label={t("activeChip.mustHaveItem", {
                value: filters.mustHaveItemName ?? String(filters.mustHaveItemId),
              })}
              onRemove={() =>
                setFilters((prev) => {
                  const {
                    mustHaveItemId: _i,
                    mustHaveItemName: _n,
                    ...rest
                  } = prev;
                  void _i;
                  void _n;
                  return rest;
                })
              }
            />
          ) : null}

          {filters.gemsMinLesser !== undefined ||
          filters.gemsMinRegular !== undefined ||
          filters.gemsMinGreater !== undefined ? (
            <ActiveChip
              label={`💎 ${formatFiltersGems(filters, t)}`}
              onRemove={() =>
                setFilters((prev) => {
                  const {
                    gemsMinLesser: _l,
                    gemsMinRegular: _r,
                    gemsMinGreater: _g,
                    ...rest
                  } = prev;
                  void _l;
                  void _r;
                  void _g;
                  return rest;
                })
              }
            />
          ) : null}

          {filters.storeMinOutfits !== undefined ||
          filters.storeMinMounts !== undefined ||
          filters.storeMinItems !== undefined ? (
            <ActiveChip
              label={`🛍 ${formatFiltersStore(filters)}`}
              onRemove={() =>
                setFilters((prev) => {
                  const {
                    storeMinOutfits: _o,
                    storeMinMounts: _m,
                    storeMinItems: _i,
                    ...rest
                  } = prev;
                  void _o;
                  void _m;
                  void _i;
                  return rest;
                })
              }
            />
          ) : null}
        </div>

        {/* ── Akcje ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            className="h-9 gap-1 px-2 text-xs"
            aria-label={t("active.clear")}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("active.clear")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="h-9 gap-1 px-2 text-xs"
            aria-label={t("active.copyLink")}
          >
            <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
            {t("active.copyLink")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

/**
 * Liczy aktywne filtry (rozszerzone — T42+). Używane do aria-live count.
 */
function countActiveFilters(f: BazaarFiltersUi): number {
  let count = 0;
  if (f.vocation) count++;
  if (f.skillType || f.skillMin !== undefined) count++;
  if (f.levelMin !== undefined || f.levelMax !== undefined) count++;
  if (f.bidMin !== undefined || f.bidMax !== undefined) count++;
  if (f.region) count++;
  if (f.world) count++;
  if (f.pvpType) count++;
  if (f.battleye) count++;
  if (f.hasSoulWar) count++;
  if (f.hasPrimalOrdeal) count++;
  if (f.hasWorldTransfer) count++;
  if (f.hasPreySlot) count++;
  if (f.hasCharmExpansion) count++;
  if (f.hasWeeklyTaskExp) count++;
  if (f.hasTwistOfFate) count++;
  if (f.imbuesFull) count++;
  if (f.mustHaveItemId !== undefined) count++;
  if (
    f.gemsMinLesser !== undefined ||
    f.gemsMinRegular !== undefined ||
    f.gemsMinGreater !== undefined
  )
    count++;
  if (
    f.storeMinOutfits !== undefined ||
    f.storeMinMounts !== undefined ||
    f.storeMinItems !== undefined
  )
    count++;
  if (f.search) count++;
  return count;
}

function formatFiltersGems(
  f: BazaarFiltersUi,
  t: ReturnType<typeof useTranslations>,
): string {
  const parts: string[] = [];
  if (f.gemsMinLesser !== undefined)
    parts.push(`${f.gemsMinLesser}L`);
  if (f.gemsMinRegular !== undefined)
    parts.push(`${f.gemsMinRegular}R`);
  if (f.gemsMinGreater !== undefined)
    parts.push(`${f.gemsMinGreater}G`);
  return `${t("advanced.gems.label")} ${parts.join("-")}`;
}

function formatFiltersStore(f: BazaarFiltersUi): string {
  const parts: string[] = [];
  if (f.storeMinOutfits !== undefined)
    parts.push(`${f.storeMinOutfits}👗`);
  if (f.storeMinMounts !== undefined)
    parts.push(`${f.storeMinMounts}🐴`);
  if (f.storeMinItems !== undefined)
    parts.push(`${f.storeMinItems}🎁`);
  return parts.join(" · ");
}

// ───────────────────────────────────────────────────────────────────────
// ActiveChip
// ───────────────────────────────────────────────────────────────────────

interface ActiveChipProps {
  label: string;
  onRemove: () => void;
  ariaLabel?: string;
}

function ActiveChip({ label, onRemove, ariaLabel }: ActiveChipProps) {
  return (
    <Badge
      variant="secondary"
      className="inline-flex h-7 items-center gap-1 pr-1 text-xs"
    >
      <span className="max-w-[16rem] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={ariaLabel ?? `Remove ${label}`}
        className="ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </Badge>
  );
}

// Ucisz unused-import warning (Link2 import rezerwowy dla przyszłego użycia).
void Link2;
