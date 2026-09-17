"use client";

/**
 * AuctionHero — górny sticky panel detalu aukcji (plan task 48,
 * arch §5 krok 7).
 *
 * Wyświetla:
 *   - Outfit GIF + name + level/vocation/world/PvP/BattlEye
 *   - Bid + currency (TC)
 *   - Countdown (AuctionCountdownCell z T40/T47)
 *   - Główne CTA: "🎯 Licytuj na Tibia.com" (external, noopener)
 *   - Drugorzędne CTA: "🔬 Analizuj w Workspace" (T50)
 *   - Badge "Aukcja kończy się wkrótce!" gdy <5 min
 *   - Reminder CTA (placeholder Faza 13 Discord OAuth)
 *
 * Wymogi:
 *   - Touch targets ≥ 44×44 (mobile, arch §6.3)
 *   - Sticky top-0 na mobile (żeby countdown był widoczny przy scrollu)
 *   - `tabular-nums` na wszystkich liczbach
 *   - a11y: external link ma `aria-label` (kontekst "nowa karta")
 */

import * as React from "react";
import { ExternalLink, Globe, Microscope, Bell, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuctionCountdownCell } from "@/components/bazaar/auction-countdown-cell";
import { Link } from "@/i18n/routing";
import { outfitImageUrl, tibiaAuctionUrl } from "@/lib/tibia";
import { cn } from "@/lib/utils";

import type { AuctionDetail } from "@/lib/server/auction-detail";
import { buildWorkspaceLink } from "@/lib/bazaar/cross-link-helpers";

const VOCATION_TONE: Record<string, string> = {
  Knight: "bg-voc-knight/15 text-voc-knight border-voc-knight/40",
  Paladin: "bg-voc-paladin/15 text-voc-paladin border-voc-paladin/40",
  Druid: "bg-voc-druid/15 text-voc-druid border-voc-druid/40",
  Sorcerer: "bg-voc-sorcerer/15 text-voc-sorcerer border-voc-sorcerer/40",
  Monk: "bg-voc-monk/15 text-voc-monk border-voc-monk/40",
};

const REGION_FLAG: Record<string, string> = {
  EU: "🇪🇺",
  NA: "🇺🇸",
  BR: "🇧🇷",
  OCE: "🇦🇺",
};

const BATTLEYE_TONE: Record<string, string> = {
  protected: "bg-success/15 text-success border-success/40",
  "initially protected": "bg-warning/15 text-warning border-warning/40",
  "not protected": "bg-danger/15 text-danger border-danger/40",
};

export interface AuctionHeroProps {
  detail: AuctionDetail;
  locale: string;
  className?: string;
}

export function AuctionHero({ detail, locale, className }: AuctionHeroProps) {
  const t = useTranslations("Bazaar.detail.hero");
  const tCommon = useTranslations("Common");
  const format = useFormatter();

  const a = detail.auction;
  const outfitSrc = outfitImageUrl(a.outfitId);
  const auctionUrl = tibiaAuctionUrl(a.id);
  const workspaceHref = buildWorkspaceLink(a.id, locale);

  const statusKey = (() => {
    switch (a.status) {
      case "sold":
        return "statusSold";
      case "finished":
        return "statusFinished";
      case "cancelled":
        return "statusCancelled";
      case "active":
      default:
        return "statusActive";
    }
  })();

  const bidLabel = a.bidType === "minimum" ? t("minimumBid") : t("currentBid");

  const battleyeClass = BATTLEYE_TONE[a.worldBattleye] ?? "";

  return (
    <header
      className={cn(
        "sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "sm:-mx-6 sm:px-6",
        "md:static md:mx-0 md:px-0 md:py-0 md:bg-transparent md:backdrop-blur-none",
        className,
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
        {/* ── Outfit + identity ──────────────────────────────── */}
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {outfitSrc !== null ? (
            <div
              className="h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted sm:h-20 sm:w-20"
              aria-hidden="true"
            >
              <img
                src={outfitSrc}
                alt={t("outfitAlt", { name: a.name })}
                width={96}
                height={96}
                className="h-full w-full object-cover"
                loading="eager"
              />
            </div>
          ) : (
            <div
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground sm:h-20 sm:w-20"
            >
              <Sparkles className="h-6 w-6" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {a.name}
              </h1>
              <Badge
                variant="outline"
                className={cn("border font-semibold", VOCATION_TONE[a.vocationBase] ?? "")}
              >
                {a.vocationPromoted}
              </Badge>
              <Badge variant="secondary" className="text-[10px] uppercase">
                {t(statusKey)}
              </Badge>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm">
              <span className="inline-flex items-center gap-1">
                <span className="font-semibold text-foreground">
                  {t("levelLabel")} {format.number(a.level, { useGrouping: true })}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                {REGION_FLAG[a.worldRegion] ?? "🌍"} {a.world}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                {t("pvpLabel")}:{" "}
                <span className="font-medium text-foreground">{a.worldPvpType}</span>
              </span>
              <span aria-hidden="true">·</span>
              <Badge
                variant="outline"
                className={cn("px-1.5 py-0 text-[10px]", battleyeClass)}
                aria-label={`${t("battleyeLabel")} ${a.worldBattleye}`}
              >
                {a.worldBattleye === "protected"
                  ? t("battleyeProtected")
                  : a.worldBattleye === "initially protected"
                    ? t("battleyeInitial")
                    : t("battleyeNone")}
              </Badge>
            </div>
          </div>
        </div>

        {/* ── Bid + countdown ────────────────────────────────── */}
        <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{bidLabel}</p>
            <p className="numeric font-mono text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
              {format.number(a.bid, { useGrouping: true })}{" "}
              <span className="text-sm font-medium text-muted-foreground">{t("bidCurrency")}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("endingIn")}
            </span>
            <AuctionCountdownCell endsAt={a.auctionEnd} className="text-sm" />
          </div>
        </div>
      </div>

      {/* ── Ending soon badge + CTAs ──────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild size="lg" className="gap-1.5 font-semibold">
          <a
            href={auctionUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${t("openExternal")} — ${a.name} (${tCommon("appName")} → Tibia.com)`}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("openExternal")}
          </a>
        </Button>

        <Button asChild size="lg" variant="secondary" className="gap-1.5">
          <Link href={workspaceHref}>
            <Microscope className="h-4 w-4" aria-hidden="true" />
            {t("analyzeInWorkspace")}
          </Link>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          disabled
          title={t("reminderHint")}
        >
          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          {t("reminderCta")}
        </Button>
      </div>
    </header>
  );
}
