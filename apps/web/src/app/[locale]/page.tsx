/**
 * Minimal home page — replaced by the real landing page in T11+/T37.
 *
 * NOTE: the outer `<main id="main">` element is rendered by the locale
 * layout (`[locale]/layout.tsx`). This page only contributes the inner
 * container so the skip-link target stays stable while the page-specific
 * markup evolves.
 */
export default function HomePage() {
  return (
    <div className="container py-12">
      <h1 className="text-3xl font-semibold">Tibians</h1>
      <p className="mt-2 text-muted-foreground">
        Community hub dla graczy Tibii — kalkulatory, wycena postaci i Bazaar.
      </p>
      <p className="mt-6 text-sm text-muted-foreground">
        Dev preview:{" "}
        <a className="text-primary underline" href="/dev/ui">
          /dev/ui
        </a>
      </p>
    </div>
  );
}