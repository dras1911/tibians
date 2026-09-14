"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * EmptyState (T66, arch §5 zero-results + §6.4 pkt 9).
 *
 * Spójny pusty stan dla list (bazaar, blog, reference, bosses).
 * `suggestions` pozwala wstawić klikalne propozycje relaksacji filtrów (T45).
 */
export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  suggestions?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  suggestions,
  className,
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-lg flex-col items-center gap-4 rounded-lg border border-dashed border-border-default bg-surface px-6 py-12 text-center",
        className,
      )}
      role="status"
    >
      <span
        aria-hidden="true"
        className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-text-muted"
      >
        <Icon className="h-6 w-6" />
      </span>

      <div className="space-y-1">
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        {description ? (
          <p className="text-sm text-text-secondary">{description}</p>
        ) : null}
      </div>

      {suggestions ? (
        <div className="w-full text-left">{suggestions}</div>
      ) : null}

      {action ? (
        action.href ? (
          <Button asChild size="sm">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      ) : null}
    </div>
  );
}
