import * as React from "react";

import { cn } from "@/lib/utils";
import { REGION_FLAG_CODE, type WorldRegion } from "@/lib/regions";

/**
 * Flaga regionu jako obrazek SVG.
 *
 * Emoji flag (🇧🇷) NIE renderują się jako flagi na Windows ani w headless
 * Chromium — systemowe fonty pokazują litery („BR", „EU"). Dlatego flagi
 * trzymamy jako SVG w `public/flags/` (flag-icons, MIT) i wyświetlamy
 * przez `<img>`.
 */
export function RegionFlag({
  region,
  className,
}: {
  region: WorldRegion | string | null | undefined;
  className?: string;
}) {
  const code = region ? REGION_FLAG_CODE[region as WorldRegion] : undefined;
  if (!code) return null;

  return (
    <img
      src={`/flags/${code}.svg`}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("inline-block h-3 w-4 shrink-0 rounded-[2px] object-cover", className)}
    />
  );
}
