/**
 * Testy `useAuctionLive` + `AuctionLiveController` — plan task 55 (arch §8.5).
 *
 * ## Pokrycie (plan task 55 MUST: min 8 testów)
 *
 *  1. **Initial state** — mount → status='connecting', auctions=[], lastUpdate=null
 *  2. **SSE message → auctions update** — onmessage z prawidłowym JSON → auctions
 *     + status='live' + lastUpdate=Date z server `ts`
 *  3. **SSE error → switch to polling** — onerror → close ES + status='polling'
 *     + fetch polling started
 *  4. **Polling fallback działa** — fetch mock zwraca JSON → auctions updated,
 *     status='polling'
 *  5. **Polling HTTP error → status='error' + reconnect scheduled** — fetch
 *     rzuca → exponential backoff reconnect (verify delay via fake timers)
 *  6. **Exponential backoff progressive** — kolejne błędy: 2s → 4s → 8s
 *  7. **Cleanup on dispose** — controller.dispose() → es.close() + clearInterval
 *     + clearTimeout (verify mocki wywołane)
 *  8. **`enabled: false` → nie startuje** — konstruktor z enabled=false → brak
 *     EventSource, brak fetch
 *  9. **`enabled: false → true` toggle** — setEnabled(true) po disable → start
 * 10. **Invalid JSON → graceful** — prawidłowy SSE message → invalid JSON →
 *     hook nie rzuca, status pozostaje 'live'
 * 11. **Multiple messages update auctions** — dwa kolejne onmessage → drugi
 *     nadpisuje pierwszy
 * 12. **Heartbeat (": ping") → ignored** — payload bez `auctions` array → brak
 *     zmiany stanu
 *
 * Mockujemy EventSource i fetch przez **dependency injection**
 * (`eventSourceCtor`, `fetchImpl`) — bez `vi.stubGlobal('EventSource', ...)`,
 * bez DOM (`@testing-library/react`, jsdom, happy-dom). Controller jest
 * czystą klasą (testowalny bez Reacta); hook jest cienką warstwą
 * `useSyncExternalStore`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import * as React from "react";

import {
  AuctionLiveController,
  type EventSourceLike,
  type EndingAuction,
  type SchedulerLike,
  useAuctionLive,
} from "@/lib/hooks/use-auction-live";

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function makeAuction(overrides: Partial<EndingAuction> = {}): EndingAuction {
  return {
    auctionId: "2173376",
    characterName: "Test Knight",
    level: 200,
    vocation: "Elite Knight",
    vocationBase: "Knight",
    sex: "M",
    worldId: 1,
    outfitId: 1,
    bid: 100,
    bidType: "current",
    auctionStart: "2026-09-14T10:00:00.000Z",
    auctionEnd: "2026-09-14T11:00:00.000Z",
    status: "active",
    finalPrice: null,
    estimatedValue: 150,
    hasSoulWar: false,
    hasPrimalOrdeal: false,
    hasWorldTransfer: false,
    goldTotal: "1000000",
    worldName: "Antica",
    worldRegion: "EU",
    ...overrides,
  };
}

function makeFakeEventSource(): EventSourceLike & {
  emitMessage: (data: string) => void;
  emitOpen: () => void;
  emitError: () => void;
  closeMock: ReturnType<typeof vi.fn>;
} {
  let onmessage: EventSourceLike["onmessage"] = null;
  let onerror: EventSourceLike["onerror"] = null;
  let onopen: EventSourceLike["onopen"] = null;
  const closeMock = vi.fn();

  const fake: ReturnType<typeof makeFakeEventSource> = {
    get onmessage() {
      return onmessage;
    },
    set onmessage(fn) {
      onmessage = fn;
    },
    get onerror() {
      return onerror;
    },
    set onerror(fn) {
      onerror = fn;
    },
    get onopen() {
      return onopen;
    },
    set onopen(fn) {
      onopen = fn;
    },
    close: closeMock,
    emitMessage: (data: string): void => {
      onmessage?.({ data });
    },
    emitOpen: (): void => {
      onopen?.(new Event("open"));
    },
    emitError: (): void => {
      onerror?.(new Event("error"));
    },
    closeMock,
  };
  return fake;
}

function makeScheduler(): SchedulerLike {
  return {
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
}

// ───────────────────────────────────────────────────────────────────────
// 1. Initial state
// ───────────────────────────────────────────────────────────────────────

describe("AuctionLiveController — initial state", () => {
  it("startuje z pustymi auctions, status='connecting', lastUpdate=null", () => {
    const ctor = vi.fn().mockReturnValue(makeFakeEventSource());
    const c = new AuctionLiveController({ eventSourceCtor: ctor });

    const state = c.getState();
    expect(state.auctions).toEqual([]);
    expect(state.status).toBe("connecting");
    expect(state.lastUpdate).toBeNull();

    c.dispose();
  });

  it("konstruktor z enabled: false nie tworzy EventSource", () => {
    const ctor = vi.fn().mockReturnValue(makeFakeEventSource());
    const c = new AuctionLiveController({
      enabled: false,
      eventSourceCtor: ctor,
    });

    expect(ctor).not.toHaveBeenCalled();
    expect(c.getState().status).toBe("connecting");

    c.dispose();
  });

  it("akceptuje initialAuctions (SSR snapshot) jako initial state", () => {
    const ctor = vi.fn().mockReturnValue(makeFakeEventSource());
    const initial = [makeAuction({ auctionId: "ssr1" })];
    const c = new AuctionLiveController({
      enabled: false,
      eventSourceCtor: ctor,
      initialAuctions: initial,
    });

    expect(c.getState().auctions).toEqual(initial);
    expect(c.getState().auctions[0]?.auctionId).toBe("ssr1");

    c.dispose();
  });
});

// ───────────────────────────────────────────────────────────────────────
// 2. SSE message handling
// ───────────────────────────────────────────────────────────────────────

describe("AuctionLiveController — SSE message handling", () => {
  let fakeEs: ReturnType<typeof makeFakeEventSource>;
  let ctor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fakeEs = makeFakeEventSource();
    ctor = vi.fn().mockReturnValue(fakeEs);
  });

  afterEach(() => {
    fakeEs = null as unknown as ReturnType<typeof makeFakeEventSource>;
    ctor = null as unknown as ReturnType<typeof vi.fn>;
  });

  it("EventSource wiadomość z prawidłowym JSON → auctions + status='live'", () => {
    const c = new AuctionLiveController({ eventSourceCtor: ctor });
    const a1 = makeAuction({ auctionId: "1", characterName: "Alice" });
    const a2 = makeAuction({ auctionId: "2", characterName: "Bob" });

    fakeEs.emitMessage(
      JSON.stringify({ auctions: [a1, a2], ts: 1700000000000 }),
    );

    const state = c.getState();
    expect(state.auctions).toHaveLength(2);
    expect(state.auctions[0]?.characterName).toBe("Alice");
    expect(state.auctions[1]?.characterName).toBe("Bob");
    expect(state.status).toBe("live");
    expect(state.lastUpdate).toEqual(new Date(1700000000000));

    c.dispose();
  });

  it("kolejne wiadomości SSE nadpisują poprzednie auctions", () => {
    const c = new AuctionLiveController({ eventSourceCtor: ctor });

    fakeEs.emitMessage(
      JSON.stringify({
        auctions: [makeAuction({ auctionId: "1" })],
        ts: 1700000000000,
      }),
    );
    expect(c.getState().auctions).toHaveLength(1);

    fakeEs.emitMessage(
      JSON.stringify({
        auctions: [
          makeAuction({ auctionId: "2" }),
          makeAuction({ auctionId: "3" }),
          makeAuction({ auctionId: "4" }),
        ],
        ts: 1700000060000,
      }),
    );
    const state = c.getState();
    expect(state.auctions).toHaveLength(3);
    expect(state.auctions[0]?.auctionId).toBe("2");
    expect(state.lastUpdate).toEqual(new Date(1700000060000));

    c.dispose();
  });

  it("invalid JSON w wiadomości → graceful (hook nie rzuca, stan nie zmienia się)", () => {
    const c = new AuctionLiveController({ eventSourceCtor: ctor });

    // Najpierw prawidłowa wiadomość — ustaw status 'live'
    fakeEs.emitMessage(
      JSON.stringify({ auctions: [makeAuction()], ts: 1700000000000 }),
    );
    expect(c.getState().status).toBe("live");

    // Teraz invalid JSON — nie powinno rzucić, status pozostaje 'live'
    expect(() => fakeEs.emitMessage("not-json{{")).not.toThrow();
    expect(c.getState().status).toBe("live");
    expect(c.getState().auctions).toHaveLength(1);

    c.dispose();
  });

  it("heartbeat (payload bez 'auctions') → ignorowany", () => {
    const c = new AuctionLiveController({ eventSourceCtor: ctor });

    // Wiadomość BEZ pola 'auctions' (np. serwer wysłał komentarz)
    fakeEs.emitMessage(JSON.stringify({ status: "ok", heartbeat: true }));
    expect(c.getState().auctions).toEqual([]);
    expect(c.getState().status).toBe("connecting");

    c.dispose();
  });
});

// ───────────────────────────────────────────────────────────────────────
// 3. SSE error → polling fallback
// ───────────────────────────────────────────────────────────────────────

describe("AuctionLiveController — SSE error → polling fallback", () => {
  let fakeEs: ReturnType<typeof makeFakeEventSource>;
  let ctor: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fakeEs = makeFakeEventSource();
    ctor = vi.fn().mockReturnValue(fakeEs);
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ auctions: [makeAuction({ auctionId: "p1" })] }),
    });
  });

  it("onerror zamyka EventSource i startuje polling", async () => {
    const c = new AuctionLiveController({
      eventSourceCtor: ctor,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(ctor).toHaveBeenCalledTimes(1);
    expect(fakeEs.closeMock).not.toHaveBeenCalled();

    fakeEs.emitError();

    expect(fakeEs.closeMock).toHaveBeenCalled();

    // Fetch polling odpalony (pierwsze wywołanie natychmiast, bez czekania na interval)
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalled();
    const url = fetchMock.mock.calls[0]?.[0];
    expect(url).toBe("/api/auctions/ending");

    expect(c.getState().status).toBe("polling");

    c.dispose();
  });

  it("polling update stanu → auctions + lastUpdate", async () => {
    const c = new AuctionLiveController({
      eventSourceCtor: ctor,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    fakeEs.emitError();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const state = c.getState();
    expect(state.status).toBe("polling");
    expect(state.auctions).toHaveLength(1);
    expect(state.auctions[0]?.auctionId).toBe("p1");
    expect(state.lastUpdate).toBeInstanceOf(Date);

    c.dispose();
  });
});

// ───────────────────────────────────────────────────────────────────────
// 4. Polling fetch failure → status='error' + reconnect
// ───────────────────────────────────────────────────────────────────────

describe("AuctionLiveController — polling failure + exponential backoff reconnect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetch polling rzuca → status='error' + reconnect timer zaplanowany", async () => {
    const fakeEs1 = makeFakeEventSource();
    const fakeEs2 = makeFakeEventSource();
    const ctor = vi
      .fn()
      .mockReturnValueOnce(fakeEs1)
      .mockReturnValueOnce(fakeEs2);
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));

    const c = new AuctionLiveController({
      eventSourceCtor: ctor,
      fetchImpl: fetchMock as unknown as typeof fetch,
      scheduler: makeScheduler(),
    });

    expect(ctor).toHaveBeenCalledTimes(1);

    fakeEs1.emitError();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(c.getState().status).toBe("error");

    expect(ctor).toHaveBeenCalledTimes(1);

    // Advance 2s → reconnect powinien wystrzelić (pierwsza próba = 2s)
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ctor).toHaveBeenCalledTimes(2);

    c.dispose();
  });

  it("exponential backoff: 2s → 4s → 8s po kolejnych błędach", async () => {
    const fakeEsList: Array<ReturnType<typeof makeFakeEventSource>> = [];
    const ctor = vi.fn().mockImplementation(() => {
      const es = makeFakeEventSource();
      fakeEsList.push(es);
      return es;
    });
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));

    const c = new AuctionLiveController({
      eventSourceCtor: ctor,
      fetchImpl: fetchMock as unknown as typeof fetch,
      scheduler: makeScheduler(),
    });

    // Helper: trigger error na bieżącym ES + czekaj aż polling fetch się
    // nie powiedzie i zaplanuje reconnect.
    async function triggerFailureCycle(): Promise<void> {
      const idx = fakeEsList.length - 1;
      fakeEsList[idx]?.emitError();
      // Microtaski — polling fetchOnce → reject → scheduleReconnect
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }

    // attempt 0: 2s
    await triggerFailureCycle();
    expect(ctor).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(ctor).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(ctor).toHaveBeenCalledTimes(2);

    // attempt 1: 4s
    await triggerFailureCycle();
    await vi.advanceTimersByTimeAsync(3_999);
    expect(ctor).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(ctor).toHaveBeenCalledTimes(3);

    // attempt 2: 8s
    await triggerFailureCycle();
    await vi.advanceTimersByTimeAsync(7_999);
    expect(ctor).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(ctor).toHaveBeenCalledTimes(4);

    c.dispose();
  });
});

// ───────────────────────────────────────────────────────────────────────
// 5. Cleanup on dispose
// ───────────────────────────────────────────────────────────────────────

describe("AuctionLiveController — cleanup on dispose", () => {
  it("dispose() zamyka EventSource (es.close)", () => {
    const fakeEs = makeFakeEventSource();
    const ctor = vi.fn().mockReturnValue(fakeEs);
    const c = new AuctionLiveController({ eventSourceCtor: ctor });

    expect(fakeEs.closeMock).not.toHaveBeenCalled();
    c.dispose();
    expect(fakeEs.closeMock).toHaveBeenCalled();
  });

  it("dispose() jest idempotentna — wielokrotne wywołanie nie rzuca", () => {
    const fakeEs = makeFakeEventSource();
    const ctor = vi.fn().mockReturnValue(fakeEs);
    const c = new AuctionLiveController({ eventSourceCtor: ctor });

    expect(() => {
      c.dispose();
      c.dispose();
      c.dispose();
    }).not.toThrow();
    expect(fakeEs.closeMock).toHaveBeenCalledTimes(1);
  });

  it("dispose() po SSE error + polling aktywuje cleanup polling (clearInterval)", async () => {
    vi.useFakeTimers();
    const fakeEs = makeFakeEventSource();
    const ctor = vi.fn().mockReturnValue(fakeEs);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ auctions: [] }),
    });

    const c = new AuctionLiveController({
      eventSourceCtor: ctor,
      fetchImpl: fetchMock as unknown as typeof fetch,
      scheduler: makeScheduler(),
    });

    // Trigger SSE error → polling fallback
    fakeEs.emitError();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    c.dispose();

    // Advance timer o pollIntervalMs — fetch NIE powinien być wywołany ponownie
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("setEnabled(false) zamyka EventSource i czyści stan", () => {
    const fakeEs = makeFakeEventSource();
    const ctor = vi.fn().mockReturnValue(fakeEs);
    const c = new AuctionLiveController({ eventSourceCtor: ctor });

    fakeEs.emitMessage(
      JSON.stringify({ auctions: [makeAuction()], ts: 1700000000000 }),
    );
    expect(c.getState().auctions).toHaveLength(1);

    c.setEnabled(false);
    expect(fakeEs.closeMock).toHaveBeenCalled();
    expect(c.getState().status).toBe("connecting");
    expect(c.getState().lastUpdate).toBeNull();

    c.dispose();
  });

  it("setEnabled(false → true) restartuje EventSource", () => {
    const fakeEs1 = makeFakeEventSource();
    const fakeEs2 = makeFakeEventSource();
    const ctor = vi
      .fn()
      .mockReturnValueOnce(fakeEs1)
      .mockReturnValueOnce(fakeEs2);
    const c = new AuctionLiveController({ eventSourceCtor: ctor });

    expect(ctor).toHaveBeenCalledTimes(1);
    c.setEnabled(false);
    c.setEnabled(true);
    expect(ctor).toHaveBeenCalledTimes(2);

    c.dispose();
  });
});

// ───────────────────────────────────────────────────────────────────────
// 6. React hook integration (SSR-safe)
// ───────────────────────────────────────────────────────────────────────

describe("useAuctionLive — React hook integration (SSR-safe)", () => {
  it("renderuje się w SSR bez rzucania (lazy EventSource resolution)", () => {
    const fakeEs = makeFakeEventSource();
    const ctor = vi.fn().mockReturnValue(fakeEs);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auctions: [] }),
    });

    function Probe(): React.ReactElement {
      const live = useAuctionLive({
        eventSourceCtor: ctor,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      return React.createElement("div", { "data-status": live.status });
    }

    const html = renderToString(React.createElement(Probe));
    expect(html).toContain('data-status="connecting"');
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("zwraca initial state z enabled: false bez tworzenia EventSource", () => {
    const ctor = vi.fn().mockReturnValue(makeFakeEventSource());

    function Probe(): React.ReactElement {
      const live = useAuctionLive({
        enabled: false,
        eventSourceCtor: ctor,
      });
      return React.createElement("div", {
        "data-status": live.status,
        "data-count": String(live.auctions.length),
      });
    }

    const html = renderToString(React.createElement(Probe));
    expect(html).toContain('data-status="connecting"');
    expect(html).toContain('data-count="0"');
    expect(ctor).not.toHaveBeenCalled();
  });
});
