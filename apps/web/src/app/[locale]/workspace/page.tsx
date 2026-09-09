import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SnapshotSourceProvider } from "@/components/workspace/snapshot-source-provider";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { loadValuationConfig } from "@/lib/character-value-config";
import { routing, type Locale } from "@/i18n/routing";

/**
 * `/[locale]/workspace` — Character Workspace (task 25, architecture
 * §13.3 / §13.4).
 *
 * Server Component shell:
 *   1. `generateMetadata()` — per-locale SEO title + description.
 *   2. Renders the client `<SnapshotSourceProvider>` (reads `?auction=` /
 *      `?saved=` and pushes the snapshot into the Zustand store).
 *   3. Renders the client `<WorkspaceLayout>` — header + tabs + panels.
 *
 * The route exists in exactly two variants (`/pl/workspace`, `/en/workspace`)
 * — both share the same client tree. `pnpm --filter @tibians/web build`
 * compiles them in parallel.
 *
 * Note: this page is intentionally a thin shell — all heavy logic
 * (snapshot loading, panel reactivity, tab persistence, edit-mode
 * badge) lives in client components under `src/components/workspace/`.
 * This keeps the server boundary minimal (no `force-dynamic`, no DB
 * queries, fully static per locale).
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

const PATH = "/workspace";

// Marked `force-dynamic` because the page loads `ValuationConfig` at
// request time (mirrors the existing `/calculators/character-value`
// page). Once Faza 2 wires a real DB read with cache tags this can
// become ISR + on-demand revalidation.
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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [t, config] = await Promise.all([
    getTranslations({
      locale: locale as Locale,
      namespace: "Workspace",
    }),
    loadValuationConfig(),
  ]);

  return (
    <SnapshotSourceProvider>
      <WorkspaceLayout
        description={t("description")}
        valuationConfig={config}
      />
    </SnapshotSourceProvider>
  );
}