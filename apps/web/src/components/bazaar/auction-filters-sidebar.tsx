"use client";

/**
 * AuctionFiltersSidebar — sidebar z szybkimi filtrami Bazaar (plan T41, arch §5 krok 3).
 *
 * Sekcje (arch §5 krok 3 + §6.4):
 *   1. **Vocation** — chips z licznikiem `[Knight (812)] [Paladin (540)] …`
 *   2. **Level** — preset chips `8-50 · 50-150 · 150-300 · [300-600] · 600+`
 *      + dual-range inputs (advanced, future-proof)
 *   3. **Max Price** — input z placeholderem "TC"
 *   4. **World** — searchable multi-select, grupowany po regionie EU/NA/BR
 *   5. **Region toggles** — "Tylko EU", "Tylko Optional PvP", "Tylko yellow BattlEye"
 *   6. **PvP Type** — multi-select (Open / Optional / Hardcore / Retro * / Retro Hardcore)
 *   7. **BattlEye** — select (protected / initially protected / not protected)
 *
 * Faceted counts (arch §6.4 pkt 1): każda opcja ma `count` z `mv_facet_counts`
 * (T34 view). Komponent jest prezentacyjny — counts przychodzą z parent.
 *
 * URL state sync (arch §5 + plan T43):
 *   - Każda zmiana filtru wywołuje `onFilterChange({ ...prev, [key]: value })`
 *   - Parent decyduje o `router.replace()` (T43 dispatch)
 *   - "Aktywne filtry" to sticky rząd chipów z × na dole sidebara
 *
 * Mobile: FAB trigger → `<Sheet>` (T3). Wewnątrz sidebara dostajemy
 * ten sam content + przycisk "Zamknij" w nagłówku (parent to dodaje).
 *
 * Zasady (arch §6.3 + §6.5):
 *   - Touch targets ≥ 44 px (h-11)
 *   - Zero debounce na chipach/toggle/select (natychmiastowy feedback)
 *   - Wszystkie labele PL + EN
 */

import * as React from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Check,
  ChevronDown,
  Globe,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// Publiczne typy — kanoniczny kształt filtrów przekazywany do sidebara
// ─────────────────────────────────────────────────────────────────────

/** 5 bazowych klas postaci (arch §6.1 — paleta OKLCH vocation). */
export type VocationFilter = "Knight" | "Paladin" | "Druid" | "Sorcerer" | "Monk";

/** Regiony serwerów. */
export type RegionFilter = "EU" | "NA" | "BR";

/** PvP type (arch §7.2 worlds.pvp_type). */
export type PvPTypeFilter =
  | "Open PvP"
  | "Optional PvP"
  | "Hardcore PvP"
  | "Retro Open PvP"
  | "Retro Hardcore PvP";

/** BattlEye status. */
export type BattlEyeFilter = "protected" | "initially protected" | "not protected";

/** Kanoniczny obiekt filtrów (URL ↔ UI ↔ DB). */
export interface BazaarFilters {
  vocation?: VocationFilter | undefined;
  levelMin?: number | undefined;
  levelMax?: number | undefined;
  bidMax?: number | undefined;
  bidMin?: number | undefined;
  region?: RegionFilter | undefined;
  world?: string | undefined;
  pvpType?: PvPTypeFilter | undefined;
  battleye?: BattlEyeFilter | undefined;
  hasSoulWar?: boolean | undefined;
  hasPrimalOrdeal?: boolean | undefined;
  search?: string | undefined;
}

/** Facet count dla pojedynczej opcji (arch §6.4 pkt 1). */
export interface FacetCount {
  /** Unikalny identyfikator opcji (np. "Knight", "EU", "Open PvP"). */
  value: string;
  /** Liczba aukcji spełniających ten filtr (po zastosowaniu pozostałych). */
  count: number;
}

/** Domyślna paczka facet counts (przekazywana przez parent). */
export interface FacetCounts {
  vocation: FacetCount[];
  region: FacetCount[];
  world: FacetCount[];
  pvpType: FacetCount[];
  battleye: FacetCount[];
  /** Łączna liczba aktywnych aukcji (bez filtrów). */
  totalActive: number;
}

export interface AuctionFiltersSidebarProps {
  /** Aktualny stan filtrów. */
  filters: BazaarFilters;
  /** Callback po zmianie dowolnego filtra (URL state sync, plan T43). */
  onFilterChange: (next: BazaarFilters) => void;
  /** Callback "Wyczyść wszystkie". */
  onReset: () => void;
  /** Facet counts (serwowane z parent — serwer + cache 60s). */
  facetCounts: FacetCounts;
  /** Lista dostępnych światów (grupowana po regionie). */
  worldsByRegion: Record<RegionFilter, string[]>;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Vocation tone (spójne z resztą bazaar UI)
// ─────────────────────────────────────────────────────────────────────

const VOCATION_ORDER: VocationFilter[] = [
  "Knight",
  "Paladin",
  "Druid",
  "Sorcerer",
  "Monk",
];

const VOCATION_TONE: Record<VocationFilter, string> = {
  Knight: "bg-voc-knight/15 text-voc-knight border-voc-knight/40",
  Paladin: "bg-voc-paladin/15 text-voc-paladin border-voc-paladin/40",
  Druid: "bg-voc-druid/15 text-voc-druid border-voc-druid/40",
  Sorcerer: "bg-voc-sorcerer/15 text-voc-sorcerer border-voc-sorcerer/40",
  Monk: "bg-voc-monk/15 text-voc-monk border-voc-monk/40",
};

// ─────────────────────────────────────────────────────────────────────
// Level presets (arch §5 krok 3 pkt 2)
// ─────────────────────────────────────────────────────────────────────

const LEVEL_PRESETS: Array<{
  key: "starter" | "mid" | "high" | "endgame" | "elite";
  min: number;
  max: number | null;
}> = [
  { key: "starter", min: 8, max: 50 },
  { key: "mid", min: 50, max: 150 },
  { key: "high", min: 150, max: 300 },
  { key: "endgame", min: 300, max: 600 },
  { key: "elite", min: 600, max: null },
];

// ─────────────────────────────────────────────────────────────────────
// PvP types + BattlEye (do mapowania tłumaczeń)
// ─────────────────────────────────────────────────────────────────────

const PVP_TYPES: PvPTypeFilter[] = [
  "Open PvP",
  "Optional PvP",
  "Hardcore PvP",
  "Retro Open PvP",
  "Retro Hardcore PvP",
];

const BATTLEYE_TYPES: BattlEyeFilter[] = [
  "protected",
  "initially protected",
  "not protected",
];

const REGIONS: RegionFilter[] = ["EU", "NA", "BR"];

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Sprawdza, czy jakikolwiek filtr jest aktywny (do sticky chipów).
 */
function countActiveFilters(f: BazaarFilters): number {
  let count = 0;
  if (f.vocation) count++;
  if (f.levelMin !== undefined || f.levelMax !== undefined) count++;
  if (f.bidMin !== undefined || f.bidMax !== undefined) count++;
  if (f.region) count++;
  if (f.world) count++;
  if (f.pvpType) count++;
  if (f.battleye) count++;
  if (f.hasSoulWar) count++;
  if (f.hasPrimalOrdeal) count++;
  if (f.search) count++;
  return count;
}

/**
 * Szuka count dla konkretnej opcji w facetach.
 */
function findCount(facets: FacetCount[], value: string): number {
  const found = facets.find((f) => f.value === value);
  return found?.count ?? 0;
}

// ─────────────────────────────────────────────────────────────────────
// AuctionFiltersSidebar
// ─────────────────────────────────────────────────────────────────────

export function AuctionFiltersSidebar({
  filters,
  onFilterChange,
  onReset,
  facetCounts,
  worldsByRegion,
  className,
}: AuctionFiltersSidebarProps) {
  const t = useTranslations("Bazaar.filters");
  const tSort = useTranslations("Bazaar");
  const tCard = useTranslations("Bazaar.card");
  const format = useFormatter();

  // ── Mutable helpers — generują nowy obiekt filtrów ─────────────
  const update = React.useCallback(
    (patch: Partial<BazaarFilters>) => {
      onFilterChange({ ...filters, ...patch });
    },
    [filters, onFilterChange],
  );

  const clearOne = React.useCallback(
    (key: keyof BazaarFilters) => {
      const next = { ...filters };
      if (key === "levelMin" || key === "levelMax") {
        delete next.levelMin;
        delete next.levelMax;
      } else if (key === "bidMin" || key === "bidMax") {
        delete next.bidMin;
        delete next.bidMax;
      } else {
        delete next[key];
      }
      onFilterChange(next);
    },
    [filters, onFilterChange],
  );

  const activeCount = countActiveFilters(filters);

  // ── Max Price: parsowanie input → number ─────────────────────────
  const [bidMaxInput, setBidMaxInput] = React.useState(
    filters.bidMax !== undefined ? String(filters.bidMax) : "",
  );
  React.useEffect(() => {
    setBidMaxInput(
      filters.bidMax !== undefined ? String(filters.bidMax) : "",
    );
  }, [filters.bidMax]);
  const commitBidMax = React.useCallback(() => {
    const value = bidMaxInput.trim();
    if (value === "") {
      if (filters.bidMax !== undefined) update({ bidMax: undefined });
      return;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (parsed !== filters.bidMax) update({ bidMax: parsed });
  }, [bidMaxInput, filters.bidMax, update]);

  // ── Search world: lokalny input → filter ────────────────────────
  const [worldSearch, setWorldSearch] = React.useState("");
  const filteredWorldsByRegion = React.useMemo(() => {
    const q = worldSearch.trim().toLowerCase();
    const result: Record<RegionFilter, string[]> = { EU: [], NA: [], BR: [] };
    for (const region of REGIONS) {
      const worlds = worldsByRegion[region] ?? [];
      result[region] = worlds.filter((w) =>
        q === "" ? true : w.toLowerCase().includes(q),
      );
    }
    return result;
  }, [worldsByRegion, worldSearch]);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-card p-4",
        className,
      )}
      aria-label={t("title")}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {t("title")}
        </h2>
        {activeCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-9 gap-1.5 px-2 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("reset")}
          </Button>
        ) : null}
      </div>

      {/* ── Vocation chips ────────────────────────────────────────── */}
      <section aria-labelledby="filter-vocation">
        <h3
          id="filter-vocation"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t("sections.vocation")}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {VOCATION_ORDER.map((voc) => {
            const count = findCount(facetCounts.vocation, voc);
            const active = filters.vocation === voc;
            return (
              <button
                key={voc}
                type="button"
                onClick={() =>
                  update({ vocation: active ? undefined : voc })
                }
                aria-pressed={active}
                disabled={count === 0 && !active}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? VOCATION_TONE[voc]
                    : "bg-background text-foreground hover:bg-accent",
                  count === 0 && !active && "opacity-40",
                )}
              >
                {t(`vocation.${voc.toLowerCase()}`)}
                <span className="numeric ml-1 font-mono text-xs tabular-nums opacity-70">
                  ({format.number(count, { useGrouping: true })})
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* ── Level presets + dual-range ────────────────────────────── */}
      <section aria-labelledby="filter-level">
        <h3
          id="filter-level"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t("sections.level")}
        </h3>

        {/* Presets (arch §5 krok 3 pkt 2) */}
        <div className="flex flex-wrap gap-1.5">
          {LEVEL_PRESETS.map((preset) => {
            const isActive =
              filters.levelMin === preset.min &&
              (preset.max === null
                ? filters.levelMax === undefined
                : filters.levelMax === preset.max);
            const labelKey = `levelPresets.${preset.key}`;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  if (isActive) {
                    update({ levelMin: undefined, levelMax: undefined });
                  } else {
                    update({
                      levelMin: preset.min,
                      levelMax: preset.max ?? undefined,
                    });
                  }
                }}
                aria-pressed={isActive}
                className={cn(
                  "inline-flex h-11 items-center rounded-full border px-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:bg-accent",
                )}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>

        {/* Dual-range inputs */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="level-min" className="text-xs">
              {t("levelMin")}
            </Label>
            <Input
              id="level-min"
              type="number"
              min={8}
              max={2500}
              inputMode="numeric"
              value={filters.levelMin ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                update({
                  levelMin:
                    value === "" ? undefined : Number.parseInt(value, 10),
                });
              }}
              className="numeric mt-1 h-11 font-mono tabular-nums"
              placeholder="8"
            />
          </div>
          <div>
            <Label htmlFor="level-max" className="text-xs">
              {t("levelMax")}
            </Label>
            <Input
              id="level-max"
              type="number"
              min={8}
              max={2500}
              inputMode="numeric"
              value={filters.levelMax ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                update({
                  levelMax:
                    value === "" ? undefined : Number.parseInt(value, 10),
                });
              }}
              className="numeric mt-1 h-11 font-mono tabular-nums"
              placeholder="2500"
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Max Price ─────────────────────────────────────────────── */}
      <section aria-labelledby="filter-price">
        <h3
          id="filter-price"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t("sections.price")}
        </h3>
        <div className="relative">
          <Input
            id="bid-max"
            type="number"
            inputMode="numeric"
            min={0}
            value={bidMaxInput}
            onChange={(e) => setBidMaxInput(e.target.value)}
            onBlur={commitBidMax}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitBidMax();
            }}
            placeholder={t("pricePlaceholder")}
            className="numeric h-11 pr-12 font-mono tabular-nums"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {t("priceSuffix")}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("priceHint", { rate: "0,42" })}
        </p>
      </section>

      <Separator />

      {/* ── Region toggles (arch §5 krok 3 pkt 4) ──────────────────── */}
      <section aria-labelledby="filter-region">
        <h3
          id="filter-region"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t("sections.world")}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {REGIONS.map((region) => {
            const count = findCount(facetCounts.region, region);
            const active = filters.region === region;
            return (
              <button
                key={region}
                type="button"
                onClick={() =>
                  update({ region: active ? undefined : region })
                }
                aria-pressed={active}
                disabled={count === 0 && !active}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:bg-accent",
                  count === 0 && !active && "opacity-40",
                )}
              >
                {t(`regions.${region}`)}
                <span className="numeric ml-1 font-mono text-xs tabular-nums opacity-70">
                  ({format.number(count, { useGrouping: true })})
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* ── World searchable multi-select (grupowane po regionie) ─── */}
      <section aria-labelledby="filter-world">
        <h3
          id="filter-world"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          <Globe className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
          {t("sections.world")}
        </h3>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            inputMode="search"
            value={worldSearch}
            onChange={(e) => setWorldSearch(e.target.value)}
            placeholder={t("worldPlaceholder")}
            className="h-11 pl-9"
            aria-label={t("worldPlaceholder")}
          />
        </div>

        <ScrollArea className="mt-2 h-48 rounded-md border bg-background">
          {REGIONS.every(
            (region) => filteredWorldsByRegion[region].length === 0,
          ) ? (
            <p className="p-3 text-center text-xs text-muted-foreground">
              {t("worldEmpty")}
            </p>
          ) : (
            REGIONS.map((region) => {
              const worlds = filteredWorldsByRegion[region];
              if (worlds.length === 0) return null;
              return (
                <div key={region} className="border-b p-2 last:border-b-0">
                  <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t(`regions.${region}`)}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {worlds.map((world) => {
                      const active = filters.world === world;
                      const count = findCount(facetCounts.world, world);
                      return (
                        <button
                          key={world}
                          type="button"
                          onClick={() =>
                            update({
                              world: active ? undefined : world,
                            })
                          }
                          aria-pressed={active}
                          className={cn(
                            "inline-flex h-9 w-full items-center justify-between gap-1.5 rounded-sm px-2 text-left text-sm transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                            active
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-muted",
                          )}
                        >
                          <span className="inline-flex items-center gap-2 truncate">
                            {active ? (
                              <Check
                                className="h-3.5 w-3.5 text-primary"
                                aria-hidden="true"
                              />
                            ) : (
                              <span className="h-3.5 w-3.5" />
                            )}
                            <span className="truncate">{world}</span>
                          </span>
                          <span className="numeric font-mono text-xs tabular-nums text-muted-foreground">
                            ({count})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </ScrollArea>
      </section>

      <Separator />

      {/* ── PvP type multi-select ─────────────────────────────────── */}
      <section aria-labelledby="filter-pvp">
        <h3
          id="filter-pvp"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t("sections.pvpType")}
        </h3>
        <div className="flex flex-col gap-1">
          {PVP_TYPES.map((pvp) => {
            const active = filters.pvpType === pvp;
            const count = findCount(facetCounts.pvpType, pvp);
            return (
              <label
                key={pvp}
                className={cn(
                  "flex h-11 cursor-pointer items-center justify-between gap-2 rounded-md border px-3 text-sm transition-colors",
                  "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input bg-background hover:bg-accent",
                  count === 0 && !active && "opacity-50",
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <Checkbox
                    checked={active}
                    onCheckedChange={(value) =>
                      update({ pvpType: value === true ? pvp : undefined })
                    }
                    aria-label={pvp}
                    className="h-4 w-4"
                  />
                  <span>{t(`pvpType.${pvp}`)}</span>
                </span>
                <span className="numeric font-mono text-xs tabular-nums text-muted-foreground">
                  ({count})
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* ── BattlEye select ───────────────────────────────────────── */}
      <section aria-labelledby="filter-battleye">
        <h3
          id="filter-battleye"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t("sections.battleye")}
        </h3>
        <Select
          value={filters.battleye ?? "__any"}
          onValueChange={(value) => {
            update({
              battleye:
                value === "__any"
                  ? undefined
                  : (value as BattlEyeFilter),
            });
          }}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder={t("sections.battleye")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any">—</SelectItem>
            {BATTLEYE_TYPES.map((be) => (
              <SelectItem key={be} value={be}>
                {t(`battleye.${be}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <Separator />

      {/* ── Heurystyczne flagi (arch §5 krok 4 — must-have toggles) ─── */}
      <section aria-labelledby="filter-flags">
        <h3
          id="filter-flags"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          <Sparkles className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
          {tSort("heuristic")}
        </h3>
        <div className="flex flex-col gap-1">
          <label
            className={cn(
              "flex h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors",
              filters.hasSoulWar
                ? "border-primary bg-primary/10"
                : "border-input bg-background hover:bg-accent",
            )}
          >
            <Checkbox
              checked={filters.hasSoulWar ?? false}
              onCheckedChange={(value) =>
                update({ hasSoulWar: value === true ? true : undefined })
              }
              className="h-4 w-4"
            />
            <span className="text-base">💀</span>
            <span className="flex-1">{tCard("tags.soulWar")}</span>
          </label>
          <label
            className={cn(
              "flex h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors",
              filters.hasPrimalOrdeal
                ? "border-primary bg-primary/10"
                : "border-input bg-background hover:bg-accent",
            )}
          >
            <Checkbox
              checked={filters.hasPrimalOrdeal ?? false}
              onCheckedChange={(value) =>
                update({
                  hasPrimalOrdeal: value === true ? true : undefined,
                })
              }
              className="h-4 w-4"
            />
            <span className="text-base">🦖</span>
            <span className="flex-1">{tCard("tags.primalOrdeal")}</span>
          </label>
        </div>
      </section>

      {/* ── Active filters (sticky chips) ─────────────────────────── */}
      {activeCount > 0 ? (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("activeTitle")} ({activeCount})
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="h-7 gap-1 px-2 text-[0.65rem]"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                {t("clear")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filters.vocation ? (
                <ActiveChip
                  label={t(`vocation.${filters.vocation.toLowerCase()}`)}
                  onRemove={() => clearOne("vocation")}
                />
              ) : null}
              {filters.region ? (
                <ActiveChip
                  label={t(`regions.${filters.region}`)}
                  onRemove={() => clearOne("region")}
                />
              ) : null}
              {filters.world ? (
                <ActiveChip
                  label={t("activeChip.world", { value: filters.world })}
                  onRemove={() => clearOne("world")}
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
                  onRemove={() => clearOne("levelMin")}
                />
              ) : null}
              {filters.bidMax !== undefined ? (
                <ActiveChip
                  label={t("activeChip.bidMax", { value: filters.bidMax })}
                  onRemove={() => clearOne("bidMax")}
                />
              ) : null}
              {filters.bidMin !== undefined ? (
                <ActiveChip
                  label={t("activeChip.bidMin", { value: filters.bidMin })}
                  onRemove={() => clearOne("bidMin")}
                />
              ) : null}
              {filters.pvpType ? (
                <ActiveChip
                  label={t(`pvpType.${filters.pvpType}`)}
                  onRemove={() => clearOne("pvpType")}
                />
              ) : null}
              {filters.battleye ? (
                <ActiveChip
                  label={t(`battleye.${filters.battleye}`)}
                  onRemove={() => clearOne("battleye")}
                />
              ) : null}
              {filters.hasSoulWar ? (
                <ActiveChip
                  label={t("activeChip.hasSoulWar")}
                  onRemove={() => clearOne("hasSoulWar")}
                />
              ) : null}
              {filters.hasPrimalOrdeal ? (
                <ActiveChip
                  label={t("activeChip.hasPrimalOrdeal")}
                  onRemove={() => clearOne("hasPrimalOrdeal")}
                />
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ActiveChip — sticky chip z przyciskiem ×
// ─────────────────────────────────────────────────────────────────────

interface ActiveChipProps {
  label: string;
  onRemove: () => void;
}

function ActiveChip({ label, onRemove }: ActiveChipProps) {
  return (
    <Badge
      variant="secondary"
      className="inline-flex h-7 items-center gap-1 pr-1 text-xs"
    >
      <span className="truncate max-w-[12rem]">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </Badge>
  );
}

// Icons unused marker — pomijamy ostrzeżenie o niewykorzystanym imporcie
// (ChevronDown używany pośrednio przez Select/Sheet).
void ChevronDown;