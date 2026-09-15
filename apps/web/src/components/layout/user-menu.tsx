"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CircleUserRound, LogIn, LogOut, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * UserMenu (T78) — stan logowania w nagłówku.
 *
 * Dlaczego `fetch("/api/auth/me")` zamiast propsa z serwera:
 *   `Header` jest komponentem klienckim (mega-menu, przełączniki motywu
 *   i języka). Przekazywanie sesji z `layout.tsx` wymagałoby zmiany
 *   `layout.tsx` na dynamiczny (`cookies()` = brak statycznego renderu dla
 *   CAŁEGO drzewa), co kosztowałoby wydajność każdej strony. Pobranie
 *   lekkiego `/api/auth/me` po hydratacji nie blokuje renderu i nie psuje
 *   cache'owania layoutu. Endpoint jest `no-store`, więc zawsze świeży.
 *
 * Stany:
 *   - `null`  → jeszcze nie wiemy (skeleton bez przesunięcia layoutu)
 *   - anonim  → link „Zaloguj przez Discord" (zwykłe `<a>` — trasa API nie
 *               ma prefiksu lokalizacji)
 *   - zalogowany → awatar + rozwijane menu (wyloguj)
 */
interface MeResponse {
  readonly authenticated: boolean;
  readonly user: {
    readonly discordId: string;
    readonly username: string;
    readonly avatarUrl: string | null;
  } | null;
  readonly entitlements: { readonly isPremium: boolean };
}

const ANONYMOUS_FALLBACK: MeResponse = {
  authenticated: false,
  user: null,
  entitlements: { isPremium: false },
};

export function UserMenu() {
  const t = useTranslations("Auth");
  const [state, setState] = React.useState<MeResponse | null>(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<MeResponse>)
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        // Brak sieci / endpoint padł → traktujemy jak anonimowego.
        if (!cancelled) setState(ANONYMOUS_FALLBACK);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Zamknij menu po kliknięciu poza nim (standardowy wzorzec a11y).
  React.useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent): void {
      if (containerRef.current === null) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout(): Promise<void> {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Pełny reload — najprostszy sposób, żeby serwerowe komponenty
      // (entitlements, gating premium) zobaczyły nowy stan sesji.
      window.location.reload();
    }
  }

  // Skeleton: ten sam rozmiar co docelowy element → brak przesunięcia layoutu.
  if (state === null) {
    return (
      <div
        className="h-11 w-11 rounded-md bg-muted/40"
        aria-hidden="true"
        data-testid="user-menu-skeleton"
      />
    );
  }

  if (!state.authenticated || state.user === null) {
    return (
      <a
        href="/api/auth/login/discord"
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm font-medium",
          "bg-primary text-primary-foreground shadow-sm",
          "transition-colors hover:bg-primary/90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        data-testid="user-menu-login"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t("login")}</span>
      </a>
    );
  }

  const { user, entitlements } = state;
  const displayName = user.username;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("accountMenu")}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-md px-1.5",
          "transition-colors hover:bg-accent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        data-testid="user-menu-trigger"
      >
        {user.avatarUrl !== null ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-full border border-border"
          />
        ) : (
          <CircleUserRound className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="hidden max-w-24 truncate text-sm font-medium lg:inline">
          {displayName}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 top-[calc(100%+0.25rem)] z-50 w-56",
            "rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
          )}
        >
          <div className="border-b px-2 py-2">
            <p className="truncate text-sm font-medium">{displayName}</p>
            {entitlements.isPremium && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {t("premium")}
              </p>
            )}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void handleLogout();
            }}
            disabled={busy}
            className={cn(
              "mt-1 flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm",
              "transition-colors hover:bg-accent",
              "disabled:opacity-50",
            )}
            data-testid="user-menu-logout"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}
