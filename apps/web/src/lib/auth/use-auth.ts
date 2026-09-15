"use client";

import * as React from "react";

/**
 * useAuthState — stan zalogowania po stronie klienta (T78).
 *
 * Dlaczego fetch, a nie props z serwera:
 *   Komponenty, które tego potrzebują (`UserMenu`, workspace), są klienckie.
 *   Wciągnięcie sesji z `layout.tsx` wymagałoby `cookies()` w layoucie, co
 *   optuje CAŁE drzewo out of static rendering — koszt na każdej stronie.
 *   Lekki `/api/auth/me` po hydratacji nie blokuje renderu i nie psuje cache.
 *
 * Stan `loading` jest istotny: komponenty muszą odróżnić „jeszcze nie wiem"
 * od „wiem, że anonim". Bez tego zalogowany użytkownik zobaczyłby przez
 * chwilę UI dla anonimowych (miganie limitów, badge`3/3` zamiast `∞`).
 */
export interface AuthUser {
  readonly discordId: string;
  readonly username: string;
  readonly avatarUrl: string | null;
}

export interface AuthState {
  readonly status: "loading" | "anonymous" | "authenticated";
  readonly user: AuthUser | null;
  readonly isPremium: boolean;
}

const LOADING_STATE: AuthState = {
  status: "loading",
  user: null,
  isPremium: false,
};

const ANONYMOUS_STATE: AuthState = {
  status: "anonymous",
  user: null,
  isPremium: false,
};

interface MeResponse {
  readonly authenticated?: unknown;
  readonly user?: unknown;
  readonly entitlements?: unknown;
}

function parseMeResponse(raw: unknown): AuthState {
  if (typeof raw !== "object" || raw === null) return ANONYMOUS_STATE;

  const data = raw as MeResponse;
  if (data.authenticated !== true) return ANONYMOUS_STATE;

  const user = data.user as Partial<AuthUser> | null | undefined;
  if (
    user === null ||
    user === undefined ||
    typeof user.discordId !== "string" ||
    typeof user.username !== "string"
  ) {
    return ANONYMOUS_STATE;
  }

  const entitlements = data.entitlements as { isPremium?: unknown } | undefined;

  return {
    status: "authenticated",
    user: {
      discordId: user.discordId,
      username: user.username,
      avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : null,
    },
    isPremium: entitlements?.isPremium === true,
  };
}

export function useAuthState(): AuthState {
  const [state, setState] = React.useState<AuthState>(LOADING_STATE);

  React.useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<unknown>)
      .then((raw) => {
        if (!cancelled) setState(parseMeResponse(raw));
      })
      .catch(() => {
        // Brak sieci / endpoint padł → traktujemy jak anonimowego.
        if (!cancelled) setState(ANONYMOUS_STATE);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
