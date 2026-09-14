/**
 * `/[locale]/bosses` — lista boostable bossów z TibiaData `/v4/boostablebosses`
 * (plan T60, arch §18.1 + §3.1).
 *
 * **Fetch (arch §18.1):**
 *   - `getBoostableBosses()` z `@tibians/shared/tibiadata` (T8 — typed client
 *     z LRU cache + circuit breaker). Zero własnego scrapera (§18.1 Must NOT).
 *   - Dane są prawie statyczne (lista bossów zmienia się rzadko) → agresywny
 *     ISR `revalidate = 3600` (1 h).
 *
 * **Render:**
 *   - Breadcrumbs: `Strona główna / Bossy dnia`
 *   - Hero: tytuł + opis + (gdy dostępny) badge aktualnie boostowanego bossa
 *   - Grid kart `<BossCard>` (featured pierwsze, potem alfabetycznie)
 *   - JSON-LD `ItemList` schema (SEO §4.3)
 *
 * **i18n:** namespace `Bosses.*` (PL + EN). Zero hardcoded PL/EN.
 *
 * **Empty/error state:**
 *   - TibiaData może zwrócić `null` lub brak `boostable_boss_list` →
 *     fallback do `EmptyState` z CTA powrotu na home.
 */

import * as React from "react";
import type { Metadata } from "next";
import { ShieldAlert, Skull } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BossCard, bossSlug } from "@/components/bosses/boss-card";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBoostableBosses } from "@tibians/shared/tibiadata";
import { routing } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

/** ISR: 1h fallback. On-demand revalidate przez scraper webhook (T38). */
export const revalidate = 3600;

// ───────────────────────────────────────────────────────────────────────
// generateMetadata — locale-aware SEO (plan T60).
// ───────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "Bosses.list",
  });

  const title = t("pageTitle");
  const description = t("pageDescription");
  const path = "/bosses";

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
// Page (Server Component, RSC).
// ───────────────────────────────────────────────────────────────────────

export default async function BossesListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [tList, tBosses] = await Promise.all([
    getTranslations({ locale, namespace: "Bosses.list" }),
    getTranslations({ locale, namespace: "Bosses" }),
  ]);

  // Fetch przez typed TibiaData client (T8) — LRU cache + retry + breaker.
  let response;
  try {
    response = await getBoostableBosses();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[bosses] TibiaData fetch failed:", error);
    response = null;
  }

  const container =
    response?.boostable_bosses ?? null;
  const rawBosses = container?.boostable_boss_list ?? [];
  const boosted = container?.boosted ?? null;

  // Filtruj + sortuj: featured pierwsze, potem alfabetycznie po nazwie.
  const bosses = rawBosses
    .filter((b) => typeof b.name === "string" && b.name.length > 0)
    .slice()
    .sort((a, b) => {
      if ((a.featured ?? false) !== (b.featured ?? false)) {
        return a.featured ? -1 : 1;
      }
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

  // ── Empty state ─────────────────────────────────────────────────────
  if (bosses.length === 0) {
    return (
      <div className="container py-6 md:py-8">
        <Breadcrumbs
          items={[{ label: tBosses("title"), href: "/bosses" }]}
        />
        <EmptyBosses
          title={tList("emptyTitle")}
          description={tList("emptyDescription")}
        />
      </div>
    );
  }

  // ── JSON-LD ItemList ────────────────────────────────────────────────
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: tList("pageTitle"),
    description: tList("pageDescription"),
    numberOfItems: bosses.length,
    itemListElement: bosses.slice(0, 25).map((b, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${SITE_URL}/${locale}/bosses/${bossSlug(b.name ?? "")}`,
      name: b.name ?? "",
    })),
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tBosses("title"), href: "/bosses" },
  ];

  return (
    <div className="container py-6 md:py-8">
      <Breadcrumbs items={breadcrumbItems} />

      <header className="mt-6 max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <Skull className="h-6 w-6 text-primary" aria-hidden="true" />
          {tList("pageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {tList("pageDescription")}
        </p>
      </header>

      {/* ── Aktualnie boostowany boss ─────────────────────────────────── */}
      {boosted && typeof boosted.name === "string" ? (
        <Card className="mt-6 border-warning/40 bg-warning/5">
          <CardHeader className="gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
              {tList("boostedTitle")}
            </CardTitle>
            <CardDescription>{tList("boostedDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {boosted.image_url !== null ? (
                <img
                  src={boosted.image_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-16 rounded-md border border-border object-cover"
                />
              ) : null}
              <span className="text-lg font-semibold text-foreground">
                {boosted.name}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Grid kart ────────────────────────────────────────────────── */}
      <div
        className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        role="list"
        aria-label={tList("gridAria")}
      >
        {bosses.map((boss) => {
          const slug = bossSlug(boss.name ?? "");
          return (
            <div key={slug} role="listitem">
              <BossCard
                name={boss.name ?? ""}
                imageUrl={boss.image_url ?? null}
                featured={boss.featured === true}
                href={`/bosses/${slug}`}
                detailsLabel={tList("detailsLabel")}
                featuredLabel={tList("featuredLabel")}
              />
            </div>
          );
        })}
      </div>

      {/* JSON-LD ItemList schema (SEO §4.3). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// EmptyBosses — fallback gdy TibiaData zwróci pustę.
// ───────────────────────────────────────────────────────────────────────

function EmptyBosses({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="mx-auto mt-8 max-w-xl border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Skull className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}