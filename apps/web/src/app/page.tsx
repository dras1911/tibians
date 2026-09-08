/**
 * Minimal home page — replaced by the real landing page in T11+/T37.
 * Kept here so `pnpm dev` boots without 404 and the dev/ui link works.
 */
export default function HomePage() {
  return (
    <main className="container py-12">
      <h1 className="text-3xl font-semibold">Tibians</h1>
      <p className="mt-2 text-muted-foreground">
        Community hub dla graczy Tibii — kalkulatory, wycena postaci i Bazaar.
      </p>
      <p className="mt-6 text-sm text-muted-foreground">
        Dev preview: <a className="text-primary underline" href="/dev/ui">/dev/ui</a>
      </p>
    </main>
  );
}