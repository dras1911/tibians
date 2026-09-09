import { ArrowRight, Star } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CalculatorLayout } from "@/components/calculators";
import { Link } from "@/i18n/routing";
import { routing, type Locale } from "@/i18n/routing";

import { TrueSkillForm, TrueSkillResult } from "./true-skill-calculator";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://tibians.tools";
const SLUG = "true-skill";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Calculators.trueSkill",
  });
  const title = t("title");
  const description = t("description");
  const localizedTitle = `${title} · Tibians`;
  const finalTitle = localizedTitle.length <= 60 ? localizedTitle : title;
  const finalDescription =
    description.length <= 155 ? description : `${description.slice(0, 152)}…`;
  const canonical = `${SITE_URL}/${locale}/calculators/${SLUG}`;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_URL}/${l}/calculators/${SLUG}`;
  }
  return {
    title: finalTitle,
    description: finalDescription,
    alternates: { canonical, languages },
    openGraph: {
      title: finalTitle,
      description: finalDescription,
      url: canonical,
      siteName: "Tibians",
      locale: locale === "pl" ? "pl_PL" : "en_US",
      type: "article",
      images: [
        {
          url: `${SITE_URL}/og/calculators-${SLUG}.png`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: finalTitle,
      description: finalDescription,
    },
  };
}

export default async function TrueSkillPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Calculators.trueSkill",
  });
  const title = t("title");
  const description = t("description");
  const infoBanner = (
    <InfoBanner
      title={t("infoTitle")}
      body={t("infoBody")}
      linkLabel={t("infoLinkLabel")}
    />
  );
  return (
    <CalculatorLayout
      title={title}
      description={description}
      slug={SLUG}
      form={<TrueSkillForm />}
      result={<TrueSkillResult />}
    >
      {infoBanner}
    </CalculatorLayout>
  );
}

function InfoBanner({
  title,
  body,
  linkLabel,
}: {
  title: string;
  body: string;
  linkLabel: string;
}) {
  return (
    <aside
      aria-labelledby="true-skill-info-heading"
      className="rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Star className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="true-skill-info-heading"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground sm:text-base"
          >
            {title}
            <span
              className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary"
              aria-hidden="true"
            >
              ★
            </span>
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {body}{" "}
            <Link
              href="/bazaar"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {linkLabel}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </p>
        </div>
      </div>
    </aside>
  );
}