/**
 * AuctionSection — reużywalna sekcja siatki kart aukcji (T53).
 *
 * Używana przez:
 *   - EndingSoonSection (home, "Kończące się w ciągu godziny")
 *   - RecentlyUpdatedSection (home, "Ostatnio zaktualizowane")
 *
 * **Hierarchia:**
 *   - Header z title + description + "view all" link
 *   - Grid kart (1/2/3/4 kolumny zależnie od breakpoint)
 *   - Empty state gdy brak aukcji
 *
 * **Reużycie:** `AuctionCard` z T40 (mobile-preferowany widok).
 */

import * as React from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { AuctionCard } from "@/components/bazaar/auction-card";
import type { AuctionSummary } from "@/components/bazaar/auction-summary";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export interface AuctionSectionProps {
  /** ID sekcji (np. "ending-soon") — dla `aria-labelledby`. */
  sectionId: string;
  /** Tytuł sekcji. */
  title: string;
  /** Opis pod tytułem. */
  description: string;
  /** Opcjonalna ikona (Lucide) przy tytule. */
  icon?: LucideIcon;
  /** Lista aukcji (max 8 dla UI). */
  auctions: AuctionSummary[];
  /** URL "view all" (np. `/bazaar?sort=ending` lub `/bazaar?sort=newest`). */
  viewAllHref: string;
  /** Label na linku "view all". */
  viewAllLabel: string;
  /** Empty state — title. */
  emptyTitle: string;
  /** Empty state — description. */
  emptyDescription: string;
  /** Ile aukcji pokazać (default 4 dla ending-soon, 6 dla recently-updated). */
  maxItems?: number;
}

// ───────────────────────────────────────────────────────────────────────
// Component (Server Component)
// ───────────────────────────────────────────────────────────────────────

export function AuctionSection({
  sectionId,
  title,
  description,
  icon: Icon,
  auctions,
  viewAllHref,
  viewAllLabel,
  emptyTitle,
  emptyDescription,
  maxItems = 4,
}: AuctionSectionProps) {
  const shown = auctions.slice(0, maxItems);
  const titleId = `${sectionId}-title`;

  return (
    <section
      aria-labelledby={titleId}
      className="space-y-4"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id={titleId}
            className="flex items-center gap-2 text-lg font-semibold tracking-tight sm:text-xl"
          >
            {Icon !== undefined ? (
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            ) : null}
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Link
          href={viewAllHref as "/bazaar"}
          className={cn(
            "shrink-0 text-sm font-medium text-primary hover:underline",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          {viewAllLabel}
          <ArrowRight
            className="ml-1 inline h-3.5 w-3.5"
            aria-hidden="true"
          />
        </Link>
      </header>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1">{emptyDescription}</p>
        </div>
      ) : (
        <ul
          className={cn(
            "grid gap-4",
            "grid-cols-1",
            maxItems >= 2 ? "sm:grid-cols-2" : null,
            maxItems >= 3 ? "lg:grid-cols-3" : null,
            maxItems >= 4 ? "lg:grid-cols-4" : null,
            maxItems >= 6 ? "xl:grid-cols-6" : null,
          )}
        >
          {shown.map((auction) => (
            <li key={auction.id} className="min-w-0">
              <AuctionCard auction={auction} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
