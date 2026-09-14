"use client";

/**
 * BazaarLiveIndicator — sticky indicator w toolbarze `/bazaar`
 * pokazujący status SSE (plan T59, arch §8.5).
 *
 * ## Co robi
 *
 * Subskrybuje `useAuctionLive()` (T55 — dispatch równoległy) i wyświetla:
 *
 *   - 🟢 **LIVE**         — EventSource aktywny, dane napływają co 30 s
 *   - 🟡 **POLLING**      — SSE zawiódł, fallback do pollingu co 30 s
 *   - ⚪ **ŁĄCZENIE**     — EventSource tworzony, czeka na pierwsze dane
 *   - 🔴 **OFFLINE**      — oba źródła zawiodły (używane SSR dane)
 *
 * Tooltip wyjaśnia źródło danych (i18n: `Bazaar.live.tooltip.*`).
 *
 * ## MUST DO (plan T59)
 *
 * - **Mały sticky indicator** w toolbarze (nie zabiera miejsca)
 * - **Tooltip** dla każdego statusu
 * - **i18n PL + EN** — wszystkie labelki z `useTranslations("Bazaar.live.*")`
 * - **`aria-live="polite"`** — zmiana statusu ogłaszana SR
 *
 * ## MUST NOT DO (plan T59)
 *
 * - **NIE** duplikuj `useAuctionLive` — reużyj hook (T55)
 * - **NIE** hardcoded PL/EN
 * - **NIE** spamuj użytkownika zmianami statusu (to wolny cykl, max
 *   raz na 30 s)
 *
 * ## Layout
 *
 * Toolbar bazaar ma obecnie:
 *   `[<AuctionResultsToolbar />  ...........  <PresetDropdown />]`
 *
 * Indicator wstawiamy jako kolejny element (przed `PresetDropdown`, sticky
 * do prawego rogu):
 *   `[<AuctionResultsToolbar />  ...........  <BazaarLiveIndicator /> <PresetDropdown />]`
 *
 * Hook `useAuctionLive()` jest tu wołany **bez propsów** — subskrybuje
 * `/api/auctions/live` domyślnie. Dane aukcji są już w `<BazaarClient>`
 * (SSR + ISR), tu chcemy tylko wizualny feedback statusu SSE.
 */

import * as React from "react";
import { useTranslations } from "next-intl";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuctionLive } from "@/lib/hooks/use-auction-live";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export interface BazaarLiveIndicatorProps {
  /** Dodatkowe klasy (Tailwind) dla stickyzacji. */
  className?: string;
}

// ───────────────────────────────────────────────────────────────────────
// Color mapping (single source of truth)
// ───────────────────────────────────────────────────────────────────────

/**
 * Klasa koloru dla dotki + obwódki przycisku (per status).
 * Spójne z badge variants w `EndingSoonSectionLive`.
 */
const STATUS_DOT_CLASS: Record<
  "live" | "polling" | "connecting" | "error",
  string
> = {
  live: "bg-success",
  polling: "bg-warning",
  connecting: "bg-muted-foreground",
  error: "bg-destructive",
};

// ───────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────

/**
 * Sticky badge w toolbarze `/bazaar` pokazujący status SSE.
 *
 * Hook `useAuctionLive()` zwraca 4 statusy:
 * - `connecting` — EventSource tworzony
 * - `live`       — pierwsze dane dotarły
 * - `polling`    — fallback polling
 * - `error`      — oba zawiodły
 */
export function BazaarLiveIndicator({
  className,
}: BazaarLiveIndicatorProps) {
  // i18n: namespace `Bazaar.live.*`
  const tLive = useTranslations("Bazaar.live");

  // Hook — subskrybujemy SSE (T55). Używamy TYLKO do statusu —
  // dane aukcji są już w SSR (BazaarClient). Hook tworzy EventSource
  // do `/api/auctions/live` (domyślny URL).
  const { status, lastUpdate } = useAuctionLive();

  // Etykieta + tooltip tekst per status (i18n).
  const label = tLive(status);
  const tooltip = tLive(`tooltip.${status}`);

  // Kolor badge: live=success, polling=warning, error=destructive.
  const dotClass = cn(
    "h-2 w-2 shrink-0 rounded-full",
    STATUS_DOT_CLASS[status],
    status === "live" && "animate-pulse",
  );

  // `data-status` + kolor obwódki dla wizualnego rozróżnienia.
  const statusClasses = cn(
    status === "live" && "border-success/40 text-success",
    status === "polling" && "border-warning/40 text-warning",
    status === "connecting" && "border-muted-foreground/40 text-muted-foreground",
    status === "error" && "border-destructive/40 text-destructive",
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger
          type="button"
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-background/80 px-2.5",
            "font-mono text-[0.7rem] uppercase tracking-wider",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "transition-colors",
            statusClasses,
            className,
          )}
          // `aria-live` na inner span (nie button) — zmiana statusu
          // ogłasza się tylko gdy SR w spoczynku.
          data-status={status}
          aria-label={`${label}. ${tooltip}`}
        >
          <span className={dotClass} aria-hidden="true" />
          <span aria-live="polite" aria-atomic="true">
            {label}
          </span>
          {/* Ukryty znacznik czasu — informacyjny dla SR. */}
          {lastUpdate !== null ? (
            <span className="sr-only">
              {tLive("lastUpdate", {
                time: lastUpdate.toISOString(),
              })}
            </span>
          ) : null}
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <p className="max-w-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
