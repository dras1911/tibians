"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Link } from "@/i18n/routing";

import { LocaleSwitch } from "./locale-switch";
import { ThemeToggle } from "./theme-toggle";

import type { Locale } from "@/i18n/routing";

/**
 * MobileSheet — hamburger menu for viewports <768 px (architecture §4.2).
 *
 * Critical design requirement (T5 acceptance criteria):
 *   "Mobile Sheet: toggle motywu i locale WIDOCZNE bez rozwijania
 *    accordionu" — theme and locale switches are pinned to the TOP of
 *    the Sheet header so the user never has to expand anything to access
 *    them. Only the section nav is collapsed behind the accordion.
 *
 *   "Touch targets ≥ 44×44 px" — every interactive element here uses
 *   `min-h-11` (44 px) instead of the default `h-10` (40 px).
 *
 *   "useTheme() from @tibians/ui" / "useLocale() + useTranslations()" —
 *   satisfied via `<ThemeToggle>` and `<LocaleSwitch>` children, which
 *   are themselves client components.
 *
 * Architecture §6.5: focus-visible ring is the accent token, never
 * `outline: none`.
 *
 * The accordion uses Radix's `type="multiple"` so users can open
 * multiple sections at once while comparing destinations (e.g. open both
 * "Kalkulatory" and "Bazaar" when planning a purchase).
 */

interface MobileSheetProps {
  /** Currently active locale (passed from Header so the Sheet doesn't need
   * to re-call useLocale just for the trigger ARIA). */
  locale: Locale;
}

export function MobileSheetTrigger({ locale: _locale }: MobileSheetProps) {
  // Local state shared with the trigger so we can re-open the sheet from
  // either end (a programmatic re-open is rare but useful when a child
  // closes itself).
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        // h-11 w-11 = 44 px square (architecture §6.3 mobile touch target).
        className="h-11 w-11"
        aria-label="Open navigation menu"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>
      <MobileSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

interface MobileSheetContentProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

function MobileSheet({ open, onOpenChange }: MobileSheetContentProps) {
  const t = useTranslations("Nav");
  const tBazaar = useTranslations("Bazaar");
  const tCalc = useTranslations("Calculators");
  const tRef = useTranslations("Reference");
  const tCommon = useTranslations("Common");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Wider than the default sm:max-w-sm (24rem) so the accordion
        // labels have room to breathe on small phones.
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b px-5 pb-4 pt-5">
          <SheetTitle className="text-base">{tCommon("appName")}</SheetTitle>
          <SheetDescription className="text-xs">
            {t("openMenuAria")}
          </SheetDescription>
        </SheetHeader>

        {/* ★ Theme + locale — ALWAYS visible at the top, never collapsed. */}
        <div className="flex flex-col gap-3 border-b bg-muted/30 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("themeToggle.label")}
            </span>
            <ThemeToggle variant="compact" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("locale.label")}
            </span>
            <LocaleSwitch variant="compact" />
          </div>
        </div>

        {/* Accordion sections — primary nav (touch targets ≥ 44 px). */}
        <nav
          aria-label={t("brand")}
          className="flex-1 overflow-y-auto px-2 py-2"
        >
          <Accordion type="multiple" className="w-full">
            {/* Bazaar */}
            <AccordionItem value="bazaar">
              <AccordionTrigger className="min-h-11">
                {t("bazaar")}
              </AccordionTrigger>
              <AccordionContent>
                <ul className="flex flex-col gap-0.5 pl-2">
                  <MobileLink href="/bazaar" onSelect={() => onOpenChange(false)}>
                    {tBazaar("all")}
                  </MobileLink>
                  <MobileLink href="/bazaar/ending-soon" onSelect={() => onOpenChange(false)}>
                    🔴 {tBazaar("endingSoon.pageTitle")}
                  </MobileLink>
                  <MobileLink href="/bazaar/statistics" onSelect={() => onOpenChange(false)}>
                    {tBazaar("statistics")}
                  </MobileLink>
                  <MobileLink href="/bazaar/compare" onSelect={() => onOpenChange(false)}>
                    {tBazaar("compare.pageTitle")}
                  </MobileLink>
                  <MobileLink href="/bazaar/history" onSelect={() => onOpenChange(false)}>
                    {tBazaar("history")}
                  </MobileLink>
                </ul>
              </AccordionContent>
            </AccordionItem>

            {/* Kalkulatory */}
            <AccordionItem value="calculators">
              <AccordionTrigger className="min-h-11">
                {t("calculators")}
              </AccordionTrigger>
              <AccordionContent>
                <ul className="flex flex-col gap-0.5 pl-2">
                  <MobileLink href="/calculators/exercise-weapons" onSelect={() => onOpenChange(false)}>
                    {tCalc("skillsTraining.exerciseWeapons")}
                  </MobileLink>
                  <MobileLink href="/calculators/true-skill" onSelect={() => onOpenChange(false)}>
                    {tCalc("skillsTraining.trueSkill")}
                  </MobileLink>
                  <MobileLink href="/calculators/stamina" onSelect={() => onOpenChange(false)}>
                    {tCalc("skillsTraining.stamina")}
                  </MobileLink>
                  <MobileLink href="/calculators/stamina" onSelect={() => onOpenChange(false)}>
                    {tCalc("stamina.title")}
                  </MobileLink>
                  <MobileLink href="/calculators/character-value" onSelect={() => onOpenChange(false)}>
                    {tCalc("valuation.characterValue")}
                  </MobileLink>
                  <MobileLink href="/calculators/imbuement" onSelect={() => onOpenChange(false)}>
                    {tCalc("imbuementCharms.imbuement")}
                  </MobileLink>
                  <MobileLink href="/calculators/weekly-tasks" onSelect={() => onOpenChange(false)}>
                    {tCalc("imbuementCharms.weeklyTasks")}
                  </MobileLink>
                  <MobileLink href="/calculators/charms" onSelect={() => onOpenChange(false)}>
                    {tCalc("imbuementCharms.charmsDamage")}
                  </MobileLink>
                  <MobileLink href="/calculators/experience" onSelect={() => onOpenChange(false)}>
                    {tCalc("experience.title")}
                  </MobileLink>
                  <MobileLink href="/calculators/leech" onSelect={() => onOpenChange(false)}>
                    {tCalc("leech.title")}
                  </MobileLink>
                  <MobileLink href="/calculators/exp-share" onSelect={() => onOpenChange(false)}>
                    {tCalc("expShare.title")}
                  </MobileLink>
                  <MobileLink href="/planners/wheel" onSelect={() => onOpenChange(false)}>
                    {tCalc("wheelOfDestiny")}
                  </MobileLink>
                </ul>
              </AccordionContent>
            </AccordionItem>

            {/* Referencje */}
            <AccordionItem value="reference">
              <AccordionTrigger className="min-h-11">
                {t("reference")}
              </AccordionTrigger>
              <AccordionContent>
                <ul className="flex flex-col gap-0.5 pl-2">
                  <MobileLink href="/reference/items" onSelect={() => onOpenChange(false)}>
                    {tRef("items.pageTitle")}
                  </MobileLink>
                  <MobileLink href="/reference/imbuements" onSelect={() => onOpenChange(false)}>
                    {tRef("imbuements")}
                  </MobileLink>
                  <MobileLink href="/reference/worlds" onSelect={() => onOpenChange(false)}>
                    {tRef("worlds.pageTitle")}
                  </MobileLink>
                  <MobileLink href="/reference/outfits" onSelect={() => onOpenChange(false)}>
                    {tRef("outfits.pageTitle")}
                  </MobileLink>
                  <MobileLink href="/reference/mounts" onSelect={() => onOpenChange(false)}>
                    {tRef("mounts.pageTitle")}
                  </MobileLink>
                </ul>
              </AccordionContent>
            </AccordionItem>

            {/* Bosses (flat link) */}
            <AccordionItem value="bosses" className="border-b-0">
              <MobileFlatLink href="/bosses" onSelect={() => onOpenChange(false)}>
                {t("bosses")}
              </MobileFlatLink>
            </AccordionItem>

            {/* Blog (flat link) */}
            <AccordionItem value="blog" className="border-b-0">
              <MobileFlatLink href="/blog" onSelect={() => onOpenChange(false)}>
                {t("blog")}
              </MobileFlatLink>
            </AccordionItem>
          </Accordion>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileLink({
  href,
  onSelect,
  children,
}: {
  href: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onSelect}
        className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        {children}
      </Link>
    </li>
  );
}

function MobileFlatLink({
  href,
  onSelect,
  children,
}: {
  href: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      {children}
    </Link>
  );
}