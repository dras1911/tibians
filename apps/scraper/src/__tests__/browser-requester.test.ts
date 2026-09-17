/**
 * Testy transportu browser (adapter Requester ↔ serwis FlareSolverr-API).
 *
 * Strategia: podnosimy PRAWDZIWY lokalny serwer HTTP (node:http), który
 * symuluje API serwisu browser-fetch / FlareSolverr. Dzięki temu testujemy
 * pełną ścieżkę: JSON → POST → parse odpowiedzi → mapowanie na Requester.
 */

import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { makeBrowserRequester, looksLikeChallenge } from "../browser-requester.js";
import type { BrowserFetchConfig } from "../config.js";

/** Odpowiedzi serwera per ścieżka/kolejność — prosty skryptowany mock. */
interface ScriptedResponse {
  statusCode?: number;
  body?: string;
  delayMs?: number;
}

function startMockServer(
  script: Array<ScriptedResponse>,
): Promise<{
  server: Server;
  url: string;
  calls: Array<{ body: string; headers: Record<string, unknown> }>;
}> {
  const calls: Array<{ body: string; headers: Record<string, unknown> }> = [];
  let index = 0;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      calls.push({ body: raw, headers: req.headers as Record<string, unknown> });
      const next = script[Math.min(index, script.length - 1)] ?? {};
      index += 1;
      const respond = () => {
        res.writeHead(next.statusCode ?? 200, { "Content-Type": "application/json" });
        res.end(next.body ?? "{}");
      };
      if (next.delayMs != null) setTimeout(respond, next.delayMs);
      else respond();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/v1`, calls });
    });
  });
}

function makeConfig(overrides: Partial<BrowserFetchConfig>): BrowserFetchConfig {
  return {
    mode: "browser",
    url: null,
    token: null,
    fallbackUrl: null,
    fallbackToken: null,
    timeoutMs: 5000,
    ...overrides,
  };
}

const okSolution = (html: string, status = 200): string =>
  JSON.stringify({
    status: "ok",
    solution: {
      url: "https://www.tibia.com/charactertrade/",
      status,
      response: html,
      headers: { "content-type": "text/html" },
    },
  });

let cleanup: Array<Server> = [];
afterEach(async () => {
  await Promise.all(
    cleanup.map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
        }),
    ),
  );
  cleanup = [];
});

describe("makeBrowserRequester", () => {
  it("wysyła request.get i mapuje solution na Requester", async () => {
    const { server, url, calls } = await startMockServer([
      { body: okSolution("<html>hello tibia</html>") },
    ]);
    cleanup.push(server);

    const requester = makeBrowserRequester(makeConfig({ url }));
    const controller = new AbortController();
    const res = await requester.request("https://www.tibia.com/charactertrade/?x=1", {
      method: "GET",
      headers: {},
      signal: controller.signal,
    });

    expect(res.statusCode).toBe(200);
    expect(await res.body.text()).toBe("<html>hello tibia</html>");

    // Protokół: JSON z cmd=request.get i przekazanym URL-em.
    const sent = JSON.parse(calls[0]?.body ?? "{}");
    expect(sent.cmd).toBe("request.get");
    expect(sent.url).toContain("tibia.com");
    expect(sent.maxTimeout).toBe(5000);
  });

  it("przekazuje token w nagłówku X-BF-Token", async () => {
    const { server, url, calls } = await startMockServer([{ body: okSolution("<html>ok</html>") }]);
    cleanup.push(server);

    const requester = makeBrowserRequester(makeConfig({ url, token: "s3cret" }));
    await requester.request("https://x.test/", {
      method: "GET",
      headers: {},
      signal: new AbortController().signal,
    });

    expect(calls[0]?.headers["x-bf-token"]).toBe("s3cret");
  });

  it("rzuca błąd przejściowy gdy challenge nadal widoczny", async () => {
    const { server, url } = await startMockServer([
      { body: okSolution("<html><title>Just a moment...</title></html>") },
    ]);
    cleanup.push(server);

    const requester = makeBrowserRequester(makeConfig({ url }));
    await expect(
      requester.request("https://x.test/", {
        method: "GET",
        headers: {},
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/challenge/i);
  });

  it("rzuca błąd gdy serwis zwraca status=error", async () => {
    const { server, url } = await startMockServer([
      { body: JSON.stringify({ status: "error", message: "browser crashed" }) },
    ]);
    cleanup.push(server);

    const requester = makeBrowserRequester(makeConfig({ url }));
    await expect(
      requester.request("https://x.test/", {
        method: "GET",
        headers: {},
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/browser crashed/);
  });

  it("spada na fallback gdy primary jest niedostępny", async () => {
    const { server, url } = await startMockServer([
      { body: okSolution("<html>fallback ok</html>") },
    ]);
    cleanup.push(server);

    const requester = makeBrowserRequester(
      makeConfig({
        url: "http://127.0.0.1:1/v1", // zamknięty port → ECONNREFUSED
        fallbackUrl: url,
      }),
    );
    const res = await requester.request("https://x.test/", {
      method: "GET",
      headers: {},
      signal: new AbortController().signal,
    });
    expect(await res.body.text()).toBe("<html>fallback ok</html>");
  });

  it("propaguje status strony (404) bez zamiany na błąd transportu", async () => {
    const { server, url } = await startMockServer([
      { body: okSolution("<html>not found</html>", 404) },
    ]);
    cleanup.push(server);

    const requester = makeBrowserRequester(makeConfig({ url }));
    const res = await requester.request("https://x.test/", {
      method: "GET",
      headers: {},
      signal: new AbortController().signal,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("looksLikeChallenge", () => {
  it("rozpoznaje typowe strony przejściowe CF", () => {
    expect(looksLikeChallenge("<title>Just a moment...</title>")).toBe(true);
    expect(looksLikeChallenge("<html>Attention Required! | Cloudflare</html>")).toBe(true);
    expect(looksLikeChallenge('<html data-cf-mitigated="challenge"></html>')).toBe(true);
    expect(looksLikeChallenge("<html>normal page</html>")).toBe(false);
  });
});
