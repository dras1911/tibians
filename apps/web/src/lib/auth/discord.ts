/**
 * Klient OAuth2 Discorda (T78) — logowanie użytkownika (NIE bot).
 *
 * Zakres: `identify` (id, username, global_name, avatar).
 * `email` NIE jest żądany — nie potrzebujemy go do niczego w MVP, a każdy
 * dodatkowy scope to większy ekran zgody i więcej danych osobowych.
 *
 * Przepływ (authorization code):
 *   1. `buildAuthorizeUrl(state)` → redirect przeglądarki na Discord
 *   2. Discord wraca na `/api/auth/callback/discord?code=…&state=…`
 *   3. `exchangeCodeForToken(code)` → access_token
 *   4. `fetchDiscordUser(accessToken)` → profil
 *
 * Bez zależności (`next-auth` itp.) — cały przepływ to dwa `fetch`e.
 */

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";

/** Nazwa cookie na parametr `state` (ochrona CSRF). */
export const OAUTH_STATE_COOKIE = "tibians_oauth_state";

/** Profil użytkownika zwracany przez `GET /users/@me` (tylko potrzebne pola). */
export interface DiscordProfile {
  readonly id: string;
  readonly username: string;
  readonly globalName: string | null;
  readonly avatarUrl: string | null;
}

interface DiscordTokenResponse {
  access_token?: unknown;
  token_type?: unknown;
}

interface DiscordUserResponse {
  id?: unknown;
  username?: unknown;
  global_name?: unknown;
  avatar?: unknown;
}

/**
 * Czy konfiguracja OAuth jest kompletna?
 *
 * Sprawdzane przy każdym wejściu na trasę logowania — brak konfiguracji ma
 * dawać czytelny komunikat, a nie `undefined` wklejone w URL Discorda.
 */
export function isDiscordConfigured(): boolean {
  return (
    (process.env.DISCORD_CLIENT_ID ?? "").length > 0 &&
    (process.env.DISCORD_CLIENT_SECRET ?? "").length > 0
  );
}

/**
 * Adres powrotu z Discorda.
 *
 * Musi być **identyczny** z tym w panelu Discord (OAuth2 → Redirects),
 * dlatego liczymy go z `NEXT_PUBLIC_SITE_URL` (ta sama wartość w dev i prod),
 * a nie z nagłówka `Host` (podatnego na spoofing).
 */
export function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/callback/discord`;
}

/** Buduje URL ekranu zgody Discorda. */
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? "",
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "identify",
    state,
    // `consent` wymusza ekran zgody także przy powtórnym logowaniu —
    // lepsze dla przejrzystości, gdy pokazujemy branding portalu.
    prompt: "consent",
  });
  return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;
}

/** Wymienia `code` na `access_token`. */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? "",
    client_secret: process.env.DISCORD_CLIENT_SECRET ?? "",
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
  });

  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Discord token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as DiscordTokenResponse;
  if (typeof data.access_token !== "string" || data.access_token.length === 0) {
    throw new Error("Discord token exchange returned no access_token");
  }
  return data.access_token;
}

/**
 * Buduje URL awatara z CDN Discorda.
 *
 * Discord zwraca sam hash (albo `null`). Nowe konta bez awatara mają `null` —
 * wtedy zwracamy `null`, a UI pokazuje inicjał.
 */
function buildAvatarUrl(userId: string, avatarHash: string | null): string | null {
  if (avatarHash === null) return null;
  const extension = avatarHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${extension}?size=128`;
}

/** Pobiera profil zalogowanego użytkownika. */
export async function fetchDiscordUser(accessToken: string): Promise<DiscordProfile> {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Discord user fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as DiscordUserResponse;

  if (typeof data.id !== "string" || data.id.length === 0) {
    throw new Error("Discord user payload missing id");
  }
  if (typeof data.username !== "string" || data.username.length === 0) {
    throw new Error("Discord user payload missing username");
  }

  const avatarHash = typeof data.avatar === "string" ? data.avatar : null;

  return {
    id: data.id,
    username: data.username,
    globalName: typeof data.global_name === "string" ? data.global_name : null,
    avatarUrl: buildAvatarUrl(data.id, avatarHash),
  };
}

/**
 * Losowy `state` dla ochrony przed CSRF (atak „login CSRF": podstawienie
 * własnego kodu autoryzacyjnego ofierze).
 */
export function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
