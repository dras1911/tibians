/**
 * GET /api/auth/login/discord — start logowania przez Discord (T78).
 *
 * Kroki:
 *   1. Sprawdź konfigurację (CLIENT_ID/SECRET) — brak = czytelny 503 (a nie
 *      `client_id=` w URL Discorda, co daje mylący błąd po ich stronie).
 *   2. Wygeneruj losowy `state` (ochrona przed login-CSRF).
 *   3. Zapisz `state` w httpOnly cookie (krótki TTL — 10 min).
 *   4. Przekieruj na ekran zgody Discorda.
 *
 * Użytkownik zobaczy tam **nazwę aplikacji** („Tibians Tools"), a nie nick
 * właściciela aplikacji — nazwa pochodzi z panelu Discord Developers, nie
 * z konta, którym się logujesz.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  buildAuthorizeUrl,
  generateState,
  isDiscordConfigured,
  OAUTH_STATE_COOKIE,
} from "@/lib/auth/discord";

export const dynamic = "force-dynamic";

/** TTL cookie `state` — wystarcza na przejście przez ekran zgody Discorda. */
const STATE_MAX_AGE_SECONDS = 600;

export async function GET(): Promise<Response> {
  if (!isDiscordConfigured()) {
    return NextResponse.json(
      {
        error: "DiscordNotConfigured",
        message:
          "Logowanie przez Discord nie jest skonfigurowane. Ustaw DISCORD_CLIENT_ID i DISCORD_CLIENT_SECRET.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const state = generateState();

  const store = await cookies();
  store.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_MAX_AGE_SECONDS,
  });

  return NextResponse.redirect(buildAuthorizeUrl(state));
}
