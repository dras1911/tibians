"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@tibians/ui";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * ThemeToggle — segmented control for the three theme states (light / dark
 * / system).
 *
 * Architecture §6.6: "Toggle in header: [☀️ | 🌙] (segmented control, NOT
 * dropdown — 1-click state visible). Three states: light / dark / system
 * (default system)."
 *
 * Used by both the desktop Header and the mobile Sheet (so the user can
 * switch theme without expanding the menu — see T5 acceptance criteria).
 */
type ThemeValue = "light" | "dark" | "system";

const OPTIONS: ReadonlyArray<{
  value: ThemeValue;
  icon: React.ComponentType<{ className?: string }>;
  ariaKey: "light" | "dark" | "system";
}> = [
  { value: "light", icon: Sun, ariaKey: "light" },
  { value: "dark", icon: Moon, ariaKey: "dark" },
  { value: "system", icon: Monitor, ariaKey: "system" },
];

interface ThemeToggleProps {
  /**
   * "compact" — used inside the mobile sheet header where vertical space
   * is constrained. Defaults to "default" which renders a fuller pill.
   */
  variant?: "default" | "compact";
}

export function ThemeToggle({ variant = "default" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("Nav.themeToggle");

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className={cn(
        "inline-flex h-11 items-center rounded-md border bg-muted/60 p-1",
        // Compact variant shrinks padding for the mobile sheet.
        variant === "compact" && "h-10",
      )}
    >
      {OPTIONS.map(({ value, icon: Icon, ariaKey }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={t(ariaKey)}
            // Mobile touch target ≥ 44 px (architecture §6.3).
            className={cn(
              "inline-flex h-9 min-w-11 items-center justify-center rounded-sm px-2.5",
              "transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
            onClick={() => setTheme(value)}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {variant === "default" ? (
              <span className="ml-1.5 text-xs font-medium">
                {t(ariaKey)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}