/**
 * Testy SSR-safe zachowania useSavedCharacters — task 13.
 *
 * W środowisku jsdom `window` jest zawsze zdefiniowane, więc gałąź
 * `subscribe` dla `typeof window === "undefined"` jest nieosiągalna
 * przez normalne renderowanie React. Mockujemy `use-sync-external-store/shim`
 * żeby przechwycić `subscribe` i wywołać go bezpośrednio w środowisku node
 * (bez window).
 *
 * Pokrycie:
 *   1. subscribe → no-op gdy window undefined
 *   2. getSnapshot → [] gdy window undefined
 *   3. refresh → no-op gdy window undefined
 */
import { describe, expect, it, vi } from "vitest";

// Przechwytujemy subscribe zanim zaimportujemy hook.
const captured: {
  subscribe?: (onStoreChange: () => void) => () => void;
  getSnapshot?: () => unknown;
} = {};

vi.mock("use-sync-external-store/shim", () => ({
  useSyncExternalStore: (
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => unknown,
  ) => {
    captured.subscribe = subscribe;
    captured.getSnapshot = getSnapshot;
    return getSnapshot();
  },
}));

import { useSavedCharacters } from "../persistence/use-saved-characters.js";

describe("useSavedCharacters — SSR (node, bez window)", () => {
  it("subscribe zwraca no-op gdy window undefined", () => {
    // W środowisku node (bez jsdom) window jest undefined.
    expect(typeof window).toBe("undefined");
    // Wywołanie hooka populuje `captured` przez mock shim.
    useSavedCharacters();
    const unsub = captured.subscribe!(() => {});
    expect(typeof unsub).toBe("function");
    // No-op — nie rzuca.
    expect(() => unsub()).not.toThrow();
  });

  it("getSnapshot zwraca [] gdy window undefined", () => {
    useSavedCharacters();
    const snap = captured.getSnapshot!();
    expect(snap).toEqual([]);
  });

  it("hook zwraca pustą listę i limit 3 (SSR-safe)", () => {
    const result = useSavedCharacters();
    expect(result.characters).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.limit).toBe(3);
    expect(result.canSaveMore).toBe(true);
    // refresh — no-op bez window.
    expect(() => result.refresh()).not.toThrow();
  });

  it("hook z isAuthenticated=true → limit Infinity", () => {
    const result = useSavedCharacters({ isAuthenticated: true });
    expect(result.limit).toBe(Infinity);
    expect(result.canSaveMore).toBe(true);
  });
});