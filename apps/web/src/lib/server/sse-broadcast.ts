/**
 * SSE Broadcast Module — plan task 54 (arch §8.5).
 *
 * ## Problem (arch §8.5 pkt 4)
 *
 * Endpoint `/api/auctions/live` NIE MOŻE robić osobnego `getEndingAuctions(1)`
 * per klient, bo przy 100 podłączonych klientach to 100 zapytań do DB co 30 s
 * = 200 req/min na hot path. Zamiast tego:
 *
 *   - **1 broadcaster per process** (singleton) trzyma listę klientów
 *   - **1 timer fetchujący dane** uruchamiany tylko gdy są klienci (oszczędza
 *     zasoby gdy zero połączeń — np. w nocy)
 *   - **broadcast()** rozsyła payload do wszystkich; auto-cleanup rozłączonych
 *
 * ## W produkcji: Redis pub/sub (TODO T59+)
 *
 * W środowisku multi-instance (kilka kontenerów Next.js za load balancerem)
 * powyższy singleton nie wystarczy — klient na instancji A nie dostanie
 * push z instancji B. Rozwiązanie docelowe (Faza 7+):
 *
 *   - Scraper publikuje świeże dane do **Redis channel** `auctions:live`
 *   - Każda instancja Next.js subskrybuje ten channel
 *   - `SseBroadcaster.broadcast()` wysyła tylko do klientów LOKALNEJ instancji
 *
 * Na chwilę obecną zakładamy 1 instancja (VPS Hetzner CX32, ~100-500 SSE
 * połączeń max — mieścimy się w pamięci procesu).
 *
 * ## Co NIE robimy (MUST NOT DO, task 54)
 *
 *   - **NIE** używamy WebSocket (server→client one-way, SSE wystarczy)
 *   - **NIE** robimy per-klienta zapytania do DB (broadcast z 1 źródła)
 *   - **NIE** używamy `as any` / `@ts-ignore` (strict TypeScript)
 */

import { listEndingSoon } from "@/lib/server/auctions";
import { jsonSafe } from "@/lib/server/json";

// ───────────────────────────────────────────────────────────────────────
// Typy
// ───────────────────────────────────────────────────────────────────────

/**
 * Reprezentacja jednego klienta SSE zarejestrowanego w broadcasterze.
 * Klient udostępnia dwie operacje:
 *   - `send(chunk)` — zakolejkuj kawałek danych (SSE format: "data: ...\n\n"
 *     lub komentarz ": ping\n\n")
 *   - `close()` — zamknij podłączenie (ReadableStream controller.close)
 *
 * Implementacja tych callbacków żyje w route handler (`/api/auctions/live`).
 * Broadcaster jest agnostyczny wobec Web Streams API — to ułatwia testowanie.
 */
export interface SseClient {
  readonly id: string;
  send: (chunk: string) => void;
  close: () => void;
}

/**
 * Konfiguracja broadcastera — wstrzykiwana w konstruktorze.
 *
 * `fetchPayload` zwraca już-sformatowany kawałek SSE (np.
 * `"data: {...}\n\n"`). Rozdzielenie fetch-format pozwala testować
 * broadcaster z deterministycznym payloadem bez mockowania DB.
 */
export interface SseBroadcasterOptions {
  /** Funkcja pobierająca payload (zwraca gotowy kawałek SSE). */
  fetchPayload: () => Promise<string>;
  /** Interwał pushu danych (ms) — domyślnie 30 000 (30 s, arch §8.5). */
  intervalMs: number;
  /** Interwał heartbeat (ms) — domyślnie 15 000 (15 s, arch §8.5). */
  heartbeatMs: number;
  /** Callback dla błędów (np. fetch DB). Opcjonalny. */
  onError?: (err: unknown) => void;
}

// ───────────────────────────────────────────────────────────────────────
// Implementacja
// ───────────────────────────────────────────────────────────────────────

/**
 * SseBroadcaster — trzyma listę podłączonych klientów SSE i wachluje dane
 * do nich z jednego źródła.
 *
 * Cykl życia timerów (arch §8.5):
 *   - `add()` gdy lista pusta → startuj oba interwały (data + heartbeat)
 *   - `remove()` gdy lista pusta → zatrzymaj oba interwały (oszczędza CPU)
 *
 * Cykl życia klienta:
 *   - `add()` → pushFirstTo(client) (async, fire-and-forget) — pierwszy
 *     push zanim jeszcze pierwszy interval zdąży wystrzelić
 *   - co `intervalMs` → fetch → broadcast (do wszystkich)
 *   - co `heartbeatMs` → broadcast `: ping\n\n` (proxy keep-alive)
 *   - `remove(id)` → klient wypisany z listy
 *   - `broadcast()` na kliencie którego `send` rzuca → auto-cleanup
 *
 * Auto-cleanup jest KLUCZOWY — bez niego martwe kontrolery kumulują się w pamięci
 * i proces się wysypie po kilku tysiącach rozłączonych klientów.
 */
export class SseBroadcaster {
  private readonly clients = new Map<string, SseClient>();
  private dataHandle: ReturnType<typeof setInterval> | null = null;
  private hbHandle: ReturnType<typeof setInterval> | null = null;
  private nextClientId = 0;
  private running = false;

  constructor(private readonly options: SseBroadcasterOptions) {}

  /**
   * Rejestruje nowego klienta; zwraca ID do późniejszego wywołania `remove()`.
   *
   * Po rejestracji:
   *   1. Jeśli to pierwszy klient — startuje timery (arch §8.5 — oszczędność
   *      CPU gdy zero klientów).
   *   2. Asynchronicznie wysyła **pierwszy push** (klient nie czeka 30 s).
   *      Błędy fetch/send są logowane i NIE zabijają streamu.
   */
  add(send: (chunk: string) => void, close: () => void): string {
    const id = this.generateClientId();
    const client: SseClient = { id, send, close };
    this.clients.set(id, client);

    if (!this.running) {
      this.startTimers();
    }

    // Pierwszy push natychmiast (arch §8.5 — klient nie czeka 30 s)
    void this.pushFirstTo(client);

    return id;
  }

  /**
   * Wypisuje klienta z broadcastera. Zwraca `true` jeśli klient istniał.
   *
   * Po usunięciu ostatniego klienta timery są zatrzymywane.
   */
  remove(id: string): boolean {
    const existed = this.clients.delete(id);
    if (this.clients.size === 0) {
      this.stopTimers();
    }
    return existed;
  }

  /**
   * Wysyła payload do wszystkich zarejestrowanych klientów.
   *
   * Auto-cleanup: jeśli `send` klienta rzuci wyjątkiem (np. zamknięty
   * controller), klient jest natychmiast usuwany z listy.
   *
   * Zwraca liczbę klientów do których payload dotarł pomyślnie.
   *
   * Używane przez:
   *   - Wewnętrzny timer (cykliczne push'e z `fetchPayload`)
   *   - Scraper (T59) — gdy scraper zakończy EndingSoon sweep, może
   *     wywołać `broadcaster.broadcast(freshPayload)` poza harmonogramem.
   */
  broadcast(payload: string): number {
    let successCount = 0;
    const failed: string[] = [];

    for (const [id, client] of this.clients) {
      try {
        client.send(payload);
        successCount++;
      } catch {
        failed.push(id);
      }
    }

    for (const id of failed) {
      this.clients.delete(id);
    }

    // Jeśli przez błędy lista się wyczyściła — zatrzymaj timery.
    if (this.clients.size === 0) {
      this.stopTimers();
    }

    return successCount;
  }

  /** Liczba aktywnych klientów (przydatne do debug/metrics). */
  size(): number {
    return this.clients.size;
  }

  /** Czy timery działają? (Przydatne w asercjach testowych). */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Zwalnia wszystkie zasoby (timery + klienci). Wywoływane przez
   * `_resetAuctionLiveBroadcasterForTests()` lub jawnie przy graceful
   * shutdown serwera.
   */
  dispose(): void {
    this.stopTimers();
    for (const client of this.clients.values()) {
      try {
        client.close();
      } catch {
        // Klient może być już zamknięty — ignorujemy.
      }
    }
    this.clients.clear();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Prywatne
  // ─────────────────────────────────────────────────────────────────────

  private generateClientId(): string {
    this.nextClientId += 1;
    return `sse-${this.nextClientId}`;
  }

  private startTimers(): void {
    if (this.running) return;
    this.running = true;

    // Cykliczny push danych (arch §8.5 — 30 s)
    this.dataHandle = setInterval(() => {
      void this.fetchAndBroadcast();
    }, this.options.intervalMs);

    // Heartbeat (arch §8.5 — 15 s; bez niego proxy zamyka idle po 60 s)
    this.hbHandle = setInterval(() => {
      this.broadcast(": ping\n\n");
    }, this.options.heartbeatMs);
  }

  private stopTimers(): void {
    if (this.dataHandle !== null) {
      clearInterval(this.dataHandle);
      this.dataHandle = null;
    }
    if (this.hbHandle !== null) {
      clearInterval(this.hbHandle);
      this.hbHandle = null;
    }
    this.running = false;
  }

  private async fetchAndBroadcast(): Promise<void> {
    try {
      const payload = await this.options.fetchPayload();
      this.broadcast(payload);
    } catch (err) {
      // DB hiccup — logujemy, ale NIE zabijamy streamu (arch §8.5 MUST DO:
      // "Error resilience — DB hiccup nie zabija streamu").
      this.options.onError?.(err);
    }
  }

  private async pushFirstTo(client: SseClient): Promise<void> {
    try {
      const payload = await this.options.fetchPayload();
      try {
        client.send(payload);
      } catch {
        // Klient rozłączony w trakcie first-push (wyścig z abort signal)
        this.clients.delete(client.id);
        if (this.clients.size === 0) {
          this.stopTimers();
        }
      }
    } catch (err) {
      this.options.onError?.(err);
    }
  }
}

// ───────────────────────────────────────────────────────────────────────
// Singleton — arch §8.5 (1 broadcaster per process)
// ───────────────────────────────────────────────────────────────────────

let _instance: SseBroadcaster | null = null;

/**
 * Zwraca (lub tworzy) singleton broadcastera dla kończących się aukcji.
 *
 * Konfiguracja singletonu (zgodna z arch §8.5):
 *   - `intervalMs = 30_000` — push co 30 s (Ending Soon scheduler jeździ co 30 s)
 *   - `heartbeatMs = 15_000` — heartbeat co 15 s (proxy/Caddy nie zamknie idle)
 *   - `fetchPayload` — `listEndingSoon(1)` (aukcje kończące się w <1h) +
 *     `jsonSafe` (bigint → decimal string)
 *
 * **Scraper integration (T59)**: `getAuctionLiveBroadcaster().broadcast(...)`
 * pozwala scraperowi pchać dane natychmiast po EndingSoon sweep (bez czekania
 * na następny tick timera).
 */
export function getAuctionLiveBroadcaster(): SseBroadcaster {
  if (_instance !== null) return _instance;

  _instance = new SseBroadcaster({
    intervalMs: 30_000,
    heartbeatMs: 15_000,
    fetchPayload: async () => {
      // listEndingSoon(1) — aukcje kończące się w ciągu 1h (arch §8.5 pkt 1).
      // biginty (auctionId, goldTotal) muszą być zserializowane jako string,
      // bo Node 22 + JSON.stringify nie obsługują BigInt natywnie (json.ts).
      const auctions = await listEndingSoon(1);
      const payload = jsonSafe({ auctions, ts: Date.now() });
      return `data: ${JSON.stringify(payload)}\n\n`;
    },
    onError: (err) => {
      console.error("[sse-broadcast] fetchPayload failed:", err);
    },
  });

  return _instance;
}

/**
 * Czyści singleton — **wyłącznie do testów**. Pozwala każdemu testowi
 * zacząć od pustej mapy klientów.
 */
export function _resetAuctionLiveBroadcasterForTests(): void {
  if (_instance !== null) {
    _instance.dispose();
    _instance = null;
  }
}