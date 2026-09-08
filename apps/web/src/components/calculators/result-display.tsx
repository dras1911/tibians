"use client";

import * as React from "react";
import { Check, Copy, Info, Lightbulb, AlertTriangle, ThumbsUp, ThumbsDown, HelpCircle, type LucideIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * ResultDisplay — shared result renderer for every calculator page.
 *
 * Architecture §13.4: every calculator renders a single primary number
 * (mono / `tabular-nums`), optional secondary values, an optional
 * recommendation badge, and a "Copy link" action. This component is the
 * visual contract — every T17-T23 page uses it.
 *
 * Design rules enforced here:
 *   - **Presentional only**: no calculator logic, no global state, no
 *     context. Parents compute the result and pass it down as props.
 *   - **All numeric output uses the `.numeric` class** from
 *     `@tibians/ui/styles.css` (`font-variant-numeric: tabular-nums`).
 *     This kills layout jitter when the live SSE bid ticks every 30 s,
 *     and stops the result panel from "wiggling" when numbers change
 *     during what-if editing (task 26).
 *   - **All formatting is locale-aware**: numbers use
 *     `useFormatter().number()` (next-intl), which wraps
 *     `Intl.NumberFormat(locale)`. This is the contract required by
 *     architecture §3.1 / §6.2 — never use raw `.toLocaleString()`.
 *   - **Bigint is first-class**: the calculator engine (T15) returns
 *     `bigint` for XP totals to dodge IEEE-754 precision loss; we
 *     format them with `formatNumber(value, { useGrouping: true })`
 *     which accepts both `Number` and `BigInt` natively.
 *   - **Compact format for huge numbers**: anything ≥ 100 000 collapses
 *     to a short form ("1,5 mln" / "1.5M"). This keeps the card readable
 *     on mobile without inventing a new component.
 */
export type RecommendationTone =
  | "success"
  | "warning"
  | "info"
  | "negative"
  | "neutral";

export type ResultValue = number | bigint | string;

export interface ResultSecondaryValue {
  label: string;
  value: ResultValue;
  unit?: string;
}

export interface RecommendationObject {
  tone?: RecommendationTone;
  message: string;
}

export type Recommendation = string | RecommendationObject | React.ReactNode;

export interface ResultDisplayProps {
  /** Primary value (e.g. "Time: 4 h 12 min", "Bid: 25 501 gp"). */
  primaryValue?: ResultValue;
  /** Unit shown after the formatted number (e.g. "gp", "TC", "h"). */
  unit?: string;
  /** Optional override for the primary label (default = t("primaryValueLabel")). */
  primaryLabel?: string;
  /** Secondary breakdown (e.g. "Cost: 14 250 gp" / "TC: 1"). */
  secondaryValues?: ResultSecondaryValue[];
  /**
   * Recommendation to surface under the values. Accepts either:
   *   - a plain string (tone auto-inferred from content),
   *   - an object with an explicit `tone` and `message`,
   *   - or any ReactNode for custom markup.
   * If omitted, no recommendation is rendered.
   */
  recommendation?: Recommendation;
  /** Show the "Copy link" button. Defaults to `true`. */
  copyLink?: boolean;
  /**
   * Loading state — renders skeleton placeholders that match the
   * layout of the real values so the page doesn't shift when the data
   * arrives (architecture §6.4 — skeleton > spinner).
   */
  isLoading?: boolean;
  /**
   * Empty state — no calculation has been run yet. Overrides `isLoading`
   * when both are set.
   */
  empty?: boolean;
  className?: string;
}

/**
 * Internal: decide which tone a plain-string recommendation gets by
 * scanning the leading emoji / keyword. This is deliberately cheap (no
 * ML, no big dictionary) — the few calculators shipping today all use
 * the same vocabulary, and anything novel can pass `{ tone, message }`.
 */
function detectTone(input: string): RecommendationTone {
  const s = input.trim().toLowerCase();
  if (/^(\u2713|\u2714|\u2705|✓|✔|ok|tak|sukces|success|opłaca się|worth|good)/.test(s))
    return "success";
  if (/^(\u26a0|⚠|uwaga|warning|ostrzeżenie|nope|nie|not|don't|careful)/.test(s))
    return "warning";
  if (/^(\u2717|\u2716|\u274c|✗|✖|no|fail|nie opłaca|not worth|negative)/.test(s))
    return "negative";
  if (/^(\u2139|ℹ|info|wskazówka|hint|tip|note)/.test(s))
    return "info";
  return "neutral";
}

const TONE_ICON: Record<RecommendationTone, LucideIcon> = {
  success: ThumbsUp,
  warning: AlertTriangle,
  info: Lightbulb,
  negative: ThumbsDown,
  neutral: Info,
};

const TONE_BADGE: Record<RecommendationTone, "success" | "warning" | "info" | "destructive" | "secondary"> = {
  success: "success",
  warning: "warning",
  info: "info",
  negative: "destructive",
  neutral: "secondary",
};

const TONE_LABEL_KEY: Record<RecommendationTone, string> = {
  success: "recommendationPositive",
  negative: "recommendationNegative",
  neutral: "recommendationNeutral",
  warning: "recommendationWarning",
  info: "recommendationInfo",
};

/**
 * Format a number/bigint using the active locale's `Intl.NumberFormat`.
 * For bigit values we cast through `String()` (next-intl's formatter
 * detects BigInt natively as of 3.20).
 *
 * Compact mode kicks in at ≥ 100 000 to keep the card readable on
 * mobile. Compact is locale-aware: PL → "1,5 mln", EN → "1.5M".
 */
function formatValue(
  format: ReturnType<typeof useFormatter>,
  value: ResultValue,
  compact: boolean,
): string {
  if (typeof value === "string") return value;
  if (typeof value === "bigint") {
    return compact
      ? format.number(value, { notation: "compact", maximumFractionDigits: 1 })
      : format.number(value, { useGrouping: true });
  }
  return compact
    ? format.number(value, { notation: "compact", maximumFractionDigits: 1 })
    : format.number(value, { useGrouping: true });
}

/**
 * `ResultDisplay` — see file-level JSDoc for the design contract.
 */
export function ResultDisplay({
  primaryValue,
  unit,
  primaryLabel,
  secondaryValues,
  recommendation,
  copyLink = true,
  isLoading = false,
  empty = false,
  className,
}: ResultDisplayProps) {
  const t = useTranslations("Calculators.resultDisplay");
  const format = useFormatter();

  // Decide if the primary value is "big enough" to warrant compact mode.
  // Bigint comparison: coerce via Number — but only as a hint, formatting
  // still uses the original BigInt for accuracy.
  const numericMagnitude =
    typeof primaryValue === "bigint"
      ? primaryValue > 100_000n
      : typeof primaryValue === "number"
        ? Math.abs(primaryValue) >= 100_000
        : false;
  const isCompact = numericMagnitude;

  // ─── Copy-link state ─────────────────────────────────────────────────
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const handleCopy = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for older browsers / insecure contexts.
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopyState("copied");
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopyState("idle"), 2400);
    }
  }, []);

  // ─── Render: empty state ────────────────────────────────────────────
  if (empty) {
    return (
      <Card className={cn("border-dashed bg-muted/30", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
            {t("emptyTitle")}
          </CardTitle>
          <CardDescription>{t("emptyDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  // ─── Render: loading skeleton (matches layout of real values) ────────
  if (isLoading) {
    return (
      <Card className={className} aria-busy="true">
        <CardHeader>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-3/4 mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          {(secondaryValues ?? [{ label: "", value: 0 }]).map((_, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // ─── Render: real value ─────────────────────────────────────────────
  const primaryLabelText = primaryLabel ?? t("primaryValueLabel");
  const formattedPrimary =
    primaryValue === undefined
      ? "—"
      : formatValue(format, primaryValue, isCompact);

  const showRecommendation =
    recommendation !== undefined &&
    recommendation !== null &&
    recommendation !== false;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="relative">
        {copyLink ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="absolute right-4 top-4"
            aria-live="polite"
            aria-label={
              copyState === "copied"
                ? t("copyLinkCopied")
                : copyState === "failed"
                  ? t("copyLinkFailed")
                  : t("copyLink")
            }
          >
            {copyState === "copied" ? (
              <>
                <Check className="h-4 w-4 text-success" aria-hidden="true" />
                <span className="text-success">{t("copyLinkCopied")}</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span>{t("copyLink")}</span>
              </>
            )}
          </Button>
        ) : null}

        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("primaryLabel")}
        </p>
        <CardTitle className="flex items-baseline gap-2">
          <span className="numeric text-3xl font-semibold tabular-nums sm:text-4xl">
            {formattedPrimary}
          </span>
          {unit ? (
            <span className="numeric text-base font-medium text-muted-foreground tabular-nums">
              {unit}
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>{primaryLabelText}</CardDescription>
      </CardHeader>

      {secondaryValues && secondaryValues.length > 0 ? (
        <CardContent className="border-t pt-4">
          <dl className="grid gap-2 text-sm">
            <dt className="sr-only">{t("secondaryLabel")}</dt>
            {secondaryValues.map((s, idx) => {
              const mag =
                typeof s.value === "bigint"
                  ? s.value > 100_000n
                  : typeof s.value === "number"
                    ? Math.abs(s.value) >= 100_000
                    : false;
              return (
                <div
                  key={`${s.label}-${idx}`}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="text-muted-foreground">{s.label}</dt>
                  <dd className="numeric tabular-nums">
                    <span className="font-medium">
                      {formatValue(format, s.value, mag)}
                    </span>
                    {s.unit ? (
                      <span className="ml-1 text-muted-foreground">{s.unit}</span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
        </CardContent>
      ) : null}

      {showRecommendation ? <RecommendationRow recommendation={recommendation} /> : null}
    </Card>
  );
}

/**
 * Renders the recommendation block. Kept in a sub-component so the parent
 * stays focused on the value layout and so future tweaks (e.g. expand to
 * a full Alert with rich content) stay scoped.
 */
function RecommendationRow({
  recommendation,
}: {
  recommendation: Recommendation;
}) {
  const t = useTranslations("Calculators.resultDisplay");

  // Object form → map tone to badge variant + icon.
  if (React.isValidElement(recommendation)) {
    return (
      <div className="border-t bg-muted/30 px-6 py-4 text-sm">{recommendation}</div>
    );
  }

  if (typeof recommendation === "object" && recommendation !== null) {
    const obj = recommendation as RecommendationObject;
    const tone = obj.tone ?? "neutral";
    const Icon = TONE_ICON[tone];
    return (
      <div className="border-t bg-muted/30 px-6 py-4">
        <div className="flex items-start gap-3">
          <Badge
            variant={TONE_BADGE[tone]}
            className="shrink-0 gap-1 px-2 py-0.5"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t(TONE_LABEL_KEY[tone])}
          </Badge>
          <p className="text-sm leading-relaxed text-foreground">{obj.message}</p>
        </div>
      </div>
    );
  }

  // String form → auto-detect tone from the prefix keyword / emoji.
  const text = String(recommendation);
  const tone = detectTone(text);
  const Icon = TONE_ICON[tone];
  return (
    <div className="border-t bg-muted/30 px-6 py-4">
      <div className="flex items-start gap-3">
        <Badge
          variant={TONE_BADGE[tone]}
          className="shrink-0 gap-1 px-2 py-0.5"
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {t(TONE_LABEL_KEY[tone])}
        </Badge>
        <p className="text-sm leading-relaxed text-foreground">{text}</p>
      </div>
    </div>
  );
}