"use client";

/**
 * ComparePicker — wybór drugiej aukcji do porównania (plan T51, arch
 * §5 krok 6: "Wybierz 2 aukcje do porównania" / "input ID lub dropdown
 * z top-10 najnowszych").
 *
 * Funkcjonalność (arch §5 krok 6):
 *   - Pole input do wklejenia ID aukcji (numeric, max 20 znaków —
 *     Tibia ID > Number.MAX_SAFE_INTEGER)
 *   - Dropdown z 10 najnowszymi aukcjami (server-provided prop)
 *   - Submit button "Porównaj" → wypycha `?a=ID1&b=ID2` do URL przez
 *     `next/navigation` (Server Component je odbiera i przeładowuje)
 *
 * Zasady UI (arch §6.3 + §6.4):
 *   - Touch targets ≥ 44×44 px (input + button mają h-11)
 *   - Pełna klawiatura: <select> + Enter submit
 *   - `aria-label` / `aria-describedby` dla SR
 *   - Zero hardcoded labels — wszystko z `useTranslations`
 *
 * Ograniczenie MVP (arch §15.1): max 2 aukcje. Premium tier (T84)
 * rozszerzy do 4 + eksport CSV.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Scale, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

import type { AuctionSummary } from "./auction-summary";

// ───────────────────────────────────────────────────────────────────────
// Props
// ───────────────────────────────────────────────────────────────────────

export interface ComparePickerProps {
  /** Pierwsza aukcja (już wybrana) — będzie parametrem `a` w URL. */
  primaryAuction: AuctionSummary;
  /** Top 10 najnowszych aukcji (server-provided). */
  recentAuctions: AuctionSummary[];
  /** Opcjonalny callback po wybraniu drugiej aukcji. */
  onSelect?: (secondId: string) => void;
  /** Dodatkowe klasy. */
  className?: string;
}

// ───────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────

export function ComparePicker({
  primaryAuction,
  recentAuctions,
  onSelect,
  className,
}: ComparePickerProps) {
  const t = useTranslations("Bazaar.compare");
  const router = useRouter();

  // Lokalny stan formularza (kontrolowany).
  const [value, setValue] = React.useState<string>("");
  const [dropdownValue, setDropdownValue] = React.useState<string>("");

  // Filtry listy dropdown — nie pokazuj tej samej aukcji co pierwsza.
  const candidates = React.useMemo(
    () => recentAuctions.filter((a) => a.id !== primaryAuction.id),
    [recentAuctions, primaryAuction.id],
  );

  // Submit handler — waliduje ID i nawiguje do /bazaar/compare?a=X&b=Y.
  const submit = React.useCallback(
    (id: string) => {
      const trimmed = id.trim();
      // Walidacja: tylko cyfry, max 20 znaków (Tibia ID ~17-18 cyfr).
      if (!/^\d{1,20}$/u.test(trimmed)) return;
      // Zapobieganie porównaniu aukcji samej z sobą.
      if (trimmed === primaryAuction.id) return;

      onSelect?.(trimmed);
      // Nawigacja po stronie klienta (Server Component odbiera query).
      router.push(`/bazaar/compare?a=${primaryAuction.id}&b=${trimmed}`);
    },
    [primaryAuction.id, router, onSelect],
  );

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submit(value || dropdownValue);
    },
    [submit, value, dropdownValue],
  );

  const handleClear = React.useCallback(() => {
    setValue("");
    setDropdownValue("");
  }, []);

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm",
        className,
      )}
      aria-labelledby="compare-picker-label"
    >
      <div className="flex items-center gap-2">
        <Scale className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2
          id="compare-picker-label"
          className="text-base font-semibold leading-none"
        >
          {t("pickerLabel")}
        </h2>
      </div>

      <p className="text-sm text-muted-foreground">{t("singleDescription")}</p>

      {/* ── Pierwsza aukcja (read-only podgląd) ────────────────────────── */}
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <Badge variant="success" className="shrink-0">
          A
        </Badge>
        <Link
          href={`/bazaar/${primaryAuction.id}`}
          className="flex-1 truncate text-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {primaryAuction.name}
          <span className="ml-2 text-xs text-muted-foreground">
            lvl {primaryAuction.level} · {primaryAuction.vocationPromoted}
          </span>
        </Link>
      </div>

      {/* ── Dropdown: top 10 najnowszych ────────────────────────────── */}
      <div className="space-y-1">
        <label
          htmlFor="compare-picker-dropdown"
          className="text-xs font-medium text-muted-foreground"
        >
          {t("pickerDropdownLabel")}
        </label>
        <select
          id="compare-picker-dropdown"
          value={dropdownValue}
          onChange={(e) => {
            setDropdownValue(e.target.value);
            setValue("");
          }}
          className={cn(
            "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <option value="">— {t("pickerPlaceholder")} —</option>
          {candidates.map((a) => (
            <option key={a.id} value={a.id}>
              #{a.id} · {a.name} (lvl {a.level} · {a.vocationPromoted} ·{" "}
              {a.world})
            </option>
          ))}
        </select>
      </div>

      {/* ── Divider "lub" ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span>lub</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>

      {/* ── Input: ID ręcznie ─────────────────────────────────────── */}
      <div className="space-y-1">
        <label
          htmlFor="compare-picker-input"
          className="text-xs font-medium text-muted-foreground"
        >
          {t("pickerInputLabel")}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="compare-picker-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={20}
            value={value}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/gu, "");
              setValue(next);
              setDropdownValue("");
            }}
            placeholder="np. 2173376"
            className="pl-9"
            aria-describedby="compare-picker-hint"
          />
        </div>
      </div>

      {/* ── Akcje ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={!value && !dropdownValue}
          className="h-11"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          {t("pickerClear")}
        </Button>
        <Button
          type="submit"
          size="default"
          disabled={!value && !dropdownValue}
          className="h-11 flex-1 sm:flex-none sm:px-6"
        >
          <Scale className="h-4 w-4" aria-hidden="true" />
          {t("pickerSubmit")}
        </Button>
      </div>

      <p
        id="compare-picker-hint"
        className="text-xs text-muted-foreground"
      >
        {t("premiumHint")}
      </p>
    </form>
  );
}
