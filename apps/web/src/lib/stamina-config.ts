/**
 * Server-side helper: pobiera `StaminaConfig` (T15) z `getConfig()` (T16),
 * z fallbackiem do wartości z `CALCULATOR_CONFIG_SEED` gdy DB nie jest
 * dostępna (np. przy `next build`, w testach jednostkowych, w dev bez
 * postawionego Postgres).
 *
 * Wspierane klucze konfiguracyjne (packages/db/src/seed/calculator-config.ts):
 *   - stamina.regen_minutes_per_hour            (default 3)
 *   - stamina.regen_minutes_per_hour_free       (default 6)
 *   - stamina.hours_per_day_full                (default 42)
 *   - stamina.hours_per_day_full_free           (default 40)
 *   - stamina.green_zone_start_hours            (default 39)
 *
 * Każda wartość jest walidowana (integer > 0) — corrupted config → fallback
 * do seeda (zamiast crash).
 *
 * Dlaczego helper a nie inline w page.tsx: 5 kluczy + fallback + walidacja
 * to ~40 linii logiki. Wydzielenie pozwala:
 *   - reużyć w innych stronach (np. workspace scenario editor, T25-26)
 *   - pokryć testami (T16 filozofia: config loader ma testy, helper osobny)
 *
 * **Race-free**: helper jest `async`, ale wywołanie `getConfig()` wewnątrz
 * jest cache'owane przez LRU (T16) — powtórne wywołania w 60s nie dotykają
 * DB.
 */
import type { StaminaConfig } from "@tibians/calc";
import { CALCULATOR_CONFIG_SEED } from "@tibians/db/seed";

const SEED_DEFAULTS: StaminaConfig = {
  regenMinutesPerHour: 3,
  regenMinutesPerHourGreenZone: 6,
  greenZoneStartHours: 39,
  maxStaminaHours: 42,
};

/**
 * Czyta pojedynczy klucz z seeda. Używane jako fallback gdy DB nie
 * odpowiada lub klucz jest corrupted.
 */
function readSeed(key: string): number {
  const entry = CALCULATOR_CONFIG_SEED.find((e) => e.key === key);
  if (!entry || typeof entry.value !== "number") {
    throw new Error(`[stamina-config] Missing or invalid seed for key "${key}"`);
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
      `[stamina-config] "${name}" must be a positive integer, got ${String(value)}`,
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
 * Ładuje `StaminaConfig` z `getConfig()` (T16) z fallbackiem do seeda.
 *
 * Zachowanie:
 *   - DB dostępna + wszystkie klucze poprawne → wartości z DB (honoruje
 *     arch §16 Faza 1B: zmiana balansu gry = UPDATE w bazie, BEZ redeploya).
 *   - DB niedostępna / brak klucza / corrupted → wartości z seeda
 *     (build-time, dev bez Postgres, testy jednostkowe).
 *
 * @example
 * ```ts
 * // apps/web/src/app/[locale]/calculators/stamina/page.tsx
 * const config = await loadStaminaConfig();
 * ```
 */
export async function loadStaminaConfig(): Promise<StaminaConfig> {
  // Dynamic import @tibians/db wewnątrz funkcji — unika side-effectów
  // ('dotenv/config') na top-level module, które kolidowałyby z Next.js
  // static analysis przy `next build` bez DATABASE_URL.
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
    regenMinutesPerHour,
    regenMinutesPerHourGreenZone,
    greenZoneStartHours,
    hoursPerDayFull,
    hoursPerDayFullFree,
  ] = await Promise.all([
    safeRead(getConfig, "stamina.regen_minutes_per_hour", "stamina.regen_minutes_per_hour"),
    safeRead(
      getConfig,
      "stamina.regen_minutes_per_hour_free",
      "stamina.regen_minutes_per_hour_free",
    ),
    safeRead(
      getConfig,
      "stamina.green_zone_start_hours",
      "stamina.green_zone_start_hours",
    ),
    safeRead(getConfig, "stamina.hours_per_day_full", "stamina.hours_per_day_full"),
    safeRead(
      getConfig,
      "stamina.hours_per_day_full_free",
      "stamina.hours_per_day_full_free",
    ),
  ]);

  // `maxStaminaHours` jest wybierane per-request (zależy od isPremium
  // w formularzu), ale i tak walidujemy spójność obu wartości:
  // premium max > free max i oba > greenZoneStart.
  const maxPremium = hoursPerDayFull;
  const maxFree = hoursPerDayFullFree;
  if (maxPremium <= greenZoneStartHours) {
    return { ...SEED_DEFAULTS };
  }
  if (maxFree <= greenZoneStartHours) {
    return { ...SEED_DEFAULTS };
  }

  return {
    regenMinutesPerHour,
    regenMinutesPerHourGreenZone,
    greenZoneStartHours,
    // Uwaga: UI wybiera premium/free po stronie klienta, więc
    // zwracamy TYLKO premium max. Formuła `staminaRegen` clampuje
    // do `config.maxStaminaHours`. Free account → UI przekazuje
    // `maxStaminaHours: maxFree` per wywołanie.
    maxStaminaHours: maxPremium,
  };
}

/**
 * Wariant dla kont free — zwraca StaminaConfig z `maxStaminaHours` ustawionym
 * na free-account cap (40h). Reużywa loadStaminaConfig dla reszty progów.
 */
export async function loadStaminaConfigFree(): Promise<StaminaConfig> {
  let getConfig: (key: string) => Promise<unknown>;
  try {
    const dbModule = await import("@tibians/db");
    getConfig = dbModule.getConfig as (key: string) => Promise<unknown>;
  } catch {
    return { ...SEED_DEFAULTS, maxStaminaHours: 40 };
  }
  const [base, hoursFree] = await Promise.all([
    loadStaminaConfig(),
    safeRead(
      getConfig,
      "stamina.hours_per_day_full_free",
      "stamina.hours_per_day_full_free",
    ),
  ]);
  return { ...base, maxStaminaHours: hoursFree };
}