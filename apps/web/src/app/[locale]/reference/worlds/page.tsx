/**
 * `/[locale]/reference/worlds` — lista światów zgrupowana po regionie (EU/NA/BR).
 * Plan T61, arch §18.1 (TibiaData `/v4/worlds`) + §7.2 (DB `worlds`).
 *
 * **Fetch (priorytet):**
 *   1. DB `worlds` (T32) — preferowane źródło, scrape raz dziennie,
 *      izolowane od tibia.com rate limit budget.
 *   2. Fallback TibiaData `/v4/worlds` (T8) — gdy DB niedostępne (np. build
 *      time bez DATABASE_URL). Best-effort.
 *
 * **Render:**
 *   - Breadcrumbs `Strona główna / Referencje / Światy`
 *   - 3 sekcje regionów (EU/NA/BR)
 *   - Każdy świat: badge PvP + BattlEye + players online + retro flag
 *   - JSON-LD ItemList
 *
 * **ISR:** 24h (revalidate = 86_400).
 *
 * **i18n:** `Reference.worlds.*` (PL + EN).
 */

import * as React from "react";
import type { Metadata } from "next";
import { Globe2 } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listWorldsByRegion } from "@/lib/server/reference-pages";
import { REGION_FLAG, REGION_FLAG_FALLBACK } from "@/lib/regions";
import { getWorlds } from "@tibians/shared/tibiadata";
import { routing } from "@/i18n/routing";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

/** ISR: 24h (plan T61). */
export const revalidate = 86_400;

// ───────────────────────────────────────────────────────────────────────
// generateMetadata
// ───────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "Reference.worlds",
  });

  const title = t("pageTitle");
  const description = t("pageDescription");
  const path = "/reference/worlds";

  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}${path}`;
  }

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}${path}`,
      languages,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}${path}`,
      siteName: "Tibians",
      locale: locale === "pl" ? "pl_PL" : "en_US",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function ReferenceWorldsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tRef] = await Promise.all([
    getTranslations({ locale, namespace: "Reference.worlds" }),
    getTranslations({ locale, namespace: "Reference.index" }),
  ]);

  // Próba DB najpierw, potem TibiaData fallback.
  let grouped: Awaited<ReturnType<typeof listWorldsByRegion>> | null = null;

  try {
    grouped = await listWorldsByRegion();
  } catch (error) {
    console.error("[reference/worlds] DB query failed:", error);
    grouped = null;
  }

  // Fallback: TibiaData `/v4/worlds` gdy DB puste / błąd.
  if (
    grouped === null ||
    (grouped.EU.length === 0 && grouped.NA.length === 0 && grouped.BR.length === 0)
  ) {
    try {
      const td = await getWorlds();
      const rawList = td.worlds?.regular_worlds ?? [];
      grouped = { EU: [], NA: [], BR: [] };
      for (const w of rawList) {
        if (typeof w.name !== "string" || w.name.length === 0) continue;
        const location = (w.location ?? "").toLowerCase();
        // Oceania: brak grupy na /reference/worlds (grupy EU/NA/BR) —
        // pomijamy, żeby nie kłamać przypisaniem do innego regionu.
        if (location.startsWith("oce")) continue;
        const region: "EU" | "NA" | "BR" = location.startsWith("eu")
          ? "EU"
          : location.startsWith("south")
            ? "BR"
            : "NA";
        grouped[region].push({
          id: 0,
          name: w.name,
          region,
          pvpType: w.pvp_type ?? "—",
          battleye: w.battleye_protected === true ? "protected" : "not protected",
          isRetro: (w.game_world_type ?? "").toLowerCase().includes("retro"),
          isActive: (w.status ?? "").toLowerCase() === "online",
          playersOnline: w.players_online ?? null,
        });
      }
    } catch (error) {
      console.error("[reference/worlds] TibiaData fallback failed:", error);
      grouped = grouped ?? { EU: [], NA: [], BR: [] };
    }
  }

  const totalCount = grouped.EU.length + grouped.NA.length + grouped.BR.length;

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tRef("title"), href: "/reference" },
    { label: t("pageTitle"), href: "/reference/worlds" },
  ];

  // JSON-LD ItemList (schema.org).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("pageTitle"),
    description: t("pageDescription"),
    numberOfItems: totalCount,
    itemListElement: [...grouped.EU, ...grouped.NA, ...grouped.BR].slice(0, 25).map((w, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: w.name,
    })),
  };

  if (totalCount === 0) {
    return (
      <div className="container py-6 md:py-8">
        <Breadcrumbs items={breadcrumbItems} />
        <Card className="mx-auto mt-8 max-w-xl border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              {t("emptyTitle")}
            </CardTitle>
            <CardDescription>{t("emptyDescription")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-6 md:py-8">
      <Breadcrumbs items={breadcrumbItems} />

      <header className="mt-6 max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <Globe2 className="h-6 w-6 text-primary" aria-hidden="true" />
          {t("pageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">{t("pageDescription")}</p>
        <p
          className="numeric mt-2 font-mono text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {t("resultsLabel", { count: totalCount })}
        </p>
      </header>

      <div className="mt-8 space-y-8">
        {(["EU", "NA", "BR"] as const).map((region) => {
          const rows = grouped[region];
          return (
            <section key={region} aria-labelledby={`region-${region}`}>
              <h2
                id={`region-${region}`}
                className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl"
              >
                {REGION_FLAG[region] ?? REGION_FLAG_FALLBACK} {t(`regions.${region}.title`)}
                <span className="numeric rounded-md border border-border px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {rows.length}
                </span>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`regions.${region}.description`)}
              </p>
              {rows.length === 0 ? (
                <p className="numeric mt-3 text-xs tabular-nums text-muted-foreground">
                  {t("regionEmpty")}
                </p>
              ) : (
                <ul
                  role="list"
                  aria-label={t(`regions.${region}.title`)}
                  className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {rows.map((w) => (
                    <li key={`${w.region}-${w.name}`} role="listitem">
                      <WorldCard
                        world={w}
                        pvpLabel={t("pvpLabel")}
                        battleyeLabel={t("battleyeLabel")}
                        retroLabel={t("retroLabel")}
                        offlineLabel={t("offlineLabel")}
                        protectedLabel={t("protectedLabel")}
                        protectedPartialLabel={t("protectedPartialLabel")}
                        unprotectedLabel={t("unprotectedLabel")}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// WorldCard — karta pojedynczego świata
// ───────────────────────────────────────────────────────────────────────

function WorldCard({
  world,
  pvpLabel,
  battleyeLabel,
  retroLabel,
  offlineLabel,
  protectedLabel,
  protectedPartialLabel,
  unprotectedLabel,
}: {
  world: {
    name: string;
    region: "EU" | "NA" | "BR" | "OCE" | null;
    pvpType: string | null;
    battleye: string | null;
    isRetro: boolean;
    isActive: boolean;
    playersOnline: number | null;
  };
  pvpLabel: string;
  battleyeLabel: string;
  retroLabel: string;
  offlineLabel: string;
  protectedLabel: string;
  protectedPartialLabel: string;
  unprotectedLabel: string;
}) {
  const battleyeLabelResolved =
    world.battleye === "protected"
      ? protectedLabel
      : world.battleye === "initially protected"
        ? protectedPartialLabel
        : world.battleye === "not protected"
          ? unprotectedLabel
          : "—";

  const battleyeTone =
    world.battleye === "protected"
      ? "success"
      : world.battleye === "initially protected"
        ? "warning"
        : world.battleye === "not protected"
          ? "destructive"
          : "outline";

  return (
    <Card className="h-full">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">{world.name}</h3>
            <p className="numeric font-mono text-xs tabular-nums text-muted-foreground">
              {world.isActive
                ? world.playersOnline !== null
                  ? world.playersOnline.toLocaleString("en-US")
                  : "—"
                : offlineLabel}{" "}
              {world.isActive && world.playersOnline !== null
                ? pvpLabel.toLowerCase() === "pvp"
                  ? ""
                  : ""
                : ""}
            </p>
          </div>
          {world.isRetro ? (
            <Badge variant="info" className="shrink-0">
              {retroLabel}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-xs">
            {world.pvpType ?? "—"}
          </Badge>
          <Badge variant={battleyeTone} className="text-xs">
            {battleyeLabel}: {battleyeLabelResolved}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
