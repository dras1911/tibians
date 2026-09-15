"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Shield } from "lucide-react";

import { Link } from "@/i18n/routing";

import { LocaleSwitch } from "./locale-switch";
import { MegaMenu, type MegaMenuGroup } from "./mega-menu";
import { MobileSheetTrigger } from "./mobile-sheet";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { cn } from "@/lib/utils";

import type { Locale } from "@/i18n/routing";

/**
 * Header — sticky, h-16, locale-aware navigation shell.
 *
 * Architecture §4.2:
 *   - Logo "Tibians" on the left.
 *   - Desktop (≥md): mega-menu "Bazaar ▾ / Kalkulatory ▾ / Referencje ▾"
 *     grouped by INTENT (Skills & Training / Stamina / Wycena / Imbuement
 *     & Charms / Experience / Wheel) plus flat links "Bosses" and "Blog".
 *   - Right cluster: theme segmented control + locale dropdown.
 *   - Mobile (<md): hamburger → <MobileSheet/>; logo + actions still
 *     visible above the fold.
 *
 * Mega-menu contents (per task description):
 *   - Bazaar ▾  : Wszystkie aukcje / Kończące się 🔴 / Statystyki /
 *                 Porównaj / Historia
 *   - Kalkulatory ▾: Skills & Training group / Stamina / Wycena postaci /
 *                 Imbuement & Charms group / Experience group /
 *                 Wheel of Destiny
 *   - Referencje ▾: Przedmioty / Imbuements / Światy / Outfits / Mounts
 *
 * All links go through the locale-aware `<Link>` from `@/i18n/routing`
 * (next-intl) so URLs are always prefixed with the active locale.
 *
 * The backdrop-blur + bg-background/80 gives a frosted-glass effect when
 * the page scrolls behind the header (architecture §4.2).
 */
export function Header() {
  const t = useTranslations("Nav");
  const tBazaar = useTranslations("Bazaar");
  const tCalc = useTranslations("Calculators");
  const tRef = useTranslations("Reference");
  const locale = useLocale() as Locale;

  // Mega-menu groups, by INTENT (NEVER alphabetical).
  // Architecture §4.2 makes the rationale explicit: "Grouping by intent
  // instead of alphabetically shortens the time to find a tool."
  const bazaarGroups: MegaMenuGroup[] = [
    {
      label: tBazaar("title"),
      items: [
        {
          label: tBazaar("all"),
          href: "/bazaar",
          description: tBazaar("all"),
        },
        {
          label: tBazaar("endingSoon"),
          href: "/bazaar/ending-soon",
          icon: <span aria-hidden="true">🔴</span>,
        },
        { label: tBazaar("statistics"), href: "/bazaar/statistics" },
        { label: tBazaar("compare"), href: "/bazaar/compare" },
        { label: tBazaar("history"), href: "/bazaar/history" },
      ],
    },
  ];

  const calculatorGroups: MegaMenuGroup[] = [
    {
      label: tCalc("skillsTraining.label"),
      items: [
        {
          label: tCalc("skillsTraining.exerciseWeapons"),
          href: "/calculators/exercise-weapons",
        },
        {
          label: tCalc("skillsTraining.trueSkill"),
          href: "/calculators/true-skill",
        },
        {
          label: tCalc("skillsTraining.stamina"),
          href: "/calculators/stamina",
        },
      ],
    },
    {
      label: tCalc("stamina.title"),
      items: [
        {
          label: tCalc("stamina.title"),
          href: "/calculators/stamina",
          description: tCalc("stamina.description"),
        },
      ],
    },
    {
      label: tCalc("valuation.label"),
      items: [
        {
          label: tCalc("valuation.characterValue"),
          href: "/calculators/character-value",
        },
      ],
    },
    {
      label: tCalc("imbuementCharms.label"),
      items: [
        {
          label: tCalc("imbuementCharms.imbuement"),
          href: "/calculators/imbuement",
        },
        {
          label: tCalc("imbuementCharms.weeklyTasks"),
          href: "/calculators/weekly-tasks",
        },
        {
          label: tCalc("imbuementCharms.charmsDamage"),
          href: "/calculators/charms",
        },
      ],
    },
    {
      label: tCalc("experience.label"),
      items: [
        { label: tCalc("experience.xp"), href: "/calculators/experience" },
        { label: tCalc("experience.leech"), href: "/calculators/leech" },
        {
          label: tCalc("experience.expShare"),
          href: "/calculators/exp-share",
        },
      ],
    },
    {
      label: tCalc("wheelOfDestiny"),
      items: [
        {
          label: tCalc("wheelOfDestiny"),
          href: "/planners/wheel",
        },
      ],
    },
  ];

  const referenceGroups: MegaMenuGroup[] = [
    {
      label: tRef("title"),
      items: [
        { label: tRef("items"), href: "/reference/items" },
        { label: tRef("imbuements"), href: "/reference/imbuements" },
        { label: tRef("worlds"), href: "/reference/worlds" },
        { label: tRef("outfits"), href: "/reference/outfits" },
        { label: tRef("mounts"), href: "/reference/mounts" },
      ],
    },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b",
        // Semi-transparent + backdrop blur — frosted-glass effect over
        // scrolled content (architecture §4.2).
        "bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70",
      )}
    >
      <div className="container flex h-16 items-center gap-2 md:gap-4">
        {/* Brand */}
        <Link
          href="/"
          className={cn(
            "group flex items-center gap-2 rounded-md px-1 py-1",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
          aria-label={t("brand")}
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105"
            aria-hidden="true"
          >
            <Shield className="h-4 w-4" />
          </span>
          <span className="hidden text-base font-semibold tracking-tight sm:inline">
            {t("brand")}
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav
          aria-label={t("brand")}
          className="ml-2 hidden flex-1 items-center md:flex"
        >
          <ul className="flex items-center gap-0.5">
            <li>
              <MegaMenu label={t("bazaar")} groups={bazaarGroups} />
            </li>
            <li>
              <MegaMenu
                label={t("calculators")}
                groups={calculatorGroups}
              />
            </li>
            <li>
              <MegaMenu
                label={t("reference")}
                groups={referenceGroups}
              />
            </li>
            <li>
              <NavLink href="/bosses">{t("bosses")}</NavLink>
            </li>
            <li>
              <NavLink href="/blog">{t("blog")}</NavLink>
            </li>
          </ul>
        </nav>

        {/* Right cluster (theme + locale + mobile menu) */}
        <div className="ml-auto flex items-center gap-1.5 md:ml-0 md:gap-2">
          <div className="hidden md:inline-flex">
            <ThemeToggle />
          </div>
          <div className="hidden md:inline-flex">
            <LocaleSwitch />
          </div>

          {/* Account — Discord login (T78). Visible on every breakpoint:
              on mobile it sits before the hamburger so it stays reachable. */}
          <UserMenu />

          {/* Mobile only — hamburger trigger */}
          <div className="md:hidden">
            <MobileSheetTrigger locale={locale} />
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * NavLink — flat navigation link used for Bosses / Blog. Wraps the
 * locale-aware `next/link` so URLs are always prefixed with the active
 * locale and the page is rendered with the correct HTML `lang`.
 *
 * Touch target ≥ 44 px (architecture §6.3).
 */
function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-foreground/90",
        "transition-colors hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      {children}
    </Link>
  );
}