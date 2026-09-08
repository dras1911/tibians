import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn()` — standard shadcn helper: combine `clsx` (conditional classes) with
 * `tailwind-merge` (resolves conflicting Tailwind utilities so the last
 * one wins, e.g. `cn("px-2", "px-4")` → `"px-4"`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}