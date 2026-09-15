/**
 * Rozwiązywanie tytułu OG-image ze sluga pliku (`lib/og-title.ts`).
 *
 * Wydzielone z `app/og/[file]/route.tsx`, żeby dało się przetestować bez
 * uruchamiania runtime'u Next i bez zależności od `next/og` (Satori/resvg).
 * Route handler to cienka warstwa: parsuje parametr → woła to → renderuje.
 *
 * Kontrakt: slug z metadata stron (`/og/bazaar.png`,
 * `/og/calculators-exercise-weapons.png`, …) → tytuł + sekcja po polsku.
 * Nieznane ścieżki NIE mogą rzucać — podgląd w social media ma zawsze
 * coś zwrócić, nawet jeśli slug powstał z literówki.
 */

const SITE_NAME = "Tibians";

/** Etykiety sekcji — pierwszy segment sluga. */
const SECTION_LABELS: Readonly<Record<string, string>> = {
  bazaar: "Char Bazaar",
  calculators: "Kalkulatory",
  planners: "Plannery",
  workspace: "Workspace",
  reference: "Referencje",
  bosses: "Bossy",
  blog: "Blog",
  premium: "Premium",
};

/** Tytuły, których nie da się wyprowadzić z prefiksu. */
const EXACT_TITLES: Readonly<Record<string, { title: string; section: string }>> = {
  bazaar: { title: "Char Bazaar", section: "Char Bazaar" },
  "bazaar-history": { title: "Historia aukcji", section: "Char Bazaar" },
  "bazaar-statistics": { title: "Statystyki rynku", section: "Char Bazaar" },
  "bazaar-ending-soon": { title: "Kończące się aukcje", section: "Char Bazaar" },
  "bazaar-compare": { title: "Porównanie aukcji", section: "Char Bazaar" },
  workspace: { title: "Workspace", section: "Workspace" },
  calculators: { title: "Kalkulatory", section: "Kalkulatory" },
};

export interface OgTitle {
  readonly title: string;
  readonly section: string;
}

/** `exercise-weapons` → `Exercise Weapons`. */
export function humanizeSlugSegment(segment: string): string {
  return segment
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * `bazaar.png` → `{ title: "Char Bazaar", section: "Char Bazaar" }`
 * `calculators-exercise-weapons.png` → `{ title: "Exercise Weapons", section: "Kalkulatory" }`
 */
export function resolveOgTitle(file: string): OgTitle {
  const slug = file.replace(/\.(png|jpe?g|webp)$/i, "").toLowerCase();

  const exact = EXACT_TITLES[slug];
  if (exact !== undefined) return exact;

  const separatorIndex = slug.indexOf("-");
  if (separatorIndex <= 0) {
    // Brak prefiksu (albo slug zaczyna się od myślnika) — traktujemy całość
    // jako tytuł, a sekcją zostaje nazwa serwisu.
    return { title: humanizeSlugSegment(slug) || SITE_NAME, section: SITE_NAME };
  }

  const prefix = slug.slice(0, separatorIndex);
  const rest = slug.slice(separatorIndex + 1);
  const section = SECTION_LABELS[prefix] ?? SITE_NAME;
  const title = humanizeSlugSegment(rest);

  return { title: title || SITE_NAME, section };
}
