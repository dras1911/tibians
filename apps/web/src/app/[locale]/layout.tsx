// ⚠️ GLOBALNY CSS — MUSI być zaimportowany tutaj.
//
// Ten plik jest ROOT LAYOUTEM (wszystkie trasy żyją pod `[locale]`), więc to
// jedyne miejsce, w którym `globals.css` może zostać wpięty. Wcześniej NIE był
// importowany nigdzie — Tailwind i design system (`@tibians/ui`) nie trafiały
// do bundla, a portal renderował się jako surowy HTML bez żadnych stylów.
// Typcheck, testy jednostkowe i `curl` (HTTP 200) tego nie wykrywają —
// widać to wyłącznie w przeglądarce.
import "../globals.css";

import * as React from "react";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { DensityProvider } from "@/components/density-provider";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { SkipLink } from "@/components/layout/skip-link";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { noFoucScript } from "@tibians/ui";
import { routing } from "@/i18n/routing";

// Fonts: Inter Variable + JetBrains Mono via next/font (self-hosted by
// Next.js — no request to Google Fonts at runtime, only at build time).
// The variable option exposes a CSS variable that typography.css wires into
// --font-sans and --font-mono, which Tailwind's font-family.sans/mono map
// to (see tailwind.config.ts).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans-variable",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-variable",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: {
    default: "Tibians — kalkulatory, waloryzacja postaci i Bazaar",
    template: "%s · Tibians",
  },
  description:
    "Community hub dla graczy Tibii: kalkulatory, wycena postaci i analiza Char Bazaar.",
  /**
   * Favicon. Bez tego przeglądarka żąda `/favicon.ico` i dostaje 404
   * (widoczne jako błąd w konsoli na KAŻDEJ stronie).
   * Używamy istniejącej ikony SVG z `public/icons/` — tej samej co manifest PWA.
   */
  icons: {
    icon: "/icons/icon.svg",
    shortcut: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
};

/**
 * LocaleLayout — the ROOT layout for every routed page under `/[locale]/*`.
 *
 * It replaces the previous `app/layout.tsx` (T4 deliverable) and becomes
 * the only place that renders `<html>` + `<body>`. Next.js walks the
 * segment tree from the deepest matching layout that contains html/body
 * upward; with no `app/layout.tsx` file, this file becomes the effective
 * root.
 *
 * Order of operations inside `<body>`:
 *   1. <SkipLink/> — first focusable element so Tab × 1 reveals it.
 *   2. <NextIntlClientProvider> — provides `useTranslations` / `useLocale`
 *      to every client component in the tree (Header, LocaleSwitch,
 *      MobileSheet, …).
 *   3. <DensityProvider> — global density toggle used by the data table.
 *   4. <Header/> + <main id="main"> + <Footer/> — page shell.
 *
 * Architecture §4.2 + §6.5 compliance:
 *   - Header is `sticky top-0 h-16` with `bg-background/80 backdrop-blur`.
 *   - Footer is rendered ONCE here so it appears on every route (it
 *     carries the verbatim CipSoft disclaimer from §18.3).
 *   - The single `<main id="main">` is the skip-link target.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrains.variable}`}
    >
      <head>
        {/*
         * Anti-FOUC inline script (architecture §6.5). Must be the FIRST
         * element of <head> so the .dark class is set before paint.
         */}
        <script
          id="tt-no-fouc"
          dangerouslySetInnerHTML={{ __html: noFoucScript() }}
        />
      </head>
      <body className="bg-background text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <DensityProvider>
            {/* Skip link MUST be the first focusable element in the body
             *  (architecture §6.5 — "Tab × 1 → focus → Enter → focus on
             *  <main id='main'>"). It is visually hidden until focused. */}
            <SkipLink />

            <div className="flex min-h-screen flex-col">
              <Header />

              {/* The single <main> for the whole portal. tabIndex={-1}
               *  makes it programmatically focusable so the skip-link's
               *  hash target works in browsers that don't auto-focus the
               *  main element. */}
              <main
                id="main"
                tabIndex={-1}
                className="flex-1 outline-none"
              >
                {children}
              </main>

              <Footer />
            </div>

            {/* PWA (T69, arch §18.4): rejestracja SW tylko w produkcji +
             *  baner instalacji po 2. wizycie. Oba renderują null gdy nieaktywne. */}
            <ServiceWorkerRegistrar />
            <InstallPrompt />
          </DensityProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}