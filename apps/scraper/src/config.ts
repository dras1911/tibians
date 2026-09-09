/**
 * Typ luźny — pola liczbowe akceptują każdą liczbę (testy mogą obniżać timeout
 * do 50 ms bez hack-typów). Pola `as const` w runtime są niezmienne.
 */
export interface ScraperConfig {
  delayMs: number;
  maxConcurrent: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffCapMs: number;
  timeoutMs: number;
  jitterFraction: number;
  fullIntervalMin: number;
  endingSoonIntervalSec: number;
  endingSoonWindowH: number;
  referenceIntervalH: number;
  /** 5 realistycznych UA z 2026 — rotacja round-robin w `http-client.ts`. */
  userAgents: readonly string[];
}

/**
 * Stałe konfiguracyjne scrapera Bazaara Tibii.
 *
 * Źródło prawdy: architektura `tibia-tools-portal-architecture.md` §8.3
 * (strategia scrapera — szacunek dla tibia.com) + §18.1 (R11 — wspólny
 * budżet rate-limit z self-hostowanym TibiaData).
 *
 * Wartości są niemutowalne w runtime (Object.freeze przez `as const`).
 */
export const SCRAPER_CONFIG: ScraperConfig = {
  /** Minimalne opóźnienie między kolejnymi requestami do tego samego hosta (ms). */
  delayMs: 500,

  /** Maksymalna liczba requestów w locie do tego samego hosta (per-host concurrency). */
  maxConcurrent: 2,

  /** Maksymalna liczba retransmisji (poza pierwszą próbą). */
  maxRetries: 7,

  /** Bazowy czas wykładniczego backoffu (ms). */
  backoffBaseMs: 1000,

  /** Cap na czas backoffu — po osiągnięciu kolejne retry czeka `backoffCapMs`. */
  backoffCapMs: 30000,

  /** Timeout pojedynczego requestu (ms). Po przekroczeniu → AbortError → retry. */
  timeoutMs: 30000,

  /** Frakcja jittera (±). Domyślnie ±20%. Wartość 0.2 = ±20%. */
  jitterFraction: 0.2,

  /** Interwał pełnego scrapa (min). */
  fullIntervalMin: 15,

  /** Interwał scrapa "ending soon" (s). */
  endingSoonIntervalSec: 30,

  /** Okno dla "ending soon" (h) — aukcje kończące się w ciągu tej liczby godzin. */
  endingSoonWindowH: 1,

  /** Interwał scrapa referencji (h) — items/outfits/mounts. */
  referenceIntervalH: 24,

  /**
   * Pula obejmuje: Chrome/Win, Chrome/Mac, Firefox/Win, Firefox/Mac, Safari/Mac.
   * WAŻNE: rotacja zmniejsza fingerprinting tibia.com (R1 — zmiana HTML/klas
   * botów) i obniża ryzyko wzbudzenia alarmu anty-bot.
   */
  userAgents: [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  ],
};

/** Zwrot typów `SCRAPER_CONFIG.userAgents` (string literal union). */
export type UserAgent = (typeof SCRAPER_CONFIG.userAgents)[number];

/** Domniemany budżet requestów do tibia.com na minutę (R11). */
export const DEFAULT_R11_BUDGET_PER_MINUTE = 120;

/**
 * URL-e Tibii używane przez scraper.
 *
 * - `auctionList` — strona listy aukcji (paginacja przez `currentpage=N`).
 * - `auctionDetail(id)` — strona detalu pojedynczej aukcji.
 * - `ajaxPost` — endpoint POST dla operacji live (składanie ofert) — nieużywany
 *   w naszym scraperze read-only, ale zdefiniowany dla przyszłych zadań.
 */
export const TIBIA_URLS = {
  auctionList: "https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades",
  auctionDetail: (id: string | number): string =>
    `https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades&page=details&auctionid=${encodeURIComponent(String(id))}`,
  ajaxPost: "https://www.tibia.com/websiteservices/handle_charactertrades.php",
} as const;

/**
 * Nagłówki HTTP wysyłane przy każdym requeście.
 *
 * `Accept-Encoding: gzip, deflate, br` jest standardowo obsługiwane przez undici
 * (HTTP/2 + automatyczna dekompresja). `Accept-Language: en-US,en;q=0.5`
 * odsiewa warianty językowe poza angielskim (Tibia.com serwuje PL/EN/etc).
 */
export const DEFAULT_REQUEST_HEADERS: Readonly<Record<string, string>> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br",
} as const;