"use client";

/**
 * AuctionCountdownCell — kompaktowy countdown do tabeli (plan task 47,
 * arch §5 krok 5 + §6.4 pkt 10).
 *
 * Wymagania (arch §6.4 pkt 10 + §6.5 — WCAG 2.2 AA + a11y):
 *   - `setInterval(update, 1000)` — lokalny ticker (zero requestów).
 *   - `tabular-nums` (klasa `.numeric`) — zero jitter przy tykaniu.
 *   - `aria-live="off"` — screen reader **nie czyta co sekundę** (koszmar).
 *   - `< 5 min` → kolor `danger` + `animate-pulse` (odwracalny przez
 *     `prefers-reduced-motion: reduce`).
 *   - `< 1 dzień` → format `Hh Mm Ss` z wiodącymi zerami.
 *   - `< 1 godzina` → format `Xm YYs`.
 *   - `≥ 1 dzień` → format `Xd Yh`.
 *   - `≤ 0` → "Zakończona" + muted (bez pulse).
 *
 * W odróżnieniu od `<Countdown>` w `auction-card.tsx` (full featured):
 *   - Brak ikony (compact cell)
 *   - Mniejszy padding
 *   - Brak tooltip (sama wartość jest informacją)
 */

import * as React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────
// Helpers — pomiar `prefers-reduced-motion` (arch §6.5)
// ───────────────────────────────────────────────────────────────────────

/**
 * Subskrybuje `prefers-reduced-motion: reduce` i zwraca `true` gdy
 * user woli nie animować. SSR-safe (init: false).
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

// ───────────────────────────────────────────────────────────────────────
// Komponent
// ───────────────────────────────────────────────────────────────────────

export interface AuctionCountdownCellProps {
  /** ISO datetime zakończenia aukcji. */
  endsAt: string;
  className?: string;
}

export function AuctionCountdownCell({
  endsAt,
  className,
}: AuctionCountdownCellProps) {
  const t = useTranslations("Bazaar.card");
  const prefersReducedMotion = usePrefersReducedMotion();

  const endMs = React.useMemo(() => Date.parse(endsAt), [endsAt]);

  const computeRemaining = React.useCallback(
    (now: number) => Math.max(0, endMs - now),
    [endMs],
  );

  const [remainingMs, setRemainingMs] = React.useState<number>(() =>
    computeRemaining(Date.now()),
  );

  React.useEffect(() => {
    setRemainingMs(computeRemaining(Date.now()));
    const interval = setInterval(() => {
      setRemainingMs(computeRemaining(Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [computeRemaining]);

  // ── Progi (arch §6.4 + T47 spec)
  //   - `isEnded`     → remainingMs ≤ 0
  //   - `isUrgent`    → remainingMs < 5 min (danger + pulse)
  //   - `isWarning`   → remainingMs < 1h  (warning)
  //   - `isNormal`    → reszta (warning muted / foreground)
  const isEnded = remainingMs <= 0;
  const isUrgent = !isEnded && remainingMs < 5 * 60 * 1000;
  const isWarning = !isEnded && !isUrgent && remainingMs < 60 * 60 * 1000;

  // ── Format (arch §6.4 pkt 7-8 + T47):
  //   ≥ 1 dzień      → "Xd Yh"
  //   < 1 dzień, ≥1h → "Hh Mm"
  //   < 1h           → "Xm YYs" (z wiodącym zerem dla sekund)
  //   < 5 min        → "🔥 Xm YYs" (warning style)
  const formatted = React.useMemo(() => {
    if (isEnded) return t("ended");
    const totalSec = Math.floor(remainingMs / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    }
    const mm = minutes;
    const ss = String(seconds).padStart(2, "0");
    return isUrgent ? `🔥 ${mm}m ${ss}s` : `${mm}m ${ss}s`;
  }, [remainingMs, isEnded, isUrgent, t]);

  // Pulse animacji — wyłączone gdy `prefers-reduced-motion: reduce`
  // (arch §6.5 — "Reduced motion").
  const animatePulse = isUrgent && !prefersReducedMotion;

  return (
    <span
      className={cn(
        "numeric inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums",
        isEnded
          ? "bg-muted text-muted-foreground"
          : isUrgent
            ? cn(
                "bg-danger/15 text-danger",
                animatePulse && "animate-pulse",
              )
            : isWarning
              ? "bg-warning/15 text-warning-foreground"
              : "bg-muted/60 text-foreground",
        className,
      )}
      aria-live="off"
      title={formatted}
      data-testid="auction-countdown-cell"
      data-urgent={isUrgent || undefined}
      data-ended={isEnded || undefined}
    >
      {formatted}
    </span>
  );
}