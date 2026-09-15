"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { ErrorState } from "@/components/states/error-state";

/**
 * Error boundary dla segmentu `[locale]` (Next.js App Router).
 *
 * DLACZEGO TO ISTNIEJE:
 *   W repozytorium nie było ŻADNEGO `error.tsx` — nieobsłużony wyjątek w
 *   komponencie serwerowym dawał surowy 500 z domyślną stroną Next.
 *   Najprostszy do odtworzenia przypadek: `/bazaar` woła `listAuctions`,
 *   `getFacetCounts` i `getWorldsByRegion` w `Promise.all` bez `try/catch`,
 *   więc chwilowa niedostępność bazy wywalała całą stronę zamiast pokazać
 *   stan błędu z możliwością ponowienia.
 *
 *   Ten plik łapie KAŻDY nieobsłużony błąd w drzewie pod `[locale]`
 *   (nie tylko bazaar) i renderuje `ErrorState` po polsku/angielsku.
 *
 * Uwaga: błąd rzucony w samym `layout.tsx` NIE jest tu łapany — na to
 * potrzebny byłby `app/global-error.tsx` (osobny, bez dostępu do i18n).
 * Ten boundary pokrywa wszystkie strony, co jest realnym przypadkiem.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  const t = useTranslations("Common");

  // Bez tego błąd SSR ginie — trafia tylko do domyślnego handlera Next.
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[error-boundary]", error);
  }, [error]);

  // `digest` to ID błędu po stronie serwera (Next nie wysyła stack trace
  // do klienta w produkcji) — pokazujemy je, żeby dało się skorelować
  // zgłoszenie użytkownika z logami serwera.
  const details =
    error.digest !== undefined
      ? `digest: ${error.digest}`
      : error.message.length > 0
        ? error.message
        : undefined;

  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-16">
      <ErrorState
        title={t("errorTitle")}
        description={t("errorDescription")}
        // `exactOptionalPropertyTypes: true` — nie wolno podać `undefined`
        // jawnie dla propa opcjonalnego, stąd warunkowy spread.
        {...(details !== undefined ? { details } : {})}
        retry={reset}
        retryLabel={t("errorRetry")}
      />
    </div>
  );
}
