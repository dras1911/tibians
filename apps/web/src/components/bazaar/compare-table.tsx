/**
 * CompareTable — tabela side-by-side dwóch aukcji (plan T51, arch
 * §5 krok 6).
 *
 * Hierarchia informacji (arch §5 krok 6):
 *   - Sticky header z imionami + outfit GIFs (widoczne przy scrollu)
 *   - Wiersze: Name, Level, Vocation, World, PvP, Bid, Estimated Value,
 *     Price/Level, 8 skilli, Charm Points, Boss Points, Quests (X/Y),
 *     Imbuements (X/Y), Achievements, Animus, Gold, Gems, Store
 *     Outfits/Mounts/Items, Hirelings
 *   - Kolumna "Przewaga": arrows ← / → / = per row (wyższy lepszy dla
 *     większości; niższy dla Price/Level = lepszy)
 *   - Highlight różnic >10%: rows z dużą deltą mają `bg-warning/5`
 *     tła — zwraca uwagę na najważniejsze różnice
 *
 * Mobile fallback: tabela przełącza się w stacked cards przy <md
 * (każda aukcja jako osobna kolumna-karta z labelami).
 *
 * Polityka server/client: ten komponent jest Server Component —
 * porównywane dane są statyczne (arch §5 krok 6). Zmiana wyboru
 * wymaga nawigacji po stronie klienta (ComparePicker wypycha URL).
 *
 * MUST DO (plan T51):
 *   - Sticky header
 *   - Kolumna "Przewaga" z ← / → / = per wiersz
 *   - Highlight >10% różnic
 *   - Responsywność: overflow-x na mobile + stacked cards fallback
 */

import * as React from "react";
import { ArrowLeft, ArrowRight, Equal } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

import type { AuctionSummary } from "./auction-summary";

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

type Side = "left" | "right" | "tie";

/**
 * Kształt formattera z `getFormatter()` (next-intl/server) — tylko
 * metoda `number` jest nam potrzebna w wierszach. Eksportujemy typ
 * minimalny dla testów typów w RowDescriptor.
 */
type RowFormatter = (value: number, opts?: { useGrouping?: boolean }) => string;

interface RowDescriptor {
  /** i18n key w `Bazaar.compare.rows.<key>`. */
  labelKey:
    | "name"
    | "level"
    | "vocation"
    | "world"
    | "region"
    | "pvp"
    | "bid"
    | "estimatedValue"
    | "pricePerLevel"
    | "skillMagic"
    | "skillClub"
    | "skillFist"
    | "skillSword"
    | "skillAxe"
    | "skillDistance"
    | "skillShielding"
    | "skillFishing"
    | "charmPoints"
    | "bossPoints"
    | "quests"
    | "imbuements"
    | "achievementPoints"
    | "animusMasteries"
    | "goldTotal"
    | "gems"
    | "storeOutfits"
    | "storeMounts"
    | "storeItems"
    | "hirelings";
  /**
   * "higher" → wyższa wartość wygrywa (skills, value).
   * "lower"  → niższa wygrywa (Price/Level — lepsza oferta).
   */
  direction: "higher" | "lower";
  /** Wyciągnij liczbę do porównania. */
  extract: (a: AuctionSummary) => number | null;
  /** Sformatuj wartość do wyświetlenia. */
  format: (a: AuctionSummary, fmt: RowFormatter) => string;
}

// ───────────────────────────────────────────────────────────────────────
// Row definitions — wszystkie wiersze z brief (T51)
// ───────────────────────────────────────────────────────────────────────

const ROWS: RowDescriptor[] = [
  {
    labelKey: "level",
    direction: "higher",
    extract: (a) => a.level,
    format: (a) => String(a.level),
  },
  {
    labelKey: "vocation",
    direction: "higher",
    extract: () => null,
    format: (a) => a.vocationPromoted,
  },
  {
    labelKey: "world",
    direction: "higher",
    extract: () => null,
    format: (a) => a.world,
  },
  {
    labelKey: "region",
    direction: "higher",
    extract: () => null,
    format: (a) => a.worldRegion,
  },
  {
    labelKey: "pvp",
    direction: "higher",
    extract: () => null,
    format: (a) => a.worldPvpType,
  },
  {
    labelKey: "bid",
    direction: "lower",
    extract: (a) => a.bid,
    format: (a, fmt) => `${fmt(a.bid, { useGrouping: true })} TC`,
  },
  {
    labelKey: "estimatedValue",
    direction: "higher",
    extract: (a) => a.estimatedValue,
    format: (a, fmt) =>
      a.estimatedValue !== null
        ? `~${fmt(a.estimatedValue, { useGrouping: true })} TC`
        : "—",
  },
  {
    labelKey: "pricePerLevel",
    direction: "lower",
    extract: (a) => a.pricePerLevel,
    format: (a, fmt) =>
      a.pricePerLevel !== null
        ? `${fmt(a.pricePerLevel, { useGrouping: true })} TC/lvl`
        : "—",
  },
  {
    labelKey: "skillMagic",
    direction: "higher",
    extract: (a) => a.skillMagic,
    format: (a) => String(a.skillMagic),
  },
  {
    labelKey: "skillClub",
    direction: "higher",
    extract: (a) => a.skillClub,
    format: (a) => String(a.skillClub),
  },
  {
    labelKey: "skillFist",
    direction: "higher",
    extract: (a) => a.skillFist,
    format: (a) => String(a.skillFist),
  },
  {
    labelKey: "skillSword",
    direction: "higher",
    extract: (a) => a.skillSword,
    format: (a) => String(a.skillSword),
  },
  {
    labelKey: "skillAxe",
    direction: "higher",
    extract: (a) => a.skillAxe,
    format: (a) => String(a.skillAxe),
  },
  {
    labelKey: "skillDistance",
    direction: "higher",
    extract: (a) => a.skillDistance,
    format: (a) => String(a.skillDistance),
  },
  {
    labelKey: "skillShielding",
    direction: "higher",
    extract: (a) => a.skillShielding,
    format: (a) => String(a.skillShielding),
  },
  {
    labelKey: "skillFishing",
    direction: "higher",
    extract: (a) => a.skillFishing,
    format: (a) => String(a.skillFishing),
  },
  {
    labelKey: "charmPoints",
    direction: "higher",
    extract: (a) => a.charmPoints,
    format: (a, fmt) => fmt(a.charmPoints, { useGrouping: true }),
  },
  {
    labelKey: "bossPoints",
    direction: "higher",
    extract: (a) => a.bossPoints,
    format: (a, fmt) => fmt(a.bossPoints, { useGrouping: true }),
  },
  {
    labelKey: "quests",
    direction: "higher",
    extract: (a) => a.questsCompleted,
    format: (a) => `${a.questsCompleted}/${a.questsTotal}`,
  },
  {
    labelKey: "imbuements",
    direction: "higher",
    extract: (a) => a.imbuementsUnlocked,
    format: (a) => `${a.imbuementsUnlocked}/${a.imbuementsTotal}`,
  },
  {
    labelKey: "achievementPoints",
    direction: "higher",
    extract: (a) => a.achievementPoints,
    format: (a, fmt) => fmt(a.achievementPoints, { useGrouping: true }),
  },
  {
    labelKey: "animusMasteries",
    direction: "higher",
    extract: (a) => a.animusMasteries,
    format: (a) => String(a.animusMasteries),
  },
  // Poniższe pola są na AuctionDetail, ale w AuctionSummary nie ma ich —
  // pokazujemy "—" z `format` (extract zwraca null → traktujemy jako 0).
  {
    labelKey: "goldTotal",
    direction: "higher",
    extract: () => null,
    format: () => "—",
  },
  {
    labelKey: "gems",
    direction: "higher",
    extract: () => null,
    format: () => "—",
  },
  {
    labelKey: "storeOutfits",
    direction: "higher",
    extract: () => null,
    format: () => "—",
  },
  {
    labelKey: "storeMounts",
    direction: "higher",
    extract: () => null,
    format: () => "—",
  },
  {
    labelKey: "storeItems",
    direction: "higher",
    extract: () => null,
    format: () => "—",
  },
  {
    labelKey: "hirelings",
    direction: "higher",
    extract: () => null,
    format: () => "—",
  },
];

// ───────────────────────────────────────────────────────────────────────
// Helpers — logika "Przewaga"
// ───────────────────────────────────────────────────────────────────────

const DELTA_THRESHOLD = 0.1; // 10% — powyżej = highlight

/**
 * Wybiera stronę, która wygrywa w danym wierszu.
 *  - Gdy obie wartości null/0 → "tie"
 *  - Gdy tylko jedna strona ma wartość → ta strona wygrywa
 *  - W przeciwnym razie: porównanie wg `direction` (higher/lower)
 */
function resolveAdvantage(
  left: number | null,
  right: number | null,
  direction: "higher" | "lower",
): Side {
  if (left === null && right === null) return "tie";
  if (left === null) return "right";
  if (right === null) return "left";
  if (left === right) return "tie";
  if (direction === "higher") {
    return left > right ? "left" : "right";
  }
  return left < right ? "left" : "right";
}

/**
 * Ile procent różni się lewa od prawej (basis: max(left, right, 1)).
 * Zwraca null gdy obie strony null.
 */
function computeDeltaPct(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null && right === null) return null;
  const l = left ?? 0;
  const r = right ?? 0;
  const max = Math.max(Math.abs(l), Math.abs(r), 1);
  return Math.abs(l - r) / max;
}

// ───────────────────────────────────────────────────────────────────────
// Outfit image helper — spójne z AuctionCard
// ───────────────────────────────────────────────────────────────────────

function outfitImageUrl(outfitId: number | null): string | null {
  if (outfitId === null) return null;
  return `https://static.tibia.com/images/charactertrade/outfits/${outfitId}_0.gif`;
}

// ───────────────────────────────────────────────────────────────────────
// Component (Server Component)
// ───────────────────────────────────────────────────────────────────────

export interface CompareTableProps {
  left: AuctionSummary;
  right: AuctionSummary;
}

export async function CompareTable({ left, right }: CompareTableProps) {
  const t = await getTranslations("Bazaar.compare");
  const tCard = await getTranslations("Bazaar.card");
  const format = await getFormatter();

  const leftOutfit = outfitImageUrl(left.outfitId);
  const rightOutfit = outfitImageUrl(right.outfitId);

  return (
    <div className="space-y-6">
      {/* ── Sticky header z imionami + outfitami ─────────────────────── */}
      <div
        className={cn(
          "sticky top-16 z-20 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3",
          "rounded-lg border bg-card/95 p-3 shadow-sm backdrop-blur",
          "supports-[backdrop-filter]:bg-card/80",
        )}
      >
        <CompareHeaderCell
          side="left"
          auction={left}
          outfitUrl={leftOutfit}
          outfitAlt={tCard("outfitAlt", { name: left.name })}
        />
        <div className="flex items-center justify-center text-muted-foreground">
          <span className="text-xs uppercase tracking-wider">vs</span>
        </div>
        <CompareHeaderCell
          side="right"
          auction={right}
          outfitUrl={rightOutfit}
          outfitAlt={tCard("outfitAlt", { name: right.name })}
        />
      </div>

      {/* ── Tabela (overflow-x na mobile, stacked cards fallback <md) ── */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[28%]">{t("rows.metric")}</TableHead>
              <TableHead className="w-[28%] text-right">
                {format.number(left.bid, { useGrouping: true })} TC ·{" "}
                {left.name}
              </TableHead>
              <TableHead className="w-[8%] text-center text-xs uppercase tracking-wider text-muted-foreground">
                Przewaga
              </TableHead>
              <TableHead className="w-[28%]">
                {format.number(right.bid, { useGrouping: true })} TC ·{" "}
                {right.name}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((row) => {
              const leftVal = row.extract(left);
              const rightVal = row.extract(right);
              const side = resolveAdvantage(leftVal, rightVal, row.direction);
              const delta = computeDeltaPct(leftVal, rightVal);
              const isHighlighted =
                delta !== null && delta > DELTA_THRESHOLD && side !== "tie";

              return (
                <TableRow
                  key={row.labelKey}
                  data-density="comfortable"
                  className={cn(
                    isHighlighted && "bg-warning/5 hover:bg-warning/10",
                  )}
                  data-row={row.labelKey}
                  data-advantage={side}
                >
                  <TableCell className="font-medium text-muted-foreground">
                    {t(`rows.${row.labelKey}`)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "numeric text-right font-mono tabular-nums",
                      side === "left" && "font-semibold text-foreground",
                    )}
                  >
                    {row.format(left, format.number)}
                  </TableCell>
                  <TableCell className="text-center">
                    <AdvantageBadge
                      side={side}
                      leftName={left.name}
                      rightName={right.name}
                    />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "numeric font-mono tabular-nums",
                      side === "right" && "font-semibold text-foreground",
                    )}
                  >
                    {row.format(right, format.number)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Stacked cards fallback (<md) ────────────────────────────── */}
      <div className="space-y-3 md:hidden">
        {ROWS.map((row) => {
          const leftVal = row.extract(left);
          const rightVal = row.extract(right);
          const side = resolveAdvantage(leftVal, rightVal, row.direction);
          const delta = computeDeltaPct(leftVal, rightVal);
          const isHighlighted =
            delta !== null && delta > DELTA_THRESHOLD && side !== "tie";

          return (
            <div
              key={row.labelKey}
              className={cn(
                "rounded-lg border bg-card p-3",
                isHighlighted && "border-warning/40 bg-warning/5",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t(`rows.${row.labelKey}`)}
                </span>
                <AdvantageBadge
                  side={side}
                  leftName={left.name}
                  rightName={right.name}
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div
                  className={cn(
                    "numeric rounded-md border bg-background px-2 py-1.5 font-mono tabular-nums",
                    side === "left" && "border-primary/40 bg-primary/5 font-semibold",
                  )}
                >
                  <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    {left.name}
                  </div>
                  <div className="mt-0.5">{row.format(left, format.number)}</div>
                </div>
                <div
                  className={cn(
                    "numeric rounded-md border bg-background px-2 py-1.5 font-mono tabular-nums",
                    side === "right" && "border-primary/40 bg-primary/5 font-semibold",
                  )}
                >
                  <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    {right.name}
                  </div>
                  <div className="mt-0.5">{row.format(right, format.number)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// CompareHeaderCell — karta sticky z imieniem + outfit
// ───────────────────────────────────────────────────────────────────────

function CompareHeaderCell({
  side,
  auction,
  outfitUrl,
  outfitAlt,
}: {
  side: "left" | "right";
  auction: AuctionSummary;
  outfitUrl: string | null;
  outfitAlt: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 min-w-0",
        side === "right" && "flex-row-reverse text-right",
      )}
    >
      <Badge variant="outline" className="shrink-0">
        {side === "left" ? "A" : "B"}
      </Badge>
      {outfitUrl ? (
        <img
          src={outfitUrl}
          alt={outfitAlt}
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
          —
        </div>
      )}
      <div className={cn("min-w-0 flex-1", side === "right" && "text-right")}>
        <Link
          href={`/bazaar/${auction.id}`}
          className={cn(
            "block truncate text-sm font-semibold hover:text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          {auction.name}
        </Link>
        <div className="mt-0.5 text-xs text-muted-foreground">
          lvl {auction.level} · {auction.vocationPromoted} · {auction.world}
        </div>
      </div>
      <Link
        href={`/bazaar/${auction.id}`}
        className={cn(
          "hidden shrink-0 text-xs text-muted-foreground hover:text-foreground sm:block",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        →
      </Link>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// AdvantageBadge — ← / → / = ikona + aria-label
// ───────────────────────────────────────────────────────────────────────

function AdvantageBadge({
  side,
  leftName,
  rightName,
}: {
  side: Side;
  leftName: string;
  rightName: string;
}) {
  if (side === "tie") {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-muted text-muted-foreground"
        aria-label="Równe"
        title="Równe"
      >
        <Equal className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  if (side === "left") {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary"
        aria-label={`${leftName} wygrywa`}
        title={`${leftName} wygrywa`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary"
      aria-label={`${rightName} wygrywa`}
      title={`${rightName} wygrywa`}
    >
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}
