/**
 * GET /api/auth/me — kim jestem i co mi wolno (T78 + T83).
 *
 * Używane przez UI do renderowania nagłówka (avatar vs „Zaloguj") oraz przez
 * komponenty premium do decyzji o blur/gate. Zwraca też uprawnienia, żeby
 * klient nie musiał odpytywać drugiego endpointu.
 *
 * Zawsze 200 — brak sesji to nie błąd, tylko `authenticated: false`.
 *
 * Odporność na brak DB: gdy baza jest niedostępna (np. `next build` bez
 * `DATABASE_URL`), zwracamy `anonymous` zamiast wywalać render. Ten sam
 * wzorzec stosuje reszta serwerowych helperów w projekcie.
 */
import { getEntitlements, type Entitlements } from "@/lib/auth/entitlements";
import { getSessionUser } from "@/lib/auth/session";
import { jsonResponse } from "@/lib/server/json";

export const dynamic = "force-dynamic";

const ANONYMOUS: Entitlements = {
  discordId: null,
  isPremium: false,
  reason: "anonymous",
};

export async function GET(): Promise<Response> {
  const user = await getSessionUser();

  if (user === null) {
    return jsonResponse(
      { authenticated: false, user: null, entitlements: ANONYMOUS },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  let entitlements: Entitlements;
  try {
    entitlements = await getEntitlements(user.discordId);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[api/auth/me] entitlements lookup failed:", error);
    entitlements = { discordId: user.discordId, isPremium: false, reason: "no-grant" };
  }

  return jsonResponse(
    { authenticated: true, user, entitlements },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
