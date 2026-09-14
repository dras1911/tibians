/**
 * `/[locale]/bosses/[slug]` — detail pojedynczego bossa (plan T60, arch
 * §18.1).
 *
 * **Fetch:**
 *   - `getBoostableBosses()` z TibiaData — lokalnie szukamy pełnej nazwy
 *     bossa po slug (boostablebosses nie zwraca statystyk, tylko obrazek +
 *     featured flag).
 *   - `getCreature(slug)` z TibiaData `/v4/creature/{race}` — bestiariusz
 *     Tibii: HP, doświadczenie, loot, weakness/strong, opis.
 *
 * **Render:**
 *   - Breadcrumbs: `Strona główna / Bossy dnia / {Name}`
 *   - Hero: obrazek + nazwa + featured badge
 *   - Stats grid: HP, EXP, summon mana, convince mana (gdy dostępne)
 *   - Description / behaviour / loot list (gdy dostępne)
 *   - JSON-LD `Thing` + BreadcrumbList
 *
 * **ISR:** `revalidate = 3600` (1 h) — dane bestiariusza niemal statyczne.
 *
 * **i18n:** namespace `Bosses.*` (PL + EN). Zero hardcoded PL/EN.
 */

import * as React from "react";
import type { Metadata } from "next";
import {
  Heart,
  Skull,
  Sparkles,
  Swords,
  Wand2,
} from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { bossSlug } from "@/components/bosses/boss-card";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import {
  getBoostableBosses,
  getCreature,
} from "@tibians/shared/tibiadata";
import { routing } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

/** ISR: 1h fallback. Boss data zmienia się rzadko. */
export const revalidate = 3600;
export const dynamicParams = true;

// ───────────────────────────────────────────────────────────────────────
// generateMetadata — locale-aware SEO per boss.
// ───────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;

  const displayName = await resolveBossName(slug);

  const t = await getTranslations({
    locale,
    namespace: "Bosses.detail",
  });

  const title = displayName
    ? t("pageTitle", { name: displayName })
    : t("pageFallbackTitle");

  const description = t("pageDescription", { name: displayName ?? "—" });
  const path = `/bosses/${slug}`;

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
// generateStaticParams — pre-render top boostable bossów (build time).
// ───────────────────────────────────────────────────────────────────────

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  let response;
  try {
    response = await getBoostableBosses();
  } catch {
    return [];
  }
  const list = response?.boostable_bosses?.boostable_boss_list ?? [];
  const params: Array<{ slug: string }> = [];
  for (const b of list) {
    if (typeof b.name !== "string" || b.name.length === 0) continue;
    params.push({ slug: bossSlug(b.name) });
  }
  return params;
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

/**
 * Znajduje canonical name bossa po slug — szukamy w boostablebosses
 * (boostable lista to podzbiór bestiariusza, nazwy się pokrywają).
 */
async function resolveBossName(slug: string): Promise<string | null> {
  let response;
  try {
    response = await getBoostableBosses();
  } catch {
    return null;
  }
  const list = response?.boostable_bosses?.boostable_boss_list ?? [];
  for (const b of list) {
    if (typeof b.name !== "string") continue;
    if (bossSlug(b.name) === slug) return b.name;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function BossDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  // Walidacja slug (lowercase, alnum + "-") — chroni przed nadmiernym
  // wyciekiem do fetch URL.
  if (!/^[a-z0-9-]{1,80}$/u.test(slug)) {
    notFound();
  }

  const [tDetail, tBosses, tList, name] = await Promise.all([
    getTranslations({ locale, namespace: "Bosses.detail" }),
    getTranslations({ locale, namespace: "Bosses" }),
    getTranslations({ locale, namespace: "Bosses.list" }),
    resolveBossName(slug),
  ]);

  // Jeśli boss nie istnieje w boostablebosses → 404.
  if (name === null) {
    notFound();
  }

  // Bestiariusz z `/v4/creature/{name}` (TibiaData T8). race = oryginalna
  // nazwa bossa (nie slug).
  let creature = null;
  try {
    const response = await getCreature(name);
    creature = response?.creature ?? null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[bosses/detail] TibiaData creature failed:", error);
    creature = null;
  }

  // Wspólne dane do renderu.
  const imageUrl = creature?.image_url ?? null;
  const hp = creature?.hitpoints ?? null;
  const exp = creature?.experience_points ?? null;
  const behaviour = creature?.behaviour ?? null;
  const description = creature?.description ?? null;
  const summonMana = creature?.summoned_mana ?? null;
  const convinceMana = creature?.convinced_mana ?? null;
  const lootList = creature?.loot_list ?? [];
  const strong = creature?.strong ?? [];
  const weak = creature?.weakness ?? [];

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tBosses("title"), href: "/bosses" },
    { label: name, href: `/bosses/${slug}` },
  ];

  // JSON-LD: Thing (bestiariusz — brak dedykowanego schema.org type dla
  // Tibia bossów). BreadcrumbList dodaje `<Breadcrumbs>` automatycznie.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Thing",
    name,
    description: description ?? tDetail("pageDescription", { name }),
    image: imageUrl ?? undefined,
  };

  return (
    <div className="container py-6 md:py-8">
      <Breadcrumbs items={breadcrumbItems} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <header className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="aspect-square w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:w-40">
          {imageUrl !== null ? (
            <img
              src={imageUrl}
              alt=""
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center text-muted-foreground"
            >
              <Skull className="h-12 w-12" />
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {name}
            </h1>
            {creature?.featured === true ? (
              <Badge variant="warning" className="gap-1">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {tList("featuredLabel")}
              </Badge>
            ) : null}
          </div>
          {description !== null && description.length > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              {description}
            </p>
          ) : null}
          <div className="mt-4">
            <Button asChild variant="outline" size="sm">
              <Link href="/bosses">
                <span aria-hidden="true">←</span>
                {tDetail("backLabel")}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Stats grid ────────────────────────────────────────────────── */}
      {(hp !== null || exp !== null || summonMana !== null || convinceMana !== null) ? (
        <section
          aria-labelledby="stats-heading"
          className="mt-8"
        >
          <h2 id="stats-heading" className="sr-only">
            {tDetail("statsHeading")}
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {hp !== null ? (
              <StatTile
                label={tDetail("hpLabel")}
                value={hp}
                icon={<Heart className="h-4 w-4" aria-hidden="true" />}
                tone="danger"
              />
            ) : null}
            {exp !== null ? (
              <StatTile
                label={tDetail("expLabel")}
                value={exp}
                icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                tone="success"
              />
            ) : null}
            {summonMana !== null ? (
              <StatTile
                label={tDetail("summonManaLabel")}
                value={summonMana}
                icon={<Wand2 className="h-4 w-4" aria-hidden="true" />}
              />
            ) : null}
            {convinceMana !== null ? (
              <StatTile
                label={tDetail("convinceManaLabel")}
                value={convinceMana}
                icon={<Swords className="h-4 w-4" aria-hidden="true" />}
              />
            ) : null}
          </dl>
        </section>
      ) : null}

      {/* ── Behaviour ────────────────────────────────────────────────── */}
      {behaviour !== null && behaviour.length > 0 ? (
        <Card className="mt-6">
          <CardHeader className="gap-2">
            <CardTitle className="text-base">{tDetail("behaviourTitle")}</CardTitle>
            <CardDescription>{behaviour}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {/* ── Loot ──────────────────────────────────────────────────────── */}
      {lootList.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">{tDetail("lootTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {lootList.map((item, idx) => (
                <li key={`${item}-${idx}`}>
                  <Badge variant="outline" className="font-normal">
                    {item}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Strong / Weakness ────────────────────────────────────────── */}
      {(strong.length > 0 || weak.length > 0) ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {strong.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tDetail("strongTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-2">
                  {strong.map((item, idx) => (
                    <li key={`s-${item}-${idx}`}>
                      <Badge variant="destructive" className="font-normal">
                        {item}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {weak.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tDetail("weakTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-2">
                  {weak.map((item, idx) => (
                    <li key={`w-${item}-${idx}`}>
                      <Badge variant="success" className="font-normal">
                        {item}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* JSON-LD Thing schema (SEO §4.3). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// StatTile — pojedynczy kafelek statystyki bestiariusza.
// ───────────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "default" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "border-danger/40 text-foreground"
      : tone === "success"
      ? "border-success/40 text-foreground"
      : "border-border text-foreground";
  const iconClass =
    tone === "danger"
      ? "text-danger"
      : tone === "success"
      ? "text-success"
      : "text-primary";
  return (
    <div className={`rounded-lg border bg-card p-4 ${toneClass}`}>
      <div className={`flex items-center gap-2 text-xs font-medium ${iconClass}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="numeric mt-1 font-mono text-xl font-semibold tabular-nums">
        {value.toLocaleString(localeHint)}
      </div>
    </div>
  );
}

/**
 * localeHint — locale dla `toLocaleString` w `StatTile`. Wymagane przez
 * SSR (Node) → `'en-US'` jako bezpieczny fallback (separator tysięcy).
 */
const localeHint = "en-US";