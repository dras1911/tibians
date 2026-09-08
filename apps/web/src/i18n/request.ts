import { getRequestConfig } from "next-intl/server";

import { routing, type Locale } from "./routing";

/**
 * next-intl request config — runs on the server for every request that
 * matches the middleware.
 *
 * Validates the locale from the URL against the supported list and loads
 * the matching message bundle. If the locale is missing or unknown, falls
 * back to the default (`pl`) so the app never crashes on a bad URL.
 *
 * Messages are loaded eagerly with `import()` so that Next.js bundles them
 * per-locale at build time and only ships the active bundle to the client.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = (routing.locales as readonly string[]).includes(
    requested ?? "",
  )
    ? (requested as Locale)
    : routing.defaultLocale;

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    // 31 Aug 2026 → en-CA so ICU plural rules don't trip on Polish
    // plurals being passed through as the host locale. The formatNumber /
    // formatDate helpers accept an explicit locale when needed.
    timeZone: "Europe/Warsaw",
    onError() {
      // Swallow missing translation keys in dev instead of crashing;
      // production behaviour is "show the key" which is what we want
      // until the PL bundle is complete.
    },
  };
});