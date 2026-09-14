import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { TierComparison } from "@/components/premium/tier-comparison";

/**
 * /[locale]/premium (plan T86, arch §15.1) — strona sprzedażowa Premium.
 *
 * Transparentność: pokazujemy dokładnie co zyskuje użytkownik, bez dark
 * patterns (żadnych fałszywych countdownów). CTA → checkout MoR (T82).
 *
 * `NEXT_PUBLIC_PREMIUM_CHECKOUT_URL` ustawiany po konfiguracji Lemon Squeezy /
 * Paddle; gdy brak — przycisk jest nieaktywny z komunikatem "wkrótce".
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Premium" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      canonical: `/${locale}/premium`,
      languages: { pl: "/pl/premium", en: "/en/premium" },
    },
  };
}

export default async function PremiumPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Premium" });
  const checkoutUrl = process.env.NEXT_PUBLIC_PREMIUM_CHECKOUT_URL;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <Breadcrumbs
        items={[
          { label: t("breadcrumbHome"), href: "/" },
          { label: t("breadcrumbPremium"), href: "/premium" },
        ]}
      />

      <header className="space-y-3 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          {t("title")}
        </h1>
        <p className="mx-auto max-w-2xl text-text-secondary">
          {t("subtitle")}
        </p>
      </header>

      <TierComparison checkoutUrl={checkoutUrl} />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">
          {t("faqTitle")}
        </h2>
        <dl className="space-y-4">
          {(["q1", "q2", "q3", "q4"] as const).map((key) => (
            <div
              key={key}
              className="rounded-lg border border-border-subtle bg-surface p-4"
            >
              <dt className="font-medium text-text-primary">
                {t(`faq.${key}.q`)}
              </dt>
              <dd className="mt-1 text-sm text-text-secondary">
                {t(`faq.${key}.a`)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
