/**
 * pg-backed `AdvisoryLockClient` — produkcyjna implementacja locka (arch §8.3).
 *
 * Dlaczego ten plik istnieje:
 *   `apps/scraper/src/index.ts:28` dokumentuje wzorzec
 *   `startScheduler(db, { lockClient: createPgAdvisoryLockClient(pool) })`,
 *   ale ta funkcja **nie istniała nigdzie w repo** (grep: 0 trafień).
 *   Bez niej scheduler w produkcji nie ma mutexa — a bez mutexa 3 pętle
 *   mogą się nałożyć (plan §8.3: "NIE uruchamiaj wszystkich pętli
 *   jednocześnie BEZ advisory lock").
 *
 * ⚠️ KLUCZOWA DECYZJA — DEDYKOWANE POŁĄCZENIE, NIE `pool.query()`
 *   Advisory locki w PostgreSQL są **session-scoped**: lock należy do
 *   konkretnego backendu (połączenia). `pg_try_advisory_lock` wywołane
 *   przez `pool.query()` może trafić na inne połączenie niż późniejsze
 *   `pg_advisory_unlock`, a pool może oddać połączenie do puli natychmiast
 *   po zapytaniu — co **cicho zwalnia lock**.
 *
 *   Dlatego: leniwie dzierżawimy JEDNO połączenie (`pool.connect()`) przy
 *   pierwszym użyciu i trzymamy je aż do `end()`. Nie "upraszczaj" tego
 *   z powrotem do `pool.query()` — to wprowadzi trudny do wykrycia bug
 *   (dwie pętle scrapujące równolegle → ban od Tibii).
 *
 * Brak importu `pg`:
 *   `apps/scraper` nie ma `pg` w zależnościach (tylko `@tibians/db`).
 *   Używamy minimalnego widoku strukturalnego — `pg.Pool` spełnia go
 *   strukturalnie, więc nie tworzymy zbędnego couplingu z typami `pg`.
 */
import type { AdvisoryLockClient } from './advisory-lock.js';

/** Minimalny strukturalny widok `pg.PoolClient` (bez zależności od `pg`). */
export interface PgClientLike {
  query<R = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: R[] }>;
  release(): void;
}

/** Minimalny strukturalny widok `pg.Pool` (bez zależności od `pg`). */
export interface PgPoolLike {
  connect(): Promise<PgClientLike>;
}

/**
 * Tworzy `AdvisoryLockClient` na bazie poola Postgresa.
 *
 * Kontrakt:
 *   - `tryAdvisoryLock(key)` → `pg_try_advisory_lock` (natychmiastowe true/false;
 *     nigdy nie blokuje — scheduler pomija iterację gdy `false`),
 *   - `releaseAdvisoryLock(key)` → `pg_advisory_unlock` (best-effort),
 *   - `end()` → oddaje dzierżawione połączenie do puli (NIE zamyka poola).
 *
 * @param pool — `pg.Pool` (lub dowolny obiekt spełniający `PgPoolLike`).
 */
export function createPgAdvisoryLockClient(pool: PgPoolLike): AdvisoryLockClient {
  /**
   * Dzierżawione połączenie. Trzymane między wywołaniami, bo lock jest
   * session-scoped. `null` = jeszcze nie połączono (lazy init).
   */
  let client: PgClientLike | null = null;

  async function acquireClient(): Promise<PgClientLike> {
    if (client === null) {
      client = await pool.connect();
    }
    return client;
  }

  return {
    async tryAdvisoryLock(key: bigint): Promise<boolean> {
      const conn = await acquireClient();
      // `bigint` → string: node-postgres nie ma typu parametru dla bigint.
      const result = await conn.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
        [key.toString()],
      );
      return result.rows[0]?.acquired === true;
    },

    async releaseAdvisoryLock(key: bigint): Promise<void> {
      // Best-effort: jeśli nigdy nie dzierżawiliśmy połączenia, nie ma czego zwalniać.
      if (client === null) return;
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [key.toString()]);
    },

    async end(): Promise<void> {
      if (client === null) return;
      const conn = client;
      client = null;
      conn.release();
    },
  };
}
