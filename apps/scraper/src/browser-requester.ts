/**
 * Browser requester — transport HTTP przez serwis renderujący przeglądarką.
 *
 * KONTEKST (dlaczego to istnieje):
 *   tibia.com jest za Cloudflare Managed Challenge; bezpośrednie żądania
 *   z IP OVH dostają 403. Serwis `browser-fetch` (CloakBrowser + WARP)
 *   przechodzi challenge i zwraca gotowy HTML. Ten moduł to adapter
 *   `Requester` (patrz `http-client.ts`) — cała logika retry/backoff/
 *   rate-limit pozostaje w `http-client`, a tutaj podmieniamy tylko „rurę".
 *
 * PROTOKÓŁ (zgodny z FlareSolverr — jeden klient obsługuje oba silniki):
 *   POST {endpoint}
 *     {"cmd": "request.get", "url": "...", "maxTimeout": 60000}
 *   → 200 {"status": "ok", "solution": {"url", "status", "response", "headers"}}
 *   → 4xx/5xx {"status": "error", "message": "..."}
 *
 *   Dzięki kompatybilności: `SCRAPER_BROWSER_FETCH_URL` może wskazywać na
 *   nasz serwis (`:8192/v1`) ORAZ na FlareSolverr (`:8191/v1`) — fallback
 *   to po prostu drugi URL (`SCRAPER_BROWSER_FETCH_FALLBACK_URL`).
 *
 * STRATEGIA BŁĘDÓW:
 *   - „miękki" błąd serwisu (challenge nadal widoczny, timeout, 5xx serwisu)
 *     → próbujemy fallbacku, potem rzucamy zwykły `Error` — `http-client`
 *     zakwalifikuje go jako przejściowy (retry z backoffem),
 *   - status HTTP strony (404/500 tibia.com) przechodzi bez zmian — decyzję
 *     o retry podejmuje `http-client` (spójnie z trybem direct).
 */

import { fetch as undiciFetch } from "undici";

import type { BrowserFetchConfig } from "./config.js";
import type { Requester } from "./http-client.js";

/** Markery strony przejściowej Cloudflare (gdyby challenge nie przeszedł). */
const CHALLENGE_MARKERS = [
  "Just a moment",
  "Attention Required",
  "cf-mitigated",
  "challenge-platform",
  "Verifying you are human",
] as const;

interface FlareSolverrSolution {
  url?: string;
  status?: number;
  response?: string;
  headers?: Record<string, string>;
}

interface FlareSolverrResponse {
  status?: string;
  message?: string;
  solution?: FlareSolverrSolution;
}

/** Czy odpowiedź wygląda na nieprzejściowy challenge CF? */
export function looksLikeChallenge(html: string): boolean {
  return CHALLENGE_MARKERS.some((marker) => html.includes(marker));
}

interface EndpointCallResult {
  statusCode: number;
  headers: Record<string, string | string[]>;
  text: string;
}

/** Jedno wywołanie endpointu serwisu (primary albo fallback). */
async function callEndpoint(
  endpoint: string,
  token: string | null,
  url: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<EndpointCallResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers["X-BF-Token"] = token;

  const res = await undiciFetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ cmd: "request.get", url, maxTimeout: timeoutMs }),
    signal,
  });

  const text = await res.text();
  return {
    statusCode: res.status,
    headers: Object.fromEntries(res.headers.entries()) as Record<string, string>,
    text,
  };
}

/** Sparsuj odpowiedź serwisu; rzuć czytelny błąd gdy niepoprawna. */
function parseSolution(text: string): FlareSolverrSolution {
  let parsed: FlareSolverrResponse;
  try {
    parsed = JSON.parse(text) as FlareSolverrResponse;
  } catch {
    throw new Error(`browser-fetch: nie-JSON response: ${text.slice(0, 200)}`);
  }
  if (parsed.status !== "ok" || parsed.solution == null) {
    throw new Error(
      `browser-fetch: status=${parsed.status ?? "?"} message=${parsed.message ?? "(brak)"}`,
    );
  }
  return parsed.solution;
}

/**
 * Stwórz `Requester`, który pobiera strony przez serwis browser-fetch
 * (z opcjonalnym fallbackiem — np. FlareSolverr).
 */
export function makeBrowserRequester(config: BrowserFetchConfig): Requester {
  const primary = config.url;
  if (primary == null || primary === "") {
    throw new Error(
      "makeBrowserRequester: brak SCRAPER_BROWSER_FETCH_URL (tryb browser wymaga adresu serwisu)",
    );
  }

  const attempt = async (
    endpoint: string,
    token: string | null,
    url: string,
    signal: AbortSignal,
  ): Promise<EndpointCallResult & { solution: FlareSolverrSolution }> => {
    const raw = await callEndpoint(endpoint, token, url, config.timeoutMs, signal);
    if (raw.statusCode >= 400) {
      // Serwis zwrócił błąd transportu (nie strony) — czytelny komunikat.
      throw new Error(
        `browser-fetch: endpoint ${endpoint} zwrócił HTTP ${raw.statusCode}: ${raw.text.slice(0, 200)}`,
      );
    }
    const solution = parseSolution(raw.text);
    return { ...raw, solution };
  };

  return {
    async request(url, options) {
      let lastError: unknown = null;

      const endpoints: Array<{ endpoint: string; token: string | null }> = [
        { endpoint: primary, token: config.token },
      ];
      if (config.fallbackUrl) {
        endpoints.push({ endpoint: config.fallbackUrl, token: config.fallbackToken });
      }

      for (const { endpoint, token } of endpoints) {
        try {
          const { solution } = await attempt(endpoint, token, url, options.signal);
          const html = solution.response ?? "";
          if (looksLikeChallenge(html)) {
            throw new Error(`browser-fetch: challenge CF nadal widoczny (endpoint ${endpoint})`);
          }
          return {
            statusCode: solution.status ?? 200,
            headers: solution.headers ?? {},
            body: { text: async () => html },
          };
        } catch (err) {
          lastError = err;
          // Spróbuj następnego endpointu (jeśli jest); inaczej — błąd w górę.
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error(`browser-fetch: nieznany błąd (${String(lastError)})`);
    },
  };
}
