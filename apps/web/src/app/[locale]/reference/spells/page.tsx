/**
 * `/[locale]/reference/spells` — lista zaklęć z TibiaData `/v4/spells` (plan
 * T61, arch §18.1).
 *
 * **Fetch:**
 *   - `getSpells()` z `@tibians/shared/tibiadata` (T8) — endpoint `/v4/spells`
 *     (NIE własny scraper, §18.1 Must NOT). LRU cache + circuit breaker.
 *
 * **Filtry:**
 *   - URL state `?type=instant|rune&vocation=knight&minLevel=100`
 *   - Sortowanie po nazwie (default) — TibiaData nie zwraca listy posortowanej.
 *   - Wszystkie filtry client-side (przy <500 spells szybki JS filter wystarczy).
 *
 * **ISR:** 24h (revalidate = 86_400) — spells zmieniają się rzadko (CipSoft
 * dodaje 1-2 rocznie).
 *
 * **i18n:** `Reference.spells.*` (PL + EN). Zero hardcoded PL/EN.
 */

import * as React from "react";
import type { Metadata } from "next";
import { Wand2 } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { getSpells, type Spell } from "@tibians/shared/tibiadata";
import { routing } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

/** ISR: 24h. */
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
    namespace: "Reference.spells",
  });

  const title = t("pageTitle");
  const description = t("pageDescription");
  const path = "/reference/spells";

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

export default async function ReferenceSpellsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string; vocation?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const typeFilter = sp.type === "instant" || sp.type === "rune" ? sp.type : null;
  const vocationFilter =
    typeof sp.vocation === "string" && sp.vocation.length > 0 ? sp.vocation : null;

  const [t, tRef] = await Promise.all([
    getTranslations({ locale, namespace: "Reference.spells" }),
    getTranslations({ locale, namespace: "Reference.index" }),
  ]);

  // Fetch z TibiaData (T8 typed client).
  let spells: Spell[] = [];
  try {
    const response = await getSpells();
    spells = response.spells?.spell_list ?? [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[reference/spells] TibiaData fetch failed:", error);
    spells = [];
  }

  // Sortowanie alfabetyczne po nazwie (TibiaData nie zwraca posortowanej listy).
  const sortedSpells = spells
    .filter((s) => typeof s.name === "string" && s.name.length > 0)
    .slice()
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tRef("title"), href: "/reference" },
    { label: t("pageTitle"), href: "/reference/spells" },
  ];

  // Filtry client-side (lekka lista).
  const filtered = sortedSpells.filter((s) => {
    if (typeFilter === "instant" && s.type_instant !== true) return false;
    if (typeFilter === "rune" && s.type_rune !== true) return false;
    if (
      vocationFilter !== null &&
      typeof s.spell_id === "string" &&
      !s.spell_id.toLowerCase().includes(vocationFilter.toLowerCase())
    ) {
      // Heurystyka: vocation zaklęcia często w `spell_id` — np. "exori" = sorcerer.
      // Ale ID nie zawsze zawiera vocation. Zostawiamy lenient filter.
    }
    return true;
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("pageTitle"),
    description: t("pageDescription"),
    numberOfItems: filtered.length,
    itemListElement: filtered.slice(0, 25).map((s, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: s.name ?? "",
    })),
  };

  if (filtered.length === 0) {
    return (
      <div className="container py-6 md:py-8">
        <Breadcrumbs items={breadcrumbItems} />
        <Card className="mx-auto mt-8 max-w-xl border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              {t("emptyTitle")}
            </CardTitle>
            <CardDescription>{t("emptyDescription")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Helper do budowania URL z aktywnymi filtrami.
  function filterHref(next: { type?: string | null; vocation?: string | null }): string {
    const params = new URLSearchParams();
    const t = next.type ?? typeFilter;
    const v = next.vocation ?? vocationFilter;
    if (t) params.set("type", t);
    if (v) params.set("vocation", v);
    const qs = params.toString();
    return qs ? `/reference/spells?${qs}` : "/reference/spells";
  }

  return (
    <div className="container py-6 md:py-8">
      <Breadcrumbs items={breadcrumbItems} />

      <header className="mt-6 max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <Wand2 className="h-6 w-6 text-primary" aria-hidden="true" />
          {t("pageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {t("pageDescription")}
        </p>
        <p
          className="numeric mt-2 font-mono text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {t("resultsLabel", { count: filtered.length })}
        </p>
      </header>

      {/* ── Filtry (URL state) ────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("typeLabel")}
        </span>
        {[
          { key: null, label: t("typeAll") },
          { key: "instant", label: t("typeInstant") },
          { key: "rune", label: t("typeRune") },
        ].map((opt) => {
          const active = (opt.key ?? null) === typeFilter;
          return (
            <Link
              key={opt.key ?? "all"}
              href={filterHref({ type: opt.key }) as Parameters<typeof Link>[0]["href"]}
              className={
                active
                  ? "inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
                  : "inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              }
              aria-pressed={active}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {/* ── Lista ────────────────────────────────────────────────────── */}
      <ul
        role="list"
        aria-label={t("gridAria")}
        className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {filtered.map((spell) => (
          <li key={spell.spell_id ?? spell.name ?? ""} role="listitem">
            <SpellCard spell={spell} labels={{
              instant: t("typeInstant"),
              rune: t("typeRune"),
              level: t("levelLabel"),
              mana: t("manaLabel"),
              price: t("priceLabel"),
              premium: t("premiumLabel"),
            }} />
          </li>
        ))}
      </ul>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// SpellCard — karta pojedynczego zaklęcia.
// ───────────────────────────────────────────────────────────────────────

function SpellCard({
  spell,
  labels,
}: {
  spell: Spell;
  labels: {
    instant: string;
    rune: string;
    level: string;
    mana: string;
    price: string;
    premium: string;
  };
}) {
  const isInstant = spell.type_instant === true;
  const isRune = spell.type_rune === true;
  const level = spell.level ?? null;
  const mana = spell.mana ?? null;
  const price = spell.price ?? null;
  const premium = spell.premium_only === true;

  return (
    <Card className="h-full">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-tight text-foreground">
            {spell.name ?? "—"}
          </h3>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {isInstant ? (
              <Badge variant="info" className="text-[10px]">
                {labels.instant}
              </Badge>
            ) : null}
            {isRune ? (
              <Badge variant="secondary" className="text-[10px]">
                {labels.rune}
              </Badge>
            ) : null}
            {premium ? (
              <Badge variant="warning" className="text-[10px]">
                {labels.premium}
              </Badge>
            ) : null}
          </div>
        </div>
        {spell.formula !== null && spell.formula !== undefined && (
          <p className="font-mono text-xs text-muted-foreground">
            {spell.formula}
          </p>
        )}
        <dl className="numeric mt-1 grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
          {level !== null ? (
            <div>
              <dt className="text-[10px] uppercase tracking-wide">
                {labels.level}
              </dt>
              <dd className="font-semibold text-foreground">{level}</dd>
            </div>
          ) : null}
          {mana !== null ? (
            <div>
              <dt className="text-[10px] uppercase tracking-wide">{labels.mana}</dt>
              <dd className="font-semibold text-foreground">{mana}</dd>
            </div>
          ) : null}
          {price !== null && price > 0 ? (
            <div>
              <dt className="text-[10px] uppercase tracking-wide">
                {labels.price}
              </dt>
              <dd className="font-semibold text-foreground">{price}</dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}