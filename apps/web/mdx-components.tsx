/**
 * Custom MDX components — `@next/mdx` App Router integration (plan T62,
 * arch §9.2).
 *
 * Plik wymagany przez `@next/mdx` w App Router (mdx-components.js w root
 * projektu). Pozwala nadpisać renderowanie wbudowanych elementów HTML
 * (h1, h2, p, a, …) tak, aby pasowały do naszego design systemu (tokeny
 * Tailwind/OKLCH, `prose`-like typography).
 *
 * Zwraca `components` używane automatycznie przy renderowaniu MDX — nie
 * trzeba ich ręcznie przekazywać do `<MDXRemote>` czy `<MDXProvider>`.
 *
 * i18n:
 *   - Wszystkie teksty w postach są już w konkretnym locale (pl/en),
 *     więc wrappery nie potrzebują tłumaczeń — tylko klasy CSS.
 */

import type { MDXComponents } from "mdx/types";

/** Łącze wewnętrzne (next/link) — zachowuje prefiks locale. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { Link as I18nLink } from "@/i18n/routing";

const baseComponents: MDXComponents = {
  // ── Nagłówki ───────────────────────────────────────────────────────
  h1: ({ children, ...rest }) => (
    <h1
      className="mt-10 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
      {...rest}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...rest }) => (
    <h2
      className="mt-10 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      {...rest}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...rest }) => (
    <h3
      className="mt-8 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
      {...rest}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...rest }) => (
    <h4 className="mt-6 text-lg font-semibold tracking-tight text-foreground" {...rest}>
      {children}
    </h4>
  ),

  // ── Akapit + listy ────────────────────────────────────────────────
  p: ({ children, ...rest }) => (
    <p
      className="mt-5 text-base leading-7 text-foreground/90 first:mt-0"
      {...rest}
    >
      {children}
    </p>
  ),
  ul: ({ children, ...rest }) => (
    <ul
      className="mt-5 list-disc space-y-2 pl-6 text-base leading-7 text-foreground/90 marker:text-muted-foreground"
      {...rest}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...rest }) => (
    <ol
      className="mt-5 list-decimal space-y-2 pl-6 text-base leading-7 text-foreground/90 marker:text-muted-foreground"
      {...rest}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...rest }) => (
    <li className="leading-7" {...rest}>
      {children}
    </li>
  ),

  // ── Linki ─────────────────────────────────────────────────────────
  a: ({ children, href, ...rest }) => {
    const isExternal =
      typeof href === "string" && /^(https?:)?\/\//u.test(href);
    if (isExternal) {
      return (
        <a
          href={href}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          target="_blank"
          rel="noreferrer noopener"
          {...rest}
        >
          {children}
        </a>
      );
    }
    return (
      <I18nLink
        href={(href ?? "/") as Parameters<typeof I18nLink>[0]["href"]}
        className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {children}
      </I18nLink>
    );
  },

  // ── Cytaty + kod ──────────────────────────────────────────────────
  blockquote: ({ children, ...rest }) => (
    <blockquote
      className="mt-6 border-l-4 border-primary/40 bg-primary/5 px-4 py-3 text-base italic text-foreground/85"
      {...rest}
    >
      {children}
    </blockquote>
  ),
  code: ({ children, ...rest }) => (
    <code
      className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground"
      {...rest}
    >
      {children}
    </code>
  ),
  pre: ({ children, ...rest }) => (
    <pre
      className="mt-5 overflow-x-auto rounded-lg border border-border bg-muted p-4 font-mono text-sm leading-6 text-foreground"
      {...rest}
    >
      {children}
    </pre>
  ),

  // ── Linia horyzontalna + tabele (bonusy) ──────────────────────────
  hr: (props) => (
    <hr
      className="my-8 border-border"
      {...props}
    />
  ),
  table: ({ children, ...rest }) => (
    <div className="mt-5 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm" {...rest}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...rest }) => (
    <th
      className="border-b border-border bg-muted px-3 py-2 font-semibold text-foreground"
      {...rest}
    >
      {children}
    </th>
  ),
  td: ({ children, ...rest }) => (
    <td className="border-b border-border px-3 py-2 text-foreground/90" {...rest}>
      {children}
    </td>
  ),
};

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...baseComponents, ...components };
}