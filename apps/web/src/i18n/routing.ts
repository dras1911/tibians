import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

/**
 * Locale routing configuration for Tibians.
 *
 * `pl` is the default locale (the portal is PL-first — the team's working
 * language, 70%+ of the audience). `en` is the second supported locale.
 * More locales can be added here without touching individual pages — the
 * navigation helpers and the layout's locale-aware <html lang="…"> react
 * automatically.
 *
 * Adding a locale requires three things:
 *   1. Add it to `locales` below.
 *   2. Add a `messages/<locale>.json` file with the same top-level keys.
 *   3. (Optional) Add the flag emoji + label to the LocaleSwitch component.
 */
export const routing = defineRouting({
  locales: ["pl", "en"] as const,
  defaultLocale: "pl",
  // Always expose the locale in the URL (never use domain-based or cookie-only
  // routing) so that share URLs work everywhere and SEO is unambiguous.
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);