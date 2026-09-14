/**
 * SimilarAuctions — sekcja "Podobne aukcje" na detalu (plan T52,
 * arch §5 krok 7 — ostatni bullet: "Stopka detalu: 'Podobne aukcje'
 * (4 karty, te same filtry co ta aukcja)").
 *
 * **Logika (plan T52 MUST):**
 *   - Te same vocation + PvP co obecna aukcja
 *   - Level ±50 (domyślnie)
 *   - Bid ±30% (domyślnie)
 *   - Wykluczenie obecnej aukcji
 *   - 4 karty (limit w UI)
 *
 * **Reużycie:**
 *   - `AuctionCard` z T40 (mobile-preferowany widok kart)
 *   - `AuctionSummary` (client-safe shape)
 *
 * **Link "Zobacz wszystkie":**
 *   - `/bazaar?vocation=<base>&levelMin=<X>&levelMax=<Y>` (plan T52)
 *
 * **i18n:** namespace `Bazaar.similar.*` (PL + EN).
 */

import * as React from "react";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Sparkles } from "lucide-react";

import { AuctionCard } from "@/components/bazaar/auction-card";
import type { AuctionSummary } from "@/components/bazaar/auction-summary";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export interface SimilarAuctionsProps {
  /** Obecna aukcja — używana do skonstruowania URL "view all" + label. */
  currentAuction: AuctionSummary;
  /** Lista aukcji pasujących do filtrów (z `getSimilarAuctions`). */
  similar: AuctionSummary[];
}

// ───────────────────────────────────────────────────────────────────────
// Component (Server Component)
// ───────────────────────────────────────────────────────────────────────

export async function SimilarAuctions({
  currentAuction,
  similar,
}: SimilarAuctionsProps) {
  const t = await getTranslations("Bazaar.similar");

  const limit = 4;
  const shown = similar.slice(0, limit);
  const total = similar.length;

  // URL "view all" z filtrami zawężonymi do tej aukcji.
  const viewAllParams = new URLSearchParams();
  viewAllParams.set("vocation", currentAuction.vocation);
  viewAllParams.set("levelMin", String(Math.max(8, currentAuction.level - 50)));
  viewAllParams.set("levelMax", String(currentAuction.level + 50));

  return (
    <section
      aria-labelledby="similar-auctions-title"
      className="space-y-4"
    >
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2
            id="similar-auctions-title"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight sm:text-xl"
          >
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("sectionTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("sectionDescription")}
          </p>
        </div>
        {total > 0 ? (
          <Link
            href={`/bazaar?${viewAllParams.toString()}` as "/bazaar"}
            className={cn(
              "shrink-0 text-sm font-medium text-primary hover:underline",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
          >
            {t("viewAll")}
            <ArrowRight
              className="ml-1 inline h-3.5 w-3.5"
              aria-hidden="true"
            />
          </Link>
        ) : null}
      </header>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="mt-1">{t("emptyDescription")}</p>
        </div>
      ) : (
        <>
          <ul
            className={cn(
              "grid gap-4",
              "grid-cols-1",
              "sm:grid-cols-2",
              "lg:grid-cols-4",
            )}
          >
            {shown.map((auction) => (
              <li key={auction.id} className="min-w-0">
                <AuctionCard auction={auction} />
              </li>
            ))}
          </ul>
          {total > limit ? (
            <p className="text-center text-xs text-muted-foreground">
              {t("limitNotice", { count: limit, total })}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
