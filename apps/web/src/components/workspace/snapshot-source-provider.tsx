"use client";

/**
 * @file SnapshotSourceProvider — task 25.
 *
 * Reads `?auction={id}` or `?saved={id}` from the URL, then loads the
 * matching `CharacterSnapshot` into the global Zustand store
 * (`useCharacterStore` / `characterStore`).
 *
 * **Source priority (architecture §13.2):**
 *   1. `?auction={id}` → placeholder behaviour for T25. Sets
 *      `source.kind = 'auction'` + `auctionId`. Full Bazaar detail
 *      (skills/items/progression) arrives with T37
 *      (`packages/character-context/from-auction.ts` +
 *      `apps/web/api/bazaar/[id]/route.ts`). Until then we keep the
 *      current store contents and only stamp the source/auctionId.
 *   2. `?saved={uuid}` → reads the saved character from localStorage
 *      (`useSavedCharacters` hook, task 12) and dispatches
 *      `loadFromManual()` so all panels recompute.
 *   3. no params → empty workspace. The header collapses to the
 *      "empty state" CTA block rendered by `<WorkspaceLayout>`.
 *
 * **SSR-safety:** this component is `"use client"` so `useSearchParams()`
 * is safe. The hook returns `null` during SSR — we render nothing
 * meaningful until hydration completes. We also short-circuit on the
 * already-loaded `snapshot` so we never loop (param present but store
 * already has matching snapshot).
 *
 * **Edit-mode detection (T26 placeholder):** T25 has no edit mode UI.
 * We expose `isEditMode = false` for now; T26 will own the badge toggle.
 * The store's `updateNestedField` is already wired — only the UI
 * affordance is pending.
 */

import * as React from "react";
import { useSearchParams } from "next/navigation";

import {
  getSavedCharacter,
  useCharacterStore,
  useSavedCharacters,
  type CharacterSnapshot,
} from "@tibians/character-context";

export interface SnapshotSourceProviderProps {
  /**
   * Snapshot that was loaded on the server (e.g. by the page Server
   * Component). When present we use it as the initial store state so
   * the first paint already shows the character — no flash of empty
   * state. Currently always `undefined` for `/workspace`; provided as
   * a hook for T50 (Bazaar detail integration).
   */
  initialSnapshot?: CharacterSnapshot;
  /**
   * Children — the workspace tree that depends on the populated store.
   */
  children: React.ReactNode;
}

/**
 * Stable signature used to avoid re-loading on every render. We compare
 * the previous (auction,saved) tuple with the current one and only
 * dispatch a load action when something actually changed.
 */
type SourceSignature = { auction: string | null; saved: string | null };

function signatureOf(params: URLSearchParams): SourceSignature {
  return {
    auction: params.get("auction"),
    saved: params.get("saved"),
  };
}

export function SnapshotSourceProvider({
  initialSnapshot,
  children,
}: SnapshotSourceProviderProps) {
  const searchParams = useSearchParams();
  const loadFromManual = useCharacterStore((s) => s.loadFromManual);
  const setSource = useCharacterStore((s) => s.setSource);
  const reset = useCharacterStore((s) => s.reset);

  // Subscribe to localStorage so a tab other than this one writing
  // `tibians:savedChars` triggers a re-read of the `?saved=` record.
  // (When `saved` is not in the URL this is a no-op subscription.)
  useSavedCharacters();

  const signature = React.useMemo(
    () => signatureOf(searchParams),
    [searchParams],
  );

  // Track the last signature we acted on so we only run the loader once
  // per URL change.
  const lastSignatureRef = React.useRef<SourceSignature | null>(null);

  // Track whether we've hydrated the initialSnapshot, so we don't dispatch
  // it twice on re-renders.
  const hydratedInitialRef = React.useRef(false);

  React.useEffect(() => {
    if (
      lastSignatureRef.current !== null &&
      lastSignatureRef.current.auction === signature.auction &&
      lastSignatureRef.current.saved === signature.saved
    ) {
      return;
    }
    lastSignatureRef.current = signature;

    const { auction, saved } = signature;

    if (auction !== null) {
      // T25 placeholder — T37 (auctionToSnapshot) will replace this with
      // a full snapshot payload fetched from /api/bazaar/[id]. For now we
      // only stamp the source; existing panels keep showing their data.
      const auctionId = BigInt(auction);
      if (/^\d+$/u.test(auction)) {
        setSource({ kind: "auction", auctionId });
      }
      return;
    }

    if (saved !== null) {
      // T12 localStorage lookup. SSR-safe — getSavedCharacter() is a no-op
      // when window is undefined; the surrounding `useEffect` runs only
      // on the client.
      const record = getSavedCharacter(saved);
      if (record) {
        loadFromManual(record.snapshot);
      } else {
        // Corrupted id (manual edit / never saved) — keep current state,
        // the layout will show the empty-state CTAs.
        reset();
      }
      return;
    }

    // No source params — bare `/workspace`. Keep the initial snapshot
    // (if any) or the default empty state from the store.
    void reset; // keep reference used to silence linters
  }, [signature, loadFromManual, setSource, reset]);

  // Hydrate the initial snapshot on first render — covers Server-Component
  // preloads (e.g. T50 Bazaar detail flow).
  React.useEffect(() => {
    if (hydratedInitialRef.current) return;
    hydratedInitialRef.current = true;
    if (initialSnapshot) {
      loadFromManual(initialSnapshot);
    }
  }, [initialSnapshot, loadFromManual]);

  return <>{children}</>;
}