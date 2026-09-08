/**
 * Content — blog posts (arch §7.2).
 *
 * Prosta tabela CMS. tagi jako text[] zamiast osobnej tabeli relacji
 * (wystarczające dla skali bloga portalu).
 *
 * UNIQUE (slug, locale) → ten sam artykuł może mieć wersje PL i EN.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const blogPosts = pgTable(
  'blog_posts',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    locale: text('locale').notNull(), // 'pl' | 'en'
    title: text('title').notNull(),
    excerpt: text('excerpt'),
    bodyMdx: text('body_mdx').notNull(),
    thumbnail: text('thumbnail'),
    tags: text('tags')
      .array()
      .notNull()
      .default([]), // ['imbuement', 'tier-3', 'paladin']
    publishedAt: timestamp('published_at', { withTimezone: true }),
    isPublished: boolean('is_published').notNull().default(false),
  },
  (table) => [
    uniqueIndex('uq_blog_slug_locale').on(table.slug, table.locale),
    index('idx_blog_published')
      .on(table.publishedAt)
      .where(sql`is_published = true`),
    index('idx_blog_locale').on(table.locale),
  ],
);

export type BlogPost = typeof blogPosts.$inferSelect;
export type NewBlogPost = typeof blogPosts.$inferInsert;
