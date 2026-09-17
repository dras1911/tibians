"use client";

/**
 * AuctionDetailTabs — zakładki sekcji detalu aukcji (plan task 48,
 * arch §5 krok 7).
 *
 * Sekcje (arch §5 krok 7 — "Taby sekcji"):
 *   1. Skills — 8 skilli z tabelą base/loyalty + cross-linki (T49)
 *   2. Items — grid ikon przedmiotów z tier badge
 *   3. Outfits & Mounts — grid z addons
 *   4. Charms & Blessings — punkty + progress bar
 *   5. Gems — 3 statystyki (lesser/regular/greater)
 *
 * **Persistence w URL (arch §6.4 — "URL state"):** aktywna zakładka
 * mirrorowana w `?tab=<key>` przez `next/navigation`. Wejście na URL
 * z `?tab=skills` od razu otwiera tę zakładkę (deep-link).
 *
 * **Touch targets ≥ 44×44 (mobile, arch §6.3).**
 *
 * Polityka servera: ten komponent jest klientem (Tabs z Radix), ale
 * cały `auctionDetail` jest przekazywany z RSC jako prop. Zero fetch.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Gem, Package, Sparkles, Sword, ShieldCheck, Shirt } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import type {
  AuctionDetail,
  AuctionItemEntry,
  AuctionMountEntry,
  AuctionOutfitEntry,
  AuctionSkillLoyaltyEntry,
} from "@/lib/server/auction-detail";
import {
  buildBlessingsLink,
  buildCharacterValueLink,
  buildExerciseWeaponsLink,
  buildImbuementLink,
  buildSkillsCalculatorLink,
  buildTrueSkillLink,
  suggestNextSkillTarget,
} from "@/lib/bazaar/cross-link-helpers";

const TAB_KEYS = ["skills", "items", "outfitsMounts", "charmsBlessings", "gems"] as const;

type TabKey = (typeof TAB_KEYS)[number];

function isTabKey(value: string | null): value is TabKey {
  return value !== null && (TAB_KEYS as readonly string[]).includes(value);
}

const DEFAULT_TAB: TabKey = "skills";

// ───────────────────────────────────────────────────────────────────────
// SkillKey labels (mirror z packages/character-context/src/schema.ts)
// ───────────────────────────────────────────────────────────────────────

const SKILL_LABELS: Record<string, string> = {
  magic: "Magic",
  sword: "Sword",
  axe: "Axe",
  club: "Club",
  distance: "Distance",
  shielding: "Shielding",
  fist: "Fist",
  fishing: "Fishing",
};

const SKILL_KEYS_ORDER = [
  "magic",
  "sword",
  "axe",
  "club",
  "distance",
  "shielding",
  "fist",
  "fishing",
] as const;

// ───────────────────────────────────────────────────────────────────────
// Komponent
// ───────────────────────────────────────────────────────────────────────

export interface AuctionDetailTabsProps {
  detail: AuctionDetail;
  locale: string;
  auctionId: string;
  className?: string;
}

export function AuctionDetailTabs({
  detail,
  locale,
  auctionId,
  className,
}: AuctionDetailTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Tab state — mirrorowane do URL (?tab=skills) ──────────────────
  const initialTab = React.useMemo<TabKey>(() => {
    const fromUrl = searchParams.get("tab");
    return isTabKey(fromUrl) ? fromUrl : DEFAULT_TAB;
  }, [searchParams]);

  const [activeTab, setActiveTab] = React.useState<TabKey>(initialTab);

  // Sync z URL po nawigacji (back/forward).
  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabChange = React.useCallback(
    (next: string) => {
      if (!isTabKey(next)) return;
      setActiveTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_TAB) {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const qs = params.toString();
      router.replace(qs.length > 0 ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  const a = detail.auction;

  const linkCtx = {
    auctionId,
    locale,
    level: a.level,
    vocation: a.vocationBase,
  };

  return (
    <div className={className}>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto pb-1">
          <TabsList
            className={cn(
              "inline-flex h-auto w-max min-w-full justify-start gap-1 p-1",
              "sm:flex sm:w-full sm:flex-wrap",
            )}
          >
            {TAB_KEYS.map((key) => (
              <TabsTrigger key={key} value={key} className="h-11 px-3 text-sm font-medium">
                <BazaarTabIcon tab={key} className="mr-1.5 h-4 w-4" />
                <BazaarTabLabel tab={key} />
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── Skills ─────────────────────────────────────────────── */}
        <TabsContent value="skills" className="mt-6 focus-visible:outline-none">
          <SkillsTab
            detail={detail}
            linkCtx={linkCtx}
            auctionId={auctionId}
            characterName={a.name}
          />
        </TabsContent>

        {/* ── Items ──────────────────────────────────────────────── */}
        <TabsContent value="items" className="mt-6 focus-visible:outline-none">
          <ItemsTab detail={detail} linkCtx={linkCtx} />
        </TabsContent>

        {/* ── Outfits & Mounts ───────────────────────────────────── */}
        <TabsContent value="outfitsMounts" className="mt-6 focus-visible:outline-none">
          <OutfitsMountsTab detail={detail} />
        </TabsContent>

        {/* ── Charms & Blessings ─────────────────────────────────── */}
        <TabsContent value="charmsBlessings" className="mt-6 focus-visible:outline-none">
          <CharmsBlessingsTab linkCtx={linkCtx} detail={detail} />
        </TabsContent>

        {/* ── Gems ───────────────────────────────────────────────── */}
        <TabsContent value="gems" className="mt-6 focus-visible:outline-none">
          <GemsTab detail={detail} linkCtx={linkCtx} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Sub-komponenty — Tab icons + labels (i18n)
// ───────────────────────────────────────────────────────────────────────

function BazaarTabIcon({ tab, className }: { tab: TabKey; className?: string }) {
  switch (tab) {
    case "skills":
      return <Sword className={className} aria-hidden="true" />;
    case "items":
      return <Package className={className} aria-hidden="true" />;
    case "outfitsMounts":
      return <Shirt className={className} aria-hidden="true" />;
    case "charmsBlessings":
      return <ShieldCheck className={className} aria-hidden="true" />;
    case "gems":
      return <Gem className={className} aria-hidden="true" />;
  }
}

function BazaarTabLabel({ tab }: { tab: TabKey }) {
  const t = useTranslations("Bazaar.detail.tabs");
  return <span>{t(tab)}</span>;
}

// ───────────────────────────────────────────────────────────────────────
// Skills tab
// ───────────────────────────────────────────────────────────────────────

interface SkillsTabProps {
  detail: AuctionDetail;
  linkCtx: {
    auctionId: string;
    locale: string;
    level: number;
    vocation: string;
  };
  auctionId: string;
  characterName: string;
}

function SkillsTab({ detail, linkCtx, auctionId, characterName }: SkillsTabProps) {
  const t = useTranslations("Bazaar.detail.skillsTab");
  const tCross = useTranslations("Bazaar.crossLinks");
  const format = useFormatter();

  const a = detail.auction;
  const skillsByKey: Record<string, number> = {
    magic: a.skillMagic,
    sword: a.skillSword,
    axe: a.skillAxe,
    club: a.skillClub,
    distance: a.skillDistance,
    shielding: a.skillShielding,
    fist: a.skillFist,
    fishing: a.skillFishing,
  };

  const loyaltyByKey = new Map<string, AuctionSkillLoyaltyEntry>();
  for (const e of detail.skillLoyalty) {
    loyaltyByKey.set(e.skill, e);
  }

  // `noUncheckedIndexedAccess` sprawia, że `skillsByKey[k]` zwraca
  // `number | undefined` — defaults do 0 bo schema gwarantuje wartości.
  const highestKey = SKILL_KEYS_ORDER.reduce(
    (best, k) => ((skillsByKey[k] ?? 0) > (skillsByKey[best] ?? 0) ? k : best),
    "magic" as (typeof SKILL_KEYS_ORDER)[number],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sword className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("tableTitle")}
        </CardTitle>
        <CardDescription>
          {tCross("prefillNotice", {
            id: auctionId,
            name: characterName,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className={cn("grid gap-2", "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4")}>
          {SKILL_KEYS_ORDER.map((key) => {
            const value = skillsByKey[key];
            const loyalty = loyaltyByKey.get(key);
            const loyaltyPct = loyalty?.loyaltyPct ?? null;
            // Schema gwarantuje wartość; `?? 0` zaspokaja `noUncheckedIndexedAccess`.
            const target = suggestNextSkillTarget(value ?? 0);
            const isHighest = key === highestKey;
            return (
              <li
                key={key}
                className={cn(
                  "flex flex-col gap-2 rounded-md border bg-card px-3 py-2.5",
                  isHighest && "border-primary/40 bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {SKILL_LABELS[key]}
                    </p>
                    {loyaltyPct !== null && loyaltyPct > 0 ? (
                      <Badge variant="outline" className="mt-1 border-info/40 bg-info/10 text-info">
                        {t("loyaltyBadge", { pct: loyaltyPct })}
                      </Badge>
                    ) : (
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t("noLoyalty")}
                      </p>
                    )}
                  </div>
                  <span className="numeric font-mono text-base font-semibold tabular-nums text-foreground">
                    {format.number(value ?? 0, { useGrouping: true })}
                  </span>
                </div>
                {isHighest ? (
                  <Badge variant="success" className="w-fit text-[10px]">
                    {t("highest")}
                  </Badge>
                ) : null}
                <Link
                  href={buildExerciseWeaponsLink(linkCtx, {
                    skill: key as
                      | "magic"
                      | "sword"
                      | "axe"
                      | "club"
                      | "distance"
                      | "shielding"
                      | "fist"
                      | "fishing",
                    current: value ?? 0,
                    target,
                  })}
                  className="inline-flex h-11 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  <span className="truncate">
                    {t("openCalculator", {
                      skill: SKILL_LABELS[key],
                      target,
                    })}
                  </span>
                  <ArrowRight className="ml-auto h-3 w-3" aria-hidden="true" />
                </Link>
                {loyaltyPct !== null && loyaltyPct > 0 ? (
                  <Link
                    href={buildTrueSkillLink(linkCtx, {
                      skill: key as
                        | "magic"
                        | "sword"
                        | "axe"
                        | "club"
                        | "distance"
                        | "shielding"
                        | "fist"
                        | "fishing",
                      current: value ?? 0,
                      target,
                      loyaltyPct,
                    })}
                    className="inline-flex h-11 items-center gap-1.5 rounded-md border border-dashed bg-background px-2.5 text-xs font-medium text-info transition-colors hover:bg-info/10"
                  >
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    <span className="truncate">{t("openCalculatorTrueSkill")}</span>
                  </Link>
                ) : null}
                <Link
                  href={buildSkillsCalculatorLink(linkCtx, {
                    skill: key as
                      | "magic"
                      | "sword"
                      | "axe"
                      | "club"
                      | "distance"
                      | "shielding"
                      | "fist"
                      | "fishing",
                    current: value ?? 0,
                    target,
                  })}
                  className="inline-flex h-11 items-center gap-1.5 rounded-md border border-dashed bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                >
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  <span className="truncate">{t("openCalculatorSkillTraining")}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Items tab
// ───────────────────────────────────────────────────────────────────────

interface ItemsTabProps {
  detail: AuctionDetail;
  linkCtx: {
    auctionId: string;
    locale: string;
    level: number;
    vocation: string;
  };
}

function ItemsTab({ detail, linkCtx }: ItemsTabProps) {
  const t = useTranslations("Bazaar.detail.itemsTab");
  const format = useFormatter();

  if (detail.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>{t("empty")}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href={buildCharacterValueLink(linkCtx)}
            className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t("openCharacterValue")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>{t("totalLabel", { count: detail.items.length })}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul
          className={cn("grid gap-2", "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6")}
        >
          {detail.items.map((it: AuctionItemEntry) => (
            <li
              key={`${it.itemId}-${it.tier ?? 0}`}
              className="flex items-center gap-2 rounded-md border bg-card px-2 py-2"
            >
              <span
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/40 text-[10px] text-muted-foreground"
              >
                #{it.itemId}
              </span>
              <div className="min-w-0 flex-1">
                {it.tier !== null && it.tier > 0 ? (
                  <Badge variant="info" className="text-[10px]">
                    {t("tierLabel", { tier: it.tier })}
                  </Badge>
                ) : null}
                <p className="numeric mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                  ×{format.number(it.quantity, { useGrouping: true })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Outfits & Mounts tab
// ───────────────────────────────────────────────────────────────────────

function OutfitsMountsTab({ detail }: { detail: AuctionDetail }) {
  const t = useTranslations("Bazaar.detail.outfitsTab");
  const format = useFormatter();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shirt className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("outfitsHeading", { count: detail.outfits.length })}
          </CardTitle>
          <CardDescription>
            {t("storeCount", { count: detail.auction.storeOutfitsCount })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.outfits.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noOutfits")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {detail.outfits.map((o: AuctionOutfitEntry) => (
                <li
                  key={o.outfitId}
                  className="flex items-center gap-2 rounded-md border bg-card px-2 py-2"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/40 text-[10px] text-muted-foreground"
                  >
                    #{o.outfitId}
                  </span>
                  <span className="numeric text-xs tabular-nums text-muted-foreground">
                    {o.addons > 0
                      ? `${t("addons")} ${format.number(o.addons, { useGrouping: true })}`
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shirt className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("mountsHeading", { count: detail.mounts.length })}
          </CardTitle>
          <CardDescription>
            {t("mountsStoreCount", { count: detail.auction.storeMountsCount })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.mounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noMounts")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {detail.mounts.map((m: AuctionMountEntry) => (
                <li
                  key={m.mountId}
                  className="flex items-center gap-2 rounded-md border bg-card px-2 py-2"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/40 text-[10px] text-muted-foreground"
                  >
                    #{m.mountId}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Charms & Blessings tab
// ───────────────────────────────────────────────────────────────────────

function CharmsBlessingsTab({
  detail,
  linkCtx,
}: {
  detail: AuctionDetail;
  linkCtx: {
    auctionId: string;
    locale: string;
    level: number;
    vocation: string;
  };
}) {
  const t = useTranslations("Bazaar.detail.charmsTab");
  const format = useFormatter();
  const a = detail.auction;

  const charmPct =
    a.charmPoints > 0 ? Math.min(100, Math.round((a.charmPointsUnused / a.charmPoints) * 100)) : 0;
  const blessingsPct = Math.round((a.blessingsActive / 7) * 100);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Charm Points
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">{t("charmsPointsLabel")}</span>
            <span className="numeric font-mono text-2xl font-bold tabular-nums text-foreground">
              {format.number(a.charmPoints, { useGrouping: true })}
            </span>
          </div>
          <div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={charmPct}
              aria-label={`${t("charmsUnusedLabel")} (${charmPct}%)`}
            >
              <div className="h-full bg-primary transition-all" style={{ width: `${charmPct}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("charmsUnusedLabel")}:{" "}
              <span className="font-medium text-foreground">
                {format.number(a.charmPointsUnused, { useGrouping: true })}
              </span>{" "}
              ({charmPct}%)
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("charmsEchoesLabel")}:{" "}
            <span className="font-medium text-foreground">
              {format.number(a.minorCharmEchoes, { useGrouping: true })}
            </span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("blessingsLabel")}
          </CardTitle>
          <CardDescription>{t("blessingsHelp")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={7}
              aria-valuenow={a.blessingsActive}
              aria-label={`${t("blessingsLabel")} (${a.blessingsActive}/7)`}
            >
              <div
                className="h-full bg-info transition-all"
                style={{ width: `${blessingsPct}%` }}
              />
            </div>
            <p className="mt-2 text-sm font-medium text-foreground">{a.blessingsActive} / 7</p>
          </div>
          <Link
            href={buildBlessingsLink(linkCtx)}
            className="inline-flex h-11 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t("openBlessingsCalculator")}
            <ArrowRight className="ml-auto h-3 w-3" aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Gems tab
// ───────────────────────────────────────────────────────────────────────

function GemsTab({
  detail,
  linkCtx,
}: {
  detail: AuctionDetail;
  linkCtx: {
    auctionId: string;
    locale: string;
    level: number;
    vocation: string;
  };
}) {
  const t = useTranslations("Bazaar.detail.gemsTab");
  const format = useFormatter();
  const a = detail.auction;

  const gems = [
    { key: "lesser" as const, label: t("lesser"), count: a.gemsLesser },
    { key: "regular" as const, label: t("regular"), count: a.gemsRegular },
    { key: "greater" as const, label: t("greater"), count: a.gemsGreater },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gem className="h-4 w-4 text-primary" aria-hidden="true" />
          Gems
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {gems.map((g) => (
            <li
              key={g.key}
              className={cn(
                "flex flex-col items-start gap-1 rounded-md border bg-card p-4",
                g.key === "greater" && "border-primary/40 bg-primary/5",
                g.key === "regular" && "border-info/30 bg-info/5",
              )}
            >
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {g.label}
              </span>
              <span className="numeric font-mono text-3xl font-bold tabular-nums text-foreground">
                {format.number(g.count, { useGrouping: true })}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Link
            href={buildImbuementLink(linkCtx)}
            className="inline-flex h-11 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t("openImbuementCalc")}
            <ArrowRight className="ml-auto h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
