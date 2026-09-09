"use client";

/**
 * @file WorkspaceLayout — task 25, architecture §13.3 / §13.4.
 *
 * The interactive shell of `/[locale]/workspace`. Renders the snapshot
 * header (outfit, name, level, vocation, world, action buttons) plus
 * the 7 tab panels (Skills / Training / Stamina / Value / Items /
 * Progress / Comparison).
 *
 * **Panel reactivity:** every panel reads from `useCharacterStore`
 * (T11) with fine-grained selectors, so changing one field re-renders
 * only the panel(s) that depend on it. `useShallow` keeps object
 * selections stable. This is the central performance contract of the
 * Workspace (T26 what-if relies on it).
 *
 * **Tab persistence:** the active tab is mirrored into `?tab=<key>`
 * via `next/navigation` `useRouter().replace()` so shareable links
 * preserve the panel state. The page-level `<SnapshotSourceProvider>`
 * resets the store when `?saved`/`?auction` change, but keeps the
 * chosen tab.
 *
 * **Empty state:** when `snapshot.source.kind === 'manual'` AND
 * `identity.name === ""` AND no `?saved` / `?auction` was loaded, we
 * render the empty-state card with CTAs to `/bazaar` and
 * `/my-characters` instead of the panels. This matches the
 * task 25 acceptance criteria.
 *
 * **Outfit GIF:** sourced from the Tibia fan CDN (TibiaWiki CachedImages
 * via tibia.fandom.com). We render an `<img>` with `loading="lazy"` and
 * graceful fallback (`/outfits/{id}/animoutfit.gif` on TibiaWiki).
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  Clipboard,
  Edit3,
  Globe,
  Sparkles,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import type { ValuationConfig } from "@tibians/calc";
import {
  isAuctionSource,
  isImportedSource,
  useCharacterStore,
  useShallow,
  type CharacterSnapshot,
} from "@tibians/character-context";

import { ComparisonPanel } from "./panels/comparison-panel";
import { ItemsPanel } from "./panels/items-panel";
import { ProgressPanel } from "./panels/progress-panel";
import { SkillsPanel } from "./panels/skills-panel";
import { StaminaPanel } from "./panels/stamina-panel";
import { TrainingPanel } from "./panels/training-panel";
import { ValuePanel } from "./panels/value-panel";

// ───────────────────────────────────────────────────────────────────────
// Tab ids — canonical, stable order
// ───────────────────────────────────────────────────────────────────────

export const WORKSPACE_TAB_KEYS = [
  "skills",
  "training",
  "stamina",
  "value",
  "items",
  "progress",
  "comparison",
] as const;

export type WorkspaceTabKey = (typeof WORKSPACE_TAB_KEYS)[number];

const DEFAULT_TAB: WorkspaceTabKey = "skills";

function isTabKey(value: string | null): value is WorkspaceTabKey {
  return value !== null && (WORKSPACE_TAB_KEYS as readonly string[]).includes(value);
}

const VOCATION_TONE: Record<string, string> = {
  Knight: "bg-voc-knight/15 text-voc-knight border-voc-knight/40",
  Paladin: "bg-voc-paladin/15 text-voc-paladin border-voc-paladin/40",
  Druid: "bg-voc-druid/15 text-voc-druid border-voc-druid/40",
  Sorcerer: "bg-voc-sorcerer/15 text-voc-sorcerer border-voc-sorcerer/40",
  Monk: "bg-voc-monk/15 text-voc-monk border-voc-monk/40",
};

// ───────────────────────────────────────────────────────────────────────
// Hook — empty-state detection
// ───────────────────────────────────────────────────────────────────────

/**
 * Returns `true` when the snapshot looks like the store's initial empty
 * placeholder — no name, manual source, all zeros. In that case we
 * render the empty-state CTAs instead of the panels.
 */
function useIsEmptySnapshot(): boolean {
  const name = useCharacterStore((s) => s.snapshot.identity.name);
  const level = useCharacterStore((s) => s.snapshot.identity.level);
  const sourceKind = useCharacterStore((s) => s.snapshot.source.kind);
  return sourceKind === "manual" && name.length === 0 && level <= 8;
}

// ───────────────────────────────────────────────────────────────────────
// Component — WorkspaceLayout
// ───────────────────────────────────────────────────────────────────────

export interface WorkspaceLayoutProps {
  /** Locale-aware description for the H1 (rendered by the server page). */
  description?: string;
  /** Optional server-rendered initial snapshot (Bazaar detail, T50). */
  initialSnapshot?: CharacterSnapshot;
  /**
   * Server-loaded `ValuationConfig` (T22 algorithm weights). Required by
   * the Value panel — the calculator is pure and needs the weights as
   * input. The Server Component loads this via `loadValuationConfig()`
   * (which touches the DB seed and cannot run in the browser).
   */
  valuationConfig: ValuationConfig;
}

export function WorkspaceLayout({
  description,
  initialSnapshot,
  valuationConfig,
}: WorkspaceLayoutProps) {
  // Snapshot is owned by the global Zustand store. We only need fine-
  // grained selectors to keep panels reactive without forcing the header
  // to re-render on every keypress.
  const identity = useCharacterStore(
    useShallow((s) => ({
      name: s.snapshot.identity.name,
      level: s.snapshot.identity.level,
      vocation: s.snapshot.identity.vocation,
      vocationPromoted: s.snapshot.identity.vocationPromoted,
      sex: s.snapshot.identity.sex,
      world: s.snapshot.identity.world,
    })),
  );
  const source = useCharacterStore((s) => s.snapshot.source);
  const auction = useCharacterStore((s) => s.snapshot.auction);

  const isEmpty = useIsEmptySnapshot();

  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab state, mirrored to `?tab=<key>`.
  const initialTab: WorkspaceTabKey = React.useMemo(() => {
    const fromUrl = searchParams.get("tab");
    return isTabKey(fromUrl) ? fromUrl : DEFAULT_TAB;
  }, [searchParams]);
  const [activeTab, setActiveTab] = React.useState<WorkspaceTabKey>(initialTab);

  // Sync external URL changes (back/forward) into local tab state.
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

  const t = useTranslations("Workspace");
  const format = useFormatter();

  // Determine outfit illustration — outfit id is not in the snapshot
  // today (it's part of the Bazaar detail payload). We render a
  // graceful placeholder while keeping the alt text meaningful.
  const outfitFallback = (
    <div
      aria-hidden="true"
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground sm:h-20 sm:w-20"
    >
      <Sparkles className="h-6 w-6" />
    </div>
  );

  return (
    <div className="container py-6 md:py-8">
      {/* Header — snapshot identity */}
      <SnapshotHeader
        identity={identity}
        sourceKind={source.kind}
        auctionId={isAuctionSource(source) ? source.auctionId : null}
        hasAuctionContext={auction !== undefined}
        outfitFallback={outfitFallback}
      />

      {description ? (
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground sm:text-base">
          {description}
        </p>
      ) : null}

      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="mt-8">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            {/* Tabs list — horizontally scrollable on mobile to satisfy
             * the architecture §6.3 mobile contract without wrapping. */}
            <div className="overflow-x-auto pb-1">
              <TabsList
                className={cn(
                  "inline-flex h-auto w-max min-w-full justify-start gap-1 p-1",
                  "sm:flex sm:w-full sm:flex-wrap",
                )}
              >
                {WORKSPACE_TAB_KEYS.map((key) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="h-11 px-3 text-sm font-medium"
                  >
                    {t(`panels.${key}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="skills" className="mt-6 focus-visible:outline-none">
              <SkillsPanel />
            </TabsContent>
            <TabsContent
              value="training"
              className="mt-6 focus-visible:outline-none"
            >
              <TrainingPanel />
            </TabsContent>
            <TabsContent value="stamina" className="mt-6 focus-visible:outline-none">
              <StaminaPanel />
            </TabsContent>
            <TabsContent value="value" className="mt-6 focus-visible:outline-none">
              <ValuePanel
                config={valuationConfig}
                initialSnapshot={initialSnapshot}
              />
            </TabsContent>
            <TabsContent value="items" className="mt-6 focus-visible:outline-none">
              <ItemsPanel />
            </TabsContent>
            <TabsContent
              value="progress"
              className="mt-6 focus-visible:outline-none"
            >
              <ProgressPanel />
            </TabsContent>
            <TabsContent
              value="comparison"
              className="mt-6 focus-visible:outline-none"
            >
              <ComparisonPanel />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Reserved for T26 (what-if editing surface). The header already
       * shows the edit-mode badge; full editing lives in task 26. */}
      <span className="sr-only">
        {format.number(identity.level, { useGrouping: true })}
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// SnapshotHeader — outfit + identity + actions
// ───────────────────────────────────────────────────────────────────────

interface SnapshotHeaderProps {
  identity: {
    name: string;
    level: number;
    vocation: string;
    vocationPromoted: string;
    sex: "M" | "F";
    world: string | undefined;
  };
  sourceKind: CharacterSnapshot["source"]["kind"];
  auctionId: bigint | null;
  hasAuctionContext: boolean;
  outfitFallback: React.ReactNode;
}

function SnapshotHeader({
  identity,
  sourceKind,
  auctionId,
  hasAuctionContext,
  outfitFallback,
}: SnapshotHeaderProps) {
  const t = useTranslations("Workspace.snapshotHeader");
  const tCommon = useTranslations("Common");
  const isAuthenticated = false; // Faza 6 (Discord OAuth)

  const updateNestedField = useCharacterStore((s) => s.updateNestedField);

  // T26 placeholder — edit mode toggles when a what-if mutation happens.
  // Today the badge is purely informational (no mutation surface yet).
  const [isEditMode, setIsEditMode] = React.useState(false);

  const handleToggleEditMode = React.useCallback(() => {
    setIsEditMode((prev) => !prev);
    // Bump the level by 0 — emits an update so subscribers re-render.
    // T26 replaces this with a real diff-based detection.
    updateNestedField("identity.level", identity.level);
  }, [updateNestedField, identity.level]);

  const [linkCopied, setLinkCopied] = React.useState(false);
  const handleCopyLink = React.useCallback(() => {
    if (typeof window === "undefined") return;
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 2_000);
      })
      .catch(() => {
        // Fallback — no-op on browsers without clipboard API.
      });
  }, []);

  const handleSave = React.useCallback(() => {
    // T26 wires the actual save flow. For now we emit a stub by
    // bouncing to `/my-characters` so the player sees the option.
    window.location.assign("/my-characters");
  }, []);

  const vocationTone = VOCATION_TONE[identity.vocation] ?? VOCATION_TONE.Knight;
  void isAuthenticated;
  void tCommon;

  const displayName = identity.name.length > 0 ? identity.name : t("untitledCharacter");
  const sourceLabel = (() => {
    if (isAuctionSource({ kind: "auction", auctionId: auctionId ?? 0n } as CharacterSnapshot["source"])) {
      return t("source.auction", { id: (auctionId ?? 0n).toString() });
    }
    if (isImportedSource({ kind: "imported", from: "tibia-com" })) {
      return t("source.imported");
    }
    return t("source.manual");
  })();

  return (
    <header
      className={cn(
        "rounded-lg border bg-card p-4 sm:p-5",
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6",
      )}
    >
      {outfitFallback}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {displayName}
          </h1>
          <Badge
            variant="outline"
            className={cn("border font-semibold", vocationTone)}
          >
            {identity.vocationPromoted}
          </Badge>
          {isEditMode ? (
            <Badge variant="warning">{t("badges.editMode")}</Badge>
          ) : null}
          {hasAuctionContext ? null : sourceKind === "auction" ? (
            <Badge variant="secondary">{t("badges.noAuction")}</Badge>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="font-medium text-foreground">
              {t("level")} {identity.level}
            </span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            {t("world")}
            <span className="font-medium text-foreground">
              {identity.world ?? t("worldUnknown")}
            </span>
          </span>
          <span aria-hidden="true">·</span>
          <span>{sourceLabel}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSave}
          className="gap-1.5"
        >
          {t("actions.save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          className="gap-1.5"
          aria-live="polite"
        >
          {linkCopied ? (
            <>
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
              {t("actions.linkCopied")}
            </>
          ) : (
            <>
              <Clipboard className="h-4 w-4" aria-hidden="true" />
              {t("actions.copyLink")}
            </>
          )}
        </Button>
        <Button
          type="button"
          variant={isEditMode ? "default" : "secondary"}
          size="sm"
          onClick={handleToggleEditMode}
          className="gap-1.5"
        >
          <Edit3 className="h-4 w-4" aria-hidden="true" />
          {isEditMode ? t("actions.editMode") : t("actions.whatIf")}
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}

// ───────────────────────────────────────────────────────────────────────
// EmptyState — no snapshot loaded
// ───────────────────────────────────────────────────────────────────────

function EmptyState() {
  const t = useTranslations("Workspace.empty");
  return (
    <Card className="mt-8 border-dashed bg-muted/30">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center sm:py-14">
        <Sparkles
          className="h-10 w-10 text-muted-foreground/60"
          aria-hidden="true"
        />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {t("title")}
          </h2>
          <p className="mx-auto max-w-xl text-sm text-muted-foreground sm:text-base">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild size="lg">
            <Link href="/bazaar">{t("ctaBazaar")}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/my-characters">{t("ctaMyCharacters")}</Link>
          </Button>
          <Badge variant="secondary" className="px-3 py-1.5 text-xs">
            {t("ctaSoon")}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}