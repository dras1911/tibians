"use client";

/**
 * EmptyResults — zero-state dla /bazaar z **wyliczalnymi sugestiami**
 * (plan task 45, arch §5 "Obsługa 0 wyników" + §6.4 pkt 7).
 *
 * Gdy `listAuctions()` zwraca `total === 0`, UI nie pokazuje pustej
 * planszy — zamiast tego **seriale-side** wyliczamy 3-5 countów
 * rozluźniających filtry (np. "Usuń filtr świata → +47 wyników") i
 * prezentujemy je jako **klikalne CTA** (arch §5).
 *
 * Zasady:
 *   - **Dokładne count** — liczone przez `getSuggestionCounts()` (server),
 *     NIE szacowane po stronie klienta (arch §5).
 *   - Każda sugestia = patch URL state (arch §6.4 pkt 4: URL = source).
 *   - Touch targets ≥ 44×44 (arch §6.3).
 *   - i18n PL + EN (next-intl).
 *   - Ilustracja SVG w `<Empty>`-like kontenerze (opcjonalna).
 */

import * as React from "react";
import { Inbox, Sparkles, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────
// Typy
// ───────────────────────────────────────────────────────────────────────

/**
 * Pojedyncza sugestia rozluźnienia filtra. Musi być zgodna z typem
 * zwracanym przez `getSuggestionCounts()` w `lib/server/auctions.ts`.
 *
 * Definiujemy tutaj lokalnie (strukturalnie identyczny), żeby nie
 * importować server-only z client island.
 */
export interface EmptyResultsSuggestion {
  id:
    | "removeWorld"
    | "removeRegion"
    | "removeBidMax"
    | "removeHasSoulWar"
    | "removeImbuesFull"
    | "removeHasPreySlot"
    | "removeHasCharmExpansion"
    | "removeHasWeeklyTaskExpansion"
    | "removeHasTwistOfFate"
    | "raiseBidMax"
    | "removeBattleye";
  count: number;
  patch: Record<string, string | number | boolean | null | undefined>;
}

export interface EmptyResultsProps {
  /** Sugestie wyliczone server-side. */
  suggestions: EmptyResultsSuggestion[];
  /** Callback wywoływany po kliknięciu CTA sugestii. */
  onApplySuggestion: (suggestion: EmptyResultsSuggestion) => void;
  /** Callback wywoływany po kliknięciu "Wyczyść wszystkie filtry". */
  onReset: () => void;
  className?: string;
}

// ───────────────────────────────────────────────────────────────────────
// Helper: tłumaczenie ID → klucz i18n + opis
// ───────────────────────────────────────────────────────────────────────

/**
 * Mapowanie `suggestion.id` → klucz i18n w `Bazaar.empty.suggestions`.
 * Dodatkowo parametry do interpolacji (np. `{count}` dla "X wyników",
 * `{bidMax}` dla nowego limitu ceny).
 */
function describeSuggestion(
  suggestion: EmptyResultsSuggestion,
): { labelKey: string; values: Record<string, string | number> } {
  switch (suggestion.id) {
    case "removeWorld":
      return { labelKey: "removeWorld", values: {} };
    case "removeRegion":
      return { labelKey: "removeRegion", values: {} };
    case "removeBidMax":
      return { labelKey: "removeBidMax", values: {} };
    case "raiseBidMax": {
      const newBidMax =
        typeof suggestion.patch.bidMax === "number" ? suggestion.patch.bidMax : 0;
      return {
        labelKey: "raiseBidMax",
        values: { bidMax: newBidMax },
      };
    }
    case "removeHasSoulWar":
      return { labelKey: "removeSoulWar", values: {} };
    case "removeImbuesFull":
      return { labelKey: "removeImbuesFull", values: {} };
    case "removeHasPreySlot":
      return { labelKey: "removePreySlot", values: {} };
    case "removeHasCharmExpansion":
      return { labelKey: "removeCharmExpansion", values: {} };
    case "removeHasWeeklyTaskExpansion":
      return { labelKey: "removeWeeklyTaskExp", values: {} };
    case "removeHasTwistOfFate":
      return { labelKey: "removeTwistOfFate", values: {} };
    case "removeBattleye":
      return { labelKey: "removeBattleye", values: {} };
  }
}

// ───────────────────────────────────────────────────────────────────────
// Empty illustration (SVG, minimalistyczny — styl "szukaj" / inbox)
// ───────────────────────────────────────────────────────────────────────

function EmptyIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("h-24 w-24 text-muted-foreground/50", className)}
    >
      <circle
        cx="60"
        cy="60"
        r="48"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="4 4"
        opacity="0.6"
      />
      <path
        d="M40 70h40M48 54l8 8 16-16"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <circle cx="84" cy="38" r="6" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

// ───────────────────────────────────────────────────────────────────────
// EmptyResults
// ───────────────────────────────────────────────────────────────────────

export function EmptyResults({
  suggestions,
  onApplySuggestion,
  onReset,
  className,
}: EmptyResultsProps) {
  const t = useTranslations("Bazaar.empty");
  const tList = useTranslations("Bazaar.list");
  const format = useFormatter();

  return (
    <Card
      role="status"
      aria-live="polite"
      className={cn(
        "border-dashed bg-gradient-to-b from-muted/30 to-muted/10",
        className,
      )}
      data-testid="empty-results"
    >
      <CardContent className="flex flex-col items-center gap-6 py-12 text-center sm:py-16">
        {/* ── Illustration + nagłówek ──────────────────────────────────── */}
        <EmptyIllustration className="h-24 w-24" />

        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {t("title")}
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground sm:text-base">
            {t("description")}
          </p>
        </div>

        {/* ── Sugestie (T45) — klikalne CTA z dokładnym count ─────────── */}
        {suggestions.length > 0 ? (
          <div
            className="w-full max-w-2xl space-y-3"
            data-testid="empty-suggestions"
          >
            <div className="flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("suggestionsTitle")}</span>
            </div>

            <ul className="grid gap-2 sm:grid-cols-1">
              {suggestions.map((suggestion) => {
                const { labelKey, values } = describeSuggestion(suggestion);
                const countLabel = t("countLabel", {
                  count: suggestion.count,
                });
                return (
                  <li key={suggestion.id}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onApplySuggestion(suggestion)}
                      className={cn(
                        "group h-auto w-full min-h-11 justify-between gap-3 whitespace-normal px-4 py-3",
                        "text-left text-sm font-medium",
                        "transition-colors hover:border-primary hover:bg-primary/5",
                      )}
                      aria-label={`${t(labelKey, values)} — ${countLabel}`}
                      data-suggestion-id={suggestion.id}
                    >
                      <span className="min-w-0 flex-1 text-left">
                        {t(labelKey, values)}
                      </span>
                      <span
                        className={cn(
                          "numeric shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold tabular-nums",
                          "bg-success/15 text-success",
                          "group-hover:bg-success/20",
                        )}
                      >
                        +{format.number(suggestion.count, { useGrouping: true })}
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {/* ── Fallback CTA: Wyczyść wszystkie filtry ───────────────────── */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant={suggestions.length > 0 ? "ghost" : "default"}
            size="sm"
            onClick={onReset}
            className="h-11"
            data-testid="empty-clear-all"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {tList("emptyCta")}
          </Button>
        </div>

        {/* ── Wsparcie: ikona inbox w tle (dekoracyjna) ───────────────── */}
        <Inbox
          className="pointer-events-none absolute right-4 bottom-4 h-8 w-8 text-muted-foreground/20"
          aria-hidden="true"
        />
      </CardContent>
    </Card>
  );
}