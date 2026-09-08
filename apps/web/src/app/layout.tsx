import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { noFoucScript } from "@tibians/ui";

import { DensityProvider } from "@/components/density-provider";

import "./globals.css";

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

export const metadata: Metadata = {
  title: {
    default: "Tibians — kalkulatory, waloryzacja postaci i Bazaar",
    template: "%s · Tibians",
  },
  description:
    "Community hub dla graczy Tibii: kalkulatory, wycena postaci i analiza Char Bazaar.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pl"
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
      <body>
        <DensityProvider>{children}</DensityProvider>
      </body>
    </html>
  );
}