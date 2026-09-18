"use client";

/**
 * Badge statusu BattlEye świata — skróty używane w community Tibii:
 *
 *   - **GBE** (green BattlEye)  — ochrona od samego startu świata
 *     (`initially protected`; zielona ikona na tibia.com)
 *   - **YBE** (yellow BattlEye) — świat chroniony od dołączenia do BattlEye
 *     (`protected`; żółta ikona na tibia.com)
 *   - **RBE** (red BattlEye)    — brak ochrony (`not protected`)
 *
 * ⚠️ Kolejność jest NIEINTUICYJNA i została zweryfikowana na tibia.com
 * (kolory ikon): `icon_battleye.gif` = ŻÓŁTA (protected → YBE),
 * `icon_battleyeinitial.gif` = ZIELONA (initially protected → GBE).
 * Antica = YBE, Nevia = GBE.
 *
 * Pełny opis (tooltip) z i18n `Bazaar.battleye.*`.
 */
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type BattlEyeStatus = "protected" | "initially protected" | "not protected";

const BATTLEYE_META: Record<
  BattlEyeStatus,
  { label: string; variant: "success" | "warning" | "destructive" }
> = {
  protected: { label: "YBE", variant: "warning" },
  "initially protected": { label: "GBE", variant: "success" },
  "not protected": { label: "RBE", variant: "destructive" },
};

export interface BattlEyeBadgeProps {
  value: BattlEyeStatus;
  /** `sm` — kompaktowy pill do tabeli (h-6), domyślny — do kart. */
  size?: "sm" | "default";
  className?: string;
}

export function BattlEyeBadge({ value, size = "default", className }: BattlEyeBadgeProps) {
  const t = useTranslations("Bazaar.battleye");
  const meta = BATTLEYE_META[value];

  return (
    <Badge
      variant={meta.variant}
      className={cn(
        "font-semibold tracking-wide",
        size === "sm" ? "h-6 px-2 text-[0.65rem]" : "text-xs",
        className,
      )}
      title={t(value)}
      aria-label={t(value)}
    >
      {meta.label}
    </Badge>
  );
}
