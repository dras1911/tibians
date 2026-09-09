/**
 * R11 — wspólny budżet rate-limit (scraper + self-hosted TibiaData).
 *
 * Źródło: architektura §18.1 (5 mitygacji R11, punkt 3: "skoordynowany budżet").
 *
 * Scraper Bazaara = max 2 concurrent / 500 ms opóźnienia. TibiaData = cache-first.
 * Sumarycznie nie przekraczamy ~3 req/s do tibia.com (ten sam VPS IP).
 *
 * Ten moduł implementuje **licznik in-memory** w ruchomym oknie 1 minuty.
 * W przyszłości (gdy pojawi się Redis pub/sub) można rozszerzyć o globalny
 * koordynator — kontrakt `recordOutboundRequest` / `getOutboundStats` / 
 * `throttleIfNeeded` pozostaje bez zmian.
 *
 * Determinizm: wszystkie funkcje modyfikujące stan są synchroniczne i wolne od
 * I/O, więc nie trzeba ich mockować w testach — wystarczy `resetBudget()`.
 */

/** Konfiguracja budżetu (env override + default). */
export interface R11BudgetConfig {
  /** Maksymalna liczba requestów do tibia.com w ciągu 60 s. */
  readonly maxRequestsPerMinute: number;
  /** Czas trwania okna (ms). Domyślnie 60 000. */
  readonly windowMs: number;
}

/** Migawka bieżącego stanu budżetu (dla `getOutboundStats()` i metryk). */
export interface OutboundStats {
  /** Requesty zliczone w bieżącym oknie. */
  requestsThisMinute: number;
  /** Skonfigurowany limit (echo — wygodne dla monitoringu). */
  readonly maxRequestsPerMinute: number;
  /** Epoka (ms) ostatniego resetu okna. */
  lastCheckReset: number;
  /** Ile ms pozostało do zamknięcia bieżącego okna. */
  readonly msUntilReset: number;
}

/** Globalny, procesowy stan budżetu. */
interface BudgetState {
  requestsThisMinute: number;
  lastCheckReset: number;
}

let state: BudgetState = { requestsThisMinute: 0, lastCheckReset: Date.now() };

/** Klucz env do nadpisania domyślnego limitu. */
const ENV_BUDGET_KEY = "SCRAPER_MAX_TIBIA_REQS_PER_MIN";

/**
 * Odczytaj konfigurację budżetu z env (raz, leniwie).
 * Wywoływane przez `getBudgetConfig()`.
 */
let cachedConfig: R11BudgetConfig | null = null;
function readBudgetConfig(): R11BudgetConfig {
  if (cachedConfig) return cachedConfig;
  const fromEnv = process.env[ENV_BUDGET_KEY];
  const parsed = fromEnv !== undefined && fromEnv.length > 0 ? Number(fromEnv) : NaN;
  const maxRequestsPerMinute =
    Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 120; // DEFAULT_R11_BUDGET_PER_MINUTE
  cachedConfig = { maxRequestsPerMinute, windowMs: 60_000 };
  return cachedConfig;
}

/**
 * Resetuje stan budżetu do zera. Używane w testach (przez `resetBudget()`),
 * oraz przez `throttleIfNeeded()` po upływie okna.
 */
function rollWindowIfNeeded(now: number = Date.now()): void {
  const config = readBudgetConfig();
  if (now - state.lastCheckReset >= config.windowMs) {
    state = { requestsThisMinute: 0, lastCheckReset: now };
  }
}

/**
 * Zarejestruj wysłany request do tibia.com. Inkrementuje wewnętrzny
 * licznik w bieżącym oknie minutowym. Parametr `endpoint` jest obecnie
 * informacyjny (log/etykieta metryki), ale w przyszłości może służyć
 * do atrybucji (np. ile z 120 idzie na auction-list vs auction-detail).
 */
export function recordOutboundRequest(endpoint: string): void {
  void endpoint; // rezerwujemy pod przyszłą metrykę atrybucji per-endpoint
  rollWindowIfNeeded();
  state.requestsThisMinute += 1;
}

/**
 * Zwraca snapshot bieżącego stanu licznika. Wywoływane z monitoringu
 * (`scrape_runs.metrics.outbound`) oraz przez `throttleIfNeeded`.
 */
export function getOutboundStats(): OutboundStats {
  rollWindowIfNeeded();
  const config = readBudgetConfig();
  return {
    requestsThisMinute: state.requestsThisMinute,
    maxRequestsPerMinute: config.maxRequestsPerMinute,
    lastCheckReset: state.lastCheckReset,
    msUntilReset: Math.max(0, config.windowMs - (Date.now() - state.lastCheckReset)),
  };
}

/** Konfiguracja budżetu (z env lub default). */
export function getBudgetConfig(): R11BudgetConfig {
  return readBudgetConfig();
}

/**
 * Pauzuj wywołującego, jeśli budżet R11 został przekroczony.
 *
 * Zachowanie: gdy `requestsThisMinute >= maxRequestsPerMinute` zwraca Promise,
 * który resolve'uje dopiero po zamknięciu bieżącego okna (czyli po upływie
 * 60 s od ostatniego resetu). Implementacja aktywnie czeka w 100 ms krokach,
 * żeby nie blokować event-loopu na pełne 60 s w jednym `setTimeout`.
 *
 * UWAGA: to **throttle**, nie fail-fast. Cel: scraper ma czekać cierpliwie,
 * nigdy nie banować IP.
 */
export function throttleIfNeeded(): Promise<void> {
  rollWindowIfNeeded();
  const stats = getOutboundStats();
  const config = readBudgetConfig();

  if (stats.requestsThisMinute < config.maxRequestsPerMinute) {
    return Promise.resolve();
  }

  const waitMs = stats.msUntilReset;
  // Aktywne czekanie w krótkich krokach — pozwala SIGTERM/SIGINT przerwać
  // oczekiwanie między krokami (setImmediate wbudowany w setTimeout).
  return new Promise<void>((resolve) => {
    const start = Date.now();
    const tick = (): void => {
      // Re-sprawdź stan — może okno zostało zresetowane przez inny moduł
      // (testy manipulujące zegarem albo pełny reset po SIGTERM).
      rollWindowIfNeeded();
      const current = getOutboundStats();
      if (current.requestsThisMinute < config.maxRequestsPerMinute) {
        resolve();
        return;
      }
      if (Date.now() - start >= waitMs) {
        // Safety net — powinno być już zresetowane, ale gwarantujemy postęp.
        resolve();
        return;
      }
      setTimeout(tick, 100);
    };
    setTimeout(tick, 100);
  });
}

/**
 * Resetuje stan budżetu do zera. Przeznaczone wyłącznie do testów.
 * Produkcja powinna pozwolić oknu toczyć się naturalnie.
 */
export function resetBudget(): void {
  state = { requestsThisMinute: 0, lastCheckReset: Date.now() };
}

/** Resetuje cache konfiguracji (gdy testy zmieniają `process.env`). */
export function resetBudgetConfig(): void {
  cachedConfig = null;
}