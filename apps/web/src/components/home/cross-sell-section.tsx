/**
 * CrossSellSection — karty cross-sell kalkulatorów na home (plan T53,
 * arch §5 krok 1 — "Sekcja Najpopularniejsze kalkulatory").
 *
 * Wybrane 3 kalkulatory (plan T53 MUST):
 *   - Exercise Weapons (`/calculators/exercise-weapons`)
 *   - Character Value (`/calculators/character-value`)
 *   - Stamina (`/calculators/stamina`)
 *
 * **Renderowanie:**
 *   - Server Component
 *   - Statyczny katalog z `CALCULATORS` — zero fetches
 *   - Karty w 3-kolumnowym gridzie (1/2/3 breakpoints)
 *
 * **i18n:** label/title z `Calculators.index.items.<slug>.*` (już istnieją
 * w messages — reużywamy).
 */

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { CALCULATORS, type CalculatorMeta } from "@/components/calculators";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

const CROSS_SELL_SLUGS = [
  "exercise-weapons",
  "character-value",
  "stamina",
] as const;

/**
 * Wyciągnij meta dla wybranych cross-sell slugs.
 * Wymaga strict slugs (łatwiej testować i18n).
 */
function getCrossSellMeta(): CalculatorMeta[] {
  return CROSS_SELL_SLUGS.flatMap((slug) => {
    const meta = CALCULATORS.find((c) => c.messageKey === slug);
    return meta !== undefined ? [meta] : [];
  });
}

// ───────────────────────────────────────────────────────────────────────
// Component (Server Component)
// ───────────────────────────────────────────────────────────────────────

export async function CrossSellSection({
  title,
  description,
  viewAllLabel,
  viewAllHref,
}: {
  title: string;
  description: string;
  viewAllLabel: string;
  viewAllHref: string;
}) {
  const calculators = getCrossSellMeta();
  const tCalc = await getTranslations("Calculators.index");

  return (
    <section aria-labelledby="cross-sell-title" className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="cross-sell-title"
            className="text-lg font-semibold tracking-tight sm:text-xl"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Link
          href={viewAllHref as "/calculators"}
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

      <ul
        className={cn(
          "grid gap-4",
          "grid-cols-1",
          "sm:grid-cols-2",
          "lg:grid-cols-3",
        )}
      >
        {calculators.map((item) => {
          const Icon = item.icon;
          const itemTitle = tCalc(`items.${item.messageKey}.title`);
          const itemDescription = tCalc(
            `items.${item.messageKey}.description`,
          );
          return (
            <li key={item.slug} className="min-w-0">
              <Link
                href={item.slug as "/calculators/exercise-weapons"}
                className={cn(
                  "group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                )}
              >
                <Card
                  className={cn(
                    "h-full transition-all duration-200",
                    "group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md",
                    "group-focus-visible:border-primary/40 group-focus-visible:shadow-md",
                  )}
                >
                  <CardHeader className="gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
                          "bg-primary/10 text-primary",
                          "transition-colors group-hover:bg-primary/15",
                        )}
                        aria-hidden="true"
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                        aria-hidden="true"
                      />
                    </div>
                    <CardTitle className="text-base">{itemTitle}</CardTitle>
                    <CardDescription className="line-clamp-3 text-sm">
                      {itemDescription}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
