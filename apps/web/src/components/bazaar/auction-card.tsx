"use client";

/**
 * AuctionCard — karta pojedynczej aukcji Bazaar (plan T40, arch §5 krok 5).
 *
 * Widok preferowany na mobile (arch §5: "mobile: lista pełnoekranowa
 * + grid kart na desktop"). Na desktopie to widok domyślny jeśli
 * użytkownik nie wybrał tabeli (localStorage `tibians:bazaar:view`).
 *
 * Hierarchia informacji (arch §5 krok 5):
 *   1. Outfit GIF + nazwa postaci (sticky na mobile)
 *   2. Level + promoted vocation (badge)
 *   3. Świat + region + PvP type
 *   4. Aktualna oferta (Intl.NumberFormat)
 *   5. Countdown tykający co 1 s (local `setInterval`, zero requestów)
 *   6. Heurystyczne tagi (Soul War / Primal / 7/7 bliss / 23/23 imbues)
 *   7. Akcje (Szczegóły / Dodaj do porównania / Open on Tibia.com)
 *
 * Zasady UI (arch §6.4 + §6.5):
 *   - Wszystkie pola numeryczne z `tabular-nums` (klasa `.numeric`)
 *   - Countdown `< 5 min` → pulse na czerwono (`animate-pulse`)
 *   - Countdown `aria-live="off"` (nie czytać co sekundę — koszmar SR)
 *   - Touch targets ≥ 44×44 px
 *   - Sticky countdown na mobile (`sticky top-0`)
 */

import * as React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Check, CheckCircle2, ExternalLink, Gavel, Scale, Sparkles, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "@/i18n/routing";
import { outfitImageUrl, tibiaAuctionUrl } from "@/lib/tibia";
import { REGION_FLAG, REGION_FLAG_FALLBACK } from "@/lib/regions";
import { cn } from "@/lib/utils";

import type { AuctionSummary } from "./auction-summary";
import { BattlEyeBadge } from "./battleye-badge";
import { LivePriceFlash } from "./live-price-flash";

// ─────────────────────────────────────────────────────────────────────
// URL outfitu — helper z @/lib/tibia (jedno źródło dla całego bazaar UI).
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// Countdown — lokalny tykający komponent (arch §8.2: zero requestów)
// ─────────────────────────────────────────────────────────────────────

/**
 * Statyczny znacznik "zakończona" — zamiennik `<Countdown>` w trybie
 * readonly (T58, plan task 58 "AuctionCard w trybie readonly — bez
 * countdown"). Pokazuje datę zakończenia aukcji w locale format.
 *
 * - `aria-live="off"` — statyczny element, nie wymaga ogłoszenia.
 * - `tabular-nums` — spójność z resztą Bazaar UI (arch §6.2).
 */
function EndedBadge({ endedAt }: { endedAt: string }) {
  const t = useTranslations("Bazaar.card");
  const format = useFormatter();
  const date = React.useMemo(() => new Date(endedAt), [endedAt]);
  const formatted = React.useMemo(
    () =>
      format.dateTime(date, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [date, format],
  );
  return (
    <div
      className={cn(
        "numeric inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-sm font-semibold tabular-nums text-muted-foreground",
      )}
      aria-live="off"
      aria-label={`${t("ended")} — ${formatted}`}
      title={formatted}
    >
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{t("ended")}</span>
    </div>
  );
}

/**
 * Pozostaje czasu do `auctionEnd` (ISO string).
 *  - `aria-live="off"` (arch §6.4 pkt 10)
 *  - `tabular-nums` (no jitter)
 *  - `< 5 min` → `animate-pulse` + danger color
 *  - `< 5 min` → ikona 🔥 (T47)
 *  - `< 0` → "Zakończona" / "Ended"
 *  - `prefers-reduced-motion: reduce` → wyłącz pulsowanie (arch §6.5)
 */
function Countdown({ endsAt }: { endsAt: string }) {
  const t = useTranslations("Bazaar.card");

  // `prefers-reduced-motion` (arch §6.5) — wyłączamy pulsowanie.
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mql.matches);
    const onChange = () => setPrefersReducedMotion(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const endMs = React.useMemo(() => Date.parse(endsAt), [endsAt]);

  const computeRemaining = React.useCallback((now: number) => Math.max(0, endMs - now), [endMs]);

  const [remainingMs, setRemainingMs] = React.useState<number>(() => computeRemaining(Date.now()));

  React.useEffect(() => {
    setRemainingMs(computeRemaining(Date.now()));
    const interval = setInterval(() => {
      setRemainingMs(computeRemaining(Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [computeRemaining]);

  const isEnded = remainingMs <= 0;
  const isUrgent = !isEnded && remainingMs < 5 * 60 * 1000;
  const animatePulse = isUrgent && !prefersReducedMotion;

  // Formatuj "Xh Ym" / "Xm Ys" / "Ys" — locale-agnostic, locale czasu
  // nie ma znaczenia przy różnicy.
  const parts = React.useMemo(() => {
    const totalSec = Math.floor(remainingMs / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return { days, hours, minutes, seconds };
  }, [remainingMs]);

  const formatted = (() => {
    if (isEnded) return t("ended");
    if (parts.days > 0) {
      return `${parts.days}d ${parts.hours}h ${String(parts.minutes).padStart(2, "0")}m`;
    }
    if (parts.hours > 0) {
      return `${parts.hours}h ${String(parts.minutes).padStart(2, "0")}m ${String(parts.seconds).padStart(2, "0")}s`;
    }
    return `${parts.minutes}m ${String(parts.seconds).padStart(2, "0")}s`;
  })();

  return (
    <div
      className={cn(
        "numeric inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-semibold tabular-nums",
        isEnded
          ? "border-border bg-muted text-muted-foreground"
          : isUrgent
            ? cn("border-danger/40 bg-danger/10 text-danger", animatePulse && "animate-pulse")
            : "border-warning/40 bg-warning/10 text-warning-foreground",
      )}
      aria-live="off"
      aria-label={`${t("endingIn")} ${formatted}`}
      title={formatted}
    >
      {isUrgent ? (
        <span aria-hidden="true" className="text-base leading-none">
          🔥
        </span>
      ) : (
        <Timer className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>{formatted}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// AddedAgo — znacznik „dodano X temu" (dla sekcji „Ostatnio dodane").
// Countdown do końca nie ma tam sensu — liczy się świeżość dodania.
// ─────────────────────────────────────────────────────────────────────

function AddedAgo({ addedAt }: { addedAt: string }) {
  const t = useTranslations("Bazaar.card");
  const [now, setNow] = React.useState<number>(() => Date.now());

  React.useEffect(() => {
    // Odświeżanie co minutę wystarcza (i tak pokazujemy minuty/godziny).
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const addedMs = React.useMemo(() => Date.parse(addedAt), [addedAt]);
  const minutes = Math.max(0, Math.floor((now - addedMs) / 60_000));

  const label =
    minutes < 60
      ? t("addedAgoMinutes", { count: minutes })
      : minutes < 24 * 60
        ? t("addedAgoHours", { count: Math.floor(minutes / 60) })
        : t("addedAgoDays", { count: Math.floor(minutes / (24 * 60)) });

  return (
    <div
      className="numeric inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 py-1 text-sm font-medium text-success"
      aria-label={label}
      title={label}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Heurystyczne tagi (arch §5 krok 5: "Dużo charmów, Soul War, ...")
// ─────────────────────────────────────────────────────────────────────

interface HeuristicTag {
  key:
    | "soulWar"
    | "primalOrdeal"
    | "bliss77"
    | "imbueFull"
    | "worldTransfer"
    | "charmExpansion"
    | "preySlot";
  condition: boolean;
}

function deriveHeuristicTags(a: AuctionSummary): HeuristicTag[] {
  return [
    { key: "soulWar", condition: a.hasSoulWar },
    { key: "primalOrdeal", condition: a.hasPrimalOrdeal },
    { key: "bliss77", condition: a.blessingsActive >= 7 },
    {
      key: "imbueFull",
      condition: a.imbuementsTotal > 0 && a.imbuementsUnlocked >= a.imbuementsTotal,
    },
    { key: "worldTransfer", condition: a.hasWorldTransfer },
    { key: "charmExpansion", condition: a.hasCharmExpansion },
    { key: "preySlot", condition: a.hasPreySlot },
  ];
}

// ─────────────────────────────────────────────────────────────────────
// Vocation token barwy (arch §6.1 — 5 klas, rozróżnialne dla daltonistów)
// ─────────────────────────────────────────────────────────────────────

const VOCATION_TONE: Record<string, string> = {
  Knight: "bg-voc-knight/15 text-voc-knight border-voc-knight/40",
  Paladin: "bg-voc-paladin/15 text-voc-paladin border-voc-paladin/40",
  Druid: "bg-voc-druid/15 text-voc-druid border-voc-druid/40",
  Sorcerer: "bg-voc-sorcerer/15 text-voc-sorcerer border-voc-sorcerer/40",
  Monk: "bg-voc-monk/15 text-voc-monk border-voc-monk/40",
};

const REGION_TONE: Record<AuctionSummary["worldRegion"], string> = {
  EU: "bg-region-eu/15 text-region-eu border-region-eu/40",
  NA: "bg-region-na/15 text-region-na border-region-na/40",
  BR: "bg-region-br/15 text-region-br border-region-br/40",
  OCE: "bg-region-oce/15 text-region-oce border-region-oce/40",
};

// ─────────────────────────────────────────────────────────────────────
// AuctionCard
// ─────────────────────────────────────────────────────────────────────

export interface AuctionCardProps {
  auction: AuctionSummary;
  /**
   * Tryb wyświetlania:
   *   - `"active"` (default) — z live countdownem, porównaniem,
   *     aktualną ofertą. Używane na `/bazaar` (T40).
   *   - `"history"` — readonly (plan task 58): brak countdownu,
   *     brak porównania, pokazuje `finalPrice` zamiast `bid`,
   *     statyczny znacznik "Zakończona" z datą zakończenia.
   */
  mode?: "active" | "history";
  /**
   * Znacznik czasu w prawym górnym rogu karty:
   *   - `"countdown"` (default) — odliczanie do końca aukcji.
   *   - `"added"` — „dodano X temu" (sekcja „Ostatnio dodane"; wymaga
   *     `auction.firstSeenAt` — bez niego spada z powrotem na countdown).
   */
  timeDisplay?: "countdown" | "added";
  /** Wywoływane przez parent przy zaznaczeniu do porównania (T40). */
  onCompareToggle?: (id: string, selected: boolean) => void;
  /** Czy aktualnie zaznaczona (kontrolowany checkbox). */
  isCompared?: boolean;
  /**
   * T56 — czy animować flash przy zmianie `bid` (plan task 56 "LivePriceFlash").
   * Domyślnie `true` (czyli karta reaguje na live update z SSE / polling).
   * Wyłącz `false` na listach statycznych (np. detail "Podobne aukcje",
   * porównanie), gdzie bid się nie zmienia.
   */
  showLiveFlash?: boolean;
  className?: string;
}

export function AuctionCard({
  auction,
  mode = "active",
  timeDisplay = "countdown",
  onCompareToggle,
  isCompared = false,
  showLiveFlash = true,
  className,
}: AuctionCardProps) {
  const t = useTranslations("Bazaar.card");
  const tFilters = useTranslations("Bazaar.filters");
  const format = useFormatter();

  // Heurystyczne tagi (cache'owane per-render, czysta funkcja).
  const tags = React.useMemo(() => deriveHeuristicTags(auction), [auction]);
  const activeTags = tags.filter((tag) => tag.condition);

  const vocationTone = VOCATION_TONE[auction.vocation] ?? VOCATION_TONE.Knight;
  const regionTone = REGION_TONE[auction.worldRegion];

  // Outfit GIF (lazy load — może być ciężki).
  const outfitUrl = outfitImageUrl(auction.outfitId);

  // Bid format z `Intl.NumberFormat` (arch §6.2 — locale-aware).
  // W trybie history pokazujemy `finalPrice` zamiast `bid` (T58,
  // plan task 58 — readonly: "z `finalPrice` zamiast `bid`").
  const isHistory = mode === "history";
  const displayPrice = isHistory ? (auction.finalPrice ?? auction.bid) : auction.bid;
  const bidLabel = isHistory
    ? t("finalPrice")
    : auction.bidType === "current"
      ? t("currentBid")
      : t("minimumBid");
  const formattedBid = format.number(displayPrice, { useGrouping: true });

  // Heuristic toggle handler (przekazywany z parenta).
  const handleCompareChange = React.useCallback(
    (next: boolean) => {
      onCompareToggle?.(auction.id, next);
    },
    [auction.id, onCompareToggle],
  );

  return (
    <Card
      className={cn(
        "relative flex flex-col gap-0 overflow-hidden border-border/60 p-0",
        "transition-colors hover:border-border",
        className,
      )}
    >
      {/* ── Sticky header: outfit + name + countdown (mobile) ─────────── */}
      <div
        className={cn(
          "flex items-start gap-3 border-b bg-muted/30 p-4",
          "sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/60",
          "sm:static sm:bg-transparent sm:backdrop-blur-none",
        )}
      >
        {outfitUrl ? (
          <img
            src={outfitUrl}
            alt={t("outfitAlt", { name: auction.name })}
            width={48}
            height={48}
            loading="lazy"
            className="h-12 w-12 shrink-0 rounded-md border bg-background object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed bg-background text-xs text-muted-foreground"
          >
            {t("noImage")}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold leading-tight text-foreground">
            <Link
              href={`/bazaar/${auction.id}`}
              className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {auction.name}
            </Link>
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn("border font-medium", vocationTone)}>
              {auction.vocationPromoted}
            </Badge>
            <Badge variant="outline" className="font-mono tabular-nums">
              <span className="font-semibold">{auction.level}</span>
            </Badge>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {isHistory ? (
            <EndedBadge endedAt={auction.auctionEnd} />
          ) : timeDisplay === "added" && auction.firstSeenAt ? (
            <AddedAgo addedAt={auction.firstSeenAt} />
          ) : (
            <Countdown endsAt={auction.auctionEnd} />
          )}
        </div>
      </div>

      <CardContent className="space-y-3 p-4">
        {/* ── World + region + PvP ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Badge
            variant="outline"
            className={cn("border", regionTone)}
            title={auction.worldRegion ? tFilters(`regions.${auction.worldRegion}`) : undefined}
          >
            <span aria-hidden="true" className="mr-1">
              {REGION_FLAG[auction.worldRegion] ?? REGION_FLAG_FALLBACK}
            </span>
            {auction.world}
            <span className="ml-1 font-mono text-[0.65rem] opacity-70">{auction.worldRegion}</span>
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {auction.worldPvpType}
          </Badge>
          <BattlEyeBadge value={auction.worldBattleye} />
        </div>

        {/* ── Skills grid (arch §5 krok 5: 8 skilli) ──────────────── */}
        <div className="grid grid-cols-8 gap-1 text-center text-[0.7rem]">
          {(
            [
              ["magic", auction.skillMagic],
              ["club", auction.skillClub],
              ["fist", auction.skillFist],
              ["sword", auction.skillSword],
              ["axe", auction.skillAxe],
              ["distance", auction.skillDistance],
              ["shielding", auction.skillShielding],
              ["fishing", auction.skillFishing],
            ] as const
          ).map(([key, value]) => (
            <div
              key={key}
              className="numeric rounded-sm border bg-background/60 px-1 py-1 font-mono tabular-nums"
              data-skill={key}
            >
              <div className="text-[0.6rem] uppercase leading-none text-muted-foreground">
                {key.slice(0, 3)}
              </div>
              <div className="mt-0.5 font-semibold leading-none">{value}</div>
            </div>
          ))}
        </div>

        {/* ── Progression mini-line ────────────────────────────────── */}
        <dl className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div className="numeric tabular-nums">
            <dt className="sr-only">Imbuements</dt>
            <dd>
              <span className="font-semibold text-foreground">
                {auction.imbuementsUnlocked}/{auction.imbuementsTotal}
              </span>{" "}
              imbues
            </dd>
          </div>
          <div className="numeric tabular-nums">
            <dt className="sr-only">Charms</dt>
            <dd>
              <span className="font-semibold text-foreground">
                {format.number(auction.charmPoints, { useGrouping: true })}
              </span>{" "}
              charms
            </dd>
          </div>
          <div className="numeric tabular-nums">
            <dt className="sr-only">Quests</dt>
            <dd>
              <span className="font-semibold text-foreground">
                {auction.questsCompleted}/{auction.questsTotal}
              </span>{" "}
              quests
            </dd>
          </div>
        </dl>

        {/* ── Heurystyczne tagi ────────────────────────────────────── */}
        {activeTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {activeTags.map((tag) => (
              <Badge key={tag.key} variant="info" className="text-[0.65rem]">
                {t(`tags.${tag.key}`)}
              </Badge>
            ))}
          </div>
        ) : null}

        {/* ── Bid + estimated value ────────────────────────────────── */}
        <div className="flex items-end justify-between gap-3 border-t pt-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{bidLabel}</p>
            <p className="numeric mt-0.5 font-mono text-2xl font-bold tabular-nums text-foreground">
              {/* T56 — LivePriceFlash: highlight bid przy zmianie (SSE/polling).
                  Wyłączony w trybie "history" (finalPrice się nie zmienia).
                  `displayPrice` jako klucz animacji — gdy SSE zwróci nowy bid,
                  komponent wewnętrznie remountuje i animuje flash. */}
              {isHistory || !showLiveFlash ? (
                <>{formattedBid} </>
              ) : (
                <LivePriceFlash value={displayPrice} className="font-mono text-2xl font-bold">
                  {formattedBid}
                </LivePriceFlash>
              )}
              <span className="text-xs font-medium text-muted-foreground">TC</span>
            </p>
          </div>
          {auction.estimatedValue !== null ? (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("estimatedValue")}
              </p>
              <p
                className={cn(
                  "numeric mt-0.5 font-mono text-base font-semibold tabular-nums",
                  auction.estimatedValue > auction.bid ? "text-danger" : "text-success",
                )}
              >
                {format.number(auction.estimatedValue, { useGrouping: true })}{" "}
                <span className="text-xs font-medium text-muted-foreground">TC</span>
              </p>
            </div>
          ) : null}
        </div>

        {/* ── Akcje (44×44 touch targets) ─────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button asChild size="sm" className="flex-1 sm:flex-none">
            <Link href={`/bazaar/${auction.id}`}>
              <Gavel className="h-4 w-4" aria-hidden="true" />
              {t("details")}
            </Link>
          </Button>

          {/* History: pomijamy Compare + OpenExternal (archiwum nie
              jest aktywne na Bazaar — arch §5 + T58 "readonly"). */}
          {isHistory ? null : (
            <>
              <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
                <a href={tibiaAuctionUrl(auction.id)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {t("openExternal")}
                </a>
              </Button>

              <label
                className={cn(
                  "ml-auto inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium",
                  "transition-colors hover:bg-accent hover:text-accent-foreground",
                  "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                  isCompared
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input bg-background text-foreground",
                )}
              >
                <Checkbox
                  checked={isCompared}
                  onCheckedChange={(value) => handleCompareChange(value === true)}
                  aria-label={isCompared ? t("unselectCompare") : t("compare")}
                  className="h-4 w-4"
                />
                <Scale className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {isCompared ? t("unselectCompare") : t("compare")}
                </span>
                {isCompared ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : null}
              </label>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
