/**
 * GET /api/auth/callback/discord — powrót z ekranu zgody Discorda (T78).
 *
 * Kroki:
 *   1. Odczytaj `code` + `state`; skasuj cookie `state` (jednorazowe).
 *   2. Zweryfikuj `state` (ochrona przed login-CSRF) — niezgodność = odrzuć.
 *   3. Wymień `code` na `access_token` (client_secret zostaje na serwerze).
 *   4. Pobierz profil (`GET /users/@me`).
 *   5. `upsertUser` — założ/odśwież profil.
 *   6. Podpisz sesję i ustaw cookie; przekieruj do strony głównej.
 *
 * KAŻDA ścieżka błędu kończy się przekierowaniem (nie JSON-em) — użytkownik
 * tu przychodzi z przeglądarki, więc ma zobaczyć stronę, nie goły JSON.
 * Powód błędu jedzie w `?auth=…`, żeby UI mógł pokazać sensowny komunikat.
 */
import { db, upsertUser } from "@tibians/db";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  exchangeCodeForToken,
  fetchDiscordUser,
  isDiscordConfigured,
  OAUTH_STATE_COOKIE,
} from "@/lib/auth/discord";
import { encodeSession, setSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Bazowy URL strony (spójny z `redirect_uri` w panelu Discord). */
function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

/** Przekierowanie na stronę główną z kodem błędu (UI go odczyta). */
function redirectWithError(reason: string): NextResponse {
  const url = new URL(siteBase());
  url.searchParams.set("auth", "error");
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isDiscordConfigured()) {
    return redirectWithError("not-configured");
  }

  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const discordError = params.get("error");

  // `state` jest jednorazowy — kasujemy niezależnie od wyniku weryfikacji.
  const store = await cookies();
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value;
  store.delete(OAUTH_STATE_COOKIE);

  // Użytkownik odmówił dostępu na ekranie zgody.
  if (discordError !== null) {
    return redirectWithError("access-denied");
  }

  if (code === null || code.length === 0) {
    return redirectWithError("missing-code");
  }

  if (expectedState === undefined || state === null || state !== expectedState) {
    return redirectWithError("state-mismatch");
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const profile = await fetchDiscordUser(accessToken);

    await upsertUser(db, {
      discordId: profile.id,
      username: profile.username,
      globalName: profile.globalName,
      avatarUrl: profile.avatarUrl,
      // Scope `identify` nie zawiera e-maila — zostawiamy NULL, a `upsertUser`
      // nie nadpisze ewentualnego adresu zapisanego wcześniej.
      email: null,
    });

    const token = encodeSession({
      discordId: profile.id,
      username: profile.globalName ?? profile.username,
      avatarUrl: profile.avatarUrl,
    });

    if (token === null) {
      // `SESSION_SECRET` nieustawiony — nie udajemy udanego logowania.
      return redirectWithError("session-secret-missing");
    }

    await setSessionCookie(token);

    const url = new URL(siteBase());
    url.searchParams.set("auth", "ok");
    return NextResponse.redirect(url, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[api/auth/callback/discord] login failed:", error);
    return redirectWithError("exchange-failed");
  }
}
