# Fixture'y HTML — parser Bazaar (T33, ubezpieczenie R1)

> Fixture'y HTML są **regresyjnym ubezpieczeniem** na ryzyko **R1** (arch. §10):
> *Tibia zmieni HTML → scraper wysypie się cicho na produkcji.* Dzięki nim
> zmiana HTML Tibii powoduje **natychmiastowy FAIL testów**, zanim cokolwiek
> trafi do produkcji.
>
> Zasada (plan §33): fixture'y są **commitowane do repo** — NIGDY nie są
> generowane ani pobierane w teście. Testy czytają pliki z dysku.

---

## 1. Spis fixture'ów

### Lista aukcji (`auction-list-page-*.html`) — parser `auction-list.ts`

| Plik | Strona | Aukcje | Pochodzenie | Przechwytuje |
|---|---|---|---|---|
| `auction-list-page-1.html` | 1 | 25 | **Realna kopia** tibia.com, 2026-09-08 (T30) | sentinel "First Page", początek listy |
| `auction-list-page-50.html` | 50 | 25 | **Realna kopia** tibia.com, 2026-09-08 (T30) | mid-page, sentinel liczbowy |
| `auction-list-page-101.html` | 101 | 25 | **Realna kopia** tibia.com, 2026-09-08 (T30) | przedostatnie okno paginacji |
| `auction-list-page-107.html` | 107 | 14 | **Realna kopia** tibia.com, 2026-09-08 (T30) | ostatnia strona, sentinel "Last Page", strona częściowa |
| `auction-list-page-2.html` | 2 | 25 | **Mirror strukturalny** (T33) | inny zestaw aukcji niż strona 1 |
| `auction-list-page-25.html` | 25 | 25 | **Mirror strukturalny** (T33) | granica wczesnego okna paginacji |
| `auction-list-page-75.html` | 75 | 25 | **Mirror strukturalny** (T33) | późna strona (mid-end) |
| `auction-list-live-2026-09-17.html` | 1 | 25 | **Realna kopia** (2026-09-17, FlareSolverr+WARP z VPS) | żywy HTML przez przeglądarkę: sentinel „First Page", 25 aukcji, aktualny layout CipSoft |

**Czym jest „mirror strukturalny"?** Tibia.com blokuje requesty spoza
przeglądarki (HTTP 403), więc część stron nie mogła zostać pobrana jako żywa
kopia. Mirror odtwarza **dokładną strukturę HTML** zarejestrowaną w realnych
kopiách (te same klasy, selektory, układ paginacji), ale z syntetyczną,
deterministyczną treścią (imiona postaci są zmyślone). To w pełni wystarcza do
testów regresyjnych parsera — parser widzi identyczne selektory.

### Detal aukcji (`auction-detail-*.html`) — parser `auction-detail.ts`

> ⚠️ **UWAGA (2026-09-17)**: mirror detalu okazał się **FIKCYJNY**. Parser T31
> był pisany pod wymyśloną strukturę (`CharacterInfo`, `BidInfo`,
> `SkillsContainer`, `UspSection`), której prawdziwy tibia.com **nie używa**.
> Prawdziwy layout: `AuctionCharacterName`, `AuctionBody`, `ShortAuctionData*`,
> `CharacterDetailsBlock`, `AuctionOutfitImage`, … (patrz HANDOFF.md §6.10).
> Trwa przepisywanie parsera + wymiana fixture'ów na realne kopie.

| Plik | ID aukcji | Pochodzenie | Przechwytuje |
|---|---|---|---|
| `auction-detail-live-2259395.html` | 2259395 | **Realna kopia** (2026-09-17, FlareSolverr+WARP z VPS) | prawdziwy layout CipSoft: identity inline („Level: 402 \| Vocation: Royal Paladin"), 21× CharacterDetailsBlock (skills, items, imbuements, charms, quests, bestiary, gems, …), taby AuctionBody |
| `auction-detail-2173376.html` | 2173376 | **Mirror strukturalny** (T31) | pełna aukcja: 8 skilli, 2 itemy, 2 outifity, 2 mounty, 5 USP, loyalty 25%/10%, Soul War, World Transfer, Twist of Fate |
| `auction-detail-empty.html` | (99999) | **Mirror strukturalny** (T31) | minimalna aukcja: brak itemów/outfitów/mountów/USP, brak progresji |
| `auction-detail-en.html` | (11111) | **Mirror strukturalny** (T31) | locale EN: bid `1,234,567` z przecinkiem |
| `auction-detail-new-player.html` | — | **Mirror strukturalny** (T33) | **boundary**: level 8 (minimalny), brak progresji, „Minimum bid" |
| `auction-detail-vip.html` | — | **Mirror strukturalny** (T33) | **completeness**: wszystkie flagi premium (Prey Slot, Charm/Weekly Expansion, Twist of Fate, Soul War, Primal, World Transfer), Blessings 7/7 |
| `auction-detail-malformed.html` | — | **Ręcznie uszkodzony** (T33) | **error handling**: potargane tagi, puste/niepoprawne pola, nieznana vocation → `parseError` |

---

## 2. Pochodzenie i higiena danych (ważne!)

1. **Realne kopie** (listy 1/50/101/107) zostały pobrane ręcznie przez
   `scripts/fetch-fixture.ts` (T30) z
   `tibia.com/charactertrade/?subtopic=currentcharactertrades&currentpage=N`.
2. **Mirrory** odtwarzają strukturę HTML 1:1 z realnych kopii. Treść (imiona,
   poziomy, kwoty) jest **syntetyczna** — nie dotyczy żadnej prawdziwej osoby.
3. **NIE commituj wrażliwych danych** do fixture'ów:
   - imiona postaci są OK (publiczne na tibia.com),
   - **tokeny sesji, ciasteczka (`PHPSESSID`, `sessionid`), `set-cookie`,
     klucze API — WSTRZYMANE przed commitem**.
   - Test `fixture hygiene` w `src/__tests__/regression.test.ts` skanuje każdy
     plik i failuje przy wykryciu wzorca wrażliwych danych.
4. **Rozmiar plików:** mirror/detal < 50 KB. Realne kopie list (1/50/101/107)
   mają ~190-250 KB — to kompletne strony, celowo zachowane bez przycinania
   (maksymalna wierność). Nowe fixture'y dodawaj jako mirror, nie pełną kopię.

---

## 3. Jak odświeżać / aktualizować

### Ręcznie (zalecane gdy Tibia zmieni HTML)
1. Otwórz w przeglądarce (zalogowanej na tibia.com) odpowiednią stronę.
2. Zapisz jako „Strona internetowa, tylko HTML" (Ctrl+S) do
   `src/scrapers/__fixtures__/`.
3. Wytnij wrażliwe dane (patrz §2.3) i **usuń nagłówki `set-cookie`**.
4. Zaktualizuj wpis w README (data źródła + URL + co się zmieniło).
5. Uruchom testy regresyjne — **każda zmiana HTML, której parser nie
   obsługuje, MUSI skończyć się FAILem** (to jest cel R1).
6. Jeśli parser wymaga aktualizacji — popraw parser (nie test!).

### Automatycznie (skrypt)
```bash
# z apps/scraper:
pnpm tsx scripts/fetch-fixture.ts list 1          # pobierz świeżą stronę 1
pnpm tsx scripts/fetch-fixture.ts detail 2173376  # pobierz świeży detal
pnpm tsx scripts/fetch-fixture.ts --all           # wszystkie znane (constants.ts)

# cron-like odświeżenie wszystkiego + diff rozmiarów (>5% → ostrzeżenie):
./scripts/refresh-fixtures.sh          # pełne
./scripts/refresh-fixtures.sh --dry-run  # tylko plan, nic nie pobiera
```

> ⚠️ Skrypty uderzają w tibia.com — NIE uruchamiaj w CI. Używaj z szacunkiem
> (rate limit: max 2 concurrent, 500 ms przerwy — wbudowane w http-client T29).

### Metadane źródła
Każdy fixture opisuje swoją provenancję w komentarzu HTML na początku pliku
(mirror/real + data). Pełna tabela — w tym README (§1).

---

## 4. Pruning (>2 lata → archiwizuj)

Fixture'y starzeją się razem z HTML Tibii:

- **Po >2 latach** od daty źródła plik traci wartość regresyjną (Tibia i tak
  zmieni HTML szybciej) i tylko puchnie repo.
- Procedura:
  1. Przenieś plik do `src/scrapers/__fixtures__/archive/` (commit).
  2. Usuń wpis z `src/scrapers/constants.ts` i z tabeli §1.
  3. Usuń/odpowiednio zmodyfikuj testy, które go dotyczyły.
  4. Zamiast archiwum — pobierz **świeży** mirror/kopię (sekcja §3).
- **Limit:** max 10 plików na kategorię (lista / detal). Powyżej — archiwizuj
  najstarsze. Każda kategoria ma obecnie 7 (lista) i 6 (detal) plików.

---

## 5. Jak działa ubezpieczenie R1 (czego testy pilnują)

1. **Per-fixture asercje** — każdy plik ma przypisane konkretne wartości
   (ID, imię, level, vocation, bid), które parser musi zwrócić.
2. **Snapshot JSON** — pełny `AuctionDetailResult` dla kluczowej aukcji
   (2173376) serializowany do `__snapshots__/` — każda zmiana parsowania
   widoczna w diffie.
3. **Mutation tests** — celowo modyfikujemy kopię fixture'a (treść LUB
   strukturę/klasę CSS) i sprawdzamy, że parser ZAREAGOWAŁ (inny wynik).
   Gdyby parser miał zahardkodowane wartości, mutacja nic by nie zmieniła
   i test by failował → dowód, że testy naprawdę pilnują zawartości.
4. **Matryca fixture × parser** — każda kombinacja parsuje bez crasha.
5. **Higiena** — brak secrets w plikach (test skanujący wzorce).
