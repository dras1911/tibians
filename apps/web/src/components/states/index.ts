/**
 * Spójne stany UI (T66, arch §6.4) — barrel.
 *
 * Używaj tych komponentów zamiast ad-hoc empty/loading/error markupu,
 * żeby każda strona zachowywała identyczną strukturę i dostępność.
 */
export { EmptyState, type EmptyStateProps } from "./empty-state";
export {
  LoadingState,
  type LoadingStateProps,
  type LoadingVariant,
} from "./loading-state";
export { ErrorState, type ErrorStateProps } from "./error-state";
