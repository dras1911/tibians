/**
 * Calibration loop — porównanie `valuation_history.estimated_tc` z
 * `auctions.final_price` (task 57, arch §8.4 + §10 R3).
 *
 * ## Po co?
 *
 * Architektura (§8.4): "Po 30 dniach mamy dataset „nasza wycena vs realna cena
 * sprzedaży" → regresja do strojenia wag. To długoterminowa przewaga, której
 * nie da się skopiować bez historii."
 *
 * Ryzyko (§10 R3): "Wycena postaci jest nietrafna → utrata zaufania".
 * Mitygacja: "Transparentny breakdown · pętla kalibracji z final_price".
 *
 * ## Co robi?
 *
 * 1. Pobiera próbki z `auctions` JOIN `valuation_history`:
 *      - `auctions.status IN ('finished', 'sold')` — tylko zakończone aukcje
 *      - `auctions.archived_at > NOW() - interval '7 days'` — okno kalibracji
 *      - `final_price IS NOT NULL AND final_price > 0` — pomijamy aukcje bez
 *        kupca (finalPrice=0 lub null). Dlaczego? Bo to nie-transakcyjne
 *        wyceny (arch §8.4 — "szacunek orientacyjny").
 *
 * 2. Oblicza `errorPct = (estimated - final) / final * 100` per sample.
 *    Ujemny errorPct = nasza wycena ZA NISKA (underestimate).
 *    Dodatni errorPct = nasza wycena ZA WYSOKA (overestimate).
 *
 * 3. Agreguje metryki:
 *    - `avgErrorPct`    — średnia arytmetyczna (ze znakiem)
 *    - `medianErrorPct` — mediana (mediana |errorPct| przy podejmowaniu decyzji)
 *    - `mape`           — Mean Absolute Percentage Error (gold standard
 *      metryki kalibracji w literaturze ML/forecasting)
 *    - per vocation: j.w.
 *
 * 4. Wybiera top-10 worst cases (największe |errorPct|) — do analizy manualnej
 *    (po zebraniu >30 próbek per vocation → Faza 7, ręczny re-tuning wag).
 *
 * 5. Persistuje raport do `scrape_runs` z `run_type='calibration'`
 *    + `error_summary` zawiera pełny raport (do późniejszej analizy w dashboard).
 *
 * ## MUST NOT (arch §8.4)
 *
 *   - **NIE używaj ML/regresji** — prosta kalibracja (avg/median/MAPE),
 *     re-tuning wag to manualna analiza po zebraniu >30 próbek per vocation
 *     (Faza 7 — poza zakresem tej pętli).
 *   - **NIE zmieniaj wag automatycznie** — to wewnętrzny tool dla Fazy 7+.
 *   - **NIE pokazuj w UI** — kalibracja jest dla dev-teamu, nie graczy.
 *
 * ## Wzorzec
 *
 * Czysta funkcja: zero `Date.now()`, zero I/O poza `db` interface. Testy
 * wstrzykują mock `CalibrationDb` (zero real PG).
 *
 * Powiązania:
 *   - T7 — `valuation_history` (auction_id, computed_at, estimated_tc, breakdown)
 *   - T35 — `estimateValue` (produkuje `estimated_tc` zapisane w valuation_history)
 *   - T36 — `createScheduler` (wywołuje `runCalibration` po Reference loop)
 *   - T34 — DB queries (produkcyjna implementacja `CalibrationDb`)
 */
import type { Vocation } from "@tibians/shared/auction";

/**
 * Pojedyncza próbka kalibracji — jeden wiersz z JOIN.
 *
 * Dane wejściowe do obliczenia `errorPct`. Wszystkie kwoty w TC.
 */
export interface CalibrationSample {
  /** FK → auctions.auction_id. */
  readonly auctionId: bigint;
  /** Nasza wycena (valuation_history.estimated_tc). */
  readonly estimatedValue: bigint;
  /** Rzeczywista cena sprzedaży (auctions.final_price). */
  readonly finalPrice: bigint;
  /** vocation bazowy (do grupowania per-vocation). */
  readonly vocation: Vocation;
}

/**
 * Pojedynczy wynik kalibracji (sample + computed errorPct).
 *
 * `errorPct` = `(estimatedValue - finalPrice) / finalPrice * 100`.
 *
 *   - errorPct > 0 → overestimate (szacowaliśmy za drogo)
 *   - errorPct < 0 → underestimate (szacowaliśmy za tanio)
 *   - errorPct = 0 → idealnie
 *
 * Wartości w promilach nie są potrzebne — błąd rzędu ±20% jest typowy
 * dla rynku Bazaar (patrz §10 R3 "pętla kalibracji z final_price").
 */
export interface CalibrationResult {
  readonly auctionId: bigint;
  readonly estimatedValue: bigint;
  readonly finalPrice: bigint;
  /**
   * Procentowy błąd wyceny.
   *
   * Zakres: dowolny. Typowo ±100% (±1.0). Ekstremalnie może być np.
   * -99% (szacowaliśmy 100 TC, sprzedane za 10 000 TC) albo +500%
   * (szacowaliśmy 10 000 TC, sprzedane za 2 000 TC).
   */
  readonly errorPct: number;
  readonly vocation: Vocation;
}

/**
 * Metryki per vocation.
 *
 * Pattern: płaski obiekt (NIE Record<Vocation, …>) — walidacja typów
 * Vocation (5 wartości) przy serializacji jest łatwiejsza.
 */
export interface VocationCalibrationStats {
  /** Liczba próbek w tej grupie. */
  readonly count: number;
  /** Średni errorPct (ze znakiem — over/under). */
  readonly avgErrorPct: number;
  /** MAPE — Mean Absolute Percentage Error (bez znaku, do porównań). */
  readonly mape: number;
  /** Mediana |errorPct| (typowo niższa niż MAPE — robust outlier). */
  readonly medianAbsErrorPct: number;
}

/**
 * Raport kalibracji — pełna metryka po jednym przebiegu pętli.
 *
 * Persistowany do `scrape_runs.error_summary` jako JSON. Konsumowany
 * przez:
 *   - manualną analizę (dashboard dev-teamu, Faza 7+)
 *   - automatyczny alert gdy MAPE > próg (np. 30%)
 */
export interface CalibrationReport {
  readonly totalSamples: number;
  /** Średni errorPct ze znakiem (over/under balance). */
  readonly avgErrorPct: number;
  /** Mediana errorPct ze znakiem (robust central tendency). */
  readonly medianErrorPct: number;
  /** MAPE globalny (Mean Absolute Percentage Error). */
  readonly mape: number;
  /** Metryki per vocation bazowy. Klucze = Vocation. */
  readonly perVocation: Record<Vocation, VocationCalibrationStats>;
  /** Top N (default 10) próbek z największym |errorPct|. */
  readonly worstCases: readonly CalibrationResult[];
  /** Okno kalibracji w godzinach (do audytu). */
  readonly windowHours: number;
  /** ISO timestamp wygenerowania raportu. */
  readonly generatedAt: string;
}

/**
 * Interfejs DB dla kalibracji — analogicznie do `SchedulerDb` w T36.
 *
 * Cel: testy wstrzykują mock (zero real PG), produkcja dostarcza Drizzle-backed
 * implementację (T34). Minimalny kontrakt — tylko 2 metody.
 *
 * MUST NOT: nie używamy tu całego `SchedulerDb` — kalibracja nie potrzebuje
 * upsertAuction ani fetchAllAuctionSummaries. Mała powierzchnia = łatwiejszy
 * mock + jaśniejszy kontrakt.
 */
export interface CalibrationDb {
  /**
   * Pobierz próbki kalibracji z JOIN `auctions` ↔ `valuation_history`.
   *
   * Implementacja: `SELECT auction_id, estimated_tc, final_price, vocation_base
   *                FROM auctions a
   *                JOIN valuation_history vh ON vh.auction_id = a.auction_id
   *                WHERE a.status IN ('finished','sold')
   *                  AND a.archived_at > NOW() - interval '$1 hours'
   *                  AND a.final_price IS NOT NULL
   *                  AND a.final_price > 0`.
   *
   * @param opts.windowHours - ile godzin wstecz (default: 168 = 7 dni, plan task 57).
   */
  fetchCalibrationSamples(opts: {
    windowHours: number;
  }): Promise<readonly CalibrationSample[]>;

  /**
   * Persistuj raport do `scrape_runs` (runType='calibration').
   *
   * Wywoływane RAZ na końcu przebiegu pętli (nie per sample).
   * Pełny raport idzie do `error_summary` jako JSONB.
   */
  recordCalibrationRun(input: {
    report: CalibrationReport;
    generatedAt: string;
  }): Promise<void>;
}

/** Opcje `runCalibration`. */
export interface CalibrationOptions {
  /** Okno kalibracji w godzinach (default: 168 = 7 dni). */
  readonly windowHours?: number;
  /** Ile worst cases zachować w raporcie (default: 10). */
  readonly worstCasesLimit?: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Publiczne API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Domyślne wartości opcji kalibracji.
 *
 * Wyciągnięte do `const` żeby `CalibrationReport` był deterministyczny
 * (testy porównują snap-shoty z konkretnymi wartościami).
 */
export const DEFAULT_CALIBRATION_WINDOW_HOURS = 168; // 7 dni (plan task 57)
export const DEFAULT_WORST_CASES_LIMIT = 10;

/**
 * Uruchom pętlę kalibracji (task 57).
 *
 * Algorytm (czysta funkcja + I/O przez `CalibrationDb`):
 *   1. `db.fetchCalibrationSamples({ windowHours })`
 *   2. Filtruj: pomiń sample z `finalPrice <= 0` (pusty/null final_price).
 *   3. Dla każdej próbki: oblicz `errorPct = (est - final) / final * 100`.
 *   4. Agreguj: `avg`, `median`, `MAPE` globalnie + per vocation.
 *   5. Sortuj po `|errorPct|` desc → weź top N → `worstCases`.
 *   6. Zbuduj `CalibrationReport`.
 *   7. `db.recordCalibrationRun({ report, generatedAt })`.
 *   8. Return report.
 *
 * Edge cases:
 *   - **Brak próbek**: zwraca raport z `totalSamples=0`, pustymi statystykami,
 *     pustym `worstCases`. Per vocation obiekty istnieją, ale z zerami.
 *     NIE rzucamy — caller (scheduler) loguje i idzie dalej.
 *   - **finalPrice=0**: pomijamy (division by zero).
 *   - **Negative errorPct** (underestimate): dozwolone — errorPct może być
 *     ujemny. Raport i median używają wartości ZE ZNAKIEM.
 *   - **MAPE** używa `|errorPct|` (absolute).
 *
 * Determinism: funkcja jest czysta dla danego wejścia (poza `generatedAt`,
 * który i tak pochodzi z `Date` przekazanego przez caller — patrz wyżej).
 *
 * @param db      — implementacja `CalibrationDb` (mock w testach, Drizzle w prod).
 * @param options — opcjonalne parametry (windowHours, worstCasesLimit).
 * @returns       — `CalibrationReport` (zapisany do scrape_runs + zwrócony).
 */
export async function runCalibration(
  db: CalibrationDb,
  options: CalibrationOptions = {},
): Promise<CalibrationReport> {
  const windowHours =
    options.windowHours ?? DEFAULT_CALIBRATION_WINDOW_HOURS;
  const worstCasesLimit =
    options.worstCasesLimit ?? DEFAULT_WORST_CASES_LIMIT;

  // 1. Fetch samples.
  const samples = await db.fetchCalibrationSamples({ windowHours });

  // 2. Filter + compute errorPct per sample.
  const results: CalibrationResult[] = [];
  for (const s of samples) {
    if (s.finalPrice <= 0n) continue; // skip — brak realnej transakcji
    const errorPct = computeErrorPct(s.estimatedValue, s.finalPrice);
    results.push({
      auctionId: s.auctionId,
      estimatedValue: s.estimatedValue,
      finalPrice: s.finalPrice,
      errorPct,
      vocation: s.vocation,
    });
  }

  // 3-4. Aggregate.
  const errors = results.map((r) => r.errorPct);
  const avgErrorPct = mean(errors);
  const medianErrorPct = median(errors);
  const mape = mean(errors.map(Math.abs));

  // Per-vocation aggregation (5 kluczy Vocation — deterministyczny zestaw).
  const perVocation = aggregatePerVocation(results);

  // 5. Worst cases (top N by |errorPct|).
  const worstCases = pickWorstCases(results, worstCasesLimit);

  // 6-7. Build + persist.
  const generatedAt = new Date().toISOString();
  const report: CalibrationReport = {
    totalSamples: results.length,
    avgErrorPct,
    medianErrorPct,
    mape,
    perVocation,
    worstCases,
    windowHours,
    generatedAt,
  };

  await db.recordCalibrationRun({ report, generatedAt });

  // 8. Return.
  return report;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers — czyste funkcje (łatwe do testowania)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Oblicz `errorPct` dla jednej próbki.
 *
 * Reguła: `(estimated - final) / final * 100`. Konwersja `bigint → number`
 * jest bezpieczna dla typowych kwot Bazaar (rzędu 10⁵ TC). Dla ekstremalnie
 * dużych wartości (>2⁵³) tracimy precyzję — ale to nierealistyczne dla
 * pojedynczej postaci (max wycena rzędu 10⁶ TC).
 *
 * @param estimatedValue — nasza wycena z `valuation_history.estimated_tc`.
 * @param finalPrice     — cena sprzedaży z `auctions.final_price`.
 * @returns              — `errorPct` jako `number` (typowo ±0..100, ale może być większy).
 */
export function computeErrorPct(
  estimatedValue: bigint,
  finalPrice: bigint,
): number {
  if (finalPrice <= 0n) {
    // Caller powinien odfiltrować, ale defensywnie: zwracamy 0 zamiast dzielić.
    return 0;
  }
  const diff = estimatedValue - finalPrice;
  // Number konwersja: tracimy precyzję dla >2^53, ale to nierealistyczne TC.
  const diffNum = Number(diff);
  const finalNum = Number(finalPrice);
  return (diffNum / finalNum) * 100;
}

/**
 * Średnia arytmetyczna.
 *
 * Pusta tablica → 0 (NIE NaN). Caller musi sam zdecydować czy to sensowne
 * (w naszym przypadku — raport z `totalSamples=0` zwraca avg=0 + puste grupy).
 */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Mediana.
 *
 * - Pusta tablica → 0.
 * - Nieparzysta liczba → środkowy element po sortowaniu.
 * - Parzysta liczba → średnia z dwóch środkowych elementów.
 *
 * Uwaga: tu mediana ZE ZNAKIEM (nie |errorPct|). Dla "central tendency
 * błędu" — robustna na outliery w jedną stronę.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  // Parzysta: średnia z sorted[mid-1] i sorted[mid].
  const lo = sorted[mid - 1]!;
  const hi = sorted[mid]!;
  return (lo + hi) / 2;
}

/**
 * Agreguj metryki per vocation bazowy.
 *
 * Reguła: dla KAŻDEJ z 5 wartości `Vocation` zwracamy obiekt (nawet jeśli
 * `count=0`). Dzięki temu raport jest "kompletny" — UI/dashboard nie musi
 * sprawdzać `if (Knight in perVocation)`.
 *
 * @param results — wszystkie próbki (po filtracji `finalPrice > 0`).
 */
function aggregatePerVocation(
  results: readonly CalibrationResult[],
): Record<Vocation, VocationCalibrationStats> {
  const VOCATIONS: readonly Vocation[] = [
    "Knight",
    "Paladin",
    "Druid",
    "Sorcerer",
    "Monk",
  ];

  const out = {} as Record<Vocation, VocationCalibrationStats>;
  for (const voc of VOCATIONS) {
    const subset = results.filter((r) => r.vocation === voc);
    const errors = subset.map((r) => r.errorPct);
    out[voc] = {
      count: subset.length,
      avgErrorPct: mean(errors),
      mape: mean(errors.map(Math.abs)),
      medianAbsErrorPct: median(errors.map(Math.abs)),
    };
  }
  return out;
}

/**
 * Wybierz top N próbek z największym `|errorPct|`.
 *
 * Sortowanie: malejąco po `|errorPct|`. Stabilne (Array.prototype.sort jest
 * stabilny od ES2019). Tie-break: auctionId ASC (deterministyczne w testach).
 *
 * @param results — wszystkie próbki.
 * @param limit   — ile zachować (default: 10).
 */
function pickWorstCases(
  results: readonly CalibrationResult[],
  limit: number,
): CalibrationResult[] {
  if (limit <= 0) return [];
  return [...results]
    .sort((a, b) => {
      const absDiff = Math.abs(b.errorPct) - Math.abs(a.errorPct);
      if (absDiff !== 0) return absDiff;
      // Tie-break: auctionId ASC (determinism w testach).
      return a.auctionId < b.auctionId ? -1 : a.auctionId > b.auctionId ? 1 : 0;
    })
    .slice(0, limit);
}
