"use client";

import * as React from "react";
import { Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * TierComparison (plan T86, arch §15.1) — tabela Free vs Premium.
 *
 * Transparentne ceny (bez dark patterns). CTA prowadzi do checkoutu MoR
 * (Lemon Squeezy / Paddle — T82, konfigurowane env-em).
 */

interface FeatureRow {
  label: string;
  free: string | boolean;
  premium: string | boolean;
}

const FEATURES: readonly FeatureRow[] = [
  { label: "Lista aukcji + wszystkie filtry", free: true, premium: true },
  { label: "Detal aukcji (skille, itemy, questy)", free: true, premium: true },
  { label: "Licznik do końca (live, 1 s)", free: true, premium: true },
  { label: "Szacowana wartość postaci", free: true, premium: true },
  { label: "Wskaźnik okazji (−18% ✅)", free: true, premium: true },
  { label: "Wszystkie 14 kalkulatorów + Workspace", free: true, premium: true },
  { label: "Breakdown wyceny (dlaczego tyle?)", free: "🔒", premium: true },
  { label: "Wykres historii bidów", free: "🔒", premium: true },
  { label: "Pole „zainwestowane” (tc_invested)", free: "🔒", premium: true },
  { label: "SSE live — bez limitu", free: "top 5", premium: true },
  { label: "Porównywarka", free: "2 aukcje", premium: "4 + CSV" },
  { label: "Zapisane postacie", free: "3", premium: "bez limitu" },
  { label: "Presety filtrów", free: "3", premium: "bez limitu" },
  { label: "Reklamy", free: "są", premium: "brak" },
];

function Cell({ value }: { value: string | boolean }): React.ReactElement {
  if (value === true) {
    return (
      <Check
        className="mx-auto h-4 w-4 text-success"
        aria-label="Tak"
        aria-hidden="false"
      />
    );
  }
  if (value === false) {
    return (
      <X
        className="mx-auto h-4 w-4 text-text-muted"
        aria-label="Nie"
        aria-hidden="false"
      />
    );
  }
  return <span className="text-xs text-text-secondary">{value}</span>;
}

export interface TierComparisonProps {
  /** URL checkoutu MoR — z env (pusty = przycisk disabled z komunikatem). */
  checkoutUrl?: string | undefined;
  className?: string;
}

export function TierComparison({
  checkoutUrl,
  className,
}: TierComparisonProps): React.ReactElement {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="overflow-x-auto rounded-lg border border-border-default">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Porównanie planów Free i Premium</caption>
          <thead>
            <tr className="border-b border-border-default bg-muted">
              <th scope="col" className="px-4 py-3 text-left font-medium">
                Funkcja
              </th>
              <th scope="col" className="px-4 py-3 text-center font-medium">
                Free
              </th>
              <th scope="col" className="px-4 py-3 text-center font-medium">
                <span className="inline-flex items-center gap-2">
                  Premium
                  <Badge variant="secondary">🚀</Badge>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((row) => (
              <tr
                key={row.label}
                className="border-b border-border-subtle last:border-0"
              >
                <th
                  scope="row"
                  className="px-4 py-2.5 text-left font-normal text-text-primary"
                >
                  {row.label}
                </th>
                <td className="px-4 py-2.5 text-center">
                  <Cell value={row.free} />
                </td>
                <td className="bg-accent-subtle/40 px-4 py-2.5 text-center">
                  <Cell value={row.premium} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card className="flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm text-text-secondary">
          Anulujesz w każdej chwili. Płatność obsługuje nasz partner
          (Merchant of Record) — faktury i VAT po jego stronie.
        </p>
        <Button asChild size="lg" disabled={!checkoutUrl}>
          {checkoutUrl ? (
            <a href={checkoutUrl} rel="noopener noreferrer">
              Kup Premium →
            </a>
          ) : (
            <span>Premium dostępne wkrótce</span>
          )}
        </Button>
      </Card>
    </div>
  );
}
