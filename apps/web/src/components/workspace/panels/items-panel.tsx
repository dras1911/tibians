"use client";

/**
 * @file panels/items-panel.tsx — task 25.
 *
 * Items tab: lists every inventory item grouped by category (weapons,
 * armors, runes, etc.) with a small item GIF.
 *
 * **Tibia item icons:** items don't carry a `category` field in the
 * snapshot (that lives in the Bazaar detail join tables + the items
 * reference). For T25 we **infer** a category from the `tier` field as
 * a coarse bucketing heuristic:
 *   - tier === 0 → "other"
 *   - tier 1..3 → "weapons" (the most common imbued category)
 *
 * Real category resolution lands in T37/T62 once `auctionToSnapshot()`
 * joins with `items` reference table.
 *
 * **Manual snapshots:** `source.kind === 'manual'` snapshots don't
 * carry item detail (T9 schema requires it but the manual UI doesn't
 * expose it yet). We render the friendly empty state + hint instead of
 * pretending we have data.
 *
 * **Mini-GIF:** we render a placeholder square (64 px) until the items
 * reference ships with the static asset URLs.
 */

import * as React from "react";
import { Package, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCharacterStore, type CharacterSnapshot } from "@tibians/character-context";

type ItemCategory =
  | "weapons"
  | "shields"
  | "armors"
  | "helmets"
  | "runes"
  | "potions"
  | "rings"
  | "other";

const CATEGORY_LABEL_KEYS: Record<ItemCategory, string> = {
  weapons: "weapons",
  shields: "shields",
  armors: "armors",
  helmets: "helmets",
  runes: "runes",
  potions: "potions",
  rings: "rings",
  other: "other",
};

function bucketCategory(item: CharacterSnapshot["assets"]["items"][number]): ItemCategory {
  // Coarse heuristic — real mapping lives in T37 with `items` table
  // JOINs. Until then we surface tier=0 as "other" and tier>=1 as the
  // "weapons" bucket (most common use case).
  if (item.tier === undefined || item.tier === 0) return "other";
  return "weapons";
}

export function ItemsPanel() {
  const t = useTranslations("Workspace.panelsContent.items");
  const format = useFormatter();

  const items = useCharacterStore((s) => s.snapshot.assets.items);
  const sourceKind = useCharacterStore((s) => s.snapshot.source.kind);

  if (sourceKind === "manual" || items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>{t("empty")}</span>
          </CardTitle>
          {sourceKind === "manual" ? (
            <CardDescription>{t("manualHint")}</CardDescription>
          ) : null}
        </CardHeader>
      </Card>
    );
  }

  const grouped = React.useMemo(() => {
    const map = new Map<ItemCategory, CharacterSnapshot["assets"]["items"]>();
    for (const item of items) {
      const cat = bucketCategory(item);
      const existing = map.get(cat) ?? [];
      existing.push(item);
      map.set(cat, existing);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>{t("empty") /* header label reuses "items" key */}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {grouped.map(([category, list]) => (
          <section key={category} aria-labelledby={`items-cat-${category}`}>
            <h3
              id={`items-cat-${category}`}
              className="mb-2 text-sm font-semibold text-foreground"
            >
              {t(`category.${CATEGORY_LABEL_KEYS[category]}`)} · {list.length}
            </h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {list.map((item) => (
                <li
                  key={`${item.itemId}-${item.tier ?? 0}`}
                  className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/40 text-xs text-muted-foreground"
                  >
                    #{item.itemId}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {item.tier !== undefined && item.tier > 0 ? `T${item.tier}` : "—"}
                  </span>
                  <span className="numeric text-xs font-semibold tabular-nums text-foreground">
                    ×{format.number(item.quantity, { useGrouping: true })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}