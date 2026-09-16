/**
 * `/[locale]/privacy` — polityka prywatności (plan: brakujący link ze stopki).
 *
 * POWÓD ISTNIENIA:
 *   Stopka linkuje „Polityka prywatności" → `/privacy`, ale strona nigdy nie
 *   powstała. Link prowadził do 404 (widoczne w konsoli przeglądarki na każdej
 *   stronie). Ten plik to naprawia.
 *
 * Treść w i18n (`Privacy.*`), nie w kodzie — spójnie z resztą portalu
 * (zero hardcoded PL/EN).
 *
 * Struktura celowo prosta: statyczna treść, `revalidate` dzienny, SEO przez
 * `metadata` + canonical.
 */

import * as React from "react";
import type { Metadata } from "next";
import { Shield } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { routing, type Locale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export function generateStaticParams(): { locale: Locale }[] {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tibian.click";
  const path = locale === routing.defaultLocale ? "/privacy" : `/${locale}/privacy`;

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: `${siteUrl}${path}` },
  };
}

/** Sekcje polityki — klucz w i18n → treść. Kolejność ma znaczenie. */
const SECTIONS = [
  "scope",
  "data",
  "cookies",
  "legal",
  "sharing",
  "retention",
  "rights",
  "contact",
  "trademark",
] as const;

export default async function PrivacyPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Privacy");
  const tCommon = await getTranslations("Common");

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tCommon("appName"), href: "/" },
    { label: t("title"), href: "/privacy" },
  ];

  return (
    <div className="container max-w-3xl py-6 md:py-10">
      <Breadcrumbs items={breadcrumbItems} />

      <header className="mt-6 flex items-start gap-4">
        <span
          aria-hidden="true"
          className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent"
        >
          <Shield className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">{t("description")}</p>
          <p className="mt-1 text-xs text-text-muted">
            {t("lastUpdated")}: 2026-09-16
          </p>
        </div>
      </header>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section}>
            <h2 className="text-base font-semibold text-text-primary">
              {t(`sections.${section}.title`)}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              {t(`sections.${section}.body`)}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
