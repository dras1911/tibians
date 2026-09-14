"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ErrorState (T66, arch §6.4).
 *
 * `role="alert"` + `aria-live="assertive"` — czytnik ogłasza błąd natychmiast.
 * `retry` renderuje przycisk ponowienia (np. refetch z TanStack Query / router.refresh).
 */
export interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Kod/szczegóły techniczne (dev-only; nie pokazuj użytkownikowi w prod). */
  details?: string;
  retry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "Coś poszło nie tak",
  description = "Nie udało się załadować danych. Spróbuj ponownie.",
  details,
  retry,
  retryLabel = "Spróbuj ponownie",
  className,
}: ErrorStateProps): React.ReactElement {
  const showDetails =
    details && process.env.NODE_ENV !== "production";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "mx-auto flex max-w-lg flex-col items-center gap-4 rounded-lg border border-danger/30 bg-danger-subtle px-6 py-10 text-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger"
      >
        <AlertTriangle className="h-6 w-6" />
      </span>

      <div className="space-y-1">
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>

      {showDetails ? (
        <pre className="w-full overflow-x-auto rounded-md bg-inset px-3 py-2 text-left text-xs text-text-muted">
          {details}
        </pre>
      ) : null}

      {retry ? (
        <Button type="button" size="sm" variant="outline" onClick={retry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
