/**
 * Skrypt pomocniczy (dev-only) do pobrania świeżej strony listy aukcji
 * Tibii i zapisania jej jako fixture HTML do testów regresyjnych (T30/T33).
 *
 * Użycie:
 *   node --import tsx/esm apps/scraper/scripts/fetch-fixture.ts \
 *        --page 1 --out apps/scraper/src/scrapers/__fixtures__/auction-list-page-1.html
 *
 *   node --import tsx/esm apps/scraper/scripts/fetch-fixture.ts \
 *        --page 50 --out apps/scraper/src/scrapers/__fixtures__/auction-list-page-50.html
 *
 * Używa domyślnego `defaultHttpClient` (T29) — z R11 budget, 500 ms delay,
 * UA rotation, 7 retries. NIE uruchamiaj w CI — służy tylko do ręcznego
 * odświeżania fixture'ów gdy Tibia.com zmieni HTML (R1 mitygacja).
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { defaultHttpClient } from "../src/http-client.js";
import { TIBIA_URLS } from "../src/config.js";

interface Args {
  page: number;
  out: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg !== undefined && arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value !== undefined && !value.startsWith("--")) {
        args[key] = value;
        i += 1;
      } else {
        args[key] = "true";
      }
    }
  }
  const pageRaw = args["page"] ?? "1";
  const out = args["out"];
  if (out === undefined) {
    throw new Error("--out <path> is required");
  }
  return { page: Number.parseInt(pageRaw, 10), out };
}

async function main(): Promise<void> {
  const { page, out } = parseArgs(process.argv.slice(2));
  const url = `${TIBIA_URLS.auctionList}&currentpage=${page}`;
  console.log(`[fetch-fixture] GET ${url}`);

  const html = await defaultHttpClient.fetchHtml(url, {
    budgetEndpoint: "auction-list-fixture",
  });

  const outPath = resolve(out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, "utf8");

  const bytes = Buffer.byteLength(html, "utf8");
  console.log(`[fetch-fixture] saved ${bytes} bytes to ${outPath}`);
}

main().catch((err: unknown) => {
  console.error("[fetch-fixture] failed:", err);
  process.exit(1);
});