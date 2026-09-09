/**
 * HTTP client dla scrapera Bazaara Tibii (tibia.com).
 *
 * Architektura (patrz `.omo/plans/tibia-tools-portal-architecture.md`):
 *   - §3.1 — "undici + cheerio" (HTTP/2 natywne w Node 22+, ~0.08 s/strona)
 *   - §8.3 — strategia scrapera (500 ms delay, max 2 concurrent, 7 retries,
 *     exponential backoff 1s→30s, UA rotation, 30s timeout)
 *   - §18.1 — R11 (wspólny budżet rate-limit z self-hostowanym TibiaData;
 *     zliczamy każdy wychodzący request do tibia.com)
 *
 * Wzorzec: factory `createHttpClient({ ... })` — analogicznie do
 * `packages/shared/src/tibiadata/client.ts` (task 8). Domyślny singleton
 * na końcu pliku (`defaultHttpClient`) dla wygody callerów.
 *
 * Pipeline pojedynczego `fetchHtml(url)`:
 *   1. throttleIfNeeded()           — R11 budżet (patrz `r11-budget.ts`)
 *   2. acquirePerHostSlot(host)     — rate limiter (max 2 concurrent, 500 ms delay)
 *   3. wybierz User-Agent           — rotacja round-robin (5 UA z config.userAgents)
 *   4. undici.request(url, opts)    — z AbortController (timeout 30 s)
 *   5. retry on transient errors    — 5xx, 429, network; NIGDY 4xx non-429
 *   6. recordOutboundRequest()      — R11 counter
 *
 * Graceful shutdown: instalacja jednorazowego listenera SIGTERM/SIGINT
 * czyści kolejkę limitera i przerywa AbortController'y lotów.
 */

import { fetch as undiciFetch } from "undici";

import {
  DEFAULT_REQUEST_HEADERS,
  SCRAPER_CONFIG,
  type UserAgent,
} from "./config.js";
import {
  recordOutboundRequest,
  throttleIfNeeded,
} from "./r11-budget.js";

// ──────────────────────────────────────────────────────────────────────────
// Typy
// ──────────────────────────────────────────────────────────────────────────

/** Błąd HTTP rzucany przez `fetchHtml` (4xx non-429 lub 5xx po wyczerpaniu retries). */
export class TibiaHttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly url: string;

  constructor(status: number, statusText: string, url: string) {
    super(`Tibia HTTP ${status} ${statusText} (${url})`);
    this.name = "TibiaHttpError";
    this.status = status;
    this.statusText = statusText;
    this.url = url;
  }
}

/** Opcje `fetchHtml`. */
export interface FetchHtmlOptions {
  /** Host override (głównie do testów). Domyślnie: nowy URL().host. */
  host?: string;
  /** Dodatkowe headery doklejane do domyślnych. */
  headers?: Record<string, string>;
  /** Timeout override (ms). */
  timeoutMs?: number;
  /** AbortSignal od wywołującego. */
  signal?: AbortSignal;
  /** Etykieta dla R11 budget (np. "auction-list"). Domyślnie: host. */
  budgetEndpoint?: string;
}

/** Pojedyncze wywołanie HTTP (abstrakcja dla testów). */
export interface Requester {
  request(
    url: string,
    options: {
      method: string;
      headers: Record<string, string>;
      signal: AbortSignal;
    },
  ): Promise<{
    statusCode: number;
    headers: Record<string, string | string[]>;
    body: { text(): Promise<string> };
  }>;
}

/** Opcje factory `createHttpClient`. */
export interface HttpClientOptions {
  /** Podmień implementację requestu (testy). Domyślnie: undici.fetch. */
  requester?: Requester;
  /** Deterministyczny RNG (testy). Domyślnie: Math.random. */
  random?: () => number;
  /** Override konfiguracji domyślnej. */
  config?: Partial<typeof SCRAPER_CONFIG>;
  /** Sleep helper (testy ustawiają natychmiastowy). */
  sleepFn?: (ms: number) => Promise<void>;
  /** Per-request concurrency override (testy mogą obniżyć do 1). */
  maxConcurrent?: number;
  /** Per-host delay override (ms). */
  delayMs?: number;
}

/** Publiczny kontrakt HttpClient. */
export interface HttpClient {
  /** Pobierz HTML z tibia.com (lub innego hosta) z retry/backoff/rate-limit. */
  fetchHtml(url: string, options?: FetchHtmlOptions): Promise<string>;
  /** Liczba aktywnych slotów w limiterze (do testów i metryk). */
  activeSlots(host: string): number;
  /** Wyczyść stan limitera (testy + graceful shutdown). */
  resetLimiter(): void;
  /** Zainstaluj shutdown hook (jednorazowo). */
  installShutdownHook(): void;
  /** Anuluj wszystkie loty (wywoływane z shutdown hook). */
  cancelAll(reason: string): void;
}

// ──────────────────────────────────────────────────────────────────────────
// Rate limiter per host
// ──────────────────────────────────────────────────────────────────────────

interface HostLimiterState {
  /** Ile requestów aktualnie w locie. */
  activeCount: number;
  /** Kiedy ostatnio *rozpoczęto* request (ms epoch) — pilnuje minimalnego delay. */
  lastStartedAt: number;
  /** Kolejka oczekujących na wolny slot. */
  queue: Array<() => void>;
}

/**
 * Per-host rate limiter.
 *
 * Semantyka:
 *   - `maxConcurrent` = cap na jednoczesne requesty (typowo 2),
 *   - `delayMs` = minimalny odstęp między kolejnymi **startami** requestów
 *     (typowo 500 ms). Mierzymy od ostatniego `lastStartedAt`.
 *
 * Gwarancje:
 *   - Nigdy więcej niż `maxConcurrent` requestów aktywnych naraz dla danego hosta.
 *   - Nigdy więcej niż 1 request na `delayMs` zaczyna się na danym hoście
 *     (limit przepustowości, miara 2 req/s przy delay=500).
 *
 * Implementacja: per-host stan + kolejka waiterów. Kiedy `acquire()` jest
 * wywoływane, albo startuje od razu (slot wolny + delay minął) albo
 * dołącza do kolejki. Każdy `release()` budzi jednego waiter'a.
 */
class HostRateLimiter {
  private readonly states = new Map<string, HostLimiterState>();
  private readonly maxConcurrent: number;
  private readonly delayMs: number;

  constructor(opts: { maxConcurrent: number; delayMs: number }) {
    this.maxConcurrent = opts.maxConcurrent;
    this.delayMs = opts.delayMs;
  }

  /** Ile aktywnych slotów dla danego hosta. */
  activeSlots(host: string): number {
    return this.states.get(host)?.activeCount ?? 0;
  }

  /**
 * Zdobądź slot. Zwraca funkcję `release()` do zwolnienia.
 * Jeśli `signal` abortuje w trakcie oczekiwania → promise reject'uje się.
 */
  async acquire(host: string, signal?: AbortSignal): Promise<() => void> {
    let state = this.states.get(host);
    if (!state) {
      state = { activeCount: 0, lastStartedAt: 0, queue: [] };
      this.states.set(host, state);
    }
    const s = state;

    return new Promise<() => void>((resolve, reject) => {
      let settled = false; // true gdy promise rozwiązany (resolve lub reject)
      let released = false; // true gdy release() został już wywołany
      let wakeTimer: ReturnType<typeof setTimeout> | null = null;
      const rejectOnce = (msg: string): void => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener("abort", onAbort);
        if (wakeTimer !== null) clearTimeout(wakeTimer);
        reject(new AbortError(msg));
      };
      const onAbort = (): void => rejectOnce("acquire aborted");
      if (signal) {
        if (signal.aborted) {
          rejectOnce("acquire aborted");
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      const startNow = (): void => {
        if (settled) return;
        if (signal?.aborted) {
          rejectOnce("acquire aborted");
          return;
        }
        s.activeCount += 1;
        s.lastStartedAt = Date.now();
        settled = true;
        if (wakeTimer !== null) {
          clearTimeout(wakeTimer);
          wakeTimer = null;
        }
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve(() => {
          if (released) return;
          released = true;
          s.activeCount = Math.max(0, s.activeCount - 1);
          // Budź następnego w kolejce.
          const next = s.queue.shift();
          if (next) next();
        });
      };

      const tryStart = (): void => {
        if (settled) return;
        if (signal?.aborted) {
          rejectOnce("acquire aborted");
          return;
        }
        const sinceLast = Date.now() - s.lastStartedAt;
        if (s.activeCount < this.maxConcurrent && sinceLast >= this.delayMs) {
          startNow();
          return;
        }
        // Nie spełniamy warunków → czekaj. Dodaj do kolejki (do ponownego
        // sprawdzenia przy release) oraz ustaw wakeTimer jeśli problemem
        // jest delay (gdyby release nie nastąpił w międzyczasie).
        s.queue.push(tryStart);
        if (sinceLast < this.delayMs) {
          const wait = this.delayMs - sinceLast;
          if (wakeTimer !== null) clearTimeout(wakeTimer);
          wakeTimer = setTimeout(() => {
            // Po upływie delay — sprawdź ponownie. Jeśli release nastąpił
            // wcześniej, kolejka już została opróżniona i my się tu
            // wycofamy (tryStart → settled=true → return).
            tryStart();
          }, wait);
        }
      };

      tryStart();
    });
  }

  /** Wyczyść wszystko (limiter wraca do stanu "pusty", ale nie przerywa lotów). */
  clear(): void {
    this.states.clear();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Pomocnicze: AbortError, retry policy, backoff
// ──────────────────────────────────────────────────────────────────────────

/** Custom AbortError (kompatybilny z `DOMException` undici). */
class AbortError extends Error {
  public readonly code = "ABORT_ERR";
  constructor(message: string) {
    super(message);
    this.name = "AbortError";
  }
}

/** Klasyfikacja: czy błąd jest retry'owany? */
function isTransientHttpError(err: unknown): boolean {
  if (err instanceof TibiaHttpError) {
    // 5xx i 429 → retry; reszta 4xx (400/401/403/404) → throw.
    return err.status === 429 || (err.status >= 500 && err.status < 600);
  }
  // Timeout (AbortError), ECONNRESET, ETIMEDOUT i inne niedeterministyczne
  // błędy sieciowe → retry.
  return true;
}

/** Wylicz n-ty delay backoffu (1-indexed), z jitterem. */
function computeBackoffMs(
  attempt: number,
  options: { baseMs: number; capMs: number; jitterFraction: number; random: () => number },
): number {
  // attempt: 1..maxRetries (pierwsza retransmisja = 1).
  // Nominalny delay: base * 2^(attempt-1), cap na capMs.
  const nominal = Math.min(options.capMs, options.baseMs * 2 ** (attempt - 1));
  const jitter = nominal * options.jitterFraction;
  const delta = (options.random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(nominal + delta));
}

// ──────────────────────────────────────────────────────────────────────────
// Default undici requester
// ──────────────────────────────────────────────────────────────────────────

/** Adapter undici.fetch → Requester. */
function makeUndiciRequester(): Requester {
  return {
    async request(url, options) {
      // undici.fetch domyślnie: redirect="follow" (do 20 hopów), HTTP/2,
      // automatyczna dekompresja gzip/deflate/br.
      const res = await undiciFetch(url, {
        method: options.method,
        headers: options.headers,
        signal: options.signal,
      });
      return {
        statusCode: res.status,
        headers: Object.fromEntries(res.headers.entries()) as Record<string, string>,
        body: { text: () => res.text() },
      };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Factory
// ──────────────────────────────────────────────────────────────────────────

/**
 * Stwórz HttpClient. Preferowane nad singletonem dla testów
 * (pełna izolacja stanu).
 */
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const config = { ...SCRAPER_CONFIG, ...(options.config ?? {}) } as typeof SCRAPER_CONFIG;
  const requester = options.requester ?? makeUndiciRequester();
  const random = options.random ?? Math.random;
  const sleepFn = options.sleepFn ?? defaultSleep;

  const limiter = new HostRateLimiter({
    maxConcurrent: options.maxConcurrent ?? config.maxConcurrent,
    delayMs: options.delayMs ?? config.delayMs,
  });

  // Indeks rotacji UA — thread-local (w naszym świecie single-threaded EventLoop,
  // to wystarczające dla pojedynczego procesu workera).
  let uaIndex = 0;
  const nextUserAgent = (): UserAgent => {
    const list = config.userAgents;
    const ua = list[uaIndex % list.length];
    uaIndex = (uaIndex + 1) % list.length;
    return ua as UserAgent;
  };

  // Śledzenie aktywnych AbortController'ów (graceful shutdown).
  const activeControllers = new Set<AbortController>();
  let shutdownInstalled = false;

  async function fetchHtml(rawUrl: string, opts: FetchHtmlOptions = {}): Promise<string> {
    const url = rawUrl;
    const host = opts.host ?? new URL(url).host;
    const endpoint = opts.budgetEndpoint ?? host;

    // R11: throttle przed wejściem w sieć.
    await throttleIfNeeded();

    // Per-host rate limit — zdobądź slot (z blokadą delay).
    const controller = new AbortController();
    activeControllers.add(controller);
    // Połącz caller signal z naszym controllerem.
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    let release: () => void;
    try {
      release = await limiter.acquire(host, controller.signal);
    } catch (err) {
      activeControllers.delete(controller);
      throw err;
    }

    try {
      // Pętla retry (attempt 0 = pierwsza próba; attempt 1..maxRetries = retry).
      let attempt = 0;
      while (true) {
        if (controller.signal.aborted) {
          throw new AbortError("request aborted (shutdown)");
        }

        const ua = nextUserAgent();
        const headers: Record<string, string> = {
          ...DEFAULT_REQUEST_HEADERS,
          "User-Agent": ua,
          ...opts.headers,
        };

        // Timeout per-request — ustawiany w każdej iteracji, bo retries są świeże.
        const timeoutMs = opts.timeoutMs ?? config.timeoutMs;
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
        // Połącz timeoutAbort + nasz controller.shutdownAbort.
        const combined = AbortSignal.any([controller.signal, timeoutController.signal]);

        try {
          // R11: zarejestruj request przed network call (raz na wysłany request,
          // nie raz na retry — caller widzi inkrement PRZY acquire, nie przy retry).
          recordOutboundRequest(endpoint);

          const res = await requester.request(url, {
            method: "GET",
            headers,
            signal: combined,
          });

          if (res.statusCode >= 200 && res.statusCode < 300) {
            const body = await res.body.text();
            return body;
          }

          // 3xx: undici z `maxRedirections > 0` sam podąży. Gdyby zwrócił 3xx
          // (np. po przekroczeniu limitu redirections), traktujemy jako retry.
          if (res.statusCode >= 300 && res.statusCode < 400) {
            if (res.statusCode === 304) {
              throw new TibiaHttpError(304, "Not Modified", url);
            }
            throw new TibiaHttpError(res.statusCode, "Redirect Limit", url);
          }

          // 4xx/5xx.
          throw new TibiaHttpError(res.statusCode, "HTTP Error", url);
        } catch (err) {
          // Jeśli to nasz shutdown AbortError (nie timeout) → nie retry'uj.
          if (controller.signal.aborted && !timeoutController.signal.aborted) {
            throw err;
          }
          if (!isTransientHttpError(err)) throw err;
          if (attempt >= config.maxRetries) throw err;

          clearTimeout(timeoutId);
          attempt += 1;
          const delay = computeBackoffMs(attempt, {
            baseMs: config.backoffBaseMs,
            capMs: config.backoffCapMs,
            jitterFraction: config.jitterFraction,
            random,
          });
          await sleepFn(delay);
          if (controller.signal.aborted) {
            throw new AbortError("retry aborted (shutdown)");
          }
          // (Kontynuacja pętli while(true)).
        } finally {
          clearTimeout(timeoutId);
        }
      }
    } finally {
      release();
      activeControllers.delete(controller);
    }
  }

  function installShutdownHook(): void {
    if (shutdownInstalled) return;
    shutdownInstalled = true;
    const handler = (signal: NodeJS.Signals): void => {
      console.log(`[http-client] ${signal} received — cancelling in-flight requests`);
      cancelAll(signal);
    };
    process.once("SIGTERM", handler);
    process.once("SIGINT", handler);
  }

  function cancelAll(reason: string): void {
    void reason;
    for (const c of activeControllers) {
      c.abort();
    }
    limiter.clear();
  }

  return {
    fetchHtml,
    activeSlots: (host) => limiter.activeSlots(host),
    resetLimiter: () => limiter.clear(),
    installShutdownHook,
    cancelAll,
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────────────────────────────────
// Publiczny domyślny singleton
// ──────────────────────────────────────────────────────────────────────────

/** Domyślny singleton — używany przez wywołujących (np. parsery zadań 30+). */
export const defaultHttpClient: HttpClient = createHttpClient();

/** Re-eksport R11 budget helpers dla wygody wyższych warstw. */
export {
  getOutboundStats,
  recordOutboundRequest,
  throttleIfNeeded,
  getBudgetConfig,
  resetBudget,
  type OutboundStats,
  type R11BudgetConfig,
} from "./r11-budget.js";

/** Re-eksport advisory-lock helpers. */
export {
  tryAdvisoryLock,
  hashAdvisoryKey,
  type AdvisoryLockOptions,
  type AdvisoryLockClient,
} from "./advisory-lock.js";

/** Re-eksport stałych konfiguracyjnych. */
export {
  SCRAPER_CONFIG,
  TIBIA_URLS,
  DEFAULT_REQUEST_HEADERS,
  type UserAgent,
} from "./config.js";