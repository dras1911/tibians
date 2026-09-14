"use client";

import * as React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * PremiumGate (plan T85, arch §15.3) — bramka treści premium.
 *
 * Zasada projektowa (§15.3): FREE odpowiada na "czy warto?"; PREMIUM na
 * "dlaczego tyle i co dalej". Paywall NIGDY nie blokuje samej decyzji —
 * blokuje głębię analizy i wygodę.
 *
 * UX: blur (nie ukrycie) + KONKRETNA korzyść (nie "kup subskrypcję").
 * Uwaga: to warstwa prezentacji. Realne gate'owanie danych robi server
 * (getEntitlements + hasFeature — T83), żeby nie wysyłać premium danych
 * do klienta free.
 */
export interface PremiumGateProps {
  /** Czy użytkownik ma dostęp (z getEntitlements po stronie serwera). */
  allowed: boolean;
  /** Konkretna korzyść, np. "Zobacz, dlaczego wyceniliśmy to na 31 200 TC". */
  benefit: string;
  children: React.ReactNode;
  /** Intensywność blura (domyślnie 8px). */
  blur?: number;
  className?: string;
}

export function PremiumGate({
  allowed,
  benefit,
  children,
  blur = 8,
  className,
}: PremiumGateProps): React.ReactElement {
  if (allowed) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none select-none"
        style={{ filter: `blur(${blur}px)` }}
        data-premium-blurred="true"
      >
        {children}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/60 p-4 text-center backdrop-blur-[2px]">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent-subtle text-accent"
        >
          <Lock className="h-5 w-5" />
        </span>
        <p className="max-w-sm text-sm font-medium text-text-primary">
          {benefit}
        </p>
        <Button asChild size="sm">
          <Link href="/pl/premium">Zobacz plany →</Link>
        </Button>
      </div>
    </div>
  );
}
