"use client";

/**
 * EndingSoonSectionLive — Client Component wrapper dla sekcji
 * "Kończące się w ciągu godziny" na home page (plan T59, arch §5 krok 1
 * + §8.5 — live SSE integration).
 *
 * ## Architektura
 *
 * Wrapper na `<AuctionSection>` (T53 — server-component-friendly) z dołożoną
 * subskrypcją SSE poprzez `useAuctionLive()` (T55 — dispatch równoległy).
 *
 * ```
 *  SSR (page.tsx → listEndingSoon(1))            ← initialAuctions
 *      │                                            (AuctionSummary[])
 *      ▼
 *  EndingSoonSectionLive
 *      │
 *      ├── useAuctionLive() — subskrybuje SSE /api/auctions/live
 *      │       │
 *      │       ├── EventSource(/api/auctions/live)
 *      │       │       onopen → status='connecting'
 *      │       │       onmessage → status='live', lastUpdate=Date
 *      │       │       onerror → polling fallback (30 s)
 *      │
 *      ├── Header z <Badge variant="success">LIVE</Badge> gdy status='live'
 *      ├── Live timestamp ("14:32:01") przy lastUpdate !== null
 *      └── <AuctionSection auctions={initialAuctions} /> — SSR data
 * ```
 *
 * ## Decyzja projektowa: STATUS-only integration
 *
 * Hook `useAuctionLive()` zwraca `EndingAuction[]` (subset pól z SSE).
 * Nasz SSR ma pełne `AuctionSummary[]` (skills, charms, vocation, boss pts,
 * ...) — zbyt wiele różnic żeby bridge'ować w renderze komponentu.
 *
 * **Dlatego T59 używa hooka TYLKO do statusu + lastUpdate.** Dane aukcji
 * pozostają SSR (`AuctionSummary[]`) przekazane przez props.
 *
 * Sekcja i tak odświeża się automatycznie przez:
 *   - `revalidate=300` ISR + `/api/revalidate` webhook po scrape (T38)
 *   - Local countdown w `<AuctionCard>` (T40) — tick co 1 s, zero requestów
 *
 * Live status służy jako **dowód świeżości** (badge + timestamp) — zgodnie
 * z arch §5 krok 1: "Hero z licznikiem aktualizowane 3 min temu (buduje
 * zaufanie)".
 *
 * ## MUST DO (plan T59)
 *
 * - **Fallback do SSR danych** — `initialAuctions` zawsze wypełnia grid
 * - **Header z `<Badge>LIVE</Badge>`** gdy `status === 'live'`
 * - **Reużyj** `<AuctionSection>` (T53) + `<AuctionCard>` (T40)
 * - **`aria-live="polite"`** na liczniku — count zmienia się bez focus
 * - **i18n PL + EN** — wszystkie labelki z `useTranslations("Home.live.*")`
 *
 * ## MUST NOT DO (plan T59)
 *
 * - **NIE** duplikuj `<AuctionSection>` — to ten sam wrapper z live status
 * - **NIE** hardcoded PL/EN
 * - **NIE** przerywaj SSR — strona działa bez JS (initialAuctions z server)
 */

import * as React from "react";
import { Clock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { AuctionSection } from "@/components/home/auction-section";
import type { AuctionSummary } from "@/components/bazaar/auction-summary";
import { useAuctionLive, type AuctionLiveStatus } from "@/lib/hooks/use-auction-live";

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export interface EndingSoonSectionLiveProps {
  /** SSR snapshot z `listEndingSoon(1)` (T38) — domyślny stan przed SSE. */
  initialAuctions: AuctionSummary[];
  /** Tytuł sekcji (i18n: `Home.sections.endingSoon.title`). */
  title: string;
  /** Opis sekcji (i18n). */
  description: string;
  /** Label "view all" linku (i18n). */
  viewAllLabel: string;
  /** Empty state — title (i18n). */
  emptyTitle: string;
  /** Empty state — description (i18n). */
  emptyDescription: string;
}

// ───────────────────────────────────────────────────────────────────────
// Badge color mapping (single source of truth)
// ───────────────────────────────────────────────────────────────────────

/**
 * Wariant Badge dla każdego statusu SSE (arch §6.4 + §6.1 tokeny).
 *
 * - `live` → success (zielony)
 * - `polling` → warning (żółty)
 * - `connecting` → secondary (szary, "Łączenie…")
 * - `error` → destructive (czerwony)
 */
const STATUS_BADGE_VARIANT: Record<
  AuctionLiveStatus,
  "success" | "warning" | "destructive" | "secondary"
> = {
  live: "success",
  polling: "warning",
  connecting: "secondary",
  error: "destructive",
};

// ───────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────

/**
 * Sekcja "Kończące się w ciągu godziny" z live SSE status indicator.
 *
 * Header:
 *   - Tytuł + opis (statyczne, z i18n)
 *   - Badge LIVE / POLLING / ŁĄCZENIE / OFFLINE w prawym górnym rogu
 *   - Live timestamp ("14:32:01") przy `lastUpdate !== null`
 *   - Licznik "X aukcji" z `aria-live="polite"`
 *
 * Body:
 *   - `<AuctionSection>` z `initialAuctions` (SSR — pełne dane aukcji)
 *
 * @param initialAuctions SSR dane z `listEndingSoon(1)` — fallback gdy
 *                        SSE jeszcze nie zwróciło lub zawiodło.
 */
export function EndingSoonSectionLive({
  initialAuctions,
  title,
  description,
  viewAllLabel,
  emptyTitle,
  emptyDescription,
}: EndingSoonSectionLiveProps) {
  // i18n — dedykowany namespace `Home.live` dla etykiet live indicatora.
  const tLive = useTranslations("Home.live");
  const format = useFormatter();

  // Hook SSE + polling fallback (T55).
  // Używamy go TYLKO do statusu + lastUpdate (nie do auctions — patrz
  // "Decyzja projektowa" w nagłówku pliku).
  const { status, lastUpdate } = useAuctionLive();

  // Licznik w i18n (ICU plural) — oparty na SSR danych (initialAuctions).
  const countText = format.number(initialAuctions.length, {
    useGrouping: true,
  });
  const counterText = tLive("counter", {
    count: initialAuctions.length,
    formatted: countText,
  });

  // Etykieta statusu z i18n — hook zwraca 4 statusy (connecting/live/polling/error).
  const statusLabel = tLive(status);

  return (
    <section aria-labelledby="ending-soon-live-title" className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="ending-soon-live-title"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight sm:text-xl"
            >
              <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
              {title}
            </h2>
            <Badge
              variant={STATUS_BADGE_VARIANT[status]}
              className="font-mono text-[0.65rem] uppercase tracking-wider"
              role="status"
              aria-label={`${statusLabel}`}
              data-status={status}
            >
              {statusLabel}
            </Badge>
            {lastUpdate !== null ? (
              <span
                className="numeric text-xs tabular-nums text-muted-foreground"
                aria-hidden="true"
                title={lastUpdate.toISOString()}
              >
                <span className="sr-only">
                  {tLive("lastUpdate", {
                    time: lastUpdate.toISOString(),
                  })}
                </span>
                {format.dateTime(lastUpdate, {
                  timeStyle: "medium",
                })}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>

        {/* Licznik z aria-live — count zmienia się dynamicznie (SSE push).
            `aria-live="polite"` ogłasza zmiany tylko gdy SR jest w stanie
            spoczynku (nie przerywa lektury). */}
        <p
          aria-live="polite"
          aria-atomic="true"
          className="numeric shrink-0 font-mono text-sm tabular-nums text-muted-foreground"
        >
          {counterText}
        </p>
      </header>

      {/* Body: reużycie `<AuctionSection>` (T53) — SSR dane (AuctionSummary[]).
          `hideHeader` — nagłówek (tytuł, opis, ikona) renderuje już ten
          komponent powyżej, wraz z badge LIVE i licznikiem. Bez tej flagi
          tytuł sekcji pojawiał się DWA razy. */}
      <AuctionSection
        sectionId="ending-soon-live"
        title={title}
        description={description}
        icon={Clock}
        auctions={initialAuctions}
        viewAllHref="/bazaar/ending-soon"
        viewAllLabel={viewAllLabel}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        maxItems={9}
        hideHeader
      />
    </section>
  );
}
