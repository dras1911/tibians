/**
 * Skrypt pomocniczy (dev-only) do pobierania świeżych stron Tibia Bazaar
 * i zapisywania ich jako fixture HTML do testów regresyjnych (T30/T33 — R1).
 *
 * Użycie (z `apps/scraper/`):
 *   pnpm tsx scripts/fetch-fixture.ts list 1                 # strona listy nr 1
 *   pnpm tsx scripts/fetch-fixture.ts list 2 25 75          # wiele stron naraz
 *   pnpm tsx scripts/fetch-fixture.ts detail 2173376        # detal aukcji
 *   pnpm tsx scripts/fetch-fixture.ts --all                 # wszystkie znane
 *   pnpm tsx scripts/fetch-fixture.ts list 1 --out custom.html
 *   pnpm tsx scripts/fetch-fixture.ts list 1 --dry-run      # tylko plan
 *
 * Kompatybilność wsteczna (CLI z T30):
 *   pnpm tsx scripts/fetch-fixture.ts --page 1 --out path.html
 *
 * Domyślne ścieżki zapisu:
 *   list N    → src/scrapers/__fixtures__/auction-list-page-N.html
 *   detail ID → src/scrapers/__fixtures__/auction-detail-ID.html
 *
 * Używa domyślnego `defaultHttpClient` (T29) — z R11 budget, 500 ms delay,
 * max 2 concurrent, UA rotation, 7 retries. NIE uruchamiaj w CI — służy
 * tylko do ręcznego odświeżania fixture'ów gdy Tibia.com zmieni HTML (R1).
 *
 * Reguła (plan §33): pobrany HTML jest SUROWĄ kopią — przed commitem usuń
 * wrażliwe dane (set-cookie, tokeny sesji) i uzupełnij README w __fixtures__.
 */
import { writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { defaultHttpClient } from "../src/http-client.js";
import { TIBIA_URLS } from "../src/config.js";
import {
  KNOWN_AUCTION_IDS,
  KNOWN_LIST_PAGES,
  detailFixtureFile,
  listFixtureFile,
} from "../src/scrapers/constants.js";

// ──────────────────────────────────────────────────────────────────────────
// Typy + parsowanie argumentów
// ──────────────────────────────────────────────────────────────────────────

type Target =
  | { kind: "list"; page: number }
  | { kind: "detail"; id: number };

interface CliArgs {
  targets: Target[];
  outOverride: string | null;
  dryRun: boolean;
}

const SCRAPER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_DIR = resolve(SCRAPER_ROOT, "src/scrapers/__fixtures__");

/**
 * Parsuje argumenty CLI. Akceptuje dwa style:
 *   1. pozycyjny: `list N [N...]` / `detail ID [ID...]`
 *   2. legacy (T30): `--page N --out path`
 * Wspólne flagi: `--out <path>`, `--dry-run`, `--all`.
 */
function parseArgs(argv: readonly string[]): CliArgs {
  const targets: Target[] = [];
  let outOverride: string | null = null;
  let dryRun = false;

  // Legacy: `--page N --out path` → jeden target list.
  const pageFlagIdx = argv.indexOf("--page");
  if (pageFlagIdx !== -1 && argv[pageFlagIdx + 1] !== undefined) {
    const page = Number.parseInt(argv[pageFlagIdx + 1] ?? "", 10);
    if (Number.isFinite(page)) targets.push({ kind: "list", page });
  }

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case "--out": {
        const v = argv[i + 1];
        if (v !== undefined && !v.startsWith("--")) {
          outOverride = v;
          i += 2;
        } else {
          throw new Error("--out <path> wymaga wartości");
        }
        break;
      }
      case "--dry-run":
        dryRun = true;
        i += 1;
        break;
      case "--all": {
        for (const p of KNOWN_LIST_PAGES) targets.push({ kind: "list", page: p });
        for (const id of KNOWN_AUCTION_IDS) targets.push({ kind: "detail", id });
        i += 1;
        break;
      }
      case "--page": {
        // obsłużone wyżej; pomiń parę (wartość)
        i += 2;
        break;
      }
      case "list": {
        // wszystkie kolejne liczby aż do flagi = numery stron
        i += 1;
        while (i < argv.length && !argv[i]?.startsWith("--")) {
          const n = Number.parseInt(argv[i] ?? "", 10);
          if (Number.isFinite(n) && n > 0) targets.push({ kind: "list", page: n });
          i += 1;
        }
        break;
      }
      case "detail": {
        i += 1;
        while (i < argv.length && !argv[i]?.startsWith("--")) {
          const n = Number.parseInt(argv[i] ?? "", 10);
          if (Number.isFinite(n) && n > 0) targets.push({ kind: "detail", id: n });
          i += 1;
        }
        break;
      }
      default:
        i += 1;
        break;
    }
  }

  if (targets.length === 0) {
    throw new Error(
      "Brak targetu. Użycie: fetch-fixture.ts list <page...> | detail <id...> | --all",
    );
  }
  return { targets, outOverride, dryRun };
}

// ──────────────────────────────────────────────────────────────────────────
// Fetch + zapis pojedynczego targetu
// ──────────────────────────────────────────────────────────────────────────

/** Rozwiąż URL + domyślną ścieżkę zapisu dla targetu. */
function planTarget(target: Target): { url: string; defaultFile: string; label: string } {
  if (target.kind === "list") {
    return {
      url: `${TIBIA_URLS.auctionList}&currentpage=${target.page}`,
      defaultFile: listFixtureFile(target.page),
      label: `list ${target.page}`,
    };
  }
  return {
    url: TIBIA_URLS.auctionDetail(target.id),
    defaultFile: detailFixtureFile(target.id),
    label: `detail ${target.id}`,
  };
}

async function fileSizeBytes(path: string): Promise<number | null> {
  try {
    const s = await stat(path);
    return s.size;
  } catch {
    return null; // plik nie istnieje
  }
}

async function fetchOne(
  target: Target,
  outOverride: string | null,
  dryRun: boolean,
): Promise<void> {
  const { url, defaultFile, label } = planTarget(target);
  const outFile = outOverride ?? defaultFile;
  const outPath = resolve(FIXTURES_DIR, outFile);

  if (dryRun) {
    const before = await fileSizeBytes(outPath);
    console.log(
      `[fetch-fixture][dry-run] GET ${label} → ${outPath}` +
        (before !== null ? ` (istnieje: ${before} B)` : " (nowy plik)"),
    );
    return;
  }

  console.log(`[fetch-fixture] ${label}: GET ${url}`);
  const html = await defaultHttpClient.fetchHtml(url, {
    budgetEndpoint: `fixture-${label.replace(/\s+/g, "-")}`,
  });

  const before = await fileSizeBytes(outPath);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, "utf8");

  const after = Buffer.byteLength(html, "utf8");
  const diff =
    before !== null && before > 0
      ? ((after - before) / before) * 100
      : null;
  const diffNote =
    diff !== null
      ? ` (było ${before} B, zmiana ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%)`
      : " (nowy plik)";
  console.log(`[fetch-fixture] saved ${after} bytes → ${outPath}${diffNote}`);

  // Ostrzeżenie o możliwym redesignie Tibii (R1) — rozmiar drastycznie inny.
  if (diff !== null && Math.abs(diff) > 5) {
    console.warn(
      `[fetch-fixture][WARN] Rozmiar ${label} zmienił się o ${Math.abs(diff).toFixed(1)}% (>5%). ` +
        `Możliwa zmiana HTML Tibii — sprawdź czy parser nadal działa (testy regresyjne!).`,
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { targets, outOverride, dryRun } = parseArgs(process.argv.slice(2));

  // `--out` ma sens tylko przy pojedynczym targetcie.
  if (outOverride !== null && targets.length > 1) {
    throw new Error("--out można użyć tylko z jednym targetem");
  }

  console.log(
    `[fetch-fixture] plan: ${targets.length} target(s)` +
      (dryRun ? " (DRY-RUN — nic nie pobieram)" : ""),
  );
  // Sekwencyjnie — http-client (T29) i tak wymusza max 2 concurrent + 500 ms.
  for (const t of targets) {
    await fetchOne(t, outOverride, dryRun);
  }
  console.log("[fetch-fixture] done.");
}

main().catch((err: unknown) => {
  console.error("[fetch-fixture] failed:", err);
  process.exit(1);
});
