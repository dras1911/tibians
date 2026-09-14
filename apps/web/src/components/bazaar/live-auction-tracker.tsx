"use client";

/**
 * LiveAuctionTracker — Client Component dla SSE z fallback chain (plan task 55).
 *
 * ## Render prop pattern (arch §6.4 — kompozycja bez narzucania UI)
 *
 * Komponent NIE renderuje listy aukcji bezpośrednio — dostarcza hook
 * `useAuctionLive` i przekazuje jego wynik do `children` jako funkcję.
 * Konsument decyduje jak wyświetlić dane (karty, tabela, kompaktowa
 * sekcja na home).
 *
 * Dlaczego render prop, a nie context?
 *   - **Zero globalnego stanu** — każde wywołanie `useAuctionLive`
 *     ma swoje SSE/polling zasoby. Nie ma konfliktu wielu instancji.
 *   - **Lazy subscription** — tracker jest aktywny tylko gdy zamontowany
 *     w drzewie. Modal zamknięty = brak EventSource = zero network.
 *   - **Type-safe** — dzieci dostają pełny typ `UseAuctionLiveResult`,
 *     bez dodatkowej warstwy adapterów.
 *
 * ## Badge LIVE/POLLING (arch §6.4 — "live without distraction")
 *
 * Tracker opcjonalnie renderuje `<Badge>` z aktualnym statusem:
 *   - `live` → zielony badge "LIVE" (sukces)
 *   - `polling` → żółty badge "POLLING" (fallback działa)
 *   - `error` → czerwony badge "OFFLINE" (hook nie dostarcza danych)
 *   - `connecting` → badge "Łączenie…" (pierwsze połączenie)
 *
 * Rodzic może wyłączyć badge (`showStatusBadge={false}`) gdy sam
 * renderuje indykator w innym miejscu.
 *
 * ## Dlaczego NIE `<AuctionCard>` wewnątrz (MUST NOT DO)
 *
 * - Live tracker powinien być **agresywnie mały** — pierwsza rzecz
 *   po załadowaniu strony. Pełna karta to T40 (osobny task).
 * - Render prop pozwala na reużycie trackera w:
 *     - sekcji "ending soon" na home (compact view)
 *     - dedykowanej stronie `/bazaar/ending-soon` (full view, T56)
 *     - toolbarrze listy (compact 1-liner)
 *
 * ## MUST NOT DO (plan task 55)
 *
 * - **NIE** duplikuj badge'a statusu — parent decyduje czy go pokazać
 * - **NIE** importuj `AuctionCard` — to osobny komponent (T40+T47)
 * - **NIE** używaj `as any` / `@ts-ignore`
 */

import * as React from "react";
import { Radio } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  useAuctionLive,
  type AuctionLiveStatus,
  type UseAuctionLiveOptions,
  type UseAuctionLiveResult,
} from "@/lib/hooks/use-auction-live";

// ───────────────────────────────────────────────────────────────────────
// Typy
// ───────────────────────────────────────────────────────────────────────

/**
 * Funkcja render — dostaje aktualny stan SSE/polling i zwraca UI.
 *
 * Sygnatura celowo prosta: `(data) => ReactNode`. Konsument nie musi
 * używać WSZYSTKICH pól — np. dla toolbara wystarczy `status`.
 */
export type LiveAuctionRender = (data: UseAuctionLiveResult) => React.ReactNode;

/**
 * Props `LiveAuctionTracker`.
 */
export interface LiveAuctionTrackerProps
  extends Omit<UseAuctionLiveOptions, "enabled"> {
  /**
   * Render prop — funkcja otrzymująca `UseAuctionLiveResult` i
   * zwracająca UI. Wymagana.
   */
  children: LiveAuctionRender;
  /**
   * Czy hook jest aktywny. Domyślnie `true`.
   * Gdy `false` → brak EventSource, brak pollingu, hook zwraca stan
   * początkowy (puste auctions, status='connecting').
   */
  enabled?: boolean;
  /**
   * Czy renderować badge statusu obok children. Domyślnie `true`.
   */
  showStatusBadge?: boolean;
  /**
   * Klasy CSS dla kontenera wrappera. Przydatne do pozycjonowania
   * (np. `flex items-center gap-3`).
   */
  className?: string;
}

// ───────────────────────────────────────────────────────────────────────
// Badge — status indicator
// ───────────────────────────────────────────────────────────────────────

/**
 * Badge kolor + etykieta dla każdego statusu (arch §6.4: subtelne
 * wskazanie, nie krzyczące migające światełko).
 *
 * Używamy wariantów Badge: success (live), warning (polling/connecting),
 * danger (error). Tekst PL bo komponent specyficzny dla polskiego portalu.
 */
const STATUS_BADGE: Record<
  AuctionLiveStatus,
  { variant: "success" | "warning" | "destructive" | "secondary"; label: string }
> = {
  live: { variant: "success", label: "LIVE" },
  polling: { variant: "warning", label: "POLLING" },
  connecting: { variant: "secondary", label: "Łączenie…" },
  error: { variant: "destructive", label: "OFFLINE" },
};

// ───────────────────────────────────────────────────────────────────────
// Komponent
// ───────────────────────────────────────────────────────────────────────

/**
 * LiveAuctionTracker — patrz opis modułu.
 *
 * @example kompaktowa sekcja "ending soon":
 * ```tsx
 * <LiveAuctionTracker showStatusBadge>
 *   {({ auctions, status }) => (
 *     <ul>
 *       {auctions.slice(0, 5).map((a) => (
 *         <li key={a.auctionId}>{a.characterName} — {a.bid} TC</li>
 *       ))}
 *     </ul>
 *   )}
 * </LiveAuctionTracker>
 * ```
 *
 * @example z wyłącznikiem (np. po zamknięciu modala):
 * ```tsx
 * const [open, setOpen] = useState(true);
 * <LiveAuctionTracker enabled={open} liveUrl="/api/auctions/live">
 *   {({ auctions }) => <AuctionCardList auctions={auctions} />}
 * </LiveAuctionTracker>
 * ```
 */
export function LiveAuctionTracker({
  children,
  enabled = true,
  showStatusBadge = true,
  className,
  ...hookOptions
}: LiveAuctionTrackerProps): React.ReactElement {
  // Hook jest warunkowy — `enabled: false` natychmiast zamyka zasoby.
  const live = useAuctionLive({ ...hookOptions, enabled });

  // SSR-safe: nie renderuj badge z animacją przed hydration.
  // `lastUpdate` jest `null` na serwerze; badge "Łączenie…" wyświetlamy
  // natychmiast (to samo zachowanie co po mount).
  const badgeMeta = STATUS_BADGE[live.status];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {showStatusBadge ? (
        <div className="flex items-center gap-2">
          <Badge
            variant={badgeMeta.variant}
            className="inline-flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-wider"
            aria-live="polite"
            aria-label={`Status połączenia live: ${badgeMeta.label}`}
            data-live-status={live.status}
          >
            {/* Ikona "pulsującego radia" — tylko dla live. Static dla reszty. */}
            {live.status === "live" ? (
              <Radio
                className="h-3 w-3 animate-pulse"
                aria-hidden="true"
              />
            ) : (
              <Radio className="h-3 w-3" aria-hidden="true" />
            )}
            {badgeMeta.label}
          </Badge>
          {live.lastUpdate !== null ? (
            <span
              className="numeric text-xs tabular-nums text-muted-foreground"
              aria-hidden="true"
              title={live.lastUpdate.toISOString()}
            >
              {live.lastUpdate.toLocaleTimeString("pl-PL", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Render prop — konsument decyduje co wyświetlić */}
      <div data-live-tracker>{children(live)}</div>
    </div>
  );
}
