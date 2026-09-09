/**
 * Globalne rozszerzenia typów dla aplikacji web.
 *
 * `globalThis.__tibiansRateLimit` — store dla in-memory rate limitera
 * (apps/web/src/lib/server/rate-limit.ts). Zachowujemy go przez HMR
 * w dev mode (jak globalForDb w packages/db/src/index.ts).
 */
declare global {
  // eslint-disable-next-line no-var
  var __tibiansRateLimit:
    | Map<string, { timestamps: number[] }>
    | undefined;
}

export {};
