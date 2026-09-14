/**
 * GET /api/auctions/live — SSE stream kończących się aukcji (plan task 54).
 *
 * ## Architektura (arch §8.5)
 *
 * Server-Sent Events dla klienta `<EventSource>` (T55). Stream:
 *
 *   - **Pierwszy push natychmiast** — klient nie czeka 30 s na pierwsze dane
 *   - **Push co 30 s** — nowe zakończenia aukcji z `listEndingSoon(1)`
 *   - **Heartbeat `: ping` co 15 s** — utrzymuje połączenie przez Caddy/Nginx
 *     (bez tego proxy zamyka idle po 60 s — R6 w macierzy ryzyk)
 *   - **X-Accel-Buffering: no** — wyłącza buforowanie w proxy (kluczowe! bez
 *     tego Caddy buforuje cały stream i klient dostaje dane jednorazowo)
 *
 * ## Broadcast (arch §8.5 pkt 4)
 *
 * **NIE** robimy osobnego query do DB per klient. Zamiast tego:
 *
 *   1. `SseBroadcaster` (singleton w module scope) trzyma listę klientów
 *   2. Timer pobiera dane RAZ (z `listEndingSoon(1)`) i rozsyła do wszystkich
 *   3. Klient dołącza → natychmiast dostaje świeże dane (first push)
 *   4. Klient rozłączony → `req.signal.abort` → cleanup z listy
 *
 * W produkcji z wieloma instancjami Next.js (load balancer): docelowo
 * **Redis pub/sub** (Faza 7+) — scraper publikuje do kanału, każda instancja
 * subskrybuje i rozsyła do swoich lokalnych klientów SSE. Na chwilę obecną
 * 1 instancja (Hetzner CX32, ~100-500 SSE połączeń max — mieścimy się).
 *
 * ## MUST NOT (task 54)
 *
 *   - **NIE** WebSocket — SSE wystarczy (server→client one-way)
 *   - **NIE** per-klienta query DB (broadcast z 1 źródła)
 *   - **NIE** buforowanie (`X-Accel-Buffering: no` jest KRYTYCZNE)
 *   - **NIE** `as any` / `@ts-ignore`
 *
 * ## Referencje
 *
 *   - arch §8.5 — implementacja SSE + pułapki (heartbeat, X-Accel-Buffering,
 *     broadcast, abort cleanup)
 *   - arch §8.2 — strategia cache (SSE poza ISR, no-store)
 *   - T38 — `listEndingSoon()` helper
 *   - T55 — klient SSE z fallback chain
 *   - T59 — integracja (scraper → broadcaster)
 */

import { getAuctionLiveBroadcaster } from "@/lib/server/sse-broadcast";

// `force-dynamic` — ISR NIE dla streamu. Każde żądanie musi trafić do
// handlera (nie do cache'u), bo Response jest niestandardowy (stream).
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  // Wspólne zasoby dla WSZYSTKICH klientów SSE w tym procesie.
  // Arch §8.5: 1 broadcaster + N klientów (broadcast architektura).
  const broadcaster = getAuctionLiveBroadcaster();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // clientId jest ustawiane synchronicznie przez `broadcaster.add(...)`
      // poniżej. Zmienna `let` pozwala na poprawne domknięcie (closure)
      // wewnątrz safeEnqueue (które jest przekazywane do broadcaster PRZED
      // przypisaniem clientId — kolejność: definicja → add → add zwraca id).
      let clientId = "";

      // Bezpieczny wrapper na `controller.enqueue` — jeśli controller jest
      // zamknięty (klient się rozłączył), wywołanie rzuci wyjątek, który
      // łapiemy i usuwamy klienta z broadcastera (auto-cleanup).
      const safeEnqueue = (chunk: string): void => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          if (clientId !== "") {
            broadcaster.remove(clientId);
          }
        }
      };

      // Bezpieczny wrapper na `controller.close` — podwójne zamknięcie
      // (np. broadcast i abort signal jednocześnie) rzuca wyjątek, ignorujemy.
      const safeClose = (): void => {
        try {
          controller.close();
        } catch {
          // Controller już zamknięty — ignorujemy.
        }
      };

      // Rejestracja w broadcasterze → first push (async, nieblokujący).
      clientId = broadcaster.add(safeEnqueue, safeClose);

      // Abort cleanup (arch §8.5 pkt "req.signal.aborted — cleanup, inaczej
      // wyciek intervali zabija proces"). Klient zamknął kartę / zerwał
      // połączenie — usuwamy klienta z listy i zamykamy controller.
      req.signal.addEventListener("abort", () => {
        if (clientId !== "") {
          broadcaster.remove(clientId);
        }
        safeClose();
      });
    },
    cancel() {
      // ReadableStream został anulowany z zewnątrz (np. Response został
      // zwolniony). Cleanup jest wykonywany przez `req.signal.abort`
      // → `broadcaster.remove(clientId)` + `controller.close()`.
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      // KRYTYCZNE: stream SSE nie może być buforowany po stronie proxy.
      // Bez `X-Accel-Buffering: no` Caddy/Nginx buforuje cały stream
      // i klient dostaje dane jednorazowo po zamknięciu połączenia (arch §8.5).
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}