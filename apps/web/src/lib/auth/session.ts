import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

/**
 * Sesja użytkownika (T78) — podpisane HMAC cookie, bez stanu w DB.
 *
 * Dlaczego bez tabeli `sessions`:
 *   Nie potrzebujemy unieważniania pojedynczych sesji (brak ról, brak
 *   urządzeń do wylogowania zdalnego). Podpisane cookie daje to samo
 *   bezpieczeństwo przy zerowym koszcie DB i bez rundy zapytania na każdy
 *   request. Gdy w przyszłości pojawi się potrzeba rewokacji (np. „wyloguj
 *   wszystkie urządzenia"), dodamy tabelę `sessions` bez zmiany publicznego
 *   API tego modułu.
 *
 * Format: `base64url(JSON payload) + "." + base64url(HMAC-SHA256)`
 * `<iat>` w payloadzie służy do egzekwowania TTL po stronie serwera —
 * `maxAge` cookie jest tylko podpowiedzią dla przeglądarki (klient może ją
 * zignorować, więc nie może być jedyną kontrolą).
 *
 * `SESSION_SECRET` NIE MOŻE być opcjonalny w produkcji, ale ten moduł nie
 * rzuca wyjątkiem przy jego braku — zwraca `null` (czyli „brak sesji").
 * Inaczej cały build/render wywalałby się na środowisku bez sekretu
 * (np. `next build` bez `.env.production`).
 */

/** Nazwa cookie sesyjnego. */
export const SESSION_COOKIE_NAME = "tibians_session";

/** TTL sesji: 30 dni (w sekundach) — zarówno dla cookie, jak i dla `<iat>`. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Minimalna długość sekretu — `openssl rand -hex 32` daje 64 znaki. */
const MIN_SECRET_LENGTH = 16;

/** Dane użytkownika trzymane w sesji (podzbiór tabeli `users`). */
export interface SessionUser {
  readonly discordId: string;
  readonly username: string;
  readonly avatarUrl: string | null;
}

interface SessionPayload extends SessionUser {
  /** Issued-at (ms epoch) — podstawa wygaśnięcia. */
  readonly iat: number;
}

function getSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (secret === undefined || secret.length < MIN_SECRET_LENGTH) return null;
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Buduje podpisany token sesji.
 *
 * @returns token albo `null`, gdy `SESSION_SECRET` nie jest skonfigurowany.
 */
export function encodeSession(
  user: SessionUser,
  issuedAt: number = Date.now(),
): string | null {
  const secret = getSecret();
  if (secret === null) return null;

  const payload: SessionPayload = { ...user, iat: issuedAt };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.discordId === "string" &&
    candidate.discordId.length > 0 &&
    typeof candidate.username === "string" &&
    (typeof candidate.avatarUrl === "string" || candidate.avatarUrl === null) &&
    typeof candidate.iat === "number" &&
    Number.isFinite(candidate.iat)
  );
}

/**
 * Weryfikuje token i zwraca użytkownika.
 *
 * Sprawdza: format, podpis (constant-time), kształt payloadu oraz TTL.
 * Każde niezgodne wejście → `null` (traktowane jak brak sesji, nigdy wyjątek —
 * token pochodzi od klienta).
 */
export function decodeSession(
  token: string,
  now: number = Date.now(),
): SessionUser | null {
  const secret = getSecret();
  if (secret === null) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const encoded = token.slice(0, separator);
  const providedSignature = token.slice(separator + 1);

  const expectedSignature = sign(encoded, secret);
  const providedBuffer = Buffer.from(providedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  // `timingSafeEqual` wymaga równej długości — różna długość to i tak brak zgodności.
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!isSessionPayload(parsed)) return null;

  const ageSeconds = (now - parsed.iat) / 1000;
  if (ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE_SECONDS) return null;

  return {
    discordId: parsed.discordId,
    username: parsed.username,
    avatarUrl: parsed.avatarUrl,
  };
}

/** Odczytuje sesję z cookie bieżącego requestu (RSC, route handler, server action). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token === undefined) return null;
  return decodeSession(token);
}

/**
 * Zwraca `discordId` zalogowanego użytkownika — wygodne dla
 * `getEntitlements(await getCurrentDiscordId())`.
 */
export async function getCurrentDiscordId(): Promise<string | null> {
  const user = await getSessionUser();
  return user?.discordId ?? null;
}

/**
 * Ustawia cookie sesyjne.
 *
 * `httpOnly` — token nie może być czytany przez JS (ochrona przed XSS).
 * `secure` — tylko po HTTPS (wyłączamy lokalnie, żeby dev na `http://localhost`
 * działał; w produkcji zawsze włączone).
 * `sameSite: "lax"` — wystarcza (żądania cross-site nie muszą nosić sesji),
 * a nie psuje powrotu z OAuth (GET redirect).
 */
export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Kasuje cookie sesyjne (wylogowanie). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
