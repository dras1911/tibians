"use client";

/**
 * RareItemCombobox — autocomplete przedmiotów "rare" dla zaawansowanego
 * filtra Bazaar (plan T42, arch §2.1).
 *
 * UX:
 *   - Otwarty Popover (shadcn idiom) z `<Command>` (cmdk) — szybkie
 *     wyszukiwanie + klawiatura (↑↓ Enter Esc).
 *   - Debounce 300 ms na fetch (arch §6.4 pkt 2 — ale **zero debounce**
 *     na chipach/toggle/select; tutaj autocomplete z natury jest
 *     tekstowy, więc debounce jest OK).
 *   - Min. 2 znaki przed zapytaniem (mniej = zbyt wiele wyników).
 *   - Wybranie przedmiotu → zamyka Popover + ustawia `selectedItem`.
 *   - "Wyczyść" button dla usunięcia wyboru.
 *
 * API:
 *   - `value?: { id: number; name: string }` — aktualny wybór.
 *   - `onChange(...)` — callback po wybraniu / wyczyszczeniu.
 *
 * Endpoint: GET /api/reference/items?q=...&limit=20&rare=1 (T42).
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────
// Typy
// ───────────────────────────────────────────────────────────────────────

export interface ReferenceItemOption {
  id: number;
  name: string;
  namePl: string | null;
  isRare: boolean;
  isStoreItem: boolean;
  imageUrl: string;
}

export interface RareItemComboboxProps {
  /** Aktualnie wybrany przedmiot (id + name do wyświetlania). */
  value: { id: number; name: string } | null;
  /** Callback po wybraniu / wyczyszczeniu przedmiotu. */
  onChange: (next: { id: number; name: string } | null) => void;
  /** Klasa dodatkowa dla triggera. */
  className?: string;
  /** Debounce w ms (default 300). */
  debounceMs?: number;
  /** Tylko `is_rare = true` (default true). */
  rareOnly?: boolean;
  /** Endpoint (default "/api/reference/items"). */
  endpoint?: string;
}

// ───────────────────────────────────────────────────────────────────────
// Komponent
// ───────────────────────────────────────────────────────────────────────

export function RareItemCombobox({
  value,
  onChange,
  className,
  debounceMs = 300,
  rareOnly = true,
  endpoint = "/api/reference/items",
}: RareItemComboboxProps) {
  const t = useTranslations("Bazaar.filters.advanced.rareItem");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [items, setItems] = React.useState<ReferenceItemOption[]>([]);
  const [loading, setLoading] = React.useState(false);

  // ── Debounce query → debouncedQuery ───────────────────────────────
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  // ── Fetch z /api/reference/items ───────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    if (debouncedQuery.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set("q", debouncedQuery);
    url.searchParams.set("limit", "20");
    if (rareOnly) url.searchParams.set("rare", "1");
    fetch(url.toString(), { method: "GET" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ items: ReferenceItemOption[] }>;
      })
      .then((data) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => {
        // Cichy fallback — UI pokaże "Brak wyników".
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, endpoint, rareOnly]);

  // ── Handlery ───────────────────────────────────────────────────────
  const handleSelect = React.useCallback(
    (item: ReferenceItemOption) => {
      onChange({ id: item.id, name: item.name });
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const handleClear = React.useCallback(() => {
    onChange(null);
    setQuery("");
  }, [onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={t("label")}
          className={cn(
            "h-11 w-full justify-between gap-1 px-3 text-sm font-normal",
            value && "border-primary/50 bg-primary/5",
            className,
          )}
        >
          {value ? (
            <span className="flex items-center gap-2 truncate">
              <span className="truncate">{value.name}</span>
              <Badge
                variant="secondary"
                className="h-5 shrink-0 px-1.5 text-[0.65rem] font-mono tabular-nums"
              >
                #{value.id}
              </Badge>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("placeholder")}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-0.5">
            {value ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label={t("clear")}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleClear();
                  }
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </span>
            ) : null}
            <ChevronsUpDown
              className="h-3.5 w-3.5 opacity-50"
              aria-hidden="true"
            />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("placeholder")}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Skeleton className="h-3.5 w-3.5 rounded-full" />
                {t("loading")}
              </div>
            ) : debouncedQuery.length < 2 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {t("minChars")}
              </div>
            ) : items.length === 0 ? (
              <CommandEmpty>{t("empty")}</CommandEmpty>
            ) : (
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.id}-${item.name}`}
                    onSelect={() => handleSelect(item)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-muted text-[0.6rem] text-muted-foreground"
                      >
                        {/* mini-obrazek jeśli imageUrl istnieje (div z CSS background-image zamiast <img> — bez ESLint @next/next/no-img-element) */}
                        {item.imageUrl ? (
                          <div
                            role="img"
                            aria-label=""
                            style={{ backgroundImage: `url(${item.imageUrl})` }}
                            className="h-full w-full bg-contain bg-no-repeat bg-center"
                          />
                        ) : (
                          "?"
                        )}
                      </span>
                      <span className="truncate">
                        {item.namePl ?? item.name}
                      </span>
                    </span>
                    {value?.id === item.id ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
