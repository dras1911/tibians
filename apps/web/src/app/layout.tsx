import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tibians",
  description: "Community hub for Tibia players: calculators, character valuation and Char Bazaar analysis",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
