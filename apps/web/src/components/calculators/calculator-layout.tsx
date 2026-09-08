import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { cn } from "@/lib/utils";

/**
 * CalculatorLayout — the structural shell for every calculator page.
 *
 * Renders, top-to-bottom:
 *   1. Back link to the `/calculators` index.
 *   2. Breadcrumbs `Home / Kalkulatory / {Calculator}` (with schema.org
 *      JSON-LD; emitted by `<Breadcrumbs/>`).
 *   3. Title + optional description.
 *   4. Two-column grid: form on the left, result on the right. On
 *      `<md` viewports the columns stack (form first, result below).
 *
 * This component is a **Server Component** — no `"use client"` — so the
 * SEO-bearing markup (title, description, breadcrumbs JSON-LD) is
 * server-rendered and shows up in the initial HTML. The form (client)
 * and `<ResultDisplay/>` (client) slot into the slots provided below.
 *
 * Architecture references:
 *   - §13.4 — calculator pages are SEO landing pages. Every page under
 *     `/calculators/*` uses this layout so the visual contract is
 *     consistent.
 *   - §4.2 — breadcrumbs on every subpage deeper than one level.
 *   - §6.5 — touch targets ≥ 44 px (back link uses `h-11`).
 *
 * NOTE: this file deliberately does NOT own its own `<main>` element.
 * The locale layout (`app/[locale]/layout.tsx`) owns the single
 * `<main id="main">` so the skip-link target is stable across pages.
 */
export interface CalculatorLayoutProps {
  /** The localized title of the calculator (PL/EN). Required. */
  title: string;
  /** Short description (≤ 155 chars, used as <p> + meta description). */
  description?: string;
  /**
   * Slug of the calculator, used for the breadcrumb label and to build
   * the `BreadcrumbItem[]` for `<Breadcrumbs/>`. Pass the same string you
   * would pass to `/calculators/{slug}` (without the locale prefix).
   */
  slug: string;
  /**
   * Form area (client component). Rendered as the first column on
   * desktop and the first block on mobile.
   */
  form: React.ReactNode;
  /**
   * Result area (client component, typically `<ResultDisplay/>`).
   * Rendered as the second column on desktop and the second block on
   * mobile.
   */
  result: React.ReactNode;
  /** Optional extra content rendered below the form+result grid. */
  children?: React.ReactNode;
  className?: string;
}

export async function CalculatorLayout({
  title,
  description,
  slug,
  form,
  result,
  children,
  className,
}: CalculatorLayoutProps) {
  // Server-side translations for the static chrome (back link, section
  // labels). Pages are responsible for their own translated title/description
  // via `generateMetadata` and the `title`/`description` props above.
  const t = await getTranslations("Calculators.layout");

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("formLabel") === "Parametry" ? "Kalkulatory" : "Calculators", href: "/calculators" },
    { label: title, href: `/calculators/${slug}` },
  ];

  return (
    <div className={cn("container py-6 md:py-8", className)}>
      {/* Back link — top of the page, mobile-first. h-11 = 44 px touch target. */}
      <Link
        href="/calculators"
        className={cn(
          "inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground",
          "transition-colors hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToIndex")}
      </Link>

      {/* Breadcrumbs — Home > Calculators > {Title} */}
      <div className="mt-3">
        <Breadcrumbs items={breadcrumbItems} />
      </div>

      {/* Heading + description */}
      <header className="mt-6 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </header>

      {/* Two-column grid: form (left) + result (right) on desktop,
          stacked on mobile. */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section
          aria-labelledby="calculator-form-heading"
          className="min-w-0"
        >
          <h2 id="calculator-form-heading" className="sr-only">
            {t("formLabel")}
          </h2>
          {form}
        </section>

        <section
          aria-labelledby="calculator-result-heading"
          className="min-w-0"
        >
          <h2 id="calculator-result-heading" className="sr-only">
            {t("resultLabel")}
          </h2>
          {result}
        </section>
      </div>

      {children ? <div className="mt-8">{children}</div> : null}
    </div>
  );
}