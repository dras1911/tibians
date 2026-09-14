/**
 * `/[locale]/blog` — lista postów bloga (plan T62, arch §9.2).
 *
 * Renderowane **wyłącznie** jako Server Component — brak client JS poza
 * ewentualnym hoverem (CSS-only). Sortowanie po dacie DESC z `getAllPosts`.
 *
 * Każdy post to karta z:
 *   - Tytuł (klikalny → detail)
 *   - Excerpt
 *   - Data (format locale-aware — `Intl.DateTimeFormat`)
 *   - Autor
 *   - Tagi (chipy)
 *   - Miniaturka (jeśli dostępna)
 *
 * **ISR:** 1h (revalidate = 3600) — blog zmienia się rzadko.
 * **i18n:** `Blog.*` (PL + EN).
 * **SEO:** JSON-LD `Blog` schema.
 */

import * as React from "react";
import type { Metadata } from "next";
import { Calendar, Newspaper, User } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { getAllPosts, summarizePost, type BlogPostSummary } from "@/lib/blog";
import { routing, type Locale } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

/** ISR: 1h. */
export const revalidate = 3600;

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
    namespace: "Blog.list",
  });

  const title = t("pageTitle");
  const description = t("pageDescription");
  const path = "/blog";

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
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default async function BlogListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, format] = await Promise.all([
    getTranslations({ locale, namespace: "Blog.list" }),
    getFormatter({ locale }),
  ]);

  const posts = getAllPosts(locale as Locale).map(summarizePost);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("title"), href: "/blog" },
  ];

  // JSON-LD: Blog schema (schema.org).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: t("pageTitle"),
    description: t("pageDescription"),
    url: `${SITE_URL}/${locale}/blog`,
    inLanguage: locale === "pl" ? "pl-PL" : "en-US",
    blogPost: posts.slice(0, 10).map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE_URL}/${locale}/blog/${p.slug}`,
      datePublished: p.date.toISOString(),
      author: { "@type": "Person", name: p.author },
      description: p.excerpt,
    })),
  };

  return (
    <div className="container py-6 md:py-8">
      <Breadcrumbs items={breadcrumbItems} />

      <header className="mt-6 max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <Newspaper className="h-6 w-6 text-primary" aria-hidden="true" />
          {t("pageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {t("pageDescription")}
        </p>
        <p
          className="numeric mt-2 font-mono text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {t("resultsLabel", { count: posts.length })}
        </p>
      </header>

      {posts.length === 0 ? (
        <Card className="mx-auto mt-8 max-w-xl border-dashed">
          <CardHeader>
            <CardTitle className="text-base">{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyDescription")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul
          role="list"
          aria-label={t("gridAria")}
          className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2"
        >
          {posts.map((p) => (
            <li key={p.slug} role="listitem">
              <PostCard
                summary={p}
                href={`/blog/${p.slug}`}
                dateLabel={format.dateTime(p.date, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
                readMoreLabel={t("readMoreLabel")}
                tagsLabel={t("tagsLabel")}
              />
            </li>
          ))}
        </ul>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// PostCard — karta posta (link do detail).
// ───────────────────────────────────────────────────────────────────────

function PostCard({
  summary,
  href,
  dateLabel,
  readMoreLabel,
  tagsLabel,
}: {
  summary: BlogPostSummary;
  href: string;
  dateLabel: string;
  readMoreLabel: string;
  tagsLabel: string;
}) {
  return (
    <Link
      href={href as Parameters<typeof Link>[0]["href"]}
      className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`${summary.title} — ${readMoreLabel}`}
    >
      <Card className="h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md group-focus-visible:border-primary/40">
        {summary.thumbnail !== undefined ? (
          <div className="aspect-[2/1] w-full overflow-hidden rounded-t-lg bg-muted">
            <img
              src={summary.thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        ) : null}
        <CardHeader className="gap-2">
          <CardTitle className="text-lg">{summary.title}</CardTitle>
          <CardDescription className="line-clamp-3 text-sm">
            {summary.excerpt}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="numeric flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" aria-hidden="true" />
              {dateLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" aria-hidden="true" />
              {summary.author}
            </span>
          </div>
          {summary.tags && summary.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5" aria-label={tagsLabel}>
              {summary.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="font-normal text-[10px]">
                  #{tag}
                </Badge>
              ))}
            </div>
          ) : null}
          <span className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 group-hover:underline">
            {readMoreLabel}
            <span className="ml-1 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
              →
            </span>
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}