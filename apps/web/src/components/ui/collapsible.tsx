"use client";

/**
 * Collapsible — minimalny prymityw progressive disclosure (plan T42).
 *
 * Niestety nie mamy w projekcie @radix-ui/react-collapsible, więc
 * implementujemy własny komponent na bazie `useState`. Semantyka:
 *   - `<Collapsible>` — kontener, kontroluje `open` state (uncontrolled
 *     jeśli nie podamy `open`/`onOpenChange`).
 *   - `<CollapsibleTrigger>` — przycisk h-11 (touch target ≥ 44 px),
 *     `aria-expanded` + `aria-controls` dla screen readerów.
 *   - `<CollapsibleContent>` — region z `aria-hidden` gdy zamknięte,
 *     `aria-labelledby` wskazującym na trigger.
 *
 * Zachowuje tę samą klasę animacji co Accordion (data-state open/closed).
 *
 * Arch §6.3 (mobile touch ≥ 44 px), §6.5 (a11y).
 */

import * as React from "react";

import { cn } from "@/lib/utils";

interface CollapsibleContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  triggerId: string;
  contentId: string;
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(
  null,
);

function useCollapsible(component: string): CollapsibleContextValue {
  const ctx = React.useContext(CollapsibleContext);
  if (!ctx) {
    throw new Error(`${component} must be used inside <Collapsible>`);
  }
  return ctx;
}

interface CollapsibleProps {
  /** Kontrolowany stan. Jeśli pominięty — uncontrolled. */
  open?: boolean | undefined;
  /** Początkowy stan (uncontrolled). */
  defaultOpen?: boolean | undefined;
  /** Callback po zmianie stanu (kontrolowany tryb). */
  onOpenChange?: ((open: boolean) => void) | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}

/**
 * Kontener collapsible. Komponent kliencki — bez SSR.
 */
export function Collapsible({
  open,
  defaultOpen = false,
  onOpenChange,
  children,
  className,
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const actualOpen = isControlled ? (open as boolean) : uncontrolledOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const triggerId = React.useId();
  const contentId = React.useId();
  const ctx = React.useMemo<CollapsibleContextValue>(
    () => ({
      open: actualOpen,
      setOpen,
      triggerId,
      contentId,
    }),
    [actualOpen, setOpen, triggerId, contentId],
  );

  return (
    <CollapsibleContext.Provider value={ctx}>
      <div
        data-state={actualOpen ? "open" : "closed"}
        className={className}
      >
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
}

interface CollapsibleTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Ikona lub treść po prawej (zwykle chevron). */
  trailing?: React.ReactNode;
}

/**
 * Przycisk otwierający / zamykający panel.
 * Mobile touch target ≥ 44 px (h-11), pełna dostępność klawiatury.
 */
export const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  CollapsibleTriggerProps
>(function CollapsibleTrigger(
  { children, trailing, className, onClick, ...props },
  ref,
) {
  const ctx = useCollapsible("CollapsibleTrigger");

  return (
    <button
      ref={ref}
      type="button"
      id={ctx.triggerId}
      aria-expanded={ctx.open}
      aria-controls={ctx.contentId}
      data-state={ctx.open ? "open" : "closed"}
      onClick={(event) => {
        ctx.setOpen(!ctx.open);
        onClick?.(event);
      }}
      className={cn(
        // Touch target ≥ 44 px (arch §6.3)
        "inline-flex h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-sm font-medium",
        "transition-colors hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    >
      <span className="inline-flex items-center gap-2 truncate">
        {children}
      </span>
      {trailing ? (
        <span
          aria-hidden="true"
          className="shrink-0 transition-transform duration-200 data-[state=open]:rotate-180"
        >
          {trailing}
        </span>
      ) : null}
    </button>
  );
});

interface CollapsibleContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Zwijana treść. Gdy zamknięte — renderuje się poza DOM (prostsze
 * zarządzanie focus trap niż `hidden` + `aria-hidden`).
 * Atrybut `role="region"` wskazuje semantic region.
 */
export const CollapsibleContent = React.forwardRef<
  HTMLDivElement,
  CollapsibleContentProps
>(function CollapsibleContent({ children, className, ...props }, ref) {
  const ctx = useCollapsible("CollapsibleContent");

  if (!ctx.open) return null;

  return (
    <div
      ref={ref}
      id={ctx.contentId}
      role="region"
      aria-labelledby={ctx.triggerId}
      data-state="open"
      className={cn("pt-2", className)}
      {...props}
    >
      {children}
    </div>
  );
});
