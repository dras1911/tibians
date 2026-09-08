import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * PageLayout — header + optional sidebar + main + footer skeleton
 * (architecture §4.2). Used by every page after Task 5 wraps it with the
 * CipSoft footer + mega-menu header.
 *
 * Slots are intentionally `ReactNode` so consumers can pass anything from
 * a string to a fully composed mega-menu. The grid layout uses CSS
 * variables and container queries; the sidebar collapses to the top of the
 * main column below `md` (768 px) — see task 5 for the Sheet-based
 * mobile menu replacement.
 */
interface PageLayoutProps {
  /** Sticky header slot (logo, mega-menu, theme + locale switches). */
  header?: React.ReactNode;
  /** Optional left rail. Hidden on `<md` viewports. */
  sidebar?: React.ReactNode;
  /** Main content. */
  children: React.ReactNode;
  /** Optional footer (CipSoft disclaimer + secondary nav). */
  footer?: React.ReactNode;
  className?: string;
}

function PageLayout({
  header,
  sidebar,
  children,
  footer,
  className,
}: PageLayoutProps) {
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col bg-background text-foreground",
        className,
      )}
    >
      {header ? (
        <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          {header}
        </header>
      ) : null}

      <div className="container flex-1 py-6 md:py-8">
        <div
          className={cn(
            "grid gap-6",
            sidebar
              ? "grid-cols-1 md:grid-cols-[16rem_1fr]"
              : "grid-cols-1",
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

          <main id="main-content" className="min-w-0">
            {children}
          </main>
        </div>
      </div>

      {footer ? (
        <footer className="border-t bg-background">
          <div className="container py-6">{footer}</div>
        </footer>
      ) : null}
    </div>
  );
}

export { PageLayout };
export type { PageLayoutProps };