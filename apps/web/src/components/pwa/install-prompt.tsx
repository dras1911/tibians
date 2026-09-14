"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * InstallPrompt (T69, arch §18.4) — baner "Zainstaluj aplikację".
 *
 * UX:
 *   - Nasłuchuje `beforeinstallprompt` (Chrome/Edge/Android).
 *   - Pokazuje się dopiero po 2. wizycie (localStorage counter) — nie od razu.
 *   - Ukryty gdy już zainstalowane (`display-mode: standalone`) lub dismissed.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const VISITS_KEY = "tibians:pwa:visits";
const DISMISSED_KEY = "tibians:pwa:dismissed";
const MIN_VISITS = 2;

function safeGet(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* prywatny tryb / brak storage — ignoruj */
  }
}

export function InstallPrompt(): React.ReactNode {
  const t = useTranslations("Pwa");
  const [promptEvent, setPromptEvent] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    // Już zainstalowane → nie pokazuj.
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (safeGet(DISMISSED_KEY) === "1") return;

    // Licznik wizyt (bez cookies — localStorage).
    const visits = Number(safeGet(VISITS_KEY) ?? "0") + 1;
    safeSet(VISITS_KEY, String(visits));

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const prompt = event as BeforeInstallPromptEvent;
      setPromptEvent(prompt);
      if (visits >= MIN_VISITS) setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const handleInstall = React.useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setVisible(false);
    setPromptEvent(null);
  }, [promptEvent]);

  const handleDismiss = React.useCallback(() => {
    safeSet(DISMISSED_KEY, "1");
    setVisible(false);
  }, []);

  if (!visible || !promptEvent) return null;

  return (
    <div
      role="dialog"
      aria-label={t("install.title")}
      className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 rounded-lg border border-border-default bg-surface p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">
            {t("install.title")}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {t("install.description")}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button type="button" size="sm" onClick={handleInstall}>
              {t("install.button")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
            >
              {t("install.dismiss")}
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t("install.dismiss")}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-foreground/5 hover:text-text-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
