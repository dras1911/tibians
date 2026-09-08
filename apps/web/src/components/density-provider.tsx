"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Density — global UI density toggle (architecture §6.3).
 *
 *   compact     → 40 px rows  (9 columns, power user scanning 100+ rows)
 *   comfortable → 52 px rows  (7 columns, default desktop)
 *
 * Applied to <html data-density="…"> so any descendant can react via CSS
 * (`[data-density=compact] [&_tr]:h-10`). Persisted to localStorage so the
 * choice survives reloads.
 */
export type Density = "compact" | "comfortable";

interface DensityContextValue {
  density: Density;
  setDensity: (density: Density) => void;
  toggle: () => void;
}

const STORAGE_KEY = "tt-density";

const DensityContext = React.createContext<DensityContextValue | null>(null);

const DEFAULT_DENSITY: Density = "comfortable";

function readStored(): Density | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "compact" || raw === "comfortable" ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(value: Density): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = React.useState<Density>(DEFAULT_DENSITY);

  // Mount: read storage + apply to <html>
  React.useEffect(() => {
    const stored = readStored() ?? DEFAULT_DENSITY;
    setDensityState(stored);
    document.documentElement.setAttribute("data-density", stored);
  }, []);

  // Keep <html data-density> in sync with state
  React.useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  const setDensity = React.useCallback((next: Density) => {
    writeStored(next);
    setDensityState(next);
  }, []);

  const toggle = React.useCallback(() => {
    setDensityState((prev) => {
      const next: Density = prev === "compact" ? "comfortable" : "compact";
      writeStored(next);
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({ density, setDensity, toggle }),
    [density, setDensity, toggle],
  );

  return (
    <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
  );
}

export function useDensity(): DensityContextValue {
  const ctx = React.useContext(DensityContext);
  if (!ctx) {
    throw new Error("useDensity must be used inside <DensityProvider>");
  }
  return ctx;
}

/**
 * Density-aware table row class. Drop into TanStack Table's `<tr>` to get
 * the §6.3 row heights automatically.
 */
export function densityRowClass(density: Density): string {
  return cn(density === "compact" ? "h-10" : "h-13");
}