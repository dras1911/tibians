"use client";

import * as React from "react";
import { Lock, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * PremiumBlur — placeholder dla paywalla "Premium feature" (T22, arch §15.1).
 *
 * **Dla T22**: w `app/[locale]/calculators/character-value/page.tsx` wszystko
 * jest widoczne (breakdown NIE jest ukrywany — gating będzie w T84/85 razem
 * z OAuth). Ten placeholder służy do ewentualnego pokazania overlay'a
 * "Premium feature — wkrótce" na breakdownie w wybranych kontekstach.
 *
 * **Dla T84/85** (Discord OAuth + Lemon Squeezy): ten komponent zostanie
 * zastąpiony prawdziwym `<RequirePremium>` (server-side guard z `getSession()`),
 * ale wizualnie zachowa tę samą hierarchię:
 *
 *   <PremiumBlur>
 *     <ActualBreakdown />   // to co widzą premium
 *   </PremiumBlur>
 *
 * Domyślnie **nie blur'uje** (variant="hidden"), ale ustawia `aria-label`
 * i badge "Premium" dla semantyki — UI testowe może włączyć blur dla QA
 * scenariuszy.
 *
 * @example
 * ```tsx
 * <PremiumBlur blur={false} badgeLabel="Premium">
 *   <Accordion>...</Accordion>
 * </PremiumBlur>
 * ```
 */
export interface PremiumBlurProps {
  /** Gdy `true` — renderuje overlay z blur + lock icon. Domyślnie `false`. */
  blur?: boolean;
  /**
   * Tekst wyświetlany w badge'u / overlay'u. Domyślnie "Premium".
   * Używane tylko gdy `blur` jest `true` lub `showBadge` jest `true`.
   */
  badgeLabel?: string;
  /** Pokaż badge "Premium" nawet bez blur (np. dla opt-in marketingu). */
  showBadge?: boolean;
  /** Lokalizowana treść overlay'a (gdy `blur=true`). */
  tooltipLabel?: string;
  /** Children — content do owinięcia. */
  children: React.ReactNode;
  className?: string;
}

/**
 * Warianty:
 *   - `blur=false` (default): renderuje children normalnie (no gate).
 *   - `blur=true`: renderuje children z `filter: blur(8px)` + pointer-events:none
 *     + absolutny "Lock" badge na środku z tooltipem "Premium feature — wkrótce".
 *
 * Realny auth gate (T84/85) zastąpi ten komponent — zamiast blur pokaże
 * upsell CTA z linkiem do Discord OAuth + Lemon Squeezy.
 */
export function PremiumBlur({
  blur = false,
  badgeLabel,
  showBadge = false,
  tooltipLabel,
  children,
  className,
}: PremiumBlurProps) {
  const t = useTranslations("Calculators.premium");

  const label = badgeLabel ?? t("badgeLabel");
  const tooltip = tooltipLabel ?? t("tooltip");

  // ── Wariant: bez blur (default dla T22) ─────────────────────────────
  if (!blur) {
    if (!showBadge) return <>{children}</>;
    return (
      <div className={cn("relative", className)}>
        {children}
        <div
          aria-label={label}
          className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary to-primary/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm"
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {label}
        </div>
      </div>
    );
  }

  // ── Wariant: blur (placeholder — T84/85) ───────────────────────────
  return (
    <div
      className={cn("relative", className)}
      data-premium-blur="true"
      aria-roledescription="premium-content-placeholder"
    >
      <div
        aria-hidden="true"
        className="select-none pointer-events-none"
        style={{ filter: "blur(8px)" }}
      >
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/40 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-primary/40 bg-background/80 px-6 py-4 text-center shadow-sm">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary"
            aria-hidden="true"
          >
            <Lock className="h-5 w-5" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              {label}
            </span>
            <p className="text-xs text-muted-foreground" title={tooltip}>
              {tooltip}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}