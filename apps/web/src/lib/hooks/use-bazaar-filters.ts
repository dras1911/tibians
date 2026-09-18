"use client";

/**
 * useBazaarFilters — centralny hook URL state dla Bazaar (plan T43).
 *
 * Zasada arch §5 + §6.4 pkt 4: URL jest **źródłem prawdy** dla filtrów
 * aukcji. Hook opakowuje `useSearchParams()` + `useRouter().replace()`,
 * debounce'ując **write** (300 ms) aby częste interakcje z filtrami
 * nie zaśmiecały historii i nie powodowały nadmiernych renderów.
 *
 * Przepływ (arch §5):
 *   1. Mount: `filters` czytane z `useSearchParams()`.
 *   2. Zmiana filtra → `setFilters(next)` → debounce 300 ms →
 *      `router.replace(\`?${qs}\`, { scroll: false })`.
 *   3. `searchParams` się zmienia → `filters` re-sync z URL (natychmiast
 *      po nawigacji / back button).
 *
 * Dlaczego debounce tylko na write?
 *   - **Read** jest natychmiastowy — przyciski w sidebarze renderują się
 *     z aktualnym stanem od razu.
 *   - **Write** debounce'ujemy — user może przeciągnąć slider i nie
 *     chcemy 30 requestów do `/api/auctions` w 1 sekundę.
 *
 * Pokrycie filtrów:
 *   - Pola z `AuctionFilters` (auctionFiltersSchema) → czytane bezpośrednio.
 *   - Rozszerzenia T42 (skillType/Min/Max, hasWorldTransfer, imbuesFull,
 *     gemsMin*, storeMin*, mustHaveItemId, hasPreySlot, hasCharmExpansion,
 *     hasWeeklyTaskExp, hasTwistOfFate) → czytane jako "extra params",
 *     bez wymuszania strict schema. Pozwala to na iteracyjne dodawanie
 *     filtrów bez czekania na server-side query support.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { auctionFiltersSchema, type AuctionFilters } from "@tibians/shared/auction";

// ───────────────────────────────────────────────────────────────────────
// Typ filtrów UI — superset AuctionFilters
// ───────────────────────────────────────────────────────────────────────

/**
 * Pełny stan filtrów Bazaar w UI. Rozszerza `AuctionFilters` o pola
 * planowane w T42+T43, które nie są jeszcze w `auctionFiltersSchema`
 * (gemy, store counts, must-have item, computed flags).
 *
 * Pola opcjonalne — każdy preset / URL state może zawierać podzbiór.
 */
export interface BazaarFiltersUi extends Omit<Partial<AuctionFilters>, "storeItems"> {
  // Skill minimum (T42 — już w AuctionFilters jako skillType/skillMin,
  // powtarzamy tu dla jasności typu przy destrukturyzacji).
  skillType?: AuctionFilters["skillType"];
  skillMin?: number | undefined;

  /** Soul War / Primal Ordeal / World Transfer — już w AuctionFilters. */

  /** BattlEye (w AuctionFilters brak — jest na `worlds`). */
  battleye?: "protected" | "initially protected" | "not protected" | undefined;

  /** Nowe toggles (T42). */
  hasWorldTransfer?: boolean | undefined;
  hasPreySlot?: boolean | undefined;
  hasCharmExpansion?: boolean | undefined;
  hasWeeklyTaskExp?: boolean | undefined;
  hasTwistOfFate?: boolean | undefined;
  /** `true` = wymaga imbuementsUnlocked = 23. */
  imbuesFull?: boolean | undefined;

  /** Rare item id (T42 autocomplete). */
  mustHaveItemId?: number | undefined;
  /** Nazwa przedmiotu (do wyświetlania w UI; nie wysyłane do API). */
  mustHaveItemName?: string | undefined;

  /** Gemy — minimum. */
  gemsMinLesser?: number | undefined;
  gemsMinRegular?: number | undefined;
  gemsMinGreater?: number | undefined;

  /** Store counts — minimum. */
  storeMinOutfits?: number | undefined;
  storeMinMounts?: number | undefined;
  storeMinItems?: number | undefined;

  /** Store items (kuratorowane klucze, CSV — `?storeItems=goldPouch,mailbox`). */
  storeItems?: string | undefined;

  /** Computed flag (server-side, przyszłe W9+). */
  overpriced?: boolean | undefined;
}

// ───────────────────────────────────────────────────────────────────────
// Helpers — URL ↔ filters
// ───────────────────────────────────────────────────────────────────────

/**
 * Klucze URL dla filtrów rozszerzonych (T42+). Pozwala trzymać mapowanie
 * w jednym miejscu.
 */
const EXTRA_FILTER_KEYS = [
  "skillType",
  "skillMin",
  "hasWorldTransfer",
  "hasPreySlot",
  "hasCharmExpansion",
  "hasWeeklyTaskExp",
  "hasTwistOfFate",
  "imbuesFull",
  "mustHaveItemId",
  "mustHaveItemName",
  "gemsMinLesser",
  "gemsMinRegular",
  "gemsMinGreater",
  "storeMinOutfits",
  "storeMinMounts",
  "storeMinItems",
  "storeItems",
  "overpriced",
] as const;

type ExtraFilterKey = (typeof EXTRA_FILTER_KEYS)[number];

function parseBoolParam(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  return value === "1" || value === "true";
}

function parseIntParam(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Czyta `BazaarFiltersUi` z `URLSearchParams`. Próbuje najpierw sparsować
 * `auctionFiltersSchema` (strict) dla pól z API; resztę pobiera z
 * "extra keys" (luźniej — pozwala na URL-e z filtrami nieobsługiwanymi
 * jeszcze przez API).
 */
export function readFiltersFromSearchParams(searchParams: URLSearchParams): BazaarFiltersUi {
  // ── 1. Parsowanie pól znanych API (auctionFiltersSchema) ───────────
  // Próbujemy parsować `auctionFiltersSchema` dla minimalnej walidacji
  // pól znanych serwerowi. Błędy ignorujemy (URL może mieć "extra"
  // klucze spoza schemy).
  const known: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key === "page" || key === "pageSize" || key === "sortBy" || key === "sortDir") {
      // Parametry paginacji/sortowania NIE są filtrami w naszym UI;
      // są zarządzane osobno przez BazaarClient.
      continue;
    }
    if (!EXTRA_FILTER_KEYS.includes(key as ExtraFilterKey)) {
      known[key] = value;
    }
  }
  const schemaResult = auctionFiltersSchema.safeParse(known);

  const filters: BazaarFiltersUi = schemaResult.success
    ? { ...schemaResult.data, storeItems: undefined }
    : {};

  // ── 2. Rozszerzone pola (T42+) ─────────────────────────────────────
  filters.skillType = searchParams.get("skillType") as BazaarFiltersUi["skillType"];
  filters.skillMin = parseIntParam(searchParams.get("skillMin"));

  filters.hasWorldTransfer = parseBoolParam(searchParams.get("hasWorldTransfer"));
  filters.hasPreySlot = parseBoolParam(searchParams.get("hasPreySlot"));
  filters.hasCharmExpansion = parseBoolParam(searchParams.get("hasCharmExpansion"));
  filters.hasWeeklyTaskExp = parseBoolParam(searchParams.get("hasWeeklyTaskExp"));
  filters.hasTwistOfFate = parseBoolParam(searchParams.get("hasTwistOfFate"));
  filters.imbuesFull = parseBoolParam(searchParams.get("imbuesFull"));

  const mustHaveId = parseIntParam(searchParams.get("mustHaveItemId"));
  if (mustHaveId !== undefined) filters.mustHaveItemId = mustHaveId;
  const mustHaveName = searchParams.get("mustHaveItemName");
  if (mustHaveName) filters.mustHaveItemName = mustHaveName;

  filters.gemsMinLesser = parseIntParam(searchParams.get("gemsMinLesser"));
  filters.gemsMinRegular = parseIntParam(searchParams.get("gemsMinRegular"));
  filters.gemsMinGreater = parseIntParam(searchParams.get("gemsMinGreater"));
  filters.storeMinOutfits = parseIntParam(searchParams.get("storeMinOutfits"));
  filters.storeMinMounts = parseIntParam(searchParams.get("storeMinMounts"));
  filters.storeMinItems = parseIntParam(searchParams.get("storeMinItems"));

  const storeItemsParam = searchParams.get("storeItems");
  if (storeItemsParam) filters.storeItems = storeItemsParam;

  filters.overpriced = parseBoolParam(searchParams.get("overpriced"));

  // ── 3. Cleanup: usuń pola `undefined` (czystszy obiekt) ────────────
  for (const key of Object.keys(filters) as (keyof BazaarFiltersUi)[]) {
    if (filters[key] === undefined) delete filters[key];
  }

  return filters;
}

/**
 * Serializuje `BazaarFiltersUi` do par klucz=wartość URL.
 * Pomija pola `undefined`, `null`, `""`. Bool → "1"/pomijane.
 */
export function buildQueryString(
  filters: BazaarFiltersUi,
  extra?: Record<string, string | number | undefined | null>,
): string {
  const params = new URLSearchParams();

  // ── AuctionFilters (klucze API) ────────────────────────────────────
  if (filters.vocation) params.set("vocation", filters.vocation);
  if (filters.region) params.set("region", filters.region);
  if (filters.world) params.set("world", filters.world);
  if (filters.pvpType) params.set("pvpType", filters.pvpType);
  if (filters.battleye) params.set("battleye", filters.battleye);
  if (filters.levelMin !== undefined) params.set("levelMin", String(filters.levelMin));
  if (filters.levelMax !== undefined) params.set("levelMax", String(filters.levelMax));
  if (filters.bidMin !== undefined) params.set("bidMin", String(filters.bidMin));
  if (filters.bidMax !== undefined) params.set("bidMax", String(filters.bidMax));
  if (filters.hasSoulWar === true) params.set("hasSoulWar", "1");
  if (filters.hasPrimalOrdeal === true) params.set("hasPrimalOrdeal", "1");
  if (filters.search) params.set("search", filters.search);
  if (filters.biddedOnly === true) params.set("biddedOnly", "1");
  if (filters.charmPointsMin !== undefined)
    params.set("charmPointsMin", String(filters.charmPointsMin));
  if (filters.charmPointsMax !== undefined)
    params.set("charmPointsMax", String(filters.charmPointsMax));
  if (filters.tcInvestedMin !== undefined)
    params.set("tcInvestedMin", String(filters.tcInvestedMin));
  if (filters.tcInvestedMax !== undefined)
    params.set("tcInvestedMax", String(filters.tcInvestedMax));

  // ── Extended (T42+) ────────────────────────────────────────────────
  for (const key of EXTRA_FILTER_KEYS) {
    const value = filters[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "boolean") {
      if (value === true) params.set(key, "1");
    } else if (typeof value === "number") {
      params.set(key, String(value));
    } else {
      params.set(key, String(value));
    }
  }

  // ── Dodatkowe (np. page, sortBy) ───────────────────────────────────
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined || value === null || value === "") continue;
      params.set(key, String(value));
    }
  }

  return params.toString();
}

// ───────────────────────────────────────────────────────────────────────
// Hook
// ───────────────────────────────────────────────────────────────────────

export interface UseBazaarFiltersReturn {
  /** Aktualny stan filtrów (z URL). */
  filters: BazaarFiltersUi;
  /**
   * Ustawia filtry. Natychmiast aktualizuje local state (optymistyczny UI),
   * debounce'uje write do URL (300 ms).
   */
  setFilters: (next: BazaarFiltersUi | ((prev: BazaarFiltersUi) => BazaarFiltersUi)) => void;
  /**
   * Resetuje WSZYSTKIE filtry (do pustego obiektu).
   * NIE resetuje paginacji/sortowania — za to odpowiada `extra` w
   * `setFilters({...}, { page: 1 })`.
   */
  reset: () => void;
  /** Czy trwa oczekiwanie na write do URL (dla skeleton). */
  isPending: boolean;
  /** Debounce delay w ms — dla UI (np. placeholder "300 ms"). */
  debounceMs: number;
}

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * useBazaarFilters — patrz opis modułu.
 *
 * @example
 * ```ts
 * const { filters, setFilters, reset } = useBazaarFilters();
 * setFilters({ vocation: "Knight", levelMin: 300, levelMax: 600 });
 * ```
 */
export function useBazaarFilters(options: { debounceMs?: number } = {}): UseBazaarFiltersReturn {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── 1. Filters z URL (read) — zawsze aktualne po nawigacji/back ───
  const filters = React.useMemo(() => readFiltersFromSearchParams(searchParams), [searchParams]);

  // ── 2. Local mirror + debounced write ─────────────────────────────
  const [localFilters, setLocalFilters] = React.useState(filters);
  const [isPending, setIsPending] = React.useState(false);

  // Sync local z URL po nawigacji (back/forward, preset apply).
  React.useEffect(() => {
    setLocalFilters(filters);
    setIsPending(false);
  }, [filters]);

  // Debounced write do URL.
  const pendingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerialized = React.useRef<string>("");

  const writeToUrl = React.useCallback(
    (next: BazaarFiltersUi) => {
      const qs = buildQueryString(next);
      // No-op jeśli identyczny z aktualnym URL-em (zapobiega
      // niepotrzebnym navigacjom podczas controlled inputs).
      if (qs === lastSerialized.current) {
        setIsPending(false);
        return;
      }
      lastSerialized.current = qs;
      router.replace(qs.length > 0 ? `?${qs}` : "?", { scroll: false });
      // URL navigation → useEffect → setIsPending(false).
      // Bezpieczny fallback po 2× debounce:
      setTimeout(() => setIsPending(false), debounceMs * 2);
    },
    [router, debounceMs],
  );

  const setFilters = React.useCallback(
    (next: BazaarFiltersUi | ((prev: BazaarFiltersUi) => BazaarFiltersUi)) => {
      const resolved =
        typeof next === "function"
          ? (next as (prev: BazaarFiltersUi) => BazaarFiltersUi)(localFilters)
          : next;
      setLocalFilters(resolved);
      setIsPending(true);

      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      pendingTimer.current = setTimeout(() => {
        writeToUrl(resolved);
        pendingTimer.current = null;
      }, debounceMs);
    },
    [localFilters, writeToUrl, debounceMs],
  );

  const reset = React.useCallback(() => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
    setLocalFilters({});
    writeToUrl({});
    setIsPending(false);
  }, [writeToUrl]);

  // Cleanup przy unmount.
  React.useEffect(() => {
    return () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, []);

  return {
    filters: localFilters,
    setFilters,
    reset,
    isPending,
    debounceMs,
  };
}
