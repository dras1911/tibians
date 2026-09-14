/**
 * `/[locale]/blog/[slug]` — pojedynczy post bloga (plan T62, arch §9.2).
 *
 * Renderuje MDX z custom componentami (z `mdx-components.tsx`).
 * Server Component — zero client JS.
 *
 * **Fetch:** `getPostBySlug(slug, locale)` → 404 gdy brak.
 * **ISR:** `revalidate = 3600` (1h) + `dynamicParams = true`.
 * **i18n:** `Blog.detail.*` (PL + EN).
 * **SEO:** JSON-LD `BlogPosting` schema.
 */

import * as React from "react";
import type { Metadata } from "next";
import { Calendar, User } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/routing";
import { getAllSlugs, getPostBySlug } from "@/lib/blog";
import { routing, type Locale } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";

/** ISR: 1h. */
export const revalidate = 3600;
export const dynamicParams = true;

// ───────────────────────────────────────────────────────────────────────
// generateStaticParams — pre-render wszystkich postów (build time).
// ───────────────────────────────────────────────────────────────────────

export async function generateStaticParams(): Promise<
  Array<{ locale: string; slug: string }>
> {
  const out: Array<{ locale: string; slug: string }> = [];
  for (const locale of routing.locales) {
    for (const slug of getAllSlugs(locale)) {
      out.push({ locale, slug });
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// generateMetadata
// ───────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = getPostBySlug(slug, locale as Locale);

  const t = await getTranslations({
    locale,
    namespace: "Blog.detail",
  });

  const title = post ? post.frontmatter.title : t("pageFallbackTitle");
  const description = post ? post.frontmatter.excerpt : t("pageFallbackDescription");
  const path = `/blog/${slug}`;

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
    openGraph: post
      ? {
          title,
          description,
          url: `${SITE_URL}/${locale}${path}`,
          siteName: "Tibians",
          locale: locale === "pl" ? "pl_PL" : "en_US",
          type: "article",
          publishedTime: post.frontmatter.date.toISOString(),
          authors: [post.frontmatter.author],
          tags: post.frontmatter.tags,
        }
      : undefined,
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

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const post = getPostBySlug(slug, locale as Locale);
  if (post === null) {
    notFound();
  }

  const [t, format] = await Promise.all([
    getTranslations({ locale, namespace: "Blog.detail" }),
    getFormatter({ locale }),
  ]);

  const Component = post.Component;
  const dateLabel = format.dateTime(post.frontmatter.date, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("blogTitle"), href: "/blog" },
    { label: post.frontmatter.title, href: `/blog/${post.slug}` },
  ];

  // JSON-LD BlogPosting (SEO §4.3).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.frontmatter.title,
    description: post.frontmatter.excerpt,
    datePublished: post.frontmatter.date.toISOString(),
    author: {
      "@type": "Person",
      name: post.frontmatter.author,
    },
    keywords: post.frontmatter.tags?.join(", "),
    inLanguage: locale === "pl" ? "pl-PL" : "en-US",
    url: `${SITE_URL}/${locale}/blog/${post.slug}`,
  };

  return (
    <div className="container max-w-3xl py-6 md:py-10">
      <Breadcrumbs items={breadcrumbItems} />

      <article className="mt-6">
        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="border-b border-border pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {post.frontmatter.title}
          </h1>
          <div className="numeric mt-3 flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" aria-hidden="true" />
              {dateLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" aria-hidden="true" />
              {post.frontmatter.author}
            </span>
          </div>
          {post.frontmatter.tags && post.frontmatter.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {post.frontmatter.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="font-normal text-[10px]">
                  #{tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </header>

        {/* ── MDX content ────────────────────────────────────────── */}
        <div className="prose-tibians mt-8">
          <Component />
        </div>

        {/* ── Footer: link do wszystkich postów ──────────────────── */}
        <footer className="mt-12 border-t border-border pt-6">
          <Link
            href="/blog"
            className="inline-flex h-11 items-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">←</span>
            {t("backLabel")}
          </Link>
        </footer>
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}