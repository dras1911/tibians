/**
 * Server-side helper: pobiera `BlessingsConfig` (T20) z `getConfig()` (T16),
 * z fallbackiem do wartości z `CALCULATOR_CONFIG_SEED` gdy DB nie jest
 * dostępna (np. przy `next build`, w testach jednostkowych, w dev bez
 * postawionego Postgres).
 *
 * Wspierane klucze konfiguracyjne (packages/db/src/seed/calculator-config.ts):
 *   - blessing.cost_per_blessing_level_1    (default  2 000)
 *   - blessing.cost_per_blessing_level_100  (default 16 000)
 *   - blessing.cost_per_blessing_level_200  (default 26 000)
 *
 * Każda wartość jest walidowana (integer > 0) — corrupted config → fallback
 * do seeda (zamiast crash).
 *
 * Spójność seeda z piece-wise formułą TibiaWiki R(L) jest weryfikowana
 * przez `isBlessingsConfigConsistent` z `@tibians/calc` — jeśli 3 wartości
 * seed nie są spójne z formułą, zwracamy seed defaults (bezpieczny fallback).
 *
 * Wzorzec mirrorowany z `stamina-config.ts` (T18) i `imbuement-config.ts`
 * (T20) dla spójności obsługi config-loader w całej aplikacji.
 */
import {
  isBlessingsConfigConsistent,
  type BlessingsConfig,
} from "@tibians/calc";
import { CALCULATOR_CONFIG_SEED } from "@tibians/db/seed";

const SEED_DEFAULTS: BlessingsConfig = {
  costPerBlessingLevel1: 2_000,
  costPerBlessingLevel100: 16_000,
  costPerBlessingLevel200: 26_000,
};

/**
 * Czyta pojedynczy klucz z seeda. Używane jako fallback gdy DB nie
 * odpowiada lub klucz jest corrupted.
 */
function readSeed(key: string): number {
  const entry = CALCULATOR_CONFIG_SEED.find((e) => e.key === key);
  if (!entry || typeof entry.value !== "number") {
    throw new Error(`[blessings-config] Missing or invalid seed for key "${key}"`);
  }
  return entry.value;
}

/**
 * Sanityzuje pojedynczą wartość configu: musi być integer > 0.
 * W przeciwnym razie rzuca — caller decyduje o fallbacku.
 */
function assertPositiveInteger(name: string, value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `[blessings-config] "${name}" must be a positive integer, got ${String(value)}`,
    );
  }
  return value;
}

/**
 * Bezpieczny odczyt pojedynczego klucza. Próbuje `getConfig(key)`; przy
 * każdym błędzie (DB down, corrupted value, missing key) → seed.
 */
async function safeRead(
  getConfig: (key: string) => Promise<unknown>,
  key: string,
  seedKey: string,
): Promise<number> {
  try {
    const raw = await getConfig(key);
    if (raw === null || raw === undefined) {
      return readSeed(seedKey);
    }
    return assertPositiveInteger(key, raw);
  } catch {
    return readSeed(seedKey);
  }
}

/**
 * Ładuje `BlessingsConfig` z `getConfig()` (T16) z fallbackiem do seeda.
 *
 * Zachowanie:
 *   - DB dostępna + wszystkie klucze poprawne + wartości spójne z R(L)
 *     → wartości z DB.
 *   - DB niedostępna / brak klucza / corrupted / wartości niespójne z R(L)
 *     → wartości z seeda (build-time, dev bez Postgres, testy jednostkowe).
 *
 * @example
 * ```ts
 * // apps/web/src/app/[locale]/calculators/blessings/page.tsx
 * const config = await loadBlessingsConfig();
 * ```
 */
export async function loadBlessingsConfig(): Promise<BlessingsConfig> {
  let getConfig: (key: string) => Promise<unknown>;
  try {
    const dbModule = await import("@tibians/db");
    getConfig = dbModule.getConfig as (key: string) => Promise<unknown>;
  } catch {
    return { ...SEED_DEFAULTS };
  }

  const [
    costPerBlessingLevel1,
    costPerBlessingLevel100,
    costPerBlessingLevel200,
  ] = await Promise.all([
    safeRead(
      getConfig,
      "blessing.cost_per_blessing_level_1",
      "blessing.cost_per_blessing_level_1",
    ),
    safeRead(
      getConfig,
      "blessing.cost_per_blessing_level_100",
      "blessing.cost_per_blessing_level_100",
    ),
    safeRead(
      getConfig,
      "blessing.cost_per_blessing_level_200",
      "blessing.cost_per_blessing_level_200",
    ),
  ]);

  const candidate: BlessingsConfig = {
    costPerBlessingLevel1,
    costPerBlessingLevel100,
    costPerBlessingLevel200,
  };

  // Sprawdź spójność z piece-wise formułą TibiaWiki R(L) — corrupted
  // seed (ręczna zmiana w DB) → fallback do SEED_DEFAULTS.
  if (!isBlessingsConfigConsistent(candidate)) {
    return { ...SEED_DEFAULTS };
  }

  return candidate;
}