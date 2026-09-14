/**
 * `import.meta.glob` — type declaration for Next.js 15 + bundler glob.
 *
 * Używane przez `src/lib/blog/index.ts` do statycznego importu plików
 * MDX z `src/content/blog/**`.
 *
 * Next.js 15 + Turbopack/webpack obsługuje ten runtime — ale TypeScript
 * nie wie o nim bez deklaracji. Dodajemy minimalną sygnaturę.
 */
declare global {
  interface ImportMeta {
    /**
     * Statyczny glob bundler-resolved.
     *
     * @example
     *   const mods = import.meta.glob<{ default: ComponentType }>('./**\/*.mdx', { eager: true });
     */
    glob<T = unknown>(
      pattern: string,
      options?: { eager?: boolean; import?: string },
    ): Record<string, T>;
  }
}

export {};