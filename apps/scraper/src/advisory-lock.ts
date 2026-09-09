/**
 * Advisory lock oparty o `pg_try_advisory_lock` (Postgres-level mutex).
 *
 * Źródło: architektura §3.1 (Postgres: JSONB, partial indexes, pg_try_advisory_lock
 * przeciw równoległym scrape'om) i §8.3 (zabezpieczenia 3-pętlowego schedulera).
 *
 * Wzorzec:
 *   - haszuj nazwę logiczną do `bigint` (np. `hash('full_scrape')`),
 *   - spróbuj `pg_try_advisory_lock(bigint)` — natychmiastowy wynik (true/false),
 *   - jeśli true → wykonaj callback → zwolnij lock,
 *   - jeśli false → zwróć `null` (caller wie, że inny proces już pracuje).
 *
 * Uwaga o abstrakcji: moduł **nie importuje `@tibians/db`** bezpośrednio — zamiast
 * tego przyjmuje `lockClient` przez opcje. Powód: (a) testy muszą móc
 * wstrzyknąć fake'a bez podnoszenia realnego poola, (b) `apps/scraper` nie
 * ma jeszcze sztywnego couplingu z `packages/db` — to dopiero task 34+ ustali
 * finalne kształty connection managera.
 */

import { createHash } from "node:crypto";

/** Minimalny kontrakt klienta locka (realny Drizzle pool, test-fake, itp.). */
export interface AdvisoryLockClient {
  /** Wywołaj `pg_try_advisory_lock(bigint)`. */
  tryAdvisoryLock(key: bigint): Promise<boolean>;
  /** Wywołaj `pg_advisory_unlock(bigint)` (best-effort). */
  releaseAdvisoryLock(key: bigint): Promise<void>;
  /** Opcjonalne czyszczenie poola przy fatal errors. */
  end?(): Promise<void>;
}

/** Opcje `tryAdvisoryLock`. */
export interface AdvisoryLockOptions {
  /** Klient DB (albo factory leniwy). Jeśli pominięty → lock "zawsze wolny" (test). */
  client?: AdvisoryLockClient | (() => Promise<AdvisoryLockClient>);
  /** Deterministyczny hash nazwy → bigint. Domyślnie: SHA-256 → `BigInt` z pierwszych 8 bajtów (signed → 64-bit). */
  hash?: (name: string) => bigint;
  /** Logger (np. `console.warn`) — wywoływany tylko gdy lock nie udał się zdobyć. */
  onSkipped?: ((name: string) => void) | undefined;
}

/**
 * Deterministyczny hash stringu → `bigint` (64-bit signed).
 *
 * Implementacja: SHA-256 → bierzemy pierwsze 8 bajtów → interpretujemy jako
 * bigint signed (zakres -2^63 .. 2^63-1). To odpowiada zakresowi
 * `pg_try_advisory_lock(bigint)`, który wewnętrznie mapuje na int8.
 *
 * Deterministyczność jest **kluczowa** — każdy proces musi wygenerować ten
 * sam hash dla tej samej nazwy logicznej, inaczej blokady nie pokryją się.
 */
export function hashAdvisoryKey(name: string): bigint {
  const digest = createHash("sha256").update(name, "utf8").digest();
  // Pierwsze 8 bajtów → bigint unsigned (0 .. 2^64-1).
  const unsigned = BigInt("0x" + digest.subarray(0, 8).toString("hex"));
  // Konwersja do signed 64-bit: jeśli ustawiony najstarszy bit, odejmij 2^64.
  const SIGN_BIT = 1n << 63n;
  return (unsigned & SIGN_BIT) !== 0n ? unsigned - (1n << 64n) : unsigned;
}

/**
 * Spróbuj zdobyć advisory lock. Jeśli się udało → wykonaj callback i zwróć
 * jego wynik. Jeśli nie → zwróć `null` (caller: drugi proces już pracuje).
 *
 * UWAGI:
 *   - wyjątek z callbacka **propaguje się** do wywołującego, ale lock jest
 *     zawsze zwalniany w `finally`.
 *   - po zwolnienieniu locka, sam `client` NIE jest zamykany — to odpowiedzialność
 *     connection pool managera wyżej.
 */
export async function tryAdvisoryLock<T>(
  name: string,
  callback: () => Promise<T>,
  options: AdvisoryLockOptions = {},
): Promise<T | null> {
  const hash = options.hash ?? hashAdvisoryKey;
  const key = hash(name);

  // Brak klienta = tryb "zawsze wolny" (dla wczesnych testów/scaffold).
  // Logujemy ostrzeżenie, żeby deployment z prawdziwym Postgresem nie
  // uruchomił się przypadkiem w tym trybie.
  let client: AdvisoryLockClient | undefined;
  if (typeof options.client === "function") {
    client = await options.client();
  } else {
    client = options.client;
  }
  if (!client) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        `[advisory-lock] No client configured for "${name}" — lock is a no-op. ` +
          "Production deployments MUST inject a Postgres-backed client.",
      );
    }
    return await callback();
  }

  const acquired = await client.tryAdvisoryLock(key);
  if (!acquired) {
    options.onSkipped?.(name);
    return null;
  }

  try {
    return await callback();
  } finally {
    try {
      await client.releaseAdvisoryLock(key);
    } catch (err) {
      // Logujemy, ale nie przesłaniamy ewentualnego wyjątku z callbacka.
      console.error(
        `[advisory-lock] Failed to release lock "${name}" (key=${key}):`,
        err,
      );
    }
  }
}