import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/**
 * next-intl middleware — handles locale detection, prefix insertion, and
 * URL canonicalisation.
 *
 * `/` → `/pl` (defaultLocale), or `/en` if Accept-Language says so.
 * `/pl/about` → stays as-is.
 * `/about` → rewritten to `/pl/about`.
 *
 * The matcher excludes API routes, Next.js internals (`_next/*`), Vercel
 * internals (`_vercel/*`), and any path that already contains a `.` (assets,
 * robots.txt, sitemap.xml, public files). This matches the next-intl default
 * matcher and prevents the middleware from intercepting static asset requests.
 */
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};