"use client";

/**
 * VirtualizedAuctionGrid — grid kart aukcji z @tanstack/react-virtual
 * (plan task 46, arch §6.4 pkt 8).
 *
 * Arch §6.4 pkt 8: "Virtualizacja powyżej 100 wierszy — `@tanstack/react-virtual`.
 * Bez tego 2500 kart = 3 s render + 400 MB RAM w przeglądarce."
 *
 * Strategia (plan task 46):
 *   - Threshold: `>100` aukcji → wirtualizuj; `<=100` → zwykły grid
 *     (niepotrzebna wirtualizacja dla małych list — gorszy UX, scroll jank).
 *   - Overscan: 5 wierszy (typowa rekomendacja @tanstack/react-virtual).
 *   - Row height: **mierzona dynamicznie** (`measureElement`) — karty mają
 *     zmienną wysokość (heurystyczne tagi, różne levele bidów). Domyślna
 *     estymacja 280 px.
 *   - `position: relative` parent + `position: absolute` items z `transform: translateY(...)`.
 *   - Smooth scroll 60fps — bez `useState` per row (zero re-render przy scroll).
 *
 * Layout:
 *   - Mobile (`<sm`): 1 kolumna, full width.
 *   - Tablet (`sm`): 2 kolumny.
 *   - Desktop (`xl`): 3 kolumny.
 *   - Proporcjonalnie do szerokości kontenera (CSS grid `repeat(auto-fill, ...)`).
 */

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { AuctionCard } from "./auction-card";
import type { AuctionSummary } from "./auction-summary";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────

/**
 * Próg włączania wirtualizacji (arch §6.4 pkt 8: "powyżej 100 wierszy").
 * Poniżej — zwykły grid, bez narzutu virtualizera.
 */
export const VIRTUALIZE_THRESHOLD = 100;

/**
 * Overscan — ile wierszy wyrenderować "poza" viewport (arch §6.4 pkt 8: "overscan: 5").
 */
const OVERSCAN = 5;

/**
 * Domyślna estymacja wysokości wiersza (px). Używana przed pierwszym pomiarem.
 * Po zmierzeniu pierwszego wiersza (`measureElement`) — nadpisywana.
 */
const DEFAULT_ROW_HEIGHT = 280;

// ───────────────────────────────────────────────────────────────────────
// Hook: useColumnCount — ile kolumn zmieści się w kontenerze?
// ───────────────────────────────────────────────────────────────────────

const MIN_COL_WIDTH = 280; // px — minimalna szerokość kolumny (mobile+)
const BREAKPOINTS = [
  { minWidth: 1280, cols: 3 }, // xl
  { minWidth: 640, cols: 2 }, // sm
] as const;

/**
 * Hook zwracający liczbę kolumn na podstawie szerokości kontenera.
 * `ResizeObserver` zapewnia reakcję na zmianę szerokości (np. obrót mobile).
 */
function useColumnCount(containerRef: React.RefObject<HTMLElement | null>): number {
  const [cols, setCols] = React.useState(1);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const compute = (width: number) => {
      // Ile kolumn zmieści się w `width` przy `MIN_COL_WIDTH`?
      const fitting = Math.max(1, Math.floor(width / MIN_COL_WIDTH));
      // Uwzględnij breakpointy (cap na xl=3, sm=2).
      const cap = BREAKPOINTS.find((bp) => width >= bp.minWidth)?.cols ?? 1;
      return Math.min(fitting, cap);
    };

    const update = () => {
      setCols(compute(el.clientWidth));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return cols;
}

// ───────────────────────────────────────────────────────────────────────
// VirtualizedAuctionGrid
// ───────────────────────────────────────────────────────────────────────

export interface VirtualizedAuctionGridProps {
  /** Lista aukcji (client-safe). */
  auctions: AuctionSummary[];
  /**
   * Wymuś wirtualizację (niezależnie od progu). Przydatne w testach.
   * @default false
   */
  forceVirtualize?: boolean;
  className?: string | undefined;
}

/**
 * Wewnętrzny typ — współdzielony przez `<StaticAuctionGrid>` i
 * `<VirtualizedInner>` (oba te same pola, mniej boilerplate).
 */
type VirtualizedInnerProps = VirtualizedAuctionGridProps;

/**
 * Grid kart z opcjonalną wirtualizacją (T46).
 *
 * Decyzja o wirtualizacji:
 *   - `forceVirtualize === true` → ZAWSZE wirtualizuj (testy).
 *   - Wpp: `auctions.length > VIRTUALIZE_THRESHOLD` → wirtualizuj.
 *   - Poniżej progu → zwykły CSS grid (bez narzutu virtualizera).
 */
export function VirtualizedAuctionGrid({
  auctions,
  forceVirtualize = false,
  className,
}: VirtualizedAuctionGridProps) {
  const shouldVirtualize = forceVirtualize || auctions.length > VIRTUALIZE_THRESHOLD;

  if (!shouldVirtualize) {
    return <StaticAuctionGrid auctions={auctions} className={className} />;
  }

  return <VirtualizedInner auctions={auctions} className={className} />;
}

// ───────────────────────────────────────────────────────────────────────
// StaticAuctionGrid — zwykły CSS grid (≤100 aukcji)
// ───────────────────────────────────────────────────────────────────────

function StaticAuctionGrid({ auctions, className }: VirtualizedInnerProps) {
  return (
    <div
      className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}
      data-testid="static-grid"
      data-row-count={auctions.length}
    >
      {auctions.map((a: AuctionSummary) => (
        <AuctionCard key={a.id} auction={a} />
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// VirtualizedInner — właściwy virtualizer (>100 aukcji)
// ───────────────────────────────────────────────────────────────────────

function VirtualizedInner({ auctions, className }: VirtualizedInnerProps) {
  // Ref do scrollowalnego kontenera (rodzic dla `position: relative`).
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);

  const cols = useColumnCount(scrollRef);
  const rowCount = Math.ceil(auctions.length / cols);

  // `measureElement` callback — w Safari (AppleWebKit) `getBoundingClientRect`
  // po transform nie zawsze zwraca poprawne wartości dla virtualizera.
  // Tam wyłączamy dynamiczny pomiar (używamy estymacji).
  const supportsMeasure =
    typeof window !== "undefined" && navigator.userAgent.indexOf("AppleWebKit") === -1;

  // `useVirtualizer` z window-scrolling (scrollRef). Domyślne
  // `getScrollElement` zwraca scrollRef — działa out-of-the-box.
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DEFAULT_ROW_HEIGHT,
    overscan: OVERSCAN,
    ...(supportsMeasure
      ? {
          measureElement: (el) => el?.getBoundingClientRect().height ?? DEFAULT_ROW_HEIGHT,
        }
      : {}),
  });

  return (
    <div
      ref={scrollRef}
      data-testid="virtualized-grid"
      data-row-count={auctions.length}
      data-virtualized-rows={rowCount}
      data-cols={cols}
      className={cn("relative max-h-[70vh] overflow-y-auto rounded-lg border", className)}
      // 70vh = ~5-6 wierszy widocznych (zależy od kolumn). Pozwala na
      // scroll wewnętrzny — header listy zostaje widoczny (sticky).
    >
      <div
        ref={innerRef}
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * cols;
          const rowAuctions = auctions.slice(startIndex, startIndex + cols);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="grid gap-4 p-2 sm:grid-cols-2 xl:grid-cols-3"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {rowAuctions.map((a: AuctionSummary) => (
                  <AuctionCard key={a.id} auction={a} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
