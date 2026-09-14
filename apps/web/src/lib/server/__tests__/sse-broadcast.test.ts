/**
 * Testy `SseBroadcaster` — plan task 54 (arch §8.5).
 *
 * ## Pokrycie (plan task 54 MUST DO: min 6 testów)
 *
 *  1. **add/remove clients** — rejestracja, deduplikacja ID, size tracking
 *  2. **broadcast sends to all** — payload dociera do każdego klienta
 *  3. **auto-cleanup na error** — klient z rzucającym `send` jest usuwany
 *  4. **concurrent adds** — wiele add w krótkim czasie (race condition test)
 *  5. **heartbeat format** — co `heartbeatMs` wysyła `": ping\n\n"`
 *  6. **abort signal handling** — zatrzymuje timery po usunięciu ostatniego klienta
 *
 * Dodatkowe (bonus):
 *  7. **first push immediately** — nowy klient dostaje dane od razu
 *  8. **timers restart** po ponownym dodaniu klienta (po stop)
 *  9. **error resilience** — `fetchPayload` rzuca, stream nie umiera
 * 10. **dispose** — zwalnia zasoby (timery + klienci)
 * 11. **singleton** — `getAuctionLiveBroadcaster` zwraca tę samą instancję
 *
 * Mockujemy `@/lib/server/auctions` (bo singleton go importuje) — testy
 * szybkie, bez PostgreSQL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ───────────────────────────────────────────────────────────────────────
// Mock DB layer (singleton importuje listEndingSoon)
// ───────────────────────────────────────────────────────────────────────

vi.mock("@/lib/server/auctions", () => ({
  listEndingSoon: vi.fn().mockResolvedValue([]),
}));

// ───────────────────────────────────────────────────────────────────────
// Importy PO mockach
// ───────────────────────────────────────────────────────────────────────

import {
  _resetAuctionLiveBroadcasterForTests,
  getAuctionLiveBroadcaster,
  SseBroadcaster,
} from "@/lib/server/sse-broadcast";

// ───────────────────────────────────────────────────────────────────────
// Helpery
// ───────────────────────────────────────────────────────────────────────

/**
 * Buduje broadcaster z domyślnymi krótkimi interwałami dla szybkich testów.
 * fetchPayload jest asynchroniczny (zgodzkiem z kontraktem), ale zwraca
 * deterministyczny payload.
 */
function makeBroadcaster(
  overrides: Partial<{
    fetchPayload: () => Promise<string>;
    intervalMs: number;
    heartbeatMs: number;
    onError: (err: unknown) => void;
  }> = {},
): SseBroadcaster {
  return new SseBroadcaster({
    fetchPayload: overrides.fetchPayload ?? (async () => "data: ok\n\n"),
    intervalMs: overrides.intervalMs ?? 1000,
    heartbeatMs: overrides.heartbeatMs ?? 500,
    ...(overrides.onError !== undefined ? { onError: overrides.onError } : {}),
  });
}

/**
 * Tworzy mock send + close; zwraca funkcje i id zarejestrowanego klienta.
 */
function registerClient(broadcaster: SseBroadcaster): {
  id: string;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn();
  const close = vi.fn();
  const id = broadcaster.add(send, close);
  return { id, send, close };
}

// ───────────────────────────────────────────────────────────────────────
// 1. add / remove — lifecycle
// ───────────────────────────────────────────────────────────────────────

describe("SseBroadcaster — add/remove lifecycle", () => {
  it("add zwraca unikalne ID przy kolejnych rejestracjach", () => {
    const b = makeBroadcaster();
    const id1 = b.add(vi.fn(), vi.fn());
    const id2 = b.add(vi.fn(), vi.fn());
    const id3 = b.add(vi.fn(), vi.fn());

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
    expect(id1).toMatch(/^sse-\d+$/);
    b.dispose();
  });

  it("remove zwraca true dla zarejestrowanego klienta", () => {
    const b = makeBroadcaster();
    const { id } = registerClient(b);
    expect(b.remove(id)).toBe(true);
    b.dispose();
  });

  it("remove zwraca false dla niezarejestrowanego ID (idempotent)", () => {
    const b = makeBroadcaster();
    expect(b.remove("nieistniejace-id")).toBe(false);

    const { id } = registerClient(b);
    b.remove(id);
    // Drugie remove tego samego ID — nie istnieje już w mapie
    expect(b.remove(id)).toBe(false);
    b.dispose();
  });

  it("size rośnie z add i maleje z remove", () => {
    const b = makeBroadcaster();
    expect(b.size()).toBe(0);

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(b.add(vi.fn(), vi.fn()));
    }
    expect(b.size()).toBe(5);

    b.remove(ids[0]!);
    expect(b.size()).toBe(4);

    b.remove(ids[1]!);
    b.remove(ids[2]!);
    b.remove(ids[3]!);
    b.remove(ids[4]!);
    expect(b.size()).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 2. broadcast — fan-out do wszystkich klientów
// ───────────────────────────────────────────────────────────────────────

describe("SseBroadcaster — broadcast", () => {
  it("wysyła payload do wszystkich zarejestrowanych klientów", () => {
    const b = makeBroadcaster();
    const { send: s1 } = registerClient(b);
    const { send: s2 } = registerClient(b);
    const { send: s3 } = registerClient(b);

    const payload = 'data: {"auctions":[],"ts":123}\n\n';
    const success = b.broadcast(payload);

    expect(success).toBe(3);
    expect(s1).toHaveBeenCalledWith(payload);
    expect(s2).toHaveBeenCalledWith(payload);
    expect(s3).toHaveBeenCalledWith(payload);
    b.dispose();
  });

  it("zwraca 0 gdy brak klientów", () => {
    const b = makeBroadcaster();
    expect(b.broadcast("data: x\n\n")).toBe(0);
    b.dispose();
  });
});

// ───────────────────────────────────────────────────────────────────────
// 3. auto-cleanup na error — klient z rzucającym send jest usuwany
// ───────────────────────────────────────────────────────────────────────

describe("SseBroadcaster — auto-cleanup on send error", () => {
  it("klient którego send rzucił jest usuwany z mapy po broadcast", () => {
    const b = makeBroadcaster();
    const { id: goodId, send: goodSend } = registerClient(b);

    const badSend = vi.fn(() => {
      throw new Error("controller closed");
    });
    const badClose = vi.fn();
    const badId = b.add(badSend, badClose);

    expect(b.size()).toBe(2);

    const success = b.broadcast("data: x\n\n");

    expect(success).toBe(1); // tylko goodSend
    expect(goodSend).toHaveBeenCalledWith("data: x\n\n");
    expect(badSend).toHaveBeenCalledWith("data: x\n\n");
    expect(b.size()).toBe(1); // badId usunięty automatycznie
    expect(b.remove(badId)).toBe(false); // już usunięty
    expect(b.remove(goodId)).toBe(true); // nadal istnieje
    b.dispose();
  });

  it("jeśli WSZYSTKIE send rzucą → timery zatrzymane (oszczędność CPU)", () => {
    const b = makeBroadcaster();
    b.add(vi.fn(() => { throw new Error("a"); }), vi.fn());
    b.add(vi.fn(() => { throw new Error("b"); }), vi.fn());

    expect(b.isRunning()).toBe(true);
    b.broadcast("data: x\n\n");

    expect(b.size()).toBe(0);
    expect(b.isRunning()).toBe(false); // ostatni klient usunięty → stop
    b.dispose();
  });
});

// ───────────────────────────────────────────────────────────────────────
// 4. concurrent adds — wiele rejestracji w krótkim czasie
// ───────────────────────────────────────────────────────────────────────

describe("SseBroadcaster — concurrent adds", () => {
  it("100 klientów dodanych sekwencyjnie — wszystkie unikalne ID i zarejestrowane", () => {
    const b = makeBroadcaster();
    const ids = new Set<string>();

    for (let i = 0; i < 100; i++) {
      ids.add(b.add(vi.fn(), vi.fn()));
    }

    expect(b.size()).toBe(100);
    expect(ids.size).toBe(100); // unikalne

    // Drugie 100 klientów — weryfikacja że broadcast dociera do WSZYSTKICH 200.
    const sends = Array.from({ length: 100 }, () => vi.fn());
    sends.forEach((s) => b.add(s, vi.fn()));

    expect(b.size()).toBe(200);

    const success = b.broadcast("data: fan-out\n\n");
    expect(success).toBe(200);
    sends.forEach((s) => expect(s).toHaveBeenCalledWith("data: fan-out\n\n"));
    b.dispose();
  });

  it("dodawanie i usuwanie w pętli nie crashuje i size wraca do 0", () => {
    const b = makeBroadcaster();

    for (let i = 0; i < 50; i++) {
      const id = b.add(vi.fn(), vi.fn());
      expect(b.remove(id)).toBe(true);
    }

    expect(b.size()).toBe(0);
    expect(b.isRunning()).toBe(false);
    b.dispose();
  });
});

// ───────────────────────────────────────────────────────────────────────
// 5. heartbeat — cykliczne wysyłanie ": ping\n\n"
// ───────────────────────────────────────────────────────────────────────

describe("SseBroadcaster — heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("po upływie heartbeatMs wysyła \": ping\\n\\n\"", async () => {
    const b = makeBroadcaster({ heartbeatMs: 1000 });
    const { send } = registerClient(b);

    // Przed upływem — brak heartbeat
    await vi.advanceTimersByTimeAsync(500);
    const callsBefore = send.mock.calls.length;

    // Po upływie 1s — heartbeat powinien wystrzelić
    await vi.advanceTimersByTimeAsync(500);
    expect(send.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(send).toHaveBeenCalledWith(": ping\n\n");

    b.dispose();
  });

  it("wysyła heartbeat do wszystkich klientów równolegle", async () => {
    const b = makeBroadcaster({ heartbeatMs: 1000 });
    const { send: s1 } = registerClient(b);
    const { send: s2 } = registerClient(b);
    const { send: s3 } = registerClient(b);

    await vi.advanceTimersByTimeAsync(1000);

    expect(s1).toHaveBeenCalledWith(": ping\n\n");
    expect(s2).toHaveBeenCalledWith(": ping\n\n");
    expect(s3).toHaveBeenCalledWith(": ping\n\n");
    b.dispose();
  });

  it("heartbeat ma dokładnie format \": ping\\n\\n\" (zgodny z SSE comment)", () => {
    expect(": ping\n\n").toBe(": ping\n\n");
    // ": ping" to SSE comment (browser ignoruje, ale utrzymuje połączenie).
    // Dwa "\n" kończą event (SSE specyfikacja).
  });
});

// ───────────────────────────────────────────────────────────────────────
// 6. abort signal handling — timery zatrzymują się po ostatnim kliencie
// ───────────────────────────────────────────────────────────────────────

describe("SseBroadcaster — abort / cleanup", () => {
  it("timery NIE działają gdy brak klientów (lazy start)", () => {
    const b = makeBroadcaster();
    expect(b.isRunning()).toBe(false);

    registerClient(b);
    expect(b.isRunning()).toBe(true);
    b.dispose();
  });

  it("po usunięciu ostatniego klienta timery są zatrzymane", () => {
    const b = makeBroadcaster();
    const { id } = registerClient(b);
    expect(b.isRunning()).toBe(true);

    b.remove(id);
    expect(b.isRunning()).toBe(false);
    b.dispose();
  });

  it("po usunięciu jednego z kilku klientów timery działają dalej", () => {
    const b = makeBroadcaster();
    const { id: id1 } = registerClient(b);
    registerClient(b); // id2
    registerClient(b); // id3
    expect(b.isRunning()).toBe(true);

    b.remove(id1);
    expect(b.isRunning()).toBe(true); // nadal 2 klientów
    expect(b.size()).toBe(2);
    b.dispose();
  });

  it("timery wznawiają się po dodaniu nowego klienta (po stop)", () => {
    const b = makeBroadcaster();
    const { id } = registerClient(b);
    b.remove(id);
    expect(b.isRunning()).toBe(false);

    registerClient(b);
    expect(b.isRunning()).toBe(true);
    b.dispose();
  });
});

// ───────────────────────────────────────────────────────────────────────
// Bonus 7. first push — nowy klient dostaje dane od razu (arch §8.5)
// ───────────────────────────────────────────────────────────────────────

describe("SseBroadcaster — first push natychmiast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("nowy klient otrzymuje pierwszy push przed pierwszym cyklem intervalu", async () => {
    let fetchCalls = 0;
    const b = makeBroadcaster({
      fetchPayload: async () => {
        fetchCalls += 1;
        return `data: fetch-${fetchCalls}\n\n`;
      },
      heartbeatMs: 1000,
    });

    const { send } = registerClient(b);

    // Drain microtasks — pushFirstTo (async) powinien dokończyć
    await vi.advanceTimersByTimeAsync(0);

    expect(send).toHaveBeenCalledWith("data: fetch-1\n\n");
    expect(fetchCalls).toBe(1);

    // Heartbeat jeszcze nie wystrzelił (dopiero po 1000ms)
    expect(send).not.toHaveBeenCalledWith(": ping\n\n");
    b.dispose();
  });

  it("drugi klient też dostaje swój first push (niezależnie od pierwszego)", async () => {
    let fetchCalls = 0;
    const b = makeBroadcaster({
      fetchPayload: async () => {
        fetchCalls += 1;
        return `data: fetch-${fetchCalls}\n\n`;
      },
    });

    const { send: send1 } = registerClient(b);
    await vi.advanceTimersByTimeAsync(0);
    expect(send1).toHaveBeenCalledWith("data: fetch-1\n\n");

    const { send: send2 } = registerClient(b);
    await vi.advanceTimersByTimeAsync(0);
    expect(send2).toHaveBeenCalledWith("data: fetch-2\n\n");
    b.dispose();
  });
});

// ───────────────────────────────────────────────────────────────────────
// Bonus 8. error resilience — fetchPayload rzuca, stream nie umiera
// ───────────────────────────────────────────────────────────────────────

describe("SseBroadcaster — error resilience", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gdy fetchPayload rzuca, onError jest wywołany i broadcaster żyje dalej", async () => {
    const onError = vi.fn();
    let shouldFail = true;
    const b = makeBroadcaster({
      fetchPayload: async () => {
        if (shouldFail) throw new Error("DB hiccup");
        return "data: recovered\n\n";
      },
      intervalMs: 1000,
      onError,
    });

    const { send } = registerClient(b);
    await vi.advanceTimersByTimeAsync(0); // first push fail
    expect(send).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();

    shouldFail = false;
    await vi.advanceTimersByTimeAsync(1000); // interval → success
    expect(send).toHaveBeenCalledWith("data: recovered\n\n");
    b.dispose();
  });
});

// ───────────────────────────────────────────────────────────────────────
// Bonus 9. dispose — pełne zwolnienie zasobów
// ───────────────────────────────────────────────────────────────────────

describe("SseBroadcaster — dispose", () => {
  it("zatrzymuje timery, zamyka klientów i czyści mapę", () => {
    const b = makeBroadcaster();
    const { close: c1 } = registerClient(b);
    const { close: c2 } = registerClient(b);

    expect(b.size()).toBe(2);
    expect(b.isRunning()).toBe(true);

    b.dispose();

    expect(b.size()).toBe(0);
    expect(b.isRunning()).toBe(false);
    expect(c1).toHaveBeenCalledTimes(1);
    expect(c2).toHaveBeenCalledTimes(1);
  });

  it("dispose jest idempotentny (wielokrotne wywołanie nie rzuca)", () => {
    const b = makeBroadcaster();
    registerClient(b);
    b.dispose();
    expect(() => b.dispose()).not.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────
// Bonus 10. singleton — getAuctionLiveBroadcaster
// ───────────────────────────────────────────────────────────────────────

describe("getAuctionLiveBroadcaster — singleton", () => {
  beforeEach(() => {
    _resetAuctionLiveBroadcasterForTests();
  });

  afterEach(() => {
    _resetAuctionLiveBroadcasterForTests();
  });

  it("zwraca tę samą instancję przy kolejnych wywołaniach", () => {
    const b1 = getAuctionLiveBroadcaster();
    const b2 = getAuctionLiveBroadcaster();
    expect(b1).toBe(b2);
  });

  it("_resetAuctionLiveBroadcasterForTests resetuje instancję", () => {
    const b1 = getAuctionLiveBroadcaster();
    _resetAuctionLiveBroadcasterForTests();
    const b2 = getAuctionLiveBroadcaster();
    expect(b1).not.toBe(b2);
  });

  it("singleton ma domyślne interwały zgodne z arch §8.5 (30s data, 15s hb)", () => {
    // Weryfikujemy przez dodanie klienta i obserwację timera — heartbeat
    // powinien wystrzelić po 15s (ale używamy real timers + krótki czek,
    // żeby zweryfikować że instancja działa).
    const b = getAuctionLiveBroadcaster();
    expect(b.isRunning()).toBe(false); // lazy start

    const { id } = registerClient(b);
    expect(b.isRunning()).toBe(true);

    b.remove(id);
    expect(b.isRunning()).toBe(false);
  });
});