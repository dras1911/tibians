/**
 * Blog (plan T62, arch §9.2).
 *
 * System postów MDX zlokalizowanych (PL/EN) z:
 *   - **Frontmatter Zod schema** (`BlogPostFrontmatterSchema`) — walidacja
 *     przed publikacją, jedno źródło typów dla listy / detail / RSS.
 *   - **Loader** (`getAllPosts`, `getPostBySlug`) — czyta `*.mdx` przez
 *     `import.meta.glob` (Vite/Next bundler), parsuje frontmatter Zod-em,
 *     sortuje po dacie DESC.
 *   - **RSS generator** (`buildRssFeed`) — poprawny XML 2.0 (W3C validator)
 *     z `<channel>`, `<item>` per post, `<atom:link>` self-ref, `<language>`.
 *
 * **i18n:** Posty są w jednym locale (`frontmatter.locale`) — UI listy i
 * detailu query po `locale` (PL lub EN). Posty z innego locale nie są
 * widoczne.
 *
 * **ISR:** `revalidate = 3600` (1h) na listingu i pojedynczym poście —
 * blog zmienia się rzadko (1-2 posty / tydzień), a Next.js cache jest
 * unieważniany przy deploy.
 */
import { z } from "zod";

import { routing, type Locale } from "@/i18n/routing";

// ───────────────────────────────────────────────────────────────────────
// Frontmatter Zod schema
// ───────────────────────────────────────────────────────────────────────

/**
 * Schemat frontmatter wymagany od każdego posta MDX w `src/content/blog/`.
 *
 * Walidacja:
 *   - `title` — wymagane, 1..120 znaków
 *   - `date` — ISO 8601 (YYYY-MM-DD lub full ISO); parsujemy do Date
 *   - `author` — string 1..80
 *   - `excerpt` — 1..280 znaków (renderowane na liście + RSS description)
 *   - `thumbnail` — opcjonalny URL (relatywny lub absolutny)
 *   - `tags` — opcjonalna lista stringów 0..10
 *   - `locale` — `"pl" | "en"` (locale posta, musi matchować folder)
 */
export const BlogPostFrontmatterSchema = z.object({
  title: z.string().min(1).max(120),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/u, "Date must be ISO 8601 (YYYY-MM-DD)")
    .transform((s) => {
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) {
        throw new Error(`Invalid date: ${s}`);
      }
      return d;
    }),
  author: z.string().min(1).max(80),
  excerpt: z.string().min(1).max(280),
  thumbnail: z.string().url().optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
  locale: z.enum(routing.locales),
});

export type BlogPostFrontmatter = z.infer<typeof BlogPostFrontmatterSchema>;

// ───────────────────────────────────────────────────────────────────────
// Loader types
// ───────────────────────────────────────────────────────────────────────

/**
 * Pełny shape posta bloga — frontmatter (parsowane przez Zod) + dynamicznie
 * importowany komponent MDX. `Component` to React Server Component zwrócony
 * przez MDX loader (zawiera `default` export = MDXContent).
 */
export interface BlogPost {
  /** Slug = nazwa pliku bez rozszerzenia i locale prefixu (np. `welcome`). */
  slug: string;
  /** Pełna ścieżka do .mdx (relatywna do src/content/blog). */
  filePath: string;
  /** Zwalidowany frontmatter. */
  frontmatter: BlogPostFrontmatter;
  /** Komponent React z `default` export = renderowany MDX. */
  Component: React.ComponentType<Record<string, unknown>>;
}

// ───────────────────────────────────────────────────────────────────────
// Loader — explicit imports (Next.js webpack compatible)
//
// Next.js 15 webpack nie wspiera `import.meta.glob` (Vite-only feature).
// Zamiast tego importujemy posty statycznie z aliasem `@/content/blog/...`
// — Next bundler analizuje je w czasie build i inline'uje do output.
// ───────────────────────────────────────────────────────────────────────

/**
 * Shape modułu MDX — `default` (komponent) + `frontmatter` (obiekt).
 *
 * Pola są `unknown` (nie `any`) — wszystko walidujemy Zod-em poniżej
 * (per §Must NOT Have — "NIE używaj `as any`").
 */
type RawMdxModule = {
  default: React.ComponentType<Record<string, unknown>>;
  frontmatter: Record<string, unknown>;
};

// ── Statyczne importy postów ────────────────────────────────────────
// PL
import * as PlWitamy from "../../content/blog/pl/witamy-na-tibians.mdx";
import * as PlWycena from "../../content/blog/pl/jak-dziala-wycenacja.mdx";
import * as PlBazaar from "../../content/blog/pl/przewodnik-po-bazaarze.mdx";
// EN
import * as EnWelcome from "../../content/blog/en/welcome-to-tibians.mdx";
import * as EnValuation from "../../content/blog/en/how-valuation-works.mdx";
import * as EnBazaar from "../../content/blog/en/bazaar-guide.mdx";

/** Ścieżka logiczna (do breadcrumbs / error logów) + slug + locale. */
interface PostManifestEntry {
  filePath: string;
  locale: Locale;
  slug: string;
  mod: RawMdxModule;
}

const MANIFEST: ReadonlyArray<PostManifestEntry> = [
  // PL
  {
    filePath: "src/content/blog/pl/witamy-na-tibians.mdx",
    locale: "pl",
    slug: "witamy-na-tibians",
    mod: PlWitamy as unknown as RawMdxModule,
  },
  {
    filePath: "src/content/blog/pl/jak-dziala-wycenacja.mdx",
    locale: "pl",
    slug: "jak-dziala-wycenacja",
    mod: PlWycena as unknown as RawMdxModule,
  },
  {
    filePath: "src/content/blog/pl/przewodnik-po-bazaarze.mdx",
    locale: "pl",
    slug: "przewodnik-po-bazaarze",
    mod: PlBazaar as unknown as RawMdxModule,
  },
  // EN
  {
    filePath: "src/content/blog/en/welcome-to-tibians.mdx",
    locale: "en",
    slug: "welcome-to-tibians",
    mod: EnWelcome as unknown as RawMdxModule,
  },
  {
    filePath: "src/content/blog/en/how-valuation-works.mdx",
    locale: "en",
    slug: "how-valuation-works",
    mod: EnValuation as unknown as RawMdxModule,
  },
  {
    filePath: "src/content/blog/en/bazaar-guide.mdx",
    locale: "en",
    slug: "bazaar-guide",
    mod: EnBazaar as unknown as RawMdxModule,
  },
];

/**
 * Ładuje i parsuje wszystkie posty. Wynik posortowany po `date DESC`.
 *
 * Błędy walidacji frontmatter logujemy i pomijamy post — reszta działa.
 */
function loadAllPostsInternal(): BlogPost[] {
  const posts: BlogPost[] = [];
  for (const entry of MANIFEST) {
    const parsed = BlogPostFrontmatterSchema.safeParse(entry.mod.frontmatter);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.error(
        `[blog] Invalid frontmatter in ${entry.filePath}:`,
        parsed.error.flatten(),
      );
      continue;
    }
    // Sprawdzenie spójności locale ↔ folder.
    if (parsed.data.locale !== entry.locale) {
      // eslint-disable-next-line no-console
      console.error(
        `[blog] Frontmatter locale mismatch in ${entry.filePath}: ` +
        `folder=${entry.locale}, frontmatter=${parsed.data.locale}`,
      );
      continue;
    }
    posts.push({
      slug: entry.slug,
      filePath: entry.filePath,
      frontmatter: parsed.data,
      Component: entry.mod.default,
    });
  }
  // Sortuj po dacie DESC (najnowsze pierwsze).
  posts.sort((a, b) => b.frontmatter.date.getTime() - a.frontmatter.date.getTime());
  return posts;
}

const ALL_POSTS: BlogPost[] = loadAllPostsInternal();

/**
 * Zwraca wszystkie posty w danym locale, posortowane DESC po dacie.
 */
export function getAllPosts(locale: Locale): BlogPost[] {
  return ALL_POSTS.filter((p) => p.frontmatter.locale === locale);
}

/**
 * Zwraca post po slug + locale. `null` gdy nie znaleziono.
 */
export function getPostBySlug(slug: string, locale: Locale): BlogPost | null {
  for (const p of ALL_POSTS) {
    if (p.frontmatter.locale === locale && p.slug === slug) return p;
  }
  return null;
}

/**
 * Zwraca listę slugów dla danego locale (do `generateStaticParams`).
 */
export function getAllSlugs(locale: Locale): string[] {
  return getAllPosts(locale).map((p) => p.slug);
}

/**
 * Lekki shape frontmatter dla listy RSS / JSON-LD (bez `Component`).
 */
export interface BlogPostSummary {
  slug: string;
  title: string;
  excerpt: string;
  date: Date;
  author: string;
  tags: readonly string[] | undefined;
  thumbnail: string | undefined;
  locale: Locale;
}

export function summarizePost(post: BlogPost): BlogPostSummary {
  return {
    slug: post.slug,
    title: post.frontmatter.title,
    excerpt: post.frontmatter.excerpt,
    date: post.frontmatter.date,
    author: post.frontmatter.author,
    tags: post.frontmatter.tags,
    thumbnail: post.frontmatter.thumbnail,
    locale: post.frontmatter.locale,
  };
}

// ───────────────────────────────────────────────────────────────────────
// RSS 2.0 feed builder
// ───────────────────────────────────────────────────────────────────────

/**
 * Generuje poprawny XML 2.0 (W3C feed validator) dla danego locale.
 *
 * Struktura:
 *   - `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`
 *   - `<channel>` z metadanymi (title, link, description, language)
 *   - `<atom:link rel="self" type="application/rss+xml" />` (wymóg RSS validators)
 *   - `<item>` per post (title, link, guid, pubDate, description, author)
 *
 * Dane XML są escape'owane (`escapeXml`) — bezpieczne dla wszystkich
 * znaków specjalnych w tytule/treści.
 */
export function buildRssFeed(
  summaries: readonly BlogPostSummary[],
  options: {
    locale: Locale;
    siteUrl: string;
    title: string;
    description: string;
    feedPath: string; // np. "/blog/rss.xml" (locale-relative)
  },
): string {
  const { locale, siteUrl, title, description, feedPath } = options;
  const channelUrl = `${siteUrl}/${locale}/blog`;
  const feedUrl = `${siteUrl}/${locale}${feedPath}`;
  const languageTag = locale === "pl" ? "pl-PL" : "en-US";

  const itemsXml = summaries
    .map((p) => {
      const itemUrl = `${siteUrl}/${locale}/blog/${p.slug}`;
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${itemUrl}</link>
      <guid isPermaLink="true">${itemUrl}</guid>
      <pubDate>${p.date.toUTCString()}</pubDate>
      <description>${escapeXml(p.excerpt)}</description>
      <dc:creator>${escapeXml(p.author)}</dc:creator>${
        p.tags && p.tags.length > 0
          ? "\n      " + p.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join("\n      ")
          : ""
      }
    </item>`;
    })
    .join("\n");

  const lastBuildDate =
    summaries[0]?.date.toUTCString() ?? new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${channelUrl}</link>
    <description>${escapeXml(description)}</description>
    <language>${languageTag}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>
`;
}

/**
 * Escape XML 1.0 specjalne znaki: `&` `<` `>` `"` `'`.
 */
function escapeXml(s: string): string {
  return s
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}