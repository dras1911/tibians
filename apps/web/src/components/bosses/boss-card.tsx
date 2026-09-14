/**
 * BossCard — karta pojedynczego bossa z `/v4/boostablebosses` (plan T60,
 * arch §18.1 + §6.4).
 *
 * Wyświetla:
 *   - Obrazek (TibiaData `image_url`)
 *   - Nazwę (EN — brak tłumaczeń PL w `/v4/boostablebosses`)
 *   - Badge "FEATURED" gdy `featured === true`
 *   - "Zobacz szczegóły" link → `/[locale]/bosses/[slug]`
 *
 * Wymogi:
 *   - Touch target przycisku ≥ 44×44 (arch §6.3) — `min-h-11`
 *   - Aspect-square kontener obrazka (zapobiega CLS)
 *   - `tabular-nums` dla ewentualnych metryk
 *
 * Renderowany **wyłącznie** jako Server Component — zero client JS.
 */
import * as React from "react";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/routing";

export interface BossCardProps {
  /** Nazwa bossa (z `name` w TibiaData). */
  name: string;
  /** URL obrazka (z `image_url` w TibiaData). */
  imageUrl: string | null;
  /** Czy boss jest featured na liście (z `featured === true`). */
  featured: boolean;
  /** Locale-relative href do detail page. */
  href: string;
  /** Etykieta CTA — i18n. */
  detailsLabel: string;
  /** Etykieta featured badge — i18n. */
  featuredLabel: string;
}

/**
 * Slug-ify nazwę bossa (lowercase, spacje → "-", trim). Zgodne z EN nazwą
 * z TibiaData — Tibia identyfikuje bossy po race stringu.
 */
export function bossSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function BossCard({
  name,
  imageUrl,
  featured,
  href,
  detailsLabel,
  featuredLabel,
}: BossCardProps) {
  return (
    <Link
      href={href as Parameters<typeof Link>[0]["href"]}
      className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`${name} — ${detailsLabel}`}
    >
      <article className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md group-focus-visible:border-primary/40">
        <div className="relative aspect-square w-full overflow-hidden bg-muted">
          {imageUrl !== null ? (
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center text-muted-foreground"
            >
              <Sparkles className="h-12 w-12" />
            </div>
          )}
          {featured ? (
            <div className="absolute left-2 top-2">
              <Badge variant="warning" className="gap-1">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {featuredLabel}
              </Badge>
            </div>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="text-base font-semibold leading-tight text-foreground">
            {name}
          </h3>
          <span className="mt-auto inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 group-hover:underline">
            {detailsLabel}
            <span className="ml-1 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
              →
            </span>
          </span>
        </div>
      </article>
    </Link>
  );
}