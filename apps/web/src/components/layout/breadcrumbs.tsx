import * as React from "react";
import { ChevronRight, Home } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Breadcrumbs — semantic, accessible breadcrumb trail.
 *
 * Architecture §4.2: "Breadcrumbs on every subpage deeper than 1 level —
 * `Home / Bazaar / Migzen (Aukcja #2173376)`. Every segment clickable."
 *
 * Implementation:
 *   - `<nav aria-label="Breadcrumb"><ol>` (WAI-ARIA breadcrumb pattern).
 *   - Each `<li>` contains either:
 *       a `<Link>` (intermediate segments), or
 *       `<span aria-current="page">` for the last segment.
 *   - Separators are inserted as `<span aria-hidden="true">/</span>` so
 *     screen readers don't announce them.
 *   - JSON-LD `BreadcrumbList` schema is emitted alongside so search
 *     engines understand the trail (architecture §4.3 — SEO is part of
 *     the rationale).
 *
 * The first crumb is always "Strona główna" / "Home" pointing at `/`,
 * per common pattern. Callers can override by passing a custom first item.
 */
export interface BreadcrumbItem {
  /** Display label (already translated by the caller if needed). */
  label: string;
  /** Locale-relative href, e.g. "/bazaar/compare". next-intl adds the prefix. */
  href: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const t = useTranslations("Breadcrumb");

  if (items.length === 0) return null;

  const tItems = [
    { label: t("home"), href: "/" },
    ...items,
  ];

  // JSON-LD schema.org BreadcrumbList.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: tItems.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.label,
      item: item.href,
    })),
  };

  return (
    <>
      <nav
        aria-label={t("aria")}
        className={cn("text-sm text-muted-foreground", className)}
      >
        <ol className="flex flex-wrap items-center gap-1.5">
          {tItems.map((item, idx) => {
            const isLast = idx === tItems.length - 1;
            return (
              <li
                key={`${item.label}-${idx}`}
                className="flex items-center gap-1.5"
              >
                {idx > 0 ? (
                  <ChevronRight
                    className="h-3.5 w-3.5 text-muted-foreground/60"
                    aria-hidden="true"
                  />
                ) : (
                  <Home
                    className="h-3.5 w-3.5 text-muted-foreground/70"
                    aria-hidden="true"
                  />
                )}
                {isLast ? (
                  <span
                    aria-current="page"
                    className="font-medium text-foreground"
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className={cn(
                      "rounded-sm transition-colors hover:text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    )}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}