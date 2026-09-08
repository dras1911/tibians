"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * CalculatorForm — shared `<form>` shell for every calculator page.
 *
 * Aims to be the "thinnest possible" wrapper so each T17-T23 calculator
 * can ship its own inputs without reinventing the form scaffolding.
 * Goals:
 *   - **One submit handler**, typed. Pass either an `onSubmit` (client
 *     callback) or render your own submit button via `children`.
 *   - **Sticky submit** — the submit button (if you use the prop)
 *     stays visible above the fold on mobile while the inputs scroll.
 *   - **A11y defaults** — `noValidate`, `aria-live` on the error region.
 *
 * This component is intentionally client-side: every real calculator
 * (T17-T23) needs to update `ResultDisplay` reactively as the user
 * types, which requires either local state or the shared Zustand store
 * (task 11).
 */
export interface CalculatorFormProps
  extends Omit<React.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> {
  /**
   * Submit handler. Receives the standard `FormEvent`. The form always
   * calls `preventDefault()` for you — return early from your handler to
   * skip validation.
   */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** Optional submit button label (PL/EN). */
  submitLabel?: React.ReactNode;
  /** When `true`, the submit button is disabled (e.g. while computing). */
  submitting?: boolean;
  /** Form contents — `<FormField>` rows, etc. */
  children: React.ReactNode;
}

/**
 * Wraps a calculator form. Submit button is optional — calculators that
 * compute live as the user types (exercise weapons, true skill, …) don't
 * need one; calculators with an explicit "Oblicz" CTA can pass
 * `submitLabel`.
 */
export function CalculatorForm({
  onSubmit,
  submitLabel,
  submitting,
  children,
  className,
  ...rest
}: CalculatorFormProps) {
  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSubmit?.(event);
    },
    [onSubmit],
  );

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={cn(
        "flex min-h-full flex-col gap-4 rounded-lg border bg-card p-4 sm:p-6",
        className,
      )}
      {...rest}
    >
      {children}
      {submitLabel ? (
        <div className="mt-auto pt-2">
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground",
              "transition-colors hover:bg-primary/90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {submitting ? "…" : submitLabel}
          </button>
        </div>
      ) : null}
    </form>
  );
}

/**
 * FormField — one input row: label + input + optional help + optional
 * error. Wraps the field in a `<div>` with `data-invalid` so the input
 * gets the right `aria-*` styling when validation fails.
 *
 * Pair with the `<Label htmlFor={id}>` + `<Input id={id} aria-describedby>`
 * pattern so screen readers announce the help + error text.
 */
export interface FormFieldProps {
  /** Field id (used to wire `Label` ↔ `Input`). */
  id: string;
  /** Localized label shown above the input. */
  label: React.ReactNode;
  /** The input element (or any custom control). */
  children: React.ReactNode;
  /** Optional help text shown below the input in muted color. */
  help?: React.ReactNode;
  /** Optional error message (also announced via `aria-live`). */
  error?: React.ReactNode;
  className?: string;
}

export function FormField({
  id,
  label,
  children,
  help,
  error,
  className,
}: FormFieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [helpId, errorId].filter(Boolean).join(" ") || undefined;

  // Clone the child to add `aria-describedby` + `aria-invalid` without
  // forcing the caller to remember. This keeps the API minimal for the
  // common case while still allowing custom inputs to override.
  //
  // `exactOptionalPropertyTypes: true` (tsconfig.base.json) forbids
  // passing `undefined` to an optional prop, so we build the override
  // object conditionally — only include keys that are set.
  const enhancedChild = React.isValidElement(children)
    ? React.cloneElement(
        children as React.ReactElement<{
          id?: string;
          "aria-describedby"?: string;
          "aria-invalid"?: boolean;
        }>,
        {
          id,
          ...(describedBy !== undefined
            ? { "aria-describedby": describedBy }
            : {}),
          "aria-invalid": Boolean(error),
        },
      )
    : children;

  return (
    <div
      className={cn("flex flex-col gap-1.5", className)}
      data-invalid={Boolean(error) || undefined}
    >
      <Label htmlFor={id}>{label}</Label>
      {enhancedChild}
      {help ? (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="text-xs font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Helper: the canonical "number input" used by every calculator. Forwards
 * the native `<input type="number">` attributes + the `numeric` class so
 * digits stay tabular-aligned in tight layouts.
 */
export const CalculatorNumberInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input>
>(({ className, ...rest }, ref) => (
  <Input
    ref={ref}
    type="number"
    inputMode="numeric"
    className={cn("numeric tabular-nums", className)}
    {...rest}
  />
));
CalculatorNumberInput.displayName = "CalculatorNumberInput";