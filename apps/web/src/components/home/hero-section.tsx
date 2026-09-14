/**
 * HeroSection — nagłówek strony głównej (plan T53, arch §5 krok 1).
 *
 * **Zawartość:**
 *   - Title: "Kupuj i sprzedawaj postacie na oficjalnym Tibijskim
 *     Bazarze Postaci!" (PL) / "Buy and sell characters on the official
 *     Tibia Char Bazaar!" (EN)
 *   - Subtitle
 *   - Stat box: liczba aktywnych aukcji + freshness ("aktualizowane
 *     X min temu") z `scrape_runs.finished_at`
 *   - Główne CTA: "Przeglądaj aukcje →" → `/bazaar`
 *
 * **Serwowanie:**
 *   - Server Component (zero client JS)
 *   - Dane z `getMarketStats()` (auction count) + `getHomeFreshness()`
 *     (scrape_runs)
 *
 * **i18n:** namespace `Home.*` (PL + EN).
 *
 * **Design notes:**
 *   - Hero jest duży, "nagłówek z dowodem świeżości" — buduje
 *     zaufanie (arch §5 krok 1: "dowód świeżości — buduje zaufanie")
 *   - Zielony accent (`bg-primary/10`) dla live-dot — spójne z resztą
 *   - Live-dot animuje pulse dla wizualnego dowodu "na żywo"
 */

import * as React from "react";
import { Activity, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

import type { HomeFreshness } from "@/lib/server/auctions";

// ───────────────────────────────────────────────────────────────────────
// Props
// ───────────────────────────────────────────────────────────────────────

export interface HeroSectionProps {
  /** Liczba aktywnych aukcji (z `getMarketStats().totalActive`). */
  totalActive: number;
  /** Świeżość z `scrape_runs` (null = brak danych). */
  freshness: HomeFreshness;
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

/**
 * Format integer with locale-aware grouping (`Intl.NumberFormat` via
 * Server Component — bez client hydration).
 */
function formatNumber(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

// ───────────────────────────────────────────────────────────────────────
// Component (Server Component)
// ───────────────────────────────────────────────────────────────────────

export async function HeroSection({
  totalActive,
  freshness,
}: HeroSectionProps) {
  const t = await getTranslations("Home");

  // "X min temu" — minute === 0 traktujemy jako "przed chwilą".
  const freshnessLabel =
    freshness.minutesSinceLastScrape !== null
      ? t("freshness.updated", { minutes: freshness.minutesSinceLastScrape })
      : t("freshness.neverScraped");

  return (
    <section
      aria-labelledby="home-hero-title"
      className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-card to-accent/10 px-6 py-10 shadow-sm sm:px-10 sm:py-14"
    >
      {/* Decorative grid pattern overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative">
        {/* ── Live-dot badge (dowód świeżości) ──────────────────────── */}
        <div className="flex items-center gap-2">
          <span
            className="relative inline-flex h-2.5 w-2.5"
            aria-hidden="true"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <Badge variant="outline" className="border-primary/40 text-primary">
            {t("freshness.liveDot")}
          </Badge>
        </div>

        {/* ── Title ─────────────────────────────────────────────────── */}
        <h1
          id="home-hero-title"
          className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl"
        >
          {t("title")}
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {t("subtitle")}
        </p>

        {/* ── Stat box: licznik + freshness ─────────────────────────── */}
        <div className="mt-6 inline-flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card/80 px-4 py-3 text-sm shadow-sm backdrop-blur">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="numeric font-mono text-lg font-semibold tabular-nums text-foreground">
              {formatNumber(totalActive, "pl-PL")}
            </span>
            <span className="text-muted-foreground">{t("statsLabel")}</span>
          </div>
          <span
            aria-hidden="true"
            className="hidden h-4 w-px bg-border sm:block"
          />
          <span className="text-muted-foreground">{freshnessLabel}</span>
        </div>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="h-13 px-6 text-base">
            <Link href="/bazaar">
              {t("heroCta")}
              <ArrowRight
                className="ml-2 h-4 w-4"
                aria-hidden="true"
              />
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("heroCtaHint")}
          </span>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Suppress unused-import warning dla `cn` (zostawione dla przyszłych wariacji)
// ───────────────────────────────────────────────────────────────────────
void cn;
