"use client";

/**
 * useAuctionLive — hook klienta SSE z fallback chain (plan task 55, arch §8.5).
 *
 * ## Cel (arch §8.5)
 *
 * Dostarcza listę kończących się aukcji w czasie rzeczywistym. Primary
 * channel = Server-Sent Events (`EventSource` do `/api/auctions/live`).
 * Fallback chain (priorytet malejąco):
 *
 *   1. **SSE** (`<EventSource>`) — push co 30 s, natychmiastowe pierwsze dane.
 *   2. **Polling** (`fetch /api/auctions/ending` co `pollIntervalMs` ms) —
 *      SSE może być blokowane przez proxy/firewall/CORS (arch §8.5 klient
 *      snippet: "Degradacja do pollingu co 30 s").
 *   3. **Statyczny** (countdown lokalny w `AuctionCard`) — UI działa nawet
 *      bez danych; to domena hooków renderujących (T40 `AuctionCard` ma
 *      `Countdown` działający na ISO stringu `auctionEnd`).
 *
 * ## Architektura wewnętrzna
 *
 * ```
 *  AuctionLiveController (pure class)
 *     │  EventSource + setInterval / setTimeout
 *     │  EventSourceLike + injectable fetch + scheduler
 *     ▼
 *  useAuctionLive (thin React hook)
 *     │  useSyncExternalStore (React 18+)
 *     ▼
 *  React component
 * ```
 *
 * Logika SSE/polling jest wydzielona do czystej klasy
 * `AuctionLiveController` (bez React). Hook jest cienką warstwą
 * subskrybującą stan kontrolera przez `useSyncExternalStore`.
 */

import * as React from "react";

// ───────────────────────────────────────────────────────────────────────
// Typy
// ───────────────────────────────────────────────────────────────────────

/**
 * Reprezentacja jednej aukcji w strumieniu live (T55).
 */
export interface EndingAuction {
  auctionId: string;
  characterName: string;
  level: number;
  vocation: string;
  vocationBase: string;
  sex: "M" | "F";
  worldId: number;
  outfitId: number | null;
  bid: number;
  bidType: "current" | "minimum";
  auctionStart: string;
  auctionEnd: string;
  status: "active" | "finished" | "cancelled" | "sold";
  finalPrice: number | null;
  estimatedValue: number | null;
  hasSoulWar: boolean;
  hasPrimalOrdeal: boolean;
  hasWorldTransfer: boolean;
  goldTotal: string;
  worldName: string;
  worldRegion: "EU" | "NA" | "BR";
}

export type AuctionLiveStatus =
  | "connecting"
  | "live"
  | "polling"
  | "error";

export interface SsePayload {
  auctions: EndingAuction[];
  ts: number;
}

export interface EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: Event) => void) | null;
  onopen: ((event: Event) => void) | null;
  close: () => void;
}

export type EventSourceConstructor = (url: string) => EventSourceLike;

export type FetchLike = typeof fetch;

export interface SchedulerLike {
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}

export interface AuctionLiveState {
  auctions: EndingAuction[];
  status: AuctionLiveStatus;
  lastUpdate: Date | null;
}

export interface UseAuctionLiveOptions {
  enabled?: boolean;
  /** Initial auctions (SSR snapshot) — zapobiega "flash of empty state". */
  initialAuctions?: EndingAuction[];
  pollIntervalMs?: number;
  liveUrl?: string;
  pollingUrl?: string;
  eventSourceCtor?: EventSourceConstructor;
  fetchImpl?: FetchLike;
  scheduler?: SchedulerLike;
}

export interface UseAuctionLiveResult {
  auctions: EndingAuction[];
  status: AuctionLiveStatus;
  lastUpdate: Date | null;
}

// ───────────────────────────────────────────────────────────────────────
// Stałe
// ───────────────────────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_LIVE_URL = "/api/auctions/live";
const DEFAULT_POLLING_URL = "/api/auctions/ending";
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

// ───────────────────────────────────────────────────────────────────────
// Walidacja payload
// ───────────────────────────────────────────────────────────────────────

function isSsePayload(value: unknown): value is SsePayload {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.auctions)) return false;
  if (typeof obj.ts !== "number" || !Number.isFinite(obj.ts)) return false;
  return true;
}

function extractAuctionsFromPollingResponse(value: unknown): EndingAuction[] {
  if (typeof value !== "object" || value === null) return [];
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.auctions)) return [];
  return obj.auctions as EndingAuction[];
}

const DEFAULT_SCHEDULER: SchedulerLike = {
  setInterval,
  clearInterval,
  setTimeout,
  clearTimeout,
};

/**
 * Rozpoznaje środowisko i zwraca natywny EventSource.
 *
 * Zwraca `null`, gdy `EventSource` nie istnieje (SSR / Node) — **nie rzuca**.
 *
 * POPRZEDNIO rzucało to wyjątek, a konstruktor kontrolera jest wołany przez
 * `useState(() => new AuctionLiveController(...))`, czyli **także podczas SSR**.
 * Efekt: strona główna (renderuje `EndingSoonSectionLive`) zwracała 500:
 *   `Error: [useAuctionLive] EventSource is not available in this environment.`
 *
 * Istniejący test „SSR-safe" tego nie łapał, bo wstrzykiwał własny `ctor` —
 * a więc omijał właśnie tę, jedyną rzucającą, ścieżkę.
 */
function resolveEventSourceCtor(): EventSourceConstructor | null {
  const g = globalThis as unknown as { EventSource?: EventSourceConstructor };
  const ctor = g.EventSource;
  if (typeof ctor !== "function") {
    return null;
  }
  // Adapter: native EventSource ma drugi opcjonalny parametr (EventSourceInit),
  // którego nie używamy. Wrapper gwarantuje zgodność z naszym typem
  // EventSourceConstructor (który akceptuje tylko URL).
  const adapter: EventSourceConstructor = (url: string): EventSourceLike => {
    // `as unknown as new (url: string) => EventSourceLike` — bo natywny
    // EventSource ma szerszą sygnaturę konstruktora niż nasz typ.
    const NativeCtor = ctor as unknown as new (
      url: string,
    ) => EventSourceLike;
    const native = new NativeCtor(url);
    return native;
  };
  return adapter;
}

function resolveFetch(): FetchLike {
  const f = globalThis.fetch;
  if (typeof f !== "function") {
    throw new Error(
      "[useAuctionLive] fetch is not available in this environment.",
    );
  }
  return f.bind(globalThis) as FetchLike;
}

// ───────────────────────────────────────────────────────────────────────
// AuctionLiveController
// ───────────────────────────────────────────────────────────────────────

type Listener = () => void;

/**
 * Czysta klasa kontrolera SSE/polling. Bez React. Testowalna bez DOM
 * (vi.fn + fake timers + injectable ctor + fetch + scheduler).
 */
export class AuctionLiveController {
  private state: AuctionLiveState;
  private listeners = new Set<Listener>();
  private es: EventSourceLike | null = null;
  private pollHandle: ReturnType<SchedulerLike["setInterval"]> | null = null;
  private reconnectHandle: ReturnType<SchedulerLike["setTimeout"]> | null =
    null;
  private attempt = 0;
  private enabled: boolean;
  private disposed = false;

  private readonly eventSourceCtor: EventSourceConstructor | null;
  private readonly fetchImpl: FetchLike;
  private readonly scheduler: SchedulerLike;
  private readonly liveUrl: string;
  private readonly pollingUrl: string;
  private readonly pollIntervalMs: number;
  private readonly initialAuctions: EndingAuction[];

  constructor(options: UseAuctionLiveOptions = {}) {
    const {
      pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
      liveUrl = DEFAULT_LIVE_URL,
      pollingUrl = DEFAULT_POLLING_URL,
      eventSourceCtor,
      fetchImpl,
      scheduler = DEFAULT_SCHEDULER,
      initialAuctions,
      enabled,
    } = options;

    this.pollIntervalMs = pollIntervalMs;
    this.liveUrl = liveUrl;
    this.pollingUrl = pollingUrl;
    this.eventSourceCtor = eventSourceCtor ?? resolveEventSourceCtor();
    this.fetchImpl = fetchImpl ?? resolveFetch();
    this.scheduler = scheduler;
    this.enabled = enabled ?? true;
    this.initialAuctions = initialAuctions ?? [];

    this.state = {
      auctions: this.initialAuctions,
      status: "connecting",
      lastUpdate: null,
    };

    /**
     * Startujemy TYLKO gdy mamy czym połączyć się na żywo.
     *
     * Poza przeglądarką (SSR) `resolveEventSourceCtor()` zwraca `null` —
     * wtedy kontroler pozostaje pasywny: bez SSE i bez pollingu, więc
     * serwerowy render nie wykonuje żadnych żądań sieciowych. Stan zostaje
     * `"connecting"`, czyli dokładnie to, co trafia do HTML-a i co React
     * podnosi w przeglądarce.
     *
     * Testy wstrzykują własny `eventSourceCtor`, więc dla nich ta gałąź
     * zachowuje się jak w przeglądarce (i to jest zamierzone).
     */
    if (this.enabled && this.eventSourceCtor !== null) {
      this.start();
    }
  }

  // ── Public API ───────────────────────────────────────────────────

  getState(): AuctionLiveState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  setEnabled(next: boolean): void {
    if (this.disposed) return;
    if (next === this.enabled) return;
    this.enabled = next;
    if (!next) {
      this.teardownAll();
      this.setState({
        auctions: this.initialAuctions,
        status: "connecting",
        lastUpdate: null,
      });
    } else {
      this.attempt = 0;
      this.start();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.teardownAll();
    this.listeners.clear();
  }

  // ── Internals ────────────────────────────────────────────────────

  private setState(partial: Partial<AuctionLiveState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Listener throw nie powinien zabić kontrolera.
      }
    }
  }

  private teardownAll(): void {
    if (this.es !== null) {
      try {
        this.es.close();
      } catch {
        // ignore
      }
      this.es = null;
    }
    if (this.pollHandle !== null) {
      this.scheduler.clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.reconnectHandle !== null) {
      this.scheduler.clearTimeout(this.reconnectHandle);
      this.reconnectHandle = null;
    }
  }

  private start(): void {
    if (this.disposed || !this.enabled) return;

    try {
      this.connectSse();
    } catch {
      this.startPolling();
    }
  }

  private connectSse(): void {
    if (this.es !== null) return;

    // Poza przeglądarką `EventSource` nie istnieje, więc nie ma czego otwierać.
    // Rzucamy celowo: wołający `start()` ma `try/catch`, który w tym wypadku
    // przechodzi do `startPolling()` — czyli zachowanie „SSE z fallbackiem"
    // działa także w środowiskach bez SSE.
    if (this.eventSourceCtor === null) {
      throw new Error(
        "[useAuctionLive] EventSource unavailable — using polling fallback",
      );
    }

    this.setState({ status: "connecting" });

    const es = this.eventSourceCtor(this.liveUrl);
    this.es = es;

    es.onopen = (): void => {
      if (this.disposed) return;
      this.attempt = 0;
    };

    es.onmessage = (event: { data: string }): void => {
      if (this.disposed) return;
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (!isSsePayload(parsed)) {
          return;
        }
        this.setState({
          auctions: parsed.auctions,
          status: "live",
          lastUpdate: new Date(parsed.ts),
        });
        this.attempt = 0;
        if (this.pollHandle !== null) {
          this.scheduler.clearInterval(this.pollHandle);
          this.pollHandle = null;
        }
      } catch {
        // Invalid JSON — graceful.
      }
    };

    es.onerror = (): void => {
      if (this.disposed) return;
      if (this.es !== null) {
        try {
          this.es.close();
        } catch {
          // ignore
        }
        this.es = null;
      }
      // ZAWSZE triggeruj polling — nawet jeśli pollHandle już istnieje.
      // Bez tego reconnect po błędzie polling nie uruchomiłby natychmiastowej
      // ponownej próby (czekałby do następnego interwału, np. 30 s).
      this.startPolling();
    };
  }

  private startPolling(): void {
    // Zawsze uruchamiamy `fetchOnce` natychmiast (natychmiastowa ponowna
    // próba po SSE error). Interval ustawiamy tylko raz — kolejne wywołania
    // `startPolling` tylko triggerują kolejny `fetchOnce`, bez mnożenia
    // timerów.
    this.setState({ status: "polling" });

    const fetchOnce = async (): Promise<void> => {
      if (this.disposed) return;
      try {
        const res = await this.fetchImpl(this.pollingUrl, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${String(res.status)}`);
        }
        const json: unknown = await res.json();
        if (this.disposed) return;
        const next = extractAuctionsFromPollingResponse(json);
        this.setState({
          auctions: next,
          status: "polling",
          lastUpdate: new Date(),
        });
      } catch {
        if (this.disposed) return;
        this.setState({ status: "error" });
        this.scheduleReconnect();
      }
    };

    void fetchOnce();
    if (this.pollHandle === null) {
      this.pollHandle = this.scheduler.setInterval(() => {
        void fetchOnce();
      }, this.pollIntervalMs);
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.attempt,
      RECONNECT_MAX_MS,
    );
    this.attempt += 1;

    if (this.reconnectHandle !== null) {
      this.scheduler.clearTimeout(this.reconnectHandle);
    }
    this.reconnectHandle = this.scheduler.setTimeout(() => {
      this.reconnectHandle = null;
      if (this.disposed || !this.enabled) return;
      if (this.es !== null) {
        try {
          this.es.close();
        } catch {
          // ignore
        }
        this.es = null;
      }
      this.connectSse();
    }, delay);
  }
}

// ───────────────────────────────────────────────────────────────────────
// useAuctionLive
// ───────────────────────────────────────────────────────────────────────

export function useAuctionLive(
  options: UseAuctionLiveOptions = {},
): UseAuctionLiveResult {
  const [controller] = React.useState<AuctionLiveController>(
    () => new AuctionLiveController(options),
  );

  const subscribe = React.useCallback(
    (listener: () => void): (() => void) => controller.subscribe(listener),
    [controller],
  );
  const getSnapshot = React.useCallback(
    (): AuctionLiveState => controller.getState(),
    [controller],
  );

  const state = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  React.useEffect(() => {
    controller?.setEnabled(options.enabled ?? true);
  }, [controller, options.enabled]);

  React.useEffect(() => {
    return (): void => {
      controller?.dispose();
    };
  }, [controller]);

  return {
    auctions: state.auctions,
    status: state.status,
    lastUpdate: state.lastUpdate,
  };
}
