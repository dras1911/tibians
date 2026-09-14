"use client";

/**
 * HistoryFilters — filtry dla archiwum zakończonych aukcji (plan task 58,
 * arch §5 "Historia zakończonych aukcji").
 *
 * Sekcje:
 *   1. **Vocation** — chips (5 bazowych klas) — `null` = wszystkie.
 *   2. **Date range** — dwa `<Input type="date">` (dateFrom / dateTo).
 *   3. **World** — natywny `<select>` z listą światów (resolved
 *      z `getWorldsByRegion()` po stronie serwera). Brak multi-select
 *      — historia ma węższy zakres filtrów niż aktywne aukcje (arch
 *      §6.4: progressive disclosure, ale historia jest już "uproszczona").
 *
 * Filtry są zarządzane **przez URL state** (plan T43 + arch §6.4 pkt 4
 * "URL = source of truth"). Komponent jest prezentacyjny — handler
 * `onChange` wywoływany przez parent powinien aktualizować URL.
 *
 * Zasady UI (arch §6.3 + §6.5):
 *   - Touch targets ≥ 44 px (h-11)
 *   - Wszystkie labele PL + EN (`useTranslations("Bazaar.history.filters")`)
 *   - `prefers-reduced-motion` respektowane przez globalną konfigurację
 */

import * as React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarDays, RotateCcw } from "lucide-react";

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
import { cn } from "@/lib/utils";

const VOCATION_OPTIONS = [
  "Knight",
  "Paladin",
  "Druid",
  "Sorcerer",
  "Monk",
] as const;
type VocationOption = (typeof VOCATION_OPTIONS)[number];

/**
 * Wartości filtrów historii. Wszystkie pola opcjonalne — `null/undefined`
 * = "wszystkie".
 *
 * Daty są w formacie `YYYY-MM-DD` (HTML `<input type="date">` value).
 * Parent konwertuje je na `Date` przed wywołaniem `getFinishedAuctions`.
 */
export interface HistoryFiltersValue {
  world?: string | undefined;
  vocation?: VocationOption | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

export interface HistoryFiltersProps {
  /** Aktualny stan filtrów (z URL). */
  value: HistoryFiltersValue;
  /** Callback po zmianie dowolnego filtra. */
  onChange: (next: HistoryFiltersValue) => void;
  /** Callback "Wyczyść wszystkie". */
  onReset: () => void;
  /** Lista dostępnych światów (resolved z `getWorldsByRegion()`). */
  worlds: string[];
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Vocation tone — spójne z AuctionFiltersSidebar (arch §6.1)
// ─────────────────────────────────────────────────────────────────────

const VOCATION_TONE: Record<VocationOption, string> = {
  Knight: "bg-voc-knight/15 text-voc-knight border-voc-knight/40",
  Paladin: "bg-voc-paladin/15 text-voc-paladin border-voc-paladin/40",
  Druid: "bg-voc-druid/15 text-voc-druid border-voc-druid/40",
  Sorcerer: "bg-voc-sorcerer/15 text-voc-sorcerer border-voc-sorcerer/40",
  Monk: "bg-voc-monk/15 text-voc-monk border-voc-monk/40",
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function countActive(value: HistoryFiltersValue): number {
  let count = 0;
  if (value.vocation) count++;
  if (value.world) count++;
  if (value.dateFrom) count++;
  if (value.dateTo) count++;
  return count;
}

// ─────────────────────────────────────────────────────────────────────
// HistoryFilters
// ─────────────────────────────────────────────────────────────────────

export function HistoryFilters({
  value,
  onChange,
  onReset,
  worlds,
  className,
}: HistoryFiltersProps) {
  const t = useTranslations("Bazaar.history.filters");
  const tFilters = useTranslations("Bazaar.filters");
  const format = useFormatter();

  const update = React.useCallback(
    (patch: Partial<HistoryFiltersValue>) => {
      onChange({ ...value, ...patch });
    },
    [onChange, value],
  );

  const clearOne = React.useCallback(
    (key: keyof HistoryFiltersValue) => {
      const next: HistoryFiltersValue = { ...value };
      delete next[key];
      onChange(next);
    },
    [onChange, value],
  );

  const activeCount = countActive(value);

  // Konwersja `YYYY-MM-DD` → `Date` dla tooltipa pomocniczego
  const dateRangeLabel = React.useMemo(() => {
    if (!value.dateFrom && !value.dateTo) return null;
    const fmt = (d: string) =>
      format.dateTime(new Date(`${d}T00:00:00`), { dateStyle: "medium" });
    if (value.dateFrom && value.dateTo) {
      return `${fmt(value.dateFrom)} — ${fmt(value.dateTo)}`;
    }
    if (value.dateFrom) return `${t("fromDate")} ${fmt(value.dateFrom)}`;
    if (value.dateTo) return `${t("toDate")} ${fmt(value.dateTo)}`;
    return null;
  }, [value.dateFrom, value.dateTo, format, t]);

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
        <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-foreground">
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
            {tFilters("reset")}
          </Button>
        ) : null}
      </div>

      {/* ── Vocation chips ────────────────────────────────────────── */}
      <section aria-labelledby="history-filter-vocation">
        <h3
          id="history-filter-vocation"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {tFilters("sections.vocation")}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {VOCATION_OPTIONS.map((voc) => {
            const active = value.vocation === voc;
            return (
              <button
                key={voc}
                type="button"
                onClick={() =>
                  update({ vocation: active ? undefined : voc })
                }
                aria-pressed={active}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? VOCATION_TONE[voc]
                    : "bg-background text-foreground hover:bg-accent",
                )}
              >
                {tFilters(`vocation.${voc.toLowerCase()}`)}
              </button>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* ── Date range (dateFrom / dateTo) ────────────────────────── */}
      <section aria-labelledby="history-filter-date">
        <h3
          id="history-filter-date"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t("dateRange")}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="history-date-from" className="text-xs">
              {t("dateFrom")}
            </Label>
            <Input
              id="history-date-from"
              type="date"
              value={value.dateFrom ?? ""}
              max={value.dateTo ?? undefined}
              onChange={(e) =>
                update({ dateFrom: e.target.value === "" ? undefined : e.target.value })
              }
              className="numeric mt-1 h-11 font-mono tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="history-date-to" className="text-xs">
              {t("dateTo")}
            </Label>
            <Input
              id="history-date-to"
              type="date"
              value={value.dateTo ?? ""}
              min={value.dateFrom ?? undefined}
              onChange={(e) =>
                update({ dateTo: e.target.value === "" ? undefined : e.target.value })
              }
              className="numeric mt-1 h-11 font-mono tabular-nums"
            />
          </div>
        </div>
        {dateRangeLabel !== null ? (
          <p className="mt-1 text-xs text-muted-foreground">{dateRangeLabel}</p>
        ) : null}
      </section>

      <Separator />

      {/* ── World select ──────────────────────────────────────────── */}
      <section aria-labelledby="history-filter-world">
        <h3
          id="history-filter-world"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {tFilters("sections.world")}
        </h3>
        <Select
          value={value.world ?? "__any"}
          onValueChange={(v) =>
            update({ world: v === "__any" ? undefined : v })
          }
        >
          <SelectTrigger id="history-filter-world" className="h-11">
            <SelectValue placeholder={tFilters("sections.world")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any">{t("anyWorld")}</SelectItem>
            {worlds.map((world) => (
              <SelectItem key={world} value={world}>
                {world}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {/* ── Active filter chips (kompaktowy widok) ─────────────────── */}
      {activeCount > 0 ? (
        <>
          <Separator />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {tFilters("activeTitle")}
            </span>
            <Badge variant="secondary" className="font-mono tabular-nums">
              {activeCount}
            </Badge>
            {value.vocation ? (
              <FilterChip
                label={tFilters(`vocation.${value.vocation.toLowerCase()}`)}
                onRemove={() => clearOne("vocation")}
              />
            ) : null}
            {value.world ? (
              <FilterChip
                label={t("worldChip", { value: value.world })}
                onRemove={() => clearOne("world")}
              />
            ) : null}
            {value.dateFrom || value.dateTo ? (
              <FilterChip
                label={
                  value.dateFrom && value.dateTo
                    ? `${value.dateFrom} — ${value.dateTo}`
                    : value.dateFrom
                      ? t("fromDateChip", { value: value.dateFrom })
                      : t("toDateChip", { value: value.dateTo ?? "" })
                }
                onRemove={() => {
                  update({ dateFrom: undefined, dateTo: undefined });
                }}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FilterChip — lokalny helper, spójny z AuctionFiltersSidebar
// ─────────────────────────────────────────────────────────────────────

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-full border border-input bg-background px-2.5 text-xs",
        "transition-colors hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <span className="truncate">{label}</span>
      <span aria-hidden="true" className="text-muted-foreground">
        ×
      </span>
    </button>
  );
}