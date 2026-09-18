"use client";

import * as React from "react";
import { Scale, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { COMPARE_MAX, useCompareSelection } from "@/lib/hooks/use-compare-selection";

/**
 * Pasek porównania — pojawia się przy dole ekranu, gdy cokolwiek jest
 * zaznaczone do porównania (wspólny stan: `useCompareSelection`).
 *
 * - 1 wybrana aukcja → podpowiedź, żeby wybrać drugą;
 * - 2 wybrane → „Porównaj" prowadzi do `/bazaar/compare?a=&b=`;
 * - X czyści wybór.
 */
export function CompareBar() {
  const t = useTranslations("Bazaar.compareBar");
  const { ids, clear } = useCompareSelection();

  if (ids.length === 0) return null;

  const href = `/bazaar/compare?a=${ids[0]}${ids[1] ? `&b=${ids[1]}` : ""}`;
  const ready = ids.length >= COMPARE_MAX;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        role="region"
        aria-label={t("label")}
        className="pointer-events-auto flex items-center gap-3 rounded-full border bg-card/95 py-1.5 pl-4 pr-1.5 shadow-lg backdrop-blur"
      >
        <Scale className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="numeric text-sm font-medium tabular-nums">
          {t("selected", { count: ids.length, max: COMPARE_MAX })}
        </span>

        {ready ? (
          <Button asChild size="sm">
            <Link href={href}>{t("compare")}</Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">{t("hint")}</span>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          aria-label={t("clear")}
          title={t("clear")}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
