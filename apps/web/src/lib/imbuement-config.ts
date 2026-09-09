/**
 * Server-side helper: pobiera `ImbuementConfig` (T20) z `getConfig()` (T16),
 * z fallbackiem do wartości z `CALCULATOR_CONFIG_SEED` gdy DB nie jest
 * dostępna (np. przy `next build`, w testach jednostkowych, w dev bez
 * postawionego Postgres).
 *
 * Wspierane klucze konfiguracyjne (packages/db/src/seed/calculator-config.ts):
 *   - imbuement.basic_slot_cost_tc     (default 25)
 *   - imbuement.powerful_slot_cost_tc  (default 150)
 *   - imbuement.fee_basic_gp           (default  7 500)
 *   - imbuement.fee_intricate_gp       (default 60 000)
 *   - imbuement.fee_powerful_gp        (default 250 000)
 *   - imbuement.duration_hours         (default 20)
 *
 * Każda wartość jest walidowana (integer > 0) — corrupted config → fallback
 * do seeda (zamiast crash).
 *
 * Wzorzec mirrorowany z `stamina-config.ts` (T18) dla spójności obsługi
 * config-loader w całej aplikacji.
 */
import type { ImbuementConfig } from "@tibians/calc";
import { CALCULATOR_CONFIG_SEED } from "@tibians/db/seed";

const SEED_DEFAULTS: ImbuementConfig = {
  basicSlotCostTc: 25,
  powerfulSlotCostTc: 150,
  feeBasicGp: 7_500,
  feeIntricateGp: 60_000,
  feePowerfulGp: 250_000,
  durationHours: 20,
};

/**
 * Czyta pojedynczy klucz z seeda. Używane jako fallback gdy DB nie
 * odpowiada lub klucz jest corrupted.
 */
function readSeed(key: string): number {
  const entry = CALCULATOR_CONFIG_SEED.find((e) => e.key === key);
  if (!entry || typeof entry.value !== "number") {
    throw new Error(`[imbuement-config] Missing or invalid seed for key "${key}"`);
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
      `[imbuement-config] "${name}" must be a positive integer, got ${String(value)}`,
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
 * Ładuje `ImbuementConfig` z `getConfig()` (T16) z fallbackiem do seeda.
 *
 * Zachowanie:
 *   - DB dostępna + wszystkie klucze poprawne → wartości z DB (honoruje
 *     arch §16 Faza 1B: zmiana balansu gry = UPDATE w bazie, BEZ redeploya).
 *   - DB niedostępna / brak klucza / corrupted → wartości z seeda
 *     (build-time, dev bez Postgres, testy jednostkowe).
 *
 * @example
 * ```ts
 * // apps/web/src/app/[locale]/calculators/imbuement/page.tsx
 * const config = await loadImbuementConfig();
 * ```
 */
export async function loadImbuementConfig(): Promise<ImbuementConfig> {
  let getConfig: (key: string) => Promise<unknown>;
  try {
    const dbModule = await import("@tibians/db");
    getConfig = dbModule.getConfig as (key: string) => Promise<unknown>;
  } catch {
    // @tibians/db nie załadował się (np. brak DATABASE_URL).
    // Fallback do seeda.
    return { ...SEED_DEFAULTS };
  }

  const [
    basicSlotCostTc,
    powerfulSlotCostTc,
    feeBasicGp,
    feeIntricateGp,
    feePowerfulGp,
    durationHours,
  ] = await Promise.all([
    safeRead(getConfig, "imbuement.basic_slot_cost_tc", "imbuement.basic_slot_cost_tc"),
    safeRead(
      getConfig,
      "imbuement.powerful_slot_cost_tc",
      "imbuement.powerful_slot_cost_tc",
    ),
    safeRead(getConfig, "imbuement.fee_basic_gp", "imbuement.fee_basic_gp"),
    safeRead(getConfig, "imbuement.fee_intricate_gp", "imbuement.fee_intricate_gp"),
    safeRead(getConfig, "imbuement.fee_powerful_gp", "imbuement.fee_powerful_gp"),
    safeRead(getConfig, "imbuement.duration_hours", "imbuement.duration_hours"),
  ]);

  return {
    basicSlotCostTc,
    powerfulSlotCostTc,
    feeBasicGp,
    feeIntricateGp,
    feePowerfulGp,
    durationHours,
  };
}