#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# refresh-fixtures.sh — cron-like odświeżanie fixture'ów HTML parserów
# Bazaar (T33, ubezpieczenie R1).
#
# Co robi:
#   1. Czyta listę znanych stron/ID z `src/scrapers/constants.ts`
#      (jedyne źródło prawdy — NIE duplikuj tu numerów!).
#   2. Dla każdego targetu uruchamia `fetch-fixture.ts` (dev-only —
#      NIE uruchamiaj w CI; tibia.com blokuje boty → 403).
#   3. Szanuje rate limit (R2/R11): max 2 współbieżne podprocesy + 500 ms
#      przerwy między startami. (Dodatkowo http-client T29 wymusza w środku
#      500 ms odstępu i max 2 req w locie.)
#   4. Porównuje rozmiar pliku PRZED i PO pobraniu — jeśli zmiana > ±5%,
#      ostrzega o możliwym redesignie HTML Tibii (R1).
#
# Użycie (z `apps/scraper/`):
#   ./scripts/refresh-fixtures.sh              # pełne odświeżenie
#   ./scripts/refresh-fixtures.sh --dry-run    # tylko plan, nic nie pobiera
#
# Exit code: 0 = OK, 1 = co najmniej jeden fetch się nie udał.
# ─────────────────────────────────────────────────────────────────────────
set -uo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

# ── Lokalizacje ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRAPER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FIXTURES_DIR="${SCRAPER_DIR}/src/scrapers/__fixtures__"
CONSTANTS="${SCRAPER_DIR}/src/scrapers/constants.ts"
FETCH="${SCRIPT_DIR}/fetch-fixture.ts"

if [[ ! -f "${CONSTANTS}" ]]; then
  echo "[refresh-fixtures] BŁĄD: nie znaleziono ${CONSTANTS}" >&2
  exit 1
fi

# ── Rate limit (R2): max 2 w locie + 500 ms między startami ─────────────
MAX_CONCURRENT=2
START_DELAY_S=0.5

# ── Pomocnicze ──────────────────────────────────────────────────────────
# Wyciąga liczby z tablic `as const` w constants.ts (node + tsx).
read_constants() {
  local name="$1"
  (cd "${SCRIPT_DIR}" && node --import tsx/esm --input-type=module -e "
    import { ${name} } from '../src/scrapers/constants.ts';
    console.log(${name}.join(' '));
  ")
}

size_of() { # size_of <file> → bajty (0 gdy brak pliku)
  local f="$1"
  if [[ -f "$f" ]]; then
    stat -c%s "$f" 2>/dev/null || echo 0
  else
    echo 0
  fi
}

pct_diff() { # pct_diff <before> <after> → |Δ|% (0 gdy before=0)
  local before="$1" after="$2"
  if [[ "$before" -eq 0 ]]; then
    echo "0"
    return
  fi
  local d=$((after - before))
  if [[ $d -lt 0 ]]; then d=$(( -d )); fi
  awk -v d="$d" -v b="$before" 'BEGIN { printf "%.1f", (d * 100.0) / b }'
}

# ── Lista targetów z constants.ts ───────────────────────────────────────
PAGES_STR="$(read_constants KNOWN_LIST_PAGES)" || {
  echo "[refresh-fixtures] BŁĄD: nie udało się odczytać KNOWN_LIST_PAGES" >&2
  exit 1
}
IDS_STR="$(read_constants KNOWN_AUCTION_IDS)" || {
  echo "[refresh-fixtures] BŁĄD: nie udało się odczytać KNOWN_AUCTION_IDS" >&2
  exit 1
}

TARGETS=()
for p in ${PAGES_STR}; do
  TARGETS+=("list ${p} auction-list-page-${p}.html")
done
for id in ${IDS_STR}; do
  TARGETS+=("detail ${id} auction-detail-${id}.html")
done

echo "[refresh-fixtures] plan: ${#TARGETS[@]} targetów" \
  "$([[ ${DRY_RUN} -eq 1 ]] && echo '(DRY-RUN)' || echo '')"
echo "[refresh-fixtures] źródło list: ${CONSTANTS}"

# ── Uruchomienie z limitem współbieżności ───────────────────────────────
# Każdy target: zmierz rozmiar PRZED, fetch (lub dry-run), zmierz PO,
# zapisz raport do pliku tymczasowego.
FAIL_COUNT=0
REPORT_FILE="$(mktemp)"

run_one() { # run_one "<kind> <value> <file>"
  local kind value file
  read -r kind value file <<<"$1"
  local path="${FIXTURES_DIR}/${file}"
  local before after diff
  before="$(size_of "${path}")"

  if [[ ${DRY_RUN} -eq 1 ]]; then
    echo "[refresh-fixtures][dry-run] ${kind} ${value} → ${file} (obecnie ${before} B)"
    after="${before}"
    diff="0"
  else
    echo "[refresh-fixtures] ${kind} ${value} → ${file} (było ${before} B)"
    if (cd "${SCRIPT_DIR}" && node --import tsx/esm "${FETCH}" "${kind}" "${value}"); then
      after="$(size_of "${path}")"
      diff="$(pct_diff "${before}" "${after}")"
    else
      after="$(size_of "${path}")"
      diff="ERR"
      echo "fail" >>"${REPORT_FILE}"
    fi
  fi
  echo "${kind} ${value}|before=${before}|after=${after}|diff=${diff}" >>"${REPORT_FILE}"
}
export -f run_one
export FIXTURES_DIR SCRIPT_DIR FETCH REPORT_FILE DRY_RUN

active=0
for t in "${TARGETS[@]}"; do
  run_one "${t}" &
  active=$((active + 1))
  if [[ ${active} -ge ${MAX_CONCURRENT} ]]; then
    wait -n 2>/dev/null || wait
    active=$((active - 1))
  fi
  sleep "${START_DELAY_S}"
done
wait

# ── Raport końcowy ──────────────────────────────────────────────────────
echo ""
echo "[refresh-fixtures] raport (|Δ| > 5% → możliwy redesign Tibii, R1):"
while IFS= read -r line; do
  [[ -z "${line}" ]] && continue
  kind_value="${line%%|*}"
  before="${line#*before=}"; before="${before%%|*}"
  after="${line#*after=}"; after="${after%%|*}"
  diff="${line#*diff=}"
  printf '  %-14s %10s B → %10s B  (|Δ| %s%%)\n' "${kind_value}" "${before}" "${after}" "${diff}"
  if [[ "${diff}" != "ERR" && "${diff}" != "0" && "${DRY_RUN}" -eq 0 ]]; then
    if awk -v d="${diff}" 'BEGIN { exit !(d > 5.0) }'; then
      echo "    ⚠ WARN: zmiana >5% — sprawdź czy parser działa (testy regresyjne T33)!"
    fi
  fi
done <"${REPORT_FILE}"

FAIL_COUNT="$(grep -c '^fail$' "${REPORT_FILE}" 2>/dev/null || true)"
rm -f "${REPORT_FILE}"

echo ""
echo "[refresh-fixtures] gotowe. Błędów: ${FAIL_COUNT} / ${#TARGETS[@]}."
if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  echo "[refresh-fixtures] NIEKTÓRE FETCHE SIĘ NIE UDAŁY — sprawdź logi wyżej." >&2
  exit 1
fi
exit 0
