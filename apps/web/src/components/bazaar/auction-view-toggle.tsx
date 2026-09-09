"use client";

/**
 * AuctionViewToggle — przełącznik Cards ↔ Table (plan T40).
 *
 * Persystencja preferencji użytkownika w `localStorage['tibians:bazaar:view']`
 * (arch §5: "preferencja w localStorage"). Zachowuje wybór między
 * sesjami i nawigacją.
 *
 * Komponent jest kontrolowany przez parent (`value` + `onValueChange`)
 * — mount-effect inicjalizuje stan z localStorage, a następnie
 * synchronizuje zmiany. Gwarantuje to:
 *   - SSR-safe (pierwszy render = wartość domyślna "cards", bo
 *     localStorage nie istnieje po stronie serwera)
 *   - Stabilność między hydration a dalszą interakcją
 *
 * Arch §6.3 — touch targets 44 px (h-11).
 */

import * as React from "react";
import { LayoutGrid, Table as TableIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type BazaarView = "cards" | "table";

const STORAGE_KEY = "tibians:bazaar:view";

function readStored(): BazaarView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "cards" || raw === "table" ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(value: BazaarView): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore (private mode / quota)
  }
}

export interface AuctionViewToggleProps {
  /** Wartość kontrolowana (parent decyduje). */
  value: BazaarView;
  /** Zmiana wartości (parent aktualizuje URL/state). */
  onValueChange: (next: BazaarView) => void;
  className?: string;
}

export function AuctionViewToggle({
  value,
  onValueChange,
  className,
}: AuctionViewToggleProps) {
  const t = useTranslations("Bazaar.view");

  // Hydration: po pierwszym mount odczytaj preferencję z localStorage
  // (jeśli różni się od bieżącej wartości — daj znać parent).
  // Uruchamiane celowo tylko raz (po mount) — synchronizacja SSR/CSR.
  // Celowo bez zależności: brak reguły `react-hooks/exhaustive-deps`
  // w konfiguracji ESLint tego projektu.
  React.useEffect(() => {
    const stored = readStored();
    if (stored && stored !== value) {
      onValueChange(stored);
    }
  }, []);

  const handleSelect = React.useCallback(
    (next: BazaarView) => {
      if (next === value) return;
      writeStored(next);
      onValueChange(next);
    },
    [value, onValueChange],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div
        role="group"
        aria-label={t("label")}
        className={cn(
          "inline-flex h-11 items-center gap-0.5 rounded-md border bg-card p-1",
          className,
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => handleSelect("cards")}
              aria-pressed={value === "cards"}
              aria-label={t("cardsAria")}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                value === "cards"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t("cards")}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("cardsAria")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => handleSelect("table")}
              aria-pressed={value === "table"}
              aria-label={t("tableAria")}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                value === "table"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <TableIcon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t("table")}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("tableAria")}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/**
 * Helper: czyta preferencję widoku z localStorage po stronie klienta.
 * Bezpiecznie zwraca "cards" gdy storage jest niedostępny.
 */
export function readBazaarViewPreference(): BazaarView {
  return readStored() ?? "cards";
}