import * as React from "react";
import { useTranslations } from "next-intl";
import { Shield } from "lucide-react";

import { Link } from "@/i18n/routing";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Footer — renders on EVERY route (architecture §4.2 + §18.3 acceptance
 * criteria).
 *
 * The CipSoft disclaimer is reproduced VERBATIM per architecture §18.3:
 *
 *   "Tibia is a registered trademark of CipSoft GmbH. Tibia and all
 *    products related to Tibia are copyright by CipSoft GmbH."
 *   + "Tibians nie jest powiązany z CipSoft GmbH." (until we obtain
 *     Supported / Promoted status from CipSoft's Fansite Programme)
 *
 * These two strings are the ONLY compliance mechanism — Tibians never
 * embeds the disclaimer anywhere else (so the audit trail is
 * unambiguous). The footer is therefore rendered in the locale layout
 * (NOT mounted per-page), guaranteeing presence on every route.
 */
export function Footer() {
  const t = useTranslations("Footer");
  const tNav = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-background">
      <div className="container py-10">
        <div className="grid gap-8 md:grid-cols-[1.5fr_1fr_1fr]">
          {/* Brand column */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground"
                aria-hidden="true"
              >
                <Shield className="h-4 w-4" />
              </span>
              <span className="text-base font-semibold tracking-tight">
                {tNav("brand")}
              </span>
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("tagline")}
            </p>
          </div>

          {/* Product nav */}
          <FooterColumn title={t("sections.product")}>
            <FooterLink href="/bazaar">{t("links.bazaar")}</FooterLink>
            <FooterLink href="/calculators">
              {t("links.calculators")}
            </FooterLink>
            <FooterLink href="/reference">{t("links.reference")}</FooterLink>
            <FooterLink href="/bosses">{t("links.bosses")}</FooterLink>
            <FooterLink href="/blog">{t("links.blog")}</FooterLink>
          </FooterColumn>

          {/* Legal */}
          <FooterColumn title={t("sections.legal")}>
            <FooterLink href="/privacy">{tCommon("privacyPolicy")}</FooterLink>
          </FooterColumn>
        </div>

        <Separator className="my-8" />

        {/* ★ CipSoft disclaimer — verbatim from architecture §18.3.
         *  Do NOT reword. Do NOT split across multiple lines with different
         *  capitalisation. TibiaData and ~25 official fansites use the same
         *  exact phrasing and CipSoft accepts it as Fansite Agreement
         *  compliance. Changing a single word would put us out of compliance
         *  until the next review cycle. */}
        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
          <p>{t("cipsoftDisclaimer")}</p>
          <p>{t("notAffiliated")}</p>
        </div>

        <p className="mt-6 text-[0.7rem] text-muted-foreground/70">
          {t("copyright", { year })}
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "inline-flex min-h-9 items-center rounded-sm text-sm text-foreground/80",
          "transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-md",
        )}
      >
        {children}
      </Link>
    </li>
  );
}