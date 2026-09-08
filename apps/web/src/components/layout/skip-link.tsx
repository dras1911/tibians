import * as React from "react";

import { useTranslations } from "next-intl";

/**
 * SkipLink — keyboard-only navigation aid.
 *
 * Architecture §6.5: "Skip link 'Przejdź do treści' as the FIRST element of
 * `<body>`, focus-only visibility (sr-only → focus:not-sr-only). Tab × 1
 * focuses the link, Enter jumps focus to `<main id="main">`."
 *
 * Implementation notes:
 *   - `sr-only` keeps it visually hidden until focused (Tailwind utility).
 *   - On focus (`focus:not-sr-only`) the link becomes a fixed pill at the
 *     top-left of the viewport with a strong contrast colour, so it's
 *     immediately obvious to anyone using Tab navigation.
 *   - We point at `#main` because the locale layout renders `<main id="main">`.
 *   - `tabIndex` is implicit on <a>; no need to set it.
 *   - The visible focus ring uses the design-system accent (defined in
 *     tokens.css) — never `outline: none`.
 */
export function SkipLink() {
  const t = useTranslations("Common");

  return (
    <a
      href="#main"
      className={
        // Visual: sr-only → focus:not-sr-only fixed pill.
        // The focus ring comes from the design system (`--accent`), see
        // tokens.css :focus-visible. We don't override it.
        "sr-only focus:not-sr-only " +
        "focus:fixed focus:left-4 focus:top-4 focus:z-[100] " +
        "focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 " +
        "focus:text-primary-foreground focus:shadow-lg " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      }
    >
      {t("skipToContent")}
    </a>
  );
}