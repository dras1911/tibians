"use client";

/**
 * Toast — minimalny prymityw powiadomień (plan T43, arch §6.4 pkt 11).
 *
 * Brak @radix-ui/react-toast w zależnościach — implementujemy własny,
 * oparty o `useState` + `setTimeout`. Wystarczający dla dwóch komunikatów:
 *   - "Skopiowano link"
 *   - "Nie udało się skopiować"
 *
 * API:
 *   - `<ToastProvider>` — dostarcza context, montuje portale `<ToastViewport>`.
 *   - `useToast()` — hook zwracający `toast(message)`.
 *   - `<ToastViewport>` — kontener w prawym dolnym rogu (fixed).
 *   - `<Toast>` — pojedyncza karta z `role="status"` + `aria-live="polite"`.
 *
 * Arch §6.5 (a11y): `aria-live="polite"` dla pozytywnych komunikatów,
 * `aria-live="assertive"` (alert) dla krytycznych.
 */

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────
// Typy
// ───────────────────────────────────────────────────────────────────────

export type ToastVariant = "info" | "success" | "error";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  /** ms do auto-dismiss; 0 = bez auto-dismiss. */
  duration: number;
}

interface ToastContextValue {
  toast: (input: {
    message: string;
    variant?: ToastVariant;
    duration?: number;
  }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

function useToastContext(component: string): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error(`${component} must be used inside <ToastProvider>`);
  return ctx;
}

// ───────────────────────────────────────────────────────────────────────
// Provider
// ───────────────────────────────────────────────────────────────────────

interface ToastProviderProps {
  children: React.ReactNode;
}

/**
 * Provider trzymający listę aktywnych toastów.
 * Wewnętrzny stan — nie trzeba przekazywać props do dzieci.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback<ToastContextValue["toast"]>(
    ({ message, variant = "info", duration = 2000 }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const item: ToastItem = { id, message, variant, duration };
      setToasts((prev) => [...prev, item]);

      if (duration > 0) {
        // Timer pozwala uniknąć wycieków gdy komponent zostanie
        // odmontowany przed zamknięciem.
        const timer = setTimeout(() => dismiss(id), duration);
        return () => clearTimeout(timer);
      }
      return () => undefined;
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Hook + Viewport + Toast
// ───────────────────────────────────────────────────────────────────────

/**
 * Hook do wywoływania toast z dowolnego miejsca w drzewie.
 * Przykład: `const { toast } = useToast(); toast({ message: "OK" });`
 */
export function useToast(): ToastContextValue {
  return useToastContext("useToast");
}

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
    >
      {toasts.map((t) => (
        <ToastItemView key={t.id} item={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

interface ToastItemViewProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

const VARIANT_CLASS: Record<ToastVariant, string> = {
  info: "border-border bg-card text-card-foreground",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

function ToastItemView({ item, onDismiss }: ToastItemViewProps) {
  // `role="status"` + aria-live="polite" dla info/success; alert dla error.
  const role = item.variant === "error" ? "alert" : "status";
  const live: "polite" | "assertive" =
    item.variant === "error" ? "assertive" : "polite";

  return (
    <div
      role={role}
      aria-live={live}
      data-variant={item.variant}
      className={cn(
        "pointer-events-auto flex items-center gap-2 rounded-md border p-3 shadow-md",
        "animate-in slide-in-from-bottom-2 fade-in-0 duration-200",
        VARIANT_CLASS[item.variant],
      )}
    >
      <span className="flex-1 text-sm">{item.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-current/80 transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
