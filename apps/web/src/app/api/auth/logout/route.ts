/**
 * POST /api/auth/logout — wylogowanie (T78).
 *
 * POST (nie GET), żeby wylogowania nie dało się wywołać przez zwykły link
 * ani obrazek `<img src>` — to mutacja stanu, wymaga świadomej akcji UI.
 *
 * Sesja jest bezstanowa (podpisane cookie), więc „wylogowanie" to po prostu
 * skasowanie cookie. Nie ma serwerowej listy sesji do unieważnienia.
 */
import { clearSessionCookie } from "@/lib/auth/session";
import { jsonResponse } from "@/lib/server/json";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  await clearSessionCookie();

  return jsonResponse(
    { ok: true },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
