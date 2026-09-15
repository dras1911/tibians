import { ImageResponse } from "next/og";

import { resolveOgTitle } from "@/lib/og-title";

/**
 * GET /og/[file] — dynamiczne obrazy Open Graph.
 *
 * DLACZEGO TAK, A NIE PLIKI PNG:
 *   Metadata stron referencjonuje `${SITE_URL}/og/bazaar.png`,
 *   `/og/calculators-<slug>.png`, `/og/planners-<slug>.png` itd., ale katalog
 *   `public/og/` nigdy nie powstał — każdy podgląd w social media zwracał 404.
 *   Zamiast commitować kilkadziesiąt binariów (które trzeba by ręcznie
 *   regenerować przy każdej zmianie), generujemy je na żądanie z jednego
 *   miejsca. Tytuł wynika ze sluga, więc nowa strona działa bez zmian tutaj.
 *
 * Ścieżka NIE ma prefiksu lokalizacji (`/og/...`, nie `/pl/og/...`) — dokładnie
 * tak, jak w metadata stron.
 *
 * Logika slug → tytuł żyje w `@/lib/og-title` (czysta funkcja, przetestowana
 * jednostkowo bez runtime'u Next). Ten plik to wyłącznie warstwa renderująca.
 *
 * Cache: `revalidate` 1h — obraz zmienia się tylko przy zmianie kodu.
 */
export const runtime = "nodejs";
export const revalidate = 3600;

const SITE_NAME = "Tibians";
const SITE_TAGLINE = "Char Bazaar · Kalkulatory · Wycena postaci";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  const { title, section } = resolveOgTitle(file);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          // Granatowo-złota paleta portalu (spójna z identyfikacją Tibians).
          background: "linear-gradient(135deg, #0b1220 0%, #101b33 55%, #1b2a4a 100%)",
          color: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "16px",
              background: "#f2c14e",
              color: "#0b1220",
              fontSize: "36px",
              fontWeight: 700,
            }}
          >
            T
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "34px", fontWeight: 700, letterSpacing: "-0.02em" }}>
              {SITE_NAME}
            </div>
            <div style={{ fontSize: "20px", color: "#93a4c4" }}>{section}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div
            style={{
              fontSize: "68px",
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              maxWidth: "900px",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: "26px", color: "#93a4c4" }}>{SITE_TAGLINE}</div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "28px",
            borderTop: "2px solid rgba(242, 193, 78, 0.35)",
            fontSize: "22px",
            color: "#cbd5e1",
          }}
        >
          <span>tibians.tools</span>
          <span style={{ color: "#f2c14e" }}>Dane z Char Bazaar</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
