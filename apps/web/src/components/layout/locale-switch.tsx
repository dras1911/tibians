"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/routing";
import { cn } from "@/lib/utils";

import type { Locale } from "@/i18n/routing";

/**
 * LocaleSwitch — segmented dropdown that lets the user pick the active
 * locale (pl / en).
 *
 * Implementation note: the URL is rewritten via `next-intl`'s Link with an
 * explicit `locale` prop so the server re-renders the matched locale and
 * the page is served correctly with the new HTML `lang` attribute.
 *
 * Two render modes:
 *   - "default" — desktop header. Trigger shows flag + label + chevron.
 *   - "compact" — mobile sheet header. Trigger is icon-only.
 */
interface LocaleSwitchProps {
  variant?: "default" | "compact";
}

const LOCALE_LABEL: Record<Locale, { flag: string; short: string }> = {
  pl: { flag: "🇵🇱", short: "PL" },
  en: { flag: "🇬🇧", short: "EN" },
};

export function LocaleSwitch({ variant = "default" }: LocaleSwitchProps) {
  const currentLocale = useLocale() as Locale;
  const pathname = usePathname();
  const t = useTranslations("Nav.locale");
  const tCommon = useTranslations("Common");

  const currentFlag = LOCALE_LABEL[currentLocale]?.flag ?? "🌐";
  const currentShort = LOCALE_LABEL[currentLocale]?.short ?? currentLocale;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // Use a button-styled trigger with min 44 px touch target.
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          // Override the default h-10 to h-11 for mobile target.
          "h-11 min-w-11 gap-1.5 px-2.5",
          variant === "compact" && "h-10 px-2",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        aria-label={tCommon("language")}
      >
        <span aria-hidden="true" className="text-base leading-none">
          {currentFlag}
        </span>
        {variant === "default" ? (
          <>
            <span className="text-sm font-medium">{currentShort}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(LOCALE_LABEL) as Locale[]).map((loc) => {
          const isActive = loc === currentLocale;
          return (
            <DropdownMenuItem
              key={loc}
              asChild
              className="cursor-pointer"
            >
              <Link
                href={pathname}
                locale={loc}
                aria-current={isActive ? "true" : undefined}
                className="flex w-full items-center gap-2"
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {LOCALE_LABEL[loc].flag}
                </span>
                <span className="flex-1">{t(loc)}</span>
                {isActive ? (
                  <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                ) : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}