"use client";

import * as React from "react";

/**
 * ServiceWorkerRegistrar (T69, arch §18.4) — rejestruje `/sw.js`.
 *
 * Tylko produkcja: rejestracja w dev zaśmieca cache i utrudnia HMR.
 * Komponent nie renderuje niczego (zwraca null).
 */
export function ServiceWorkerRegistrar(): null {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // Cichy fallback — brak SW nie psuje aplikacji.
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
    return undefined;
  }, []);

  return null;
}
