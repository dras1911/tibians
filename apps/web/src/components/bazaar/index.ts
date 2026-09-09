/**
 * Publiczne API komponentów Bazaar (`apps/web/src/components/bazaar/`).
 *
 * Re-eksport wszystkich elementów składających się na listę `/bazaar`:
 *   - AuctionSummary + adapter (server → client-safe)
 *   - AuctionCard (mobile + preferencja desktopowa)
 *   - AuctionTable (TanStack Table, desktop)
 *   - AuctionViewToggle (Cards ↔ Table, localStorage)
 *   - AuctionResultsToolbar (sort, pageSize, view)
 *   - AuctionFiltersSidebar (sidebar filtrów + faceted counts)
 *   - AuctionCountdownCell (compact countdown dla tabeli)
 */

export {
  type AuctionSummary,
  toAuctionSummary,
  toAuctionSummaries,
} from "./auction-summary";

export { AuctionCard, type AuctionCardProps } from "./auction-card";
export { AuctionTable, type AuctionTableProps } from "./auction-table";
export { AuctionCountdownCell } from "./auction-countdown-cell";
export {
  AuctionViewToggle,
  readBazaarViewPreference,
  type BazaarView,
} from "./auction-view-toggle";
export {
  AuctionResultsToolbar,
  type AuctionResultsToolbarProps,
  type BazaarSortKey,
} from "./auction-results-toolbar";
export {
  AuctionFiltersSidebar,
  type AuctionFiltersSidebarProps,
  type BazaarFilters,
  type FacetCounts,
  type FacetCount,
  type VocationFilter,
  type RegionFilter,
  type PvPTypeFilter,
  type BattlEyeFilter,
  type SkillFilterKey,
} from "./auction-filters-sidebar";
export {
  BazaarClient,
  type BazaarClientProps,
  sortKeyToUrlParams,
} from "./bazaar-client";
export { ActiveFiltersBar } from "./active-filters-bar";
export {
  PresetDropdown,
  formatPresetPreview,
} from "./preset-dropdown";
export {
  RareItemCombobox,
  type ReferenceItemOption,
  type RareItemComboboxProps,
} from "./rare-item-combobox";