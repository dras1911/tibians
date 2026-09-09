/**
 * BigInt-safe JSON serialization (arch. §8.2 + task 38).
 *
 * Node 22 + Next.js 15 NIE obsługuje `JSON.stringify(BigInt)` natywnie:
 *   > TypeError: Do not know how to serialize a BigInt
 *
 * Aukcje Bazaar mają kilka bigintów: `id` (auctionId, primary key z tibia.com
 * — przekracza Number.MAX_SAFE_INTEGER), `goldTotal` (bank+inventory+depot).
 * Musimy serializować je jako string w odpowiedziach JSON.
 *
 * Reguły (arch. §13.1 — CharacterSnapshot używa bigint dla auctionId):
 *   1. BigInt → string (decimal, bez "n" suffix)
 *   2. Zagnieżdżone obiekty/tablice przetwarzamy rekurencyjnie
 *   3. Date → ISO string (Next.js domyślnie robi to samo, ale jawnie dla
 *      spójności z testami)
 *   4. `null` / `undefined` → `null` w JSON (zachowanie Next.js Response.json)
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Konwertuje obiekt z potencjalnymi BigInt/Date do bezpiecznej struktury JSON.
 *
 * @example
 *   jsonSafe({ id: 2173376n, gold: 25000000n })
 *   // → { id: "2173376", gold: "25000000" }
 */
export function jsonSafe<T>(value: T): JsonValue {
  return _jsonSafe(value, new WeakSet()) as JsonValue;
}

function _jsonSafe(value: unknown, seen: WeakSet<object>): unknown {
  // null / undefined → null
  if (value === null || value === undefined) return null;

  // BigInt → string (decimal representation)
  if (typeof value === "bigint") return value.toString();

  // Date → ISO string (Next.js standard)
  if (value instanceof Date) return value.toISOString();

  // Primitives — pass through
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") return value;

  // Tablice
  if (Array.isArray(value)) {
    return value.map((v) => _jsonSafe(v, seen));
  }

  // Obiekty
  if (typeof value === "object") {
    if (seen.has(value as object)) return null;
    seen.add(value as object);

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = _jsonSafe(v, seen);
    }
    return result;
  }

  return null;
}

/**
 * Pomocnik do budowania `Response` JSON z bezpieczną serializacją BigInt.
 * Zastępuje `Response.json()` dla endpointów zwracających aukcje.
 */
export function jsonResponse(
  body: unknown,
  init?: ResponseInit,
): Response {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(jsonSafe(body)), {
    ...init,
    headers,
  });
}
