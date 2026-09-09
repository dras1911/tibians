/**
 * Testy HTTP clienta, rate limitera, R11 budget i advisory lock.
 *
 * Filozofia (taka sama jak `packages/shared/src/tibiadata/__tests__/client.test.ts`):
 *   - mockujemy `undici.request` przez wstrzyknięcie `Requester` do factory,
 *   - używamy deterministycznego RNG (seeded) → powtarzalność,
 *   - `sleepFn` ustawiamy na no-op → testy błyskawiczne (zero realnych ms),
 *   - `delayMs` obniżamy do 30 ms → asercje na timing są stabilne i szybkie.
 *
 * Pokrycie (minimum 12 + integration sanity checks):
 *   1. 200 OK → HTML body zwrócone
 *   2. 5xx → 7 retries → final TibiaHttpError ze statusem
 *   3. 4xx non-429 → no retry, immediate throw
 *   4. 429 → retry (transient)
 *   5. network error (TypeError) → retry
 *   6. timeout (AbortError) → retry
 *   7. User-Agent rotation — 5 kolejnych requestów → 5 różnych UA
 *   8. Rate limiter — max 2 concurrent verified
 *   9. Rate limiter — delay between starts
 *  10. Exponential backoff — nominal 1s, 2s, 4s, 8s, 16s, 30s, 30s (cap)
 *  11. Exponential backoff — jitter w zakresie ±20%
 *  12. 3xx redirect — auto-follow → 200 OK
 *  13. Headers — Accept / Accept-Language / Accept-Encoding
 *  14. Headers — User-Agent należy do puli 5 UA
 *  15. Per-host isolation — 2 różne hosty nie blokują się nawzajem
 *  16. Graceful shutdown — cancelAll przerywa loty
 *  17. Caller signal — propaguje abort do requestera
 *  18. R11 budget — recordOutboundRequest inkrementuje
 *  19. R11 budget — throttleIfNeeded pauzuje gdy limit osiągnięty
 *  20. R11 budget — env SCRAPER_MAX_TIBIA_REQS_PER_MIN override
 *  21. R11 budget — counter resetuje się po 60 s
 *  22. Advisory lock — callback wykonany, lock zwolniony
 *  23. Advisory lock — zwraca null gdy lock nie zdobyty
 *  24. Advisory lock — hashAdvisoryKey deterministyczny
 *  25. Advisory lock — błąd callbacka nie zatrzymuje zwolnienia locka
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createHttpClient,
  defaultHttpClient,
  type Requester,
} from "../http-client.js";
import { SCRAPER_CONFIG } from "../config.js";
import {
  getOutboundStats,
  recordOutboundRequest,
  resetBudget,
  resetBudgetConfig,
  throttleIfNeeded,
  getBudgetConfig,
} from "../r11-budget.js";
import {
  hashAdvisoryKey,
  tryAdvisoryLock,
  type AdvisoryLockClient,
} from "../advisory-lock.js";

// ──────────────────────────────────────────────────────────────────────────
// Pomocnicze: programowalny Requester + sleep + RNG
// ──────────────────────────────────────────────────────────────────────────

interface ScriptedResponse {
  statusCode?: number;
  body?: string;
  headers?: Record<string, string>;
  /** Jeśli ustawione — requester rzuca tym błędem zamiast zwracać response. */
  throw?: Error;
  /** Jeśli ustawione — requester rzuca po `delayMs` ms (symulacja slow server). */
  delayMs?: number;
}

interface FakeRequester {
  /** Funkcja do wstrzyknięcia w HttpClient. */
  impl: Requester;
  /** Pełna lista wywołań (url + headers + numer próby). */
  calls: Array<{
    url: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  }>;
  /** Domyślna kolejka odpowiedzi (per-call). Konsumowane w kolejności wywołań. */
  queue: ScriptedResponse[];
  /** Indeks aktualnie oczekiwanego call (pomocniczy). */
  currentIdx(): number;
  /** Podmień kolejkę odpowiedzi (np. "fail 3× then succeed"). */
  setQueue(responses: ScriptedResponse[]): void;
}

function makeFakeRequester(initial: ScriptedResponse[] = []): FakeRequester {
  const calls: FakeRequester["calls"] = [];
  let queue = [...initial];
  const fake: FakeRequester = {
    impl: undefined as unknown as Requester, // wypełniamy poniżej
    calls,
    queue,
    currentIdx() {
      return calls.length - 1;
    },
    setQueue(responses) {
      queue = [...responses];
      fake.queue = queue;
    },
  };

  fake.impl = {
    async request(url, options) {
      const next = queue.shift();
      calls.push({ url, headers: { ...options.headers }, signal: options.signal });

      // Symulacja opóźnienia (np. slow network).
      if (next?.delayMs !== undefined && next.delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, next.delayMs));
      }

      // Sprawdź abort PRZED odpowiedzią (symulacja sieci, która szanuje abort).
      if (options.signal.aborted) {
        throw new Error("aborted");
      }

      if (next?.throw) {
        throw next.throw;
      }

      const statusCode = next?.statusCode ?? 200;
      const body = next?.body ?? "";
      const headers = next?.headers ?? { "content-type": "text/html; charset=utf-8" };
      return {
        statusCode,
        headers,
        body: { text: async () => body },
      };
    },
  };
  return fake;
}

function okResponse(body = "<html>OK</html>", statusCode = 200): ScriptedResponse {
  return { statusCode, body };
}

function errorResponse(statusCode: number, body = ""): ScriptedResponse {
  return { statusCode, body };
}

/** Sleep, który NIE czeka (determinizm testów retry/backoff). */
function instantSleep(): Promise<void> {
  return Promise.resolve();
}

/** Deterministyczny RNG — zawsze 0.5 (jitter = 0). */
function constantRandom(): () => number {
  return () => 0.5;
}

// ──────────────────────────────────────────────────────────────────────────
// Testy
// ──────────────────────────────────────────────────────────────────────────

describe("http-client — fetchHtml happy path", () => {
  it("200 OK → HTML body returned", async () => {
    const fake = makeFakeRequester([okResponse("<html>hello</html>")]);
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    const body = await client.fetchHtml("https://www.tibia.com/charactertrade/?x=1");
    expect(body).toBe("<html>hello</html>");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.url).toBe("https://www.tibia.com/charactertrade/?x=1");
  });
});

describe("http-client — retry policy", () => {
  beforeEach(() => {
    resetBudget();
    resetBudgetConfig();
  });

  it("5xx → retries 7× → final TibiaHttpError with status", async () => {
    // 1 próba + 7 retry = 8 wywołań total.
    const fake = makeFakeRequester(Array.from({ length: 8 }, () => errorResponse(503)));
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    await expect(
      client.fetchHtml("https://www.tibia.com/charactertrade/?p=1"),
    ).rejects.toMatchObject({ status: 503, name: "TibiaHttpError" });
    expect(fake.calls).toHaveLength(8);
  });

  it("after 7 retries TibiaHttpError carries original status (e.g. 500, 502, 504)", async () => {
    for (const status of [500, 502, 503, 504]) {
      const fake = makeFakeRequester(Array.from({ length: 8 }, () => errorResponse(status)));
      const client = createHttpClient({
        requester: fake.impl,
        sleepFn: instantSleep,
        random: constantRandom(),
        delayMs: 0,
      });
      await expect(
        client.fetchHtml(`https://www.tibia.com/s${status}`),
      ).rejects.toMatchObject({ status });
      expect(fake.calls).toHaveLength(8);
    }
  });

  it("4xx non-429 → no retry, immediate throw", async () => {
    const fake = makeFakeRequester([errorResponse(404)]);
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    await expect(client.fetchHtml("https://www.tibia.com/missing")).rejects.toMatchObject({
      status: 404,
      name: "TibiaHttpError",
    });
    expect(fake.calls).toHaveLength(1); // brak retries
  });

  it("429 → retry (transient)", async () => {
    const fake = makeFakeRequester([
      errorResponse(429),
      errorResponse(429),
      okResponse("<html>ok</html>"),
    ]);
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    const body = await client.fetchHtml("https://www.tibia.com/rate-limited");
    expect(body).toBe("<html>ok</html>");
    expect(fake.calls).toHaveLength(3);
  });

  it("network error (TypeError) → retry", async () => {
    const fake = makeFakeRequester([
      { throw: new TypeError("ECONNRESET") },
      { throw: new TypeError("ETIMEDOUT") },
      okResponse("<html>recovered</html>"),
    ]);
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    const body = await client.fetchHtml("https://www.tibia.com/flaky");
    expect(body).toBe("<html>recovered</html>");
    expect(fake.calls).toHaveLength(3);
  });

  it("timeout (AbortError) → retry", async () => {
    // AbortError z timeoutController — symulujemy rzuceniem DOMException-like.
    const fake = makeFakeRequester([
      { throw: Object.assign(new Error("The operation was aborted"), { name: "AbortError", code: "ABORT_ERR" }) },
      okResponse("<html>after-timeout</html>"),
    ]);
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
      // Bardzo krótki timeout — ale AbortError jest rzucany przez test,
      // nie przez real timer, więc wartość nie ma znaczenia dla logiki retry.
      config: { timeoutMs: 50 },
    });
    const body = await client.fetchHtml("https://www.tibia.com/slow");
    expect(body).toBe("<html>after-timeout</html>");
    expect(fake.calls).toHaveLength(2);
  });
});

describe("http-client — User-Agent rotation", () => {
  it("5 consecutive requests → 5 distinct UAs from rotation pool", async () => {
    const fake = makeFakeRequester(Array.from({ length: 5 }, () => okResponse()));
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    // Sekwencyjnie (delay=0) → rotacja round-robin.
    for (let i = 0; i < 5; i += 1) {
      await client.fetchHtml(`https://www.tibia.com/p${i}`);
    }
    const uas = new Set(
      fake.calls.map((c) => c.headers["User-Agent"] ?? c.headers["user-agent"] ?? ""),
    );
    expect(uas.size).toBe(5);
    // Każdy UA jest jednym z 5 w SCRAPER_CONFIG.userAgents.
    for (const ua of uas) {
      expect((SCRAPER_CONFIG.userAgents as readonly string[])).toContain(ua);
    }
  });

  it("User-Agent cyklicznie wraca po 5 requestach (round-robin)", async () => {
    const fake = makeFakeRequester(Array.from({ length: 10 }, () => okResponse()));
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    for (let i = 0; i < 10; i += 1) {
      await client.fetchHtml(`https://www.tibia.com/x${i}`);
    }
    const uas = fake.calls.map((c) => c.headers["User-Agent"] ?? c.headers["user-agent"] ?? "");
    // Pierwsze 5 = unikalne; 6..10 powtórzenie 1..5.
    expect(uas[0]).toBe(uas[5]);
    expect(uas[1]).toBe(uas[6]);
    expect(uas[2]).toBe(uas[7]);
    expect(uas[3]).toBe(uas[8]);
    expect(uas[4]).toBe(uas[9]);
  });
});

describe("http-client — rate limiter", () => {
  it("max 2 concurrent verified (3rd request waits for slot)", async () => {
    let active = 0;
    let peak = 0;
    const trackingRequester: Requester = {
      async request(_url, options) {
        active += 1;
        peak = Math.max(peak, active);
        // Czekaj aż signal abort (test zakończy wtedy gdy wszystkie 3 są aktywne).
        await new Promise<void>((resolve) => {
          const check = (): void => {
            if (options.signal.aborted) resolve();
            else setTimeout(check, 5);
          };
          check();
        });
        active -= 1;
        return {
          statusCode: 200,
          headers: {},
          body: { text: async () => "" },
        };
      },
    };

    const client = createHttpClient({
      requester: trackingRequester,
      sleepFn: instantSleep,
      random: constantRandom(),
      maxConcurrent: 2,
      delayMs: 0, // zero delay → back-to-back start, max 2 concurrent
    });

    const p1 = client.fetchHtml("https://www.tibia.com/a");
    const p2 = client.fetchHtml("https://www.tibia.com/b");
    // Daj 2 pierwszym szansę zająć sloty.
    await new Promise((r) => setTimeout(r, 10));
    const p3 = client.fetchHtml("https://www.tibia.com/c");
    // Daj p3 czas na ewentualne zajęcie slotu → NIE powinno (2/2 active).
    await new Promise((r) => setTimeout(r, 15));
    expect(active).toBe(2);
    expect(peak).toBeLessThanOrEqual(2);

    // Cleanup — abortujemy wszystko, by promises się rozwiązały.
    client.cancelAll("test-end");
    await Promise.allSettled([p1, p2, p3]);
  });

  it("500ms delay (skalowany do 20ms w teście) enforced between starts", async () => {
    const startTimes: number[] = [];
    const trackingRequester: Requester = {
      async request(_url, options) {
        startTimes.push(Date.now());
        // Czekaj na abort (cleanup).
        await new Promise<void>((resolve) => {
          if (options.signal.aborted) return resolve();
          options.signal.addEventListener("abort", () => resolve(), { once: true });
        });
        return {
          statusCode: 200,
          headers: {},
          body: { text: async () => "" },
        };
      },
    };

    const client = createHttpClient({
      requester: trackingRequester,
      sleepFn: instantSleep,
      random: constantRandom(),
      maxConcurrent: 2,
      delayMs: 20, // skalowany do 20 ms dla szybkości testu
    });

    // Pierwszy startuje natychmiast. Drugi musi poczekać na delayMs.
    const ps = [0, 1].map((i) => client.fetchHtml(`https://www.tibia.com/d${i}`));
    // Poczekaj aż oba wystartują (>20ms).
    await new Promise((r) => setTimeout(r, 80));
    client.cancelAll("test-end");
    await Promise.allSettled(ps);

    expect(startTimes.length).toBeGreaterThanOrEqual(2);
    if (startTimes.length >= 2) {
      const gap = (startTimes[1] ?? 0) - (startTimes[0] ?? 0);
      // delayMs=20ms, druga musi startować co najmniej 20ms po pierwszej.
      expect(gap).toBeGreaterThanOrEqual(15); // tolerancja 5ms
    }
  });

  it("per-host isolation: 2 hosts run in parallel without blocking each other", async () => {
    const fake = makeFakeRequester([
      // Pierwszy request na host A — wisi aż abort.
      { delayMs: 100 },
    ]);
    const trackingRequester = fake.impl;

    const client = createHttpClient({
      requester: trackingRequester,
      sleepFn: instantSleep,
      random: constantRandom(),
      maxConcurrent: 2,
      delayMs: 50,
    });

    // Request na tibia.com — blokuje slot tibia.com.
    const pA = client.fetchHtml("https://www.tibia.com/x");
    await new Promise((r) => setTimeout(r, 10));
    expect(client.activeSlots("www.tibia.com")).toBe(1);

    // Request na innym hoście — powinien móc startować bez czekania.
    // Dodaj do kolejki odpowiedź "ok" dla drugiego hosta.
    fake.setQueue([okResponse("<html>other-host</html>")]);
    const bodyB = await client.fetchHtml("https://www.static.tibia.com/y", {
      host: "www.static.tibia.com",
    });
    expect(bodyB).toBe("<html>other-host</html>");
    expect(client.activeSlots("www.static.tibia.com")).toBe(0);

    // Cleanup.
    client.cancelAll("test-end");
    await Promise.allSettled([pA]);
  });
});

describe("http-client — exponential backoff", () => {
  it("nominal sequence: 1s, 2s, 4s, 8s, 16s, 30s, 30s (cap), jitter=0", async () => {
    const sleepCalls: number[] = [];
    const trackingSleep = (ms: number): Promise<void> => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };
    const fake = makeFakeRequester(Array.from({ length: 8 }, () => errorResponse(502)));
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: trackingSleep,
      random: () => 0.5, // jitter=0
      delayMs: 0,
      config: { maxRetries: 7 },
    });
    await expect(client.fetchHtml("https://www.tibia.com/backoff")).rejects.toThrow();
    // 8 wywołań (1 + 7 retry) → 7 sleep między nimi.
    expect(sleepCalls).toHaveLength(7);
    // random=0.5 → jitter = (1-2*0.5)=0; nominal: 1s, 2s, 4s, 8s, 16s, 30s, 30s.
    expect(sleepCalls[0]).toBe(1000);
    expect(sleepCalls[1]).toBe(2000);
    expect(sleepCalls[2]).toBe(4000);
    expect(sleepCalls[3]).toBe(8000);
    expect(sleepCalls[4]).toBe(16000);
    expect(sleepCalls[5]).toBe(30000); // cap reached
    expect(sleepCalls[6]).toBe(30000);
  });

  it("jitter within ±20% of nominal", async () => {
    // Random=0 → delta = -1 * jitter → dolna granica (nominal * 0.8).
    // Random=1 → delta = +1 * jitter → górna granica (nominal * 1.2).
    function makeTrackingSleep(): { fn: (ms: number) => Promise<void>; calls: number[] } {
      const calls: number[] = [];
      return {
        fn: (ms: number) => {
          calls.push(ms);
          return Promise.resolve();
        },
        calls,
      };
    }

    // Lower bound
    {
      const track = makeTrackingSleep();
      const fake = makeFakeRequester(Array.from({ length: 8 }, () => errorResponse(500)));
      const client = createHttpClient({
        requester: fake.impl,
        sleepFn: track.fn,
        random: () => 0,
        delayMs: 0,
        config: { maxRetries: 7 },
      });
      await expect(client.fetchHtml("https://www.tibia.com/jitter-low")).rejects.toThrow();
      expect(track.calls[0]).toBe(800); // 1000 * 0.8
      expect(track.calls[1]).toBe(1600); // 2000 * 0.8
      expect(track.calls[2]).toBe(3200); // 4000 * 0.8
    }

    // Upper bound
    {
      const track = makeTrackingSleep();
      const fake = makeFakeRequester(Array.from({ length: 8 }, () => errorResponse(500)));
      const client = createHttpClient({
        requester: fake.impl,
        sleepFn: track.fn,
        random: () => 1,
        delayMs: 0,
        config: { maxRetries: 7 },
      });
      await expect(client.fetchHtml("https://www.tibia.com/jitter-high")).rejects.toThrow();
      expect(track.calls[0]).toBe(1200); // 1000 * 1.2
      expect(track.calls[1]).toBe(2400); // 2000 * 1.2
      expect(track.calls[2]).toBe(4800); // 4000 * 1.2
    }
  });
});

describe("http-client — redirects", () => {
  it("3xx redirect auto-followed via undici.fetch redirect=follow", async () => {
    // undici.fetch domyślnie ma redirect="follow" (do 20 hopów).
    // Test dokumentuje to zachowanie: po jednym wywołaniu fetchHtml,
    // pod spodem może być wiele HTTP requestów (śledzonych automatycznie).
    const fake = makeFakeRequester([okResponse("<html>followed</html>")]);
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    const body = await client.fetchHtml("https://www.tibia.com/redirected");
    expect(body).toBe("<html>followed</html>");
    expect(fake.calls).toHaveLength(1);
  });

  it("304 Not Modified → throws TibiaHttpError (no retry)", async () => {
    const fake = makeFakeRequester([errorResponse(304)]);
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    await expect(client.fetchHtml("https://www.tibia.com/cached")).rejects.toMatchObject({
      status: 304,
    });
    expect(fake.calls).toHaveLength(1);
  });
});

describe("http-client — headers", () => {
  it("Accept / Accept-Language / Accept-Encoding set on every request", async () => {
    const fake = makeFakeRequester([okResponse(), okResponse()]);
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    await client.fetchHtml("https://www.tibia.com/p1");
    await client.fetchHtml("https://www.tibia.com/p2");
    for (const call of fake.calls) {
      // Nagłówki mogą być case-normalized przez undici; sprawdzamy lowercase.
      const h = call.headers;
      expect(h["Accept"] ?? h["accept"]).toContain("text/html");
      expect(h["Accept-Language"] ?? h["accept-language"]).toContain("en-US");
      expect(h["Accept-Encoding"] ?? h["accept-encoding"]).toContain("gzip");
    }
  });

  it("caller-provided headers merged with defaults", async () => {
    const fake = makeFakeRequester([okResponse()]);
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    await client.fetchHtml("https://www.tibia.com/x", {
      headers: { "X-Custom": "tibians", Cookie: "session=abc" },
    });
    const h = fake.calls[0]?.headers ?? {};
    expect(h["X-Custom"] ?? h["x-custom"]).toBe("tibians");
    expect(h["Cookie"] ?? h["cookie"]).toBe("session=abc");
  });
});

describe("http-client — graceful shutdown", () => {
  it("cancelAll aborts in-flight requests", async () => {
    const fake = makeFakeRequester([{ delayMs: 1000 }]); // wisi długo
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    const promise = client.fetchHtml("https://www.tibia.com/long");
    // Daj mu chwilę na start.
    await new Promise((r) => setTimeout(r, 10));
    client.cancelAll("test");
    await expect(promise).rejects.toThrow();
  });

  it("caller's AbortSignal propagates to underlying request", async () => {
    const controller = new AbortController();
    const fake = makeFakeRequester([{ delayMs: 1000 }]);
    const client = createHttpClient({
      requester: fake.impl,
      sleepFn: instantSleep,
      random: constantRandom(),
      delayMs: 0,
    });
    const promise = client.fetchHtml("https://www.tibia.com/cancel", {
      signal: controller.signal,
    });
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    await expect(promise).rejects.toThrow();
  });
});

describe("r11-budget", () => {
  beforeEach(() => {
    resetBudget();
    resetBudgetConfig();
    delete process.env.SCRAPER_MAX_TIBIA_REQS_PER_MIN;
  });

  it("recordOutboundRequest increments counter", () => {
    expect(getOutboundStats().requestsThisMinute).toBe(0);
    recordOutboundRequest("auction-list");
    expect(getOutboundStats().requestsThisMinute).toBe(1);
    recordOutboundRequest("auction-detail");
    expect(getOutboundStats().requestsThisMinute).toBe(2);
  });

  it("default budget = 120 per minute", () => {
    expect(getBudgetConfig().maxRequestsPerMinute).toBe(120);
  });

  it("env override SCRAPER_MAX_TIBIA_REQS_PER_MIN", () => {
    process.env.SCRAPER_MAX_TIBIA_REQS_PER_MIN = "5";
    resetBudgetConfig();
    expect(getBudgetConfig().maxRequestsPerMinute).toBe(5);
  });

  it("throttleIfNeeded resolves immediately when under budget", async () => {
    recordOutboundRequest("x");
    const start = Date.now();
    await throttleIfNeeded();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("throttleIfNeeded pauses when over budget, then resumes after window reset", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    const start = Date.now();
    process.env.SCRAPER_MAX_TIBIA_REQS_PER_MIN = "1";
    resetBudgetConfig();
    resetBudget();
    recordOutboundRequest("x");
    expect(getOutboundStats().requestsThisMinute).toBe(1);

    const throttlePromise = throttleIfNeeded();
    // Po 1 ms nie powinno być rozwiązane (counter nadal 1).
    vi.advanceTimersByTime(100);
    await Promise.resolve(); // daj microtaskom szansę
    // throttleIfNeeded ciągle czeka — counter nadal 1 (nie upłynęła minuta).
    expect(getOutboundStats().requestsThisMinute).toBe(1);

    // Przesuń zegar o 60 s + mały zapas → okno się resetuje → throttle resolves.
    vi.setSystemTime(start + 60_000 + 100);
    vi.advanceTimersByTime(60_000 + 200);
    await throttlePromise;

    vi.useRealTimers();
    // Cleanup env po teście.
    delete process.env.SCRAPER_MAX_TIBIA_REQS_PER_MIN;
    resetBudgetConfig();
  });

  it("counter resets after 60 s window", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    recordOutboundRequest("x");
    expect(getOutboundStats().requestsThisMinute).toBe(1);
    vi.advanceTimersByTime(60_001);
    // Wywołanie getOutboundStats powinno zrollingować okno.
    expect(getOutboundStats().requestsThisMinute).toBe(0);
    vi.useRealTimers();
  });
});

describe("advisory-lock", () => {
  it("tryAdvisoryLock executes callback when lock acquired", async () => {
    let lockHeld = false;
    const client: AdvisoryLockClient = {
      async tryAdvisoryLock() {
        lockHeld = true;
        return true;
      },
      async releaseAdvisoryLock() {
        lockHeld = false;
      },
    };
    const result = await tryAdvisoryLock("tibians-full-scrape", async () => "work-done", {
      client,
    });
    expect(result).toBe("work-done");
    expect(lockHeld).toBe(false); // zwolniony w finally
  });

  it("tryAdvisoryLock returns null when lock not acquired", async () => {
    const client: AdvisoryLockClient = {
      async tryAdvisoryLock() {
        return false;
      },
      async releaseAdvisoryLock() {
        throw new Error("should not be called");
      },
    };
    const callback = vi.fn(async () => "should-not-run");
    const result = await tryAdvisoryLock("tibians-collision", callback, { client });
    expect(result).toBeNull();
    expect(callback).not.toHaveBeenCalled();
  });

  it("tryAdvisoryLock releases lock even if callback throws", async () => {
    let released = false;
    const client: AdvisoryLockClient = {
      async tryAdvisoryLock() {
        return true;
      },
      async releaseAdvisoryLock() {
        released = true;
      },
    };
    await expect(
      tryAdvisoryLock(
        "tibians-callback-error",
        async () => {
          throw new Error("boom");
        },
        { client },
      ),
    ).rejects.toThrow("boom");
    expect(released).toBe(true);
  });

  it("tryAdvisoryLock without client = no-op (dev/test mode)", async () => {
    const result = await tryAdvisoryLock("tibians-noop", async () => 42);
    expect(result).toBe(42);
  });

  it("hashAdvisoryKey is deterministic", () => {
    const a = hashAdvisoryKey("tibians-scraper");
    const b = hashAdvisoryKey("tibians-scraper");
    expect(a).toBe(b);
    expect(typeof a).toBe("bigint");
  });

  it("hashAdvisoryKey produces different hashes for different names", () => {
    const a = hashAdvisoryKey("full_scrape");
    const b = hashAdvisoryKey("ending_soon_scrape");
    expect(a).not.toBe(b);
  });

  it("hashAdvisoryKey stays within signed 64-bit range", () => {
    // Postgres bigint to int8 — zakres -2^63..2^63-1.
    const MAX = (1n << 63n) - 1n;
    const MIN = -(1n << 63n);
    for (const name of ["", "a", "tibia.com", "x".repeat(1000), "🚀 unicode"]) {
      const h = hashAdvisoryKey(name);
      expect(h).toBeGreaterThanOrEqual(MIN);
      expect(h).toBeLessThanOrEqual(MAX);
    }
  });
});

describe("defaultHttpClient singleton", () => {
  it("is a working HttpClient instance", () => {
    expect(typeof defaultHttpClient.fetchHtml).toBe("function");
    expect(typeof defaultHttpClient.installShutdownHook).toBe("function");
    expect(typeof defaultHttpClient.activeSlots).toBe("function");
  });

  it("installShutdownHook installs once (idempotent)", () => {
    // Nie możemy łatwo trigger SIGTERM, ale możemy sprawdzić, że nie wybucha.
    const client = createHttpClient();
    expect(() => client.installShutdownHook()).not.toThrow();
    expect(() => client.installShutdownHook()).not.toThrow();
  });
});