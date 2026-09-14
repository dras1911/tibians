import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SnapshotSourceProvider } from "@/components/workspace/snapshot-source-provider";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { loadValuationConfig } from "@/lib/character-value-config";
import { tryAuctionToSnapshot } from "@/lib/bazaar/auction-to-snapshot";
import { getAuctionDetail } from "@/lib/server/auction-detail";
import { routing, type Locale } from "@/i18n/routing";
import type { CharacterSnapshot } from "@tibians/character-context";

/**
 * `/[locale]/workspace` — Character Workspace (task 25, architecture
 * §13.3 / §13.4).
 *
 * Server Component shell:
 *   1. `generateMetadata()` — per-locale SEO title + description.
 *   2. **T50 (★ integracja z Bazarem):** gdy URL zawiera `?auction={id}`,
 *      Server Component pobiera pełen `AuctionDetail` i konwertuje na
 *      `CharacterSnapshot` przez `auctionToSnapshot()`. Snapshot
 *      przekazywany jest do `<SnapshotSourceProvider initialSnapshot>`
 *      i do `<WorkspaceLayout>` — eliminuje migotanie pustego stanu
 *      przy pierwszym renderze.
 *   3. Renders the client `<SnapshotSourceProvider>` (handles `?saved=`
 *      and re-hydration of `?auction=` if needed).
 *   4. Renders the client `<WorkspaceLayout>` — header + tabs + panels.
 *
 * The route exists in exactly two variants (`/pl/workspace`, `/en/workspace`)
 * — both share the same client tree. `pnpm --filter @tibians/web build`
 * compiles them in parallel.
 *
 * Note: this page is intentionally a thin shell — all heavy logic
 * (panel reactivity, tab persistence, edit-mode badge) lives in client
 * components under `src/components/workspace/`. Server boundary stays
 * minimal: one DB read for `?auction=`, one for `ValuationConfig`.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const PATH = "/workspace";

// Marked `force-dynamic` because the page loads `ValuationConfig` at
// request time and (T50) potentially fetches an auction snapshot.
// ISR + revalidate tag `auction-{id}` could replace this in Faza 2.
export const dynamic = "force-dynamic";

// ───────────────────────────────────────────────────────────────────────
// generateMetadata — locale-aware SEO
// ───────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Workspace",
  });

  const title = t("title");
  const description = t("description");

  const localizedTitle = `${title} · Tibians`;
  const finalTitle = localizedTitle.length <= 60 ? localizedTitle : title;
  const finalDescription =
    description.length <= 155 ? description : `${description.slice(0, 152)}…`;

  const canonical = `${SITE_URL}/${locale}${PATH}`;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}${PATH}`;
  }

  return {
    title: finalTitle,
    description: finalDescription,
    alternates: { canonical, languages },
    openGraph: {
      title: finalTitle,
      description: finalDescription,
      url: canonical,
      siteName: "Tibians",
      locale: locale === "pl" ? "pl_PL" : "en_US",
      type: "website",
      images: [
        {
          url: `${SITE_URL}/og/workspace.png`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: finalTitle,
      description: finalDescription,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const rawSearch = await searchParams;

  // ── T50: prefetch snapshot gdy `?auction={id}` ──────────────────
  // Cel: uniknąć flash of empty state. Server czyta aukcję, buduje
  // CharacterSnapshot przez `auctionToSnapshot()` (T37) i przekazuje
  // do `<SnapshotSourceProvider initialSnapshot>`. Klient dostaje
  // gotowy stan od razu.
  const auctionIdRaw = pickFirst(rawSearch["auction"]);
  let initialSnapshot: CharacterSnapshot | undefined;
  if (auctionIdRaw !== null && /^\d+$/u.test(auctionIdRaw)) {
    try {
      const detail = await getAuctionDetail(BigInt(auctionIdRaw));
      if (detail !== null) {
        const snap = tryAuctionToSnapshot(detail);
        if (snap !== null) initialSnapshot = snap;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[workspace/page] Failed to prefetch snapshot for auction",
        auctionIdRaw,
        err,
      );
    }
  }

  const [t, config] = await Promise.all([
    getTranslations({
      locale: locale as Locale,
      namespace: "Workspace",
    }),
    loadValuationConfig(),
  ]);

  // Conditional spread for `exactOptionalPropertyTypes: true` -- we
  // don't pass the prop at all when there's no initial snapshot.
  const providerProps: { initialSnapshot?: CharacterSnapshot } =
    initialSnapshot !== undefined ? { initialSnapshot } : {};
  const layoutProps: {
    description: string;
    valuationConfig: typeof config;
    initialSnapshot?: CharacterSnapshot;
  } = {
    description: t("description"),
    valuationConfig: config,
    ...(initialSnapshot !== undefined ? { initialSnapshot } : {}),
  };

  return (
    <SnapshotSourceProvider {...providerProps}>
      <WorkspaceLayout {...layoutProps} />
    </SnapshotSourceProvider>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

/**
 * Wyciąga pierwszą wartość z `searchParams` dla danego klucza
 * (Next.js 15 zwraca `string | string[] | undefined`).
 */
function pickFirst(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  if (Array.isArray(value)) {
    const last = value[value.length - 1];
    return last ?? null;
  }
  return value;
}