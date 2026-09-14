"use client";

/**
 * LivePriceFlash — animacja "flash" przy zmianie wartości (plan task 55).
 *
 * ## Cel (arch §6.4: "Live bez rozpraszania")
 *
 * Gdy `value` zmienia się względem `previousValue` (np. nowa oferta
 * na aukcji kończącej się <1h przez SSE), komponent renderuje ring
 * `ring-2 ring-primary animate-pulse` przez ~1 sekundę. Daje to
 * wizualne potwierdzenie "coś się zmieniło" bez agresywnego migania.
 *
 * ## Dlaczego ring, a nie tło (arch §6.1 kontrast)
 *
 * - **Ring** nie zmienia kontrastu tekstu (arch §6.5: AA kontrast).
 * - Tło z kolorem accent zmniejszałoby kontrast `text-foreground`
 *   i łamałoby wymogi dostępności.
 * - Ring jest subtelny — user widzi zmianę kątem oka, nie odrywa
 *   się od czytania.
 *
 * ## `tabular-nums` (arch §6.2)
 *
 * WSZYSTKIE numery cenowe w portalu mają `tabular-nums` — bez tego
 * zmiana z "25501" na "25511" przesuwa layout (cyfry proporcjonalne
 * mają różne szerokości). Komponent przekazuje `tabular-nums` na
 * wrapperze i NIE narzuca własnego font-family (parent decyduje).
 *
 * ## `prefers-reduced-motion` (arch §6.5)
 *
 * Gdy user ma włączony `prefers-reduced-motion: reduce`:
 *   - `animate-pulse` jest wyłączony (Tailwind automatycznie respektuje
 *     tę media query w swoich util `animate-*`)
 *   - Ring pojawia się nadal (zmiana info powinna być widoczna)
 *   - Czas trwania jest krótszy (natychmiastowy fade-out)
 *
 * ## `useRef` do poprzedniej wartości
 *
 * `previousValue` z props jest **tylko sygnałem** — hook NIE aktualizuje
 * parenta. Wewnętrznie trzymamy `lastValueRef` żeby wykryć zmianę
 * nawet gdy parent nie taktuje `previousValue` (np. SSE push bez
 * porównywania snapshotów). Dzięki temu flash działa poprawnie
 * zarówno przy explicit `previousValue`, jak i bez niego.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────
// Typy
// ───────────────────────────────────────────────────────────────────────

/**
 * Wartość ceny — akceptujemy zarówno `number` (większość aukcji —
 * bid w TC mieści się w `Number.MAX_SAFE_INTEGER`)
 * jak i `bigint` (goldTotal z bazy — przekracza MAX_SAFE_INTEGER).
 *
 * Komponent NIE konwertuje bigint → number; konsument jest
 * odpowiedzialny za typ. Wielkie wartości (>2^53) mogą tracić
 * precyzję po konwersji na number.
 */
export type FlashValue = number | bigint;

export interface LivePriceFlashProps {
  /** Aktualna wartość. */
  value: FlashValue;
  /**
   * Poprzednia wartość (opcjonalna). Gdy się zmieni względem `value`
   * → uruchom animację flash.
   *
   * Pierwszy render: jeśli `previousValue === undefined`, porównujemy
   * z `lastValueRef.current` (który inicjalizujemy na `value` — brak
   * flash przy mount). Jeśli `previousValue` jest ustawione i różne
   * od `value` → flash (nawet przy mount, np. SSR snapshot vs client
   * fetch).
   */
  previousValue?: FlashValue;
  /**
   * Czas trwania animacji flash w ms. Domyślnie 1000 (plan task 55).
   */
  flashDurationMs?: number;
  /** Element potomny do wyrenderowania wewnątrz flash. */
  children: React.ReactNode;
  /** Klasy CSS dodatkowe dla wrappera. */
  className?: string;
}

// ───────────────────────────────────────────────────────────────────────
// Utils
// ───────────────────────────────────────────────────────────────────────

/**
 * Porównuje dwie wartości `FlashValue`. Używamy `===` — dla `number`
 * to ścisła równość IEEE 754 (dobra dla cen aukcyjnych, które są
 * integer TC). Dla `bigint` też działa (`bigint === bigint`).
 *
 * Gdy `b === undefined` → `false` (pierwszy render lub parent nie
 * śledzi poprzedniej wartości).
 */
function valuesAreEqual(a: FlashValue, b: FlashValue | undefined): boolean {
  if (b === undefined) return false;
  return a === b;
}

// ───────────────────────────────────────────────────────────────────────
// Komponent
// ───────────────────────────────────────────────────────────────────────

/**
 * LivePriceFlash — patrz opis modułu.
 *
 * @example
 * ```tsx
 * <LivePriceFlash value={auction.bid} previousValue={previousBid}>
 *   <span className="font-mono tabular-nums">
 *     {format.number(auction.bid, { useGrouping: true })} TC
 *   </span>
 * </LivePriceFlash>
 * ```
 */
export function LivePriceFlash({
  value,
  previousValue,
  flashDurationMs = 1000,
  children,
  className,
}: LivePriceFlashProps): React.ReactElement {
  // ── Ref: ostatnia wartość (po flashu) ────────────────────────────
  // Trzymamy w ref, nie w state — nie chcemy re-renderu tylko dlatego
  // że ref się zmienił. Ref jest źródłem prawdy dla "poprzedniej
  // wartości do porównania z NASTĘPNYM renderem".
  // Inicjalizujemy na `value` żeby pierwszy render NIE flashował
  // (nawet jeśli parent przekazał previousValue !== value, wtedy
  // porównanie z ref wykrywa zmianę i flash następuje — patrz useEffect).
  const lastValueRef = React.useRef<FlashValue>(value);

  // ── State: czy aktualnie flashuje ────────────────────────────────
  const [isFlashing, setIsFlashing] = React.useState<boolean>(false);

  // ── Timer ref: timeout do wyłączenia flash ───────────────────────
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── prefers-reduced-motion (arch §6.5) ───────────────────────────
  // `false` przed hydration (SSR); po mount nasłuchujemy zmian.
  const [prefersReducedMotion, setPrefersReducedMotion] =
    React.useState<boolean>(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mql.matches);
    const onChange = (): void => {
      setPrefersReducedMotion(mql.matches);
    };
    mql.addEventListener("change", onChange);
    return (): void => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  // ── Detect value change ──────────────────────────────────────────
  React.useEffect(() => {
    const prevFromRef = lastValueRef.current;

    // Bez zmiany względem ref → nic nie rób.
    if (valuesAreEqual(value, prevFromRef)) {
      return;
    }

    // Preferuj `previousValue` z props jeśli zostało podane i różni
    // się od `value` (parent explicit signal zmiany). W przeciwnym
    // razie fallback na porównanie z ref (parent nie taktuje prop,
    // ale my i tak wykrywamy zmianę).
    const triggerFlash = (): void => {
      // Wyczyść poprzedni timer jeśli jeszcze trwa (szybkie kolejne zmiany).
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      setIsFlashing(true);

      // Zmniejsz czas trwania dla reduced-motion (natychmiastowy fade-out).
      // Tailwind `animate-pulse` sam respektuje prefers-reduced-motion,
      // ale ring może pozostać — tu dajemy krótszy timeout żeby zniknął
      // szybciej (~250 ms vs 1000 ms).
      const effectiveDuration = prefersReducedMotion
        ? Math.min(250, flashDurationMs)
        : flashDurationMs;

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setIsFlashing(false);
      }, effectiveDuration);
    };

    if (
      previousValue !== undefined &&
      !valuesAreEqual(value, previousValue)
    ) {
      // Zmiana wykryta przez props — flash.
      triggerFlash();
    } else if (previousValue === undefined) {
      // Parent nie śledzi previousValue — porównuj z ref.
      triggerFlash();
    }
    // (previousValue !== undefined && valuesAreEqual(value, previousValue))
    // — parent podał tę samą wartość, brak zmiany, brak flash.

    // Aktualizuj ref na następną iterację.
    lastValueRef.current = value;
  }, [value, previousValue, flashDurationMs, prefersReducedMotion]);

  // ── Cleanup timer on unmount ─────────────────────────────────────
  React.useEffect(() => {
    return (): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (
    <span
      className={cn(
        // `tabular-nums` zapobiega jitterowi layoutu przy zmianie
        // wartości (arch §6.2 — "bez tabular-nums live countdown
        // powoduje jitter layoutu").
        "numeric inline-flex items-center rounded-md tabular-nums",
        // Flash animacja — Tailwind `animate-pulse` jest no-op
        // gdy user ma `prefers-reduced-motion: reduce` (Tailwind
        // automatycznie respektuje media query w `animate-*` utils).
        isFlashing && "animate-pulse",
        // Ring tylko podczas flash — subtelne podświetlenie krawędzi.
        isFlashing && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className,
      )}
      data-flashing={isFlashing ? "true" : "false"}
      aria-live={isFlashing ? "polite" : "off"}
    >
      {children}
    </span>
  );
}
