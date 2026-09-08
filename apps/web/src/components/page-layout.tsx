import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * PageLayout — INNER page layout helper. Provides an optional left
 * sidebar + a content area inside a `container`.
 *
 * Used by Bazaar (`/bazaar`), calculator pages (`/calculators/*`),
 * reference (`/reference/*`) etc. — any page that needs a sticky
 * sidebar (filters, table of contents, …).
 *
 * IMPORTANT: this component does NOT render `<header>` or `<footer>` —
 * the locale layout (`app/[locale]/layout.tsx`) owns those slots so the
 * CipSoft disclaimer (architecture §18.3) is guaranteed to appear on
 * every route.
 *
 * IMPORTANT: this component does NOT render `<main>` either — the locale
 * layout owns the single `<main id="main">` (skip-link target). When a
 * page wraps itself in `<PageLayout>`, the children render inside the
 * locale layout's main. Pages that don't use PageLayout still get the
 * main from the locale layout.
 */
interface PageLayoutProps {
  /** Optional left rail. Hidden on `<md` viewports. */
  sidebar?: React.ReactNode;
  /** Main content. */
  children: React.ReactNode;
  className?: string;
}

function PageLayout({ sidebar, children, className }: PageLayoutProps) {
  return (
    <div className={cn("container py-6 md:py-8", className)}>
      <div
        className={cn(
          "grid gap-6",
          sidebar ? "grid-cols-1 md:grid-cols-[16rem_1fr]" : "grid-cols-1",
        )}
      >
        {sidebar ? (
          <aside
            className="hidden md:block"
            aria-label="Section navigation"
          >
            <div className="sticky top-20">{sidebar}</div>
          </aside>
        ) : null}

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

export { PageLayout };
export type { PageLayoutProps };