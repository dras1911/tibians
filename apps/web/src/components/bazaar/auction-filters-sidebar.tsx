"use client";

/**
 * AuctionFiltersSidebar — sidebar z szybkimi filtrami Bazaar (plan T41+T42).
 *
 * Sekcje (arch §5 krok 3 + §6.4):
 *   1. **Vocation** — chips z licznikiem `[Knight (812)] [Paladin (540)] …`
 *   2. **Level** — preset chips `8-50 · 50-150 · 150-300 · [300-600] · 600+`
 *      + dual-range inputs (advanced, future-proof)
 *   3. **Max Price** — input z placeholderem "TC"
 *   4. **World** — searchable multi-select, grupowany po regionie EU/NA/BR
 *   5. **PvP Type** — multi-select (Open / Optional / Hardcore / Retro * / Retro Hardcore)
 *   6. **BattlEye** — select (protected / initially protected / not protected)
 *   7. **Advanced (Collapsible)** — plan T42:
 *      - **Skill minimum** — reaktywne per vocation (Knight/Paladin/Druid/
 *        Sorcerer/Monk → dostępne skille z arch §2.1).
 *      - **Must-have toggles** — 8 heurystycznych flag (Soul War / Primal
 *        Ordeal / World Transfer / 23/23 Imbuementy / Charm Expansion /
 *        Prey Slot / Weekly Task Expansion / Twist of Fate).
 *      - **Rare item autocomplete** — `<RareItemCombobox>` debounced 300 ms
 *        na `/api/reference/items` (T42 endpoint).
 *      - **Gems** — 3 inputy (lesser / regular / greater) minimum.
 *      - **Store counts** — 3 inputy (outfits / mounts / items) minimum.
 *
 * Faceted counts (arch §6.4 pkt 1): każda opcja ma `count` z `mv_facet_counts`
 * (T34 view). Komponent jest prezentacyjny — counts przychodzą z parent.
 *
 * URL state sync (arch §5 + plan T43):
 *   - Każda zmiana filtru wywołuje `onFilterChange({ ...prev, [key]: value })`
 *   - Parent decyduje o `router.replace()` (T43 dispatch przez `useBazaarFilters`)
 *   - "Aktywne filtry" są renderowane przez `ActiveFiltersBar` (sticky rząd
 *     chipów pod toolbar) — duplikujemy je tutaj w stopce sidebara dla
 *     desktopu jako "ostatnia deska ratunku" gdy sticky bar jest zwinięty.
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
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";

import { STORE_ITEM_KEYS } from "@tibians/shared/auction";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RegionFlag } from "@/components/ui/region-flag";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { type BazaarFiltersUi } from "@/lib/hooks/use-bazaar-filters";

import { RareItemCombobox } from "./rare-item-combobox";

// ─────────────────────────────────────────────────────────────────────
// Publiczne typy — kanoniczny kształt filtrów przekazywany do sidebara
// ─────────────────────────────────────────────────────────────────────

/**
 * Alias typu filtrów Bazaar w UI. Re-eksport z `use-bazaar-filters`,
 * żeby konsumenci sidebara nie musieli importować hooka.
 */
export type BazaarFilters = BazaarFiltersUi;

/** 5 bazowych klas postaci (arch §6.1 — paleta OKLCH vocation). */
export type VocationFilter = NonNullable<BazaarFilters["vocation"]>;

/** Regiony serwerów. */
export type RegionFilter = NonNullable<BazaarFilters["region"]>;

/** PvP type (arch §7.2 worlds.pvp_type). */
export type PvPTypeFilter = NonNullable<BazaarFilters["pvpType"]>;

/** BattlEye status. */
export type BattlEyeFilter = NonNullable<BazaarFilters["battleye"]>;

/** Skill key (arch §7.2 auctions.skill_*). */
export type SkillFilterKey = NonNullable<BazaarFilters["skillType"]>;

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
  /** Store items — liczniki kuratorowanych kluczy (bez filtrów). */
  storeItems: FacetCount[];
  /** Łączna liczba aktywnych aukcji (bez filtrów). */
  totalActive: number;
}

export interface AuctionFiltersSidebarProps {
  /** Aktualny stan filtrów. */
  filters: BazaarFiltersUi;
  /** Callback po zmianie dowolnego filtra (URL state sync, plan T43). */
  onFilterChange: (next: BazaarFiltersUi) => void;
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
  // Postacie bez profesji (realny przypadek z tibia.com).
  "None",
];

const VOCATION_TONE: Record<VocationFilter, string> = {
  Knight: "bg-voc-knight/15 text-voc-knight border-voc-knight/40",
  Paladin: "bg-voc-paladin/15 text-voc-paladin border-voc-paladin/40",
  Druid: "bg-voc-druid/15 text-voc-druid border-voc-druid/40",
  Sorcerer: "bg-voc-sorcerer/15 text-voc-sorcerer border-voc-sorcerer/40",
  Monk: "bg-voc-monk/15 text-voc-monk border-voc-monk/40",
  None: "bg-muted/30 text-muted-foreground border-muted-foreground/40",
};

// ─────────────────────────────────────────────────────────────────────
// Skill options per vocation (arch §2.1 — TibiaPal contextual pairs)
// ─────────────────────────────────────────────────────────────────────

/**
 * Kontekstowe pary vocation/skill (arch §2.1 z benchmarku TibiaPal `/exercise`):
 *
 *   - Knight:   Sword / Club / Axe (melee), Shielding, Magic
 *   - Paladin:  Distance, Magic
 *   - Druid:    Magic
 *   - Sorcerer: Magic
 *   - Monk:     Magic, Fist
 *
 * Klucz `vocation === undefined` oznacza "bez vocation" — pokaż wszystkie
 * (domyślny fallback dla graczy, którzy chcą filtrować tylko po skille,
 * bez zawężania do konkretnej klasy).
 */
const SKILLS_BY_VOCATION: Record<VocationFilter, ReadonlyArray<SkillFilterKey>> = {
  Knight: ["sword", "club", "axe", "shielding", "magic"],
  Paladin: ["distance", "magic"],
  Druid: ["magic"],
  Sorcerer: ["magic"],
  Monk: ["magic", "fist"],
  // Postacie bez profesji (realny przypadek z tibia.com) — handlowo
  // liczy się tylko fist; nie mają czarów ani bonusów klasowych.
  None: ["fist"],
};

const ALL_SKILLS: ReadonlyArray<SkillFilterKey> = [
  "magic",
  "sword",
  "club",
  "axe",
  "distance",
  "shielding",
  "fist",
  "fishing",
];

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

// Tylko zielone (protected) i żółte (initially protected) — na Tibii nie ma
// światów bez BattlEye, więc „not protected” nie jest oferowane w filtrach.
const BATTLEYE_TYPES: BattlEyeFilter[] = ["protected", "initially protected"];

/**
 * Progi tagów „Różne" (wzór: ExevoPan — „Dużo charmów" itd.).
 * Dobrane z rozkładów produkcji (percentyle p75–p90 aktywnych aukcji),
 * żeby tagi nie łapały ani całej listy, ani pojedynczych sztuk.
 */
const LOTS_OF_CHARMS_MIN = 3000;
const LOTS_OF_QUESTS_MIN = 25;
const LOTS_OF_STORE_ITEMS_MIN = 10;

const REGIONS: RegionFilter[] = ["EU", "NA", "BR", "OCE"];

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Sprawdza, czy jakikolwiek filtr jest aktywny (do sticky chipów).
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
  if (f.storeItems) count++;
  if (f.biddedOnly) count++;
  if (f.charmPointsMin !== undefined || f.charmPointsMax !== undefined) count++;
  if (f.tcInvestedMin !== undefined || f.tcInvestedMax !== undefined) count++;
  if (f.questsMin !== undefined) count++;
  if (f.rareNicknames) count++;
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
  const tAdvanced = useTranslations("Bazaar.filters.advanced");
  const format = useFormatter();

  // ── Mutable helpers — generują nowy obiekt filtrów ─────────────
  const update = React.useCallback(
    (patch: Partial<BazaarFiltersUi>) => {
      onFilterChange({ ...filters, ...patch });
    },
    [filters, onFilterChange],
  );

  // ── Store items (CSV w `filters.storeItems`) ───────────────────────
  const storeItemsSelected = React.useMemo(
    () => new Set((filters.storeItems ?? "").split(",").filter(Boolean)),
    [filters.storeItems],
  );
  const toggleStoreItem = React.useCallback(
    (key: string, on: boolean) => {
      const next = new Set(storeItemsSelected);
      if (on) next.add(key);
      else next.delete(key);
      // Stała kolejność kluczy (STORE_ITEM_KEYS) — stabilny URL.
      const list = STORE_ITEM_KEYS.filter((k) => next.has(k));
      update({ storeItems: list.length > 0 ? list.join(",") : undefined });
    },
    [storeItemsSelected, update],
  );

  // ── Tagi „Różne" (wzór: ExevoPan) — skróty do filtrów z progami ────
  const miscTags: { key: string; checked: boolean; onToggle: (on: boolean) => void }[] = [
    {
      key: "soulWar",
      checked: filters.hasSoulWar === true,
      onToggle: (v) => update({ hasSoulWar: v ? true : undefined }),
    },
    {
      key: "primalOrdeal",
      checked: filters.hasPrimalOrdeal === true,
      onToggle: (v) => update({ hasPrimalOrdeal: v ? true : undefined }),
    },
    {
      key: "lotsOfCharms",
      checked: filters.charmPointsMin === LOTS_OF_CHARMS_MIN,
      onToggle: (v) => update({ charmPointsMin: v ? LOTS_OF_CHARMS_MIN : undefined }),
    },
    {
      key: "lotsOfQuests",
      checked: filters.questsMin === LOTS_OF_QUESTS_MIN,
      onToggle: (v) => update({ questsMin: v ? LOTS_OF_QUESTS_MIN : undefined }),
    },
    {
      key: "lotsOfStoreItems",
      checked: filters.storeMinItems === LOTS_OF_STORE_ITEMS_MIN,
      onToggle: (v) => update({ storeMinItems: v ? LOTS_OF_STORE_ITEMS_MIN : undefined }),
    },
    {
      key: "rareNicknames",
      checked: filters.rareNicknames === true,
      onToggle: (v) => update({ rareNicknames: v ? true : undefined }),
    },
  ];

  const clearOne = React.useCallback(
    (key: keyof BazaarFiltersUi) => {
      const next = { ...filters };
      if (key === "levelMin" || key === "levelMax") {
        delete next.levelMin;
        delete next.levelMax;
      } else if (key === "bidMin" || key === "bidMax") {
        delete next.bidMin;
        delete next.bidMax;
      } else if (key === "skillType" || key === "skillMin") {
        delete next.skillType;
        delete next.skillMin;
      } else if (key === "gemsMinLesser" || key === "gemsMinRegular" || key === "gemsMinGreater") {
        delete next.gemsMinLesser;
        delete next.gemsMinRegular;
        delete next.gemsMinGreater;
      } else if (key === "storeMinOutfits" || key === "storeMinMounts" || key === "storeMinItems") {
        delete next.storeMinOutfits;
        delete next.storeMinMounts;
        delete next.storeMinItems;
      } else if (key === "charmPointsMin" || key === "charmPointsMax") {
        delete next.charmPointsMin;
        delete next.charmPointsMax;
      } else if (key === "tcInvestedMin" || key === "tcInvestedMax") {
        delete next.tcInvestedMin;
        delete next.tcInvestedMax;
      } else if (key === "mustHaveItemId" || key === "mustHaveItemName") {
        delete next.mustHaveItemId;
        delete next.mustHaveItemName;
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
    setBidMaxInput(filters.bidMax !== undefined ? String(filters.bidMax) : "");
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
    const result: Record<RegionFilter, string[]> = {
      EU: [],
      NA: [],
      BR: [],
      OCE: [],
    };
    for (const region of REGIONS) {
      const worlds = worldsByRegion[region] ?? [];
      result[region] = worlds.filter((w) => (q === "" ? true : w.toLowerCase().includes(q)));
    }
    return result;
  }, [worldsByRegion, worldSearch]);

  // ── Advanced section open state — domyślnie zamknięte (arch §6.4) ─
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  // ── Skill options: reaktywne na vocation (arch §2.1) ───────────
  const skillOptions = React.useMemo(() => {
    return filters.vocation ? SKILLS_BY_VOCATION[filters.vocation] : ALL_SKILLS;
  }, [filters.vocation]);

  return (
    <div
      className={cn("flex flex-col gap-4 rounded-lg border bg-card p-4", className)}
      aria-label={t("title")}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{t("title")}</h2>
        {activeCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={onReset} className="h-9 gap-1.5 px-2 text-xs">
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
                onClick={() => update({ vocation: active ? undefined : voc })}
                aria-pressed={active}
                disabled={count === 0 && !active}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active ? VOCATION_TONE[voc] : "bg-background text-foreground hover:bg-accent",
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
                  levelMin: value === "" ? undefined : Number.parseInt(value, 10),
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
                  levelMax: value === "" ? undefined : Number.parseInt(value, 10),
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
        <p className="mt-1 text-xs text-muted-foreground">{t("priceHint", { rate: "0,42" })}</p>
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
                onClick={() => update({ region: active ? undefined : region })}
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
                <RegionFlag region={region} />
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
          {REGIONS.every((region) => filteredWorldsByRegion[region].length === 0) ? (
            <p className="p-3 text-center text-xs text-muted-foreground">{t("worldEmpty")}</p>
          ) : (
            REGIONS.map((region) => {
              const worlds = filteredWorldsByRegion[region];
              if (worlds.length === 0) return null;
              return (
                <div key={region} className="border-b p-2 last:border-b-0">
                  <p className="mb-1 inline-flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <RegionFlag region={region} />
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
                            active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                          )}
                        >
                          <span className="inline-flex items-center gap-2 truncate">
                            {active ? (
                              <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
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
              battleye: value === "__any" ? undefined : (value as BattlEyeFilter),
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

      {/* ── Advanced (Collapsible — plan T42, arch §6.4) ───────────── */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger
          trailing={<ChevronDown className="h-4 w-4" aria-hidden="true" />}
          className={cn(
            "rounded-md border border-dashed bg-muted/30 px-3",
            advancedOpen && "bg-muted/60",
          )}
          aria-label={advancedOpen ? tAdvanced("close") : tAdvanced("open")}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            {tAdvanced("title")}
          </span>
          {filters.skillType ||
          filters.skillMin !== undefined ||
          filters.hasSoulWar ||
          filters.hasPrimalOrdeal ||
          filters.hasWorldTransfer ||
          filters.hasPreySlot ||
          filters.hasCharmExpansion ||
          filters.hasWeeklyTaskExp ||
          filters.hasTwistOfFate ||
          filters.imbuesFull ||
          filters.mustHaveItemId !== undefined ||
          filters.gemsMinLesser !== undefined ||
          filters.gemsMinRegular !== undefined ||
          filters.gemsMinGreater !== undefined ||
          filters.storeMinOutfits !== undefined ||
          filters.storeMinMounts !== undefined ||
          filters.storeMinItems !== undefined ? (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[0.65rem]">
              {format.number(countAdvancedActive(filters), { useGrouping: true })}
            </Badge>
          ) : null}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          {/* ── Skill minimum (reactive per vocation — arch §2.1) ── */}
          <section aria-labelledby="filter-skill-min">
            <h4
              id="filter-skill-min"
              className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {tAdvanced("skillMin.label")}
            </h4>
            <p className="mb-2 text-[0.7rem] text-muted-foreground">
              {tAdvanced("skillMin.helper")}
            </p>
            <div className="space-y-2">
              <SkillMinControl
                filters={filters}
                update={update}
                skillOptions={skillOptions}
                t={tAdvanced}
              />
            </div>
          </section>

          <Separator />

          {/* ── Must-have toggles (8 elementów) ────────────────────── */}
          <section aria-labelledby="filter-must-have">
            <h4
              id="filter-must-have"
              className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              <Sparkles className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {tAdvanced("mustHave.label")}
            </h4>
            <div className="grid grid-cols-1 gap-1">
              <MustHaveToggle
                id="mh-imbuesfull"
                label={tAdvanced("mustHave.imbuesFull")}
                checked={filters.imbuesFull === true}
                onToggle={(v) => update({ imbuesFull: v ? true : undefined })}
              />
              <MustHaveToggle
                id="mh-worldtransfer"
                label={tAdvanced("mustHave.worldTransfer")}
                checked={filters.hasWorldTransfer === true}
                onToggle={(v) => update({ hasWorldTransfer: v ? true : undefined })}
              />
            </div>
          </section>

          <Separator />

          {/* ── Store items (kuratorowana lista jak ExevoPan) ───────── */}
          <section aria-labelledby="filter-store-items">
            <h4
              id="filter-store-items"
              className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              <ShoppingBag className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {tAdvanced("storeItems.label")}
            </h4>
            <div className="grid grid-cols-1 gap-1">
              {STORE_ITEM_KEYS.map((key) => (
                <MustHaveToggle
                  key={key}
                  id={`si-${key}`}
                  label={tAdvanced(`storeItems.items.${key}`)}
                  checked={storeItemsSelected.has(key)}
                  count={findCount(facetCounts.storeItems, key)}
                  onToggle={(v) => toggleStoreItem(key, v)}
                />
              ))}
              <MustHaveToggle
                id="si-charmexpansion"
                label={tAdvanced("mustHave.charmExpansion")}
                checked={filters.hasCharmExpansion === true}
                count={findCount(facetCounts.storeItems, "hasCharmExpansion")}
                onToggle={(v) => update({ hasCharmExpansion: v ? true : undefined })}
              />
              <MustHaveToggle
                id="si-preyslot"
                label={tAdvanced("mustHave.preySlot")}
                checked={filters.hasPreySlot === true}
                count={findCount(facetCounts.storeItems, "hasPreySlot")}
                onToggle={(v) => update({ hasPreySlot: v ? true : undefined })}
              />
              <MustHaveToggle
                id="si-weeklytask"
                label={tAdvanced("mustHave.weeklyTaskExp")}
                checked={filters.hasWeeklyTaskExp === true}
                count={findCount(facetCounts.storeItems, "hasWeeklyTaskExp")}
                onToggle={(v) => update({ hasWeeklyTaskExp: v ? true : undefined })}
              />
            </div>
          </section>

          <Separator />

          {/* ── Rare item autocomplete (debounced Combobox) ───────── */}
          <section aria-labelledby="filter-rare-item">
            <h4
              id="filter-rare-item"
              className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {tAdvanced("rareItem.label")}
            </h4>
            {/* `rareOnly={false}`: kolumna `items.is_rare` jest w bazie pusta
                (0/4384), więc filtr `rare=1` zwracał zawsze pustą listę —
                wyszukiwarka „nie znajdowała nic". Szukamy po WSZYSTKICH
                itemach (bez kuratorowanej listy rare jak w ExevoPan). */}
            <RareItemCombobox
              rareOnly={false}
              value={
                filters.mustHaveItemId !== undefined
                  ? {
                      id: filters.mustHaveItemId,
                      name: filters.mustHaveItemName ?? String(filters.mustHaveItemId),
                    }
                  : null
              }
              onChange={(next) => {
                if (next === null) {
                  update({
                    mustHaveItemId: undefined,
                    mustHaveItemName: undefined,
                  });
                } else {
                  update({
                    mustHaveItemId: next.id,
                    mustHaveItemName: next.name,
                  });
                }
              }}
            />
          </section>

          <Separator />

          {/* ── Gems (3 number inputs, minimum 0) ──────────────────── */}
          <section aria-labelledby="filter-gems">
            <h4
              id="filter-gems"
              className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {tAdvanced("gems.label")}
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <NumberField
                id="gems-lesser"
                label={tAdvanced("gems.lesser")}
                value={filters.gemsMinLesser}
                min={0}
                onChange={(v) => update({ gemsMinLesser: v })}
              />
              <NumberField
                id="gems-regular"
                label={tAdvanced("gems.regular")}
                value={filters.gemsMinRegular}
                min={0}
                onChange={(v) => update({ gemsMinRegular: v })}
              />
              <NumberField
                id="gems-greater"
                label={tAdvanced("gems.greater")}
                value={filters.gemsMinGreater}
                min={0}
                onChange={(v) => update({ gemsMinGreater: v })}
              />
            </div>
          </section>

          {/* ── Store counts (3 number inputs, minimum 0) ──────────── */}
          <section aria-labelledby="filter-store">
            <h4
              id="filter-store"
              className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {tAdvanced("store.label")}
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <NumberField
                id="store-outfits"
                label={tAdvanced("store.outfits")}
                value={filters.storeMinOutfits}
                min={0}
                onChange={(v) => update({ storeMinOutfits: v })}
              />
              <NumberField
                id="store-mounts"
                label={tAdvanced("store.mounts")}
                value={filters.storeMinMounts}
                min={0}
                onChange={(v) => update({ storeMinMounts: v })}
              />
              <NumberField
                id="store-items"
                label={tAdvanced("store.items")}
                value={filters.storeMinItems}
                min={0}
                onChange={(v) => update({ storeMinItems: v })}
              />
            </div>
          </section>

          {/* ── Różne (misc — jak ExevoPan) ─────────────────────────── */}
          <section aria-labelledby="filter-misc">
            <h4
              id="filter-misc"
              className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {tAdvanced("misc.label")}
            </h4>
            {/* Tagi (wzór: ExevoPan) — skróty do filtrów z ustalonymi progami. */}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {miscTags.map((tag) => (
                <button
                  key={tag.key}
                  type="button"
                  aria-pressed={tag.checked}
                  onClick={() => tag.onToggle(!tag.checked)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    tag.checked
                      ? "border-primary bg-primary/15 font-medium text-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {tAdvanced(`misc.tags.${tag.key}`)}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <MustHaveToggle
                id="misc-biddedonly"
                label={tAdvanced("misc.biddedOnly")}
                checked={filters.biddedOnly === true}
                onToggle={(v) => update({ biddedOnly: v ? true : undefined })}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  id="misc-charmmin"
                  label={tAdvanced("misc.charmMin")}
                  value={filters.charmPointsMin}
                  min={0}
                  onChange={(v) => update({ charmPointsMin: v })}
                />
                <NumberField
                  id="misc-charmmax"
                  label={tAdvanced("misc.charmMax")}
                  value={filters.charmPointsMax}
                  min={0}
                  onChange={(v) => update({ charmPointsMax: v })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  id="misc-tcmin"
                  label={tAdvanced("misc.tcMin")}
                  value={filters.tcInvestedMin}
                  min={0}
                  onChange={(v) => update({ tcInvestedMin: v })}
                />
                <NumberField
                  id="misc-tcmax"
                  label={tAdvanced("misc.tcMax")}
                  value={filters.tcInvestedMax}
                  min={0}
                  onChange={(v) => update({ tcInvestedMax: v })}
                />
              </div>
            </div>
          </section>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Aktywne filtry (kompaktowy widok na dole sidebara) ──── */}
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
                <SidebarChip
                  label={t(`vocation.${filters.vocation.toLowerCase()}`)}
                  onRemove={() => clearOne("vocation")}
                />
              ) : null}
              {filters.skillType && filters.skillMin !== undefined ? (
                <SidebarChip
                  label={t("activeChip.skillType", {
                    value: tAdvanced(`skills.${filters.skillType}`),
                    min: filters.skillMin,
                  })}
                  onRemove={() => clearOne("skillType")}
                />
              ) : null}
              {filters.region ? (
                <SidebarChip
                  label={t(`regions.${filters.region}`)}
                  onRemove={() => clearOne("region")}
                />
              ) : null}
              {filters.world ? (
                <SidebarChip
                  label={t("activeChip.world", { value: filters.world })}
                  onRemove={() => clearOne("world")}
                />
              ) : null}
              {filters.levelMin !== undefined || filters.levelMax !== undefined ? (
                <SidebarChip
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
                <SidebarChip
                  label={t("activeChip.bidMax", { value: filters.bidMax })}
                  onRemove={() => clearOne("bidMax")}
                />
              ) : null}
              {filters.bidMin !== undefined ? (
                <SidebarChip
                  label={t("activeChip.bidMin", { value: filters.bidMin })}
                  onRemove={() => clearOne("bidMin")}
                />
              ) : null}
              {filters.pvpType ? (
                <SidebarChip
                  label={t(`pvpType.${filters.pvpType}`)}
                  onRemove={() => clearOne("pvpType")}
                />
              ) : null}
              {filters.battleye ? (
                <SidebarChip
                  label={t(`battleye.${filters.battleye}`)}
                  onRemove={() => clearOne("battleye")}
                />
              ) : null}
              {filters.hasSoulWar ? (
                <SidebarChip
                  label={t("activeChip.hasSoulWar")}
                  onRemove={() => clearOne("hasSoulWar")}
                />
              ) : null}
              {filters.hasPrimalOrdeal ? (
                <SidebarChip
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
// Helpers (lokalne)
// ─────────────────────────────────────────────────────────────────────

/** Liczy tylko filtry zaawansowane (do badge'a w triggerze). */
function countAdvancedActive(f: BazaarFiltersUi): number {
  let count = 0;
  if (f.skillType || f.skillMin !== undefined) count++;
  if (f.hasSoulWar) count++;
  if (f.hasPrimalOrdeal) count++;
  if (f.hasWorldTransfer) count++;
  if (f.hasPreySlot) count++;
  if (f.hasCharmExpansion) count++;
  if (f.hasWeeklyTaskExp) count++;
  if (f.hasTwistOfFate) count++;
  if (f.imbuesFull) count++;
  if (f.mustHaveItemId !== undefined) count++;
  if (f.storeItems) count++;
  if (f.biddedOnly) count++;
  if (f.charmPointsMin !== undefined || f.charmPointsMax !== undefined) count++;
  if (f.tcInvestedMin !== undefined || f.tcInvestedMax !== undefined) count++;
  if (f.questsMin !== undefined) count++;
  if (f.rareNicknames) count++;
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
  return count;
}

// ─────────────────────────────────────────────────────────────────────
// MustHaveToggle — kompaktowy checkbox z etykietą emoji
// ─────────────────────────────────────────────────────────────────────

interface MustHaveToggleProps {
  id: string;
  label: string;
  checked: boolean;
  /** Opcjonalny licznik (np. ile aukcji ma dany store item). */
  count?: number;
  onToggle: (checked: boolean) => void;
}

function MustHaveToggle({ id, label, checked, count, onToggle }: MustHaveToggleProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-sm transition-colors",
        checked ? "border-primary bg-primary/10" : "border-input bg-background hover:bg-accent",
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onToggle(value === true)}
        className="h-4 w-4"
      />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span className="numeric font-mono text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────
// NumberField — number input z minimum 0 (gemy / store counts)
// ─────────────────────────────────────────────────────────────────────

interface NumberFieldProps {
  id: string;
  label: string;
  value: number | undefined;
  min?: number;
  max?: number;
  onChange: (next: number | undefined) => void;
}

function NumberField({ id, label, value, min = 0, max = 9999, onChange }: NumberFieldProps) {
  const [input, setInput] = React.useState(value !== undefined ? String(value) : "");
  React.useEffect(() => {
    setInput(value !== undefined ? String(value) : "");
  }, [value]);

  const commit = React.useCallback(() => {
    const trimmed = input.trim();
    if (trimmed === "") {
      if (value !== undefined) onChange(undefined);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < min) return;
    if (parsed > max) {
      onChange(max);
      setInput(String(max));
      return;
    }
    if (parsed !== value) onChange(parsed);
  }, [input, value, onChange, min, max]);

  return (
    <div>
      <Label htmlFor={id} className="text-[0.7rem] text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className="numeric mt-1 h-9 font-mono text-xs tabular-nums"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SkillMinControl — select + slider (0..250) dla skillu reaktywnego
// na filters.vocation (arch §2.1)
// ─────────────────────────────────────────────────────────────────────

interface SkillMinControlProps {
  filters: BazaarFiltersUi;
  update: (patch: Partial<BazaarFiltersUi>) => void;
  skillOptions: ReadonlyArray<SkillFilterKey>;
  t: ReturnType<typeof useTranslations>;
}

function SkillMinControl({ filters, update, skillOptions, t }: SkillMinControlProps) {
  const firstSkill = skillOptions[0];
  const selectedSkill: SkillFilterKey = filters.skillType ?? firstSkill ?? "magic";
  const selectedMin = filters.skillMin ?? 0;

  const handleSkillChange = (next: string) => {
    update({
      skillType: next as SkillFilterKey,
      // Reset min do 0 jeśli zmieniamy skill — stary min może nie mieć sensu.
      skillMin: 0,
    });
  };

  const handleMinChange = (next: number) => {
    update({ skillMin: next });
  };

  return (
    <div className="space-y-2">
      {/* Skill selector (Select — natychmiastowy feedback, bez debounce) */}
      <Select value={selectedSkill} onValueChange={handleSkillChange}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {skillOptions.map((skill) => (
            <SelectItem key={skill} value={skill}>
              {t(`skills.${skill}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Slider 0..250 + input liczbowy (mobile: wpisz wartość) */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">≥</span>
        <Slider
          value={[selectedMin]}
          min={0}
          max={250}
          step={1}
          onValueChange={(values) => handleMinChange(values[0] ?? 0)}
          aria-label={t("skillMin.min")}
          className="flex-1"
        />
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={250}
          step={1}
          value={selectedMin}
          onChange={(event) => {
            const raw = Number(event.target.value);
            if (Number.isNaN(raw)) return;
            handleMinChange(Math.min(250, Math.max(0, Math.trunc(raw))));
          }}
          aria-label={t("skillMin.min")}
          className="numeric h-8 w-[4.5rem] text-right font-mono text-xs tabular-nums"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SidebarChip — kompaktowy chip z × (desktop footer sidebara)
// ─────────────────────────────────────────────────────────────────────

interface SidebarChipProps {
  label: string;
  onRemove: () => void;
}

function SidebarChip({ label, onRemove }: SidebarChipProps) {
  return (
    <Badge variant="secondary" className="inline-flex h-7 items-center gap-1 pr-1 text-xs">
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
