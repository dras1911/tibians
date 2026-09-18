# HANDOFF.md — Tibians: stan projektu i instrukcja kontynuacji

> **Cel dokumentu**: umożliwić kontynuację pracy w innym programie/agencie
> **bez zgadywania**. Zawiera stan faktyczny, historię zmian, znane błędy
> i listę tego, co zostało.
>
> **Data**: 2026-09-17
> **Commit**: `aa2b6ae` (local == remote)
> **Strona na żywo**: https://tibian.click

---

## 1. Co to jest

**Tibians** — portal community dla graczy Tibii:

- **Char Bazaar** — przeglądarka aukcji postaci (lista, filtry, detal, porównanie, SSE, statystyki)
- **14 kalkulatorów** — Exercise Weapons, True Skill, Stamina, Character Value, Imbuement, Blessings, Weekly Tasks, Charms, Experience, Leech, Exp Share, Wheel of Destiny, plannery
- **Workspace** — panel analizy postaci
- **Blog, Bosses, Reference** (items/worlds/outfits/mounts/imbuements)
- **Premium** — mechanizm gotowy, wymaga podłączenia płatności

Tibia jest znakiem towarowym CipSoft GmbH. Projekt nie jest powiązany z CipSoft.

---

## 2. Gdzie to działa

| Element     | Wartość                                                          |
| ----------- | ---------------------------------------------------------------- |
| **Domena**  | `tibian.click` (+ `www` → 301 na apex)                           |
| **Serwer**  | `51.83.128.47` (OVH), Ubuntu 24.04.4 LTS                         |
| **Zasoby**  | 2 vCPU · 3.8 GB RAM · 38 GB dysku (37% zajęte) · swap 2 GB       |
| **SSH**     | `ssh -i ~/.ssh/id_ed25519 ubuntu@51.83.128.47` (klucz BEZ hasła) |
| **Repo**    | https://github.com/dras1911/tibians (publiczne)                  |
| **SSL**     | Let's Encrypt, automatycznie (Caddy)                             |
| **Katalog** | `/opt/tibians`                                                   |
| **Docker**  | 29.8.1, Compose v5.5.1                                           |

### Kontenery (5)

```
tibians-caddy      — reverse proxy + SSL + HTTP/3
tibians-web        — Next.js 15
tibians-scraper    — worker (3 pętle: Full/EndingSoon/Reference)
tibians-db         — PostgreSQL 17
tibians-tibiadata  — self-hosted API TibiaData (Go)
```

---

## 3. Stack techniczny

| Warstwa   | Technologia                                                     |
| --------- | --------------------------------------------------------------- |
| Monorepo  | pnpm 9.15.9 + Turborepo                                         |
| Język     | TypeScript strict, `exactOptionalPropertyTypes`, zero `any`     |
| Web       | Next.js 15 App Router, RSC, next-intl (PL/EN)                   |
| Scraper   | Node 22 + undici + cheerio                                      |
| Baza      | PostgreSQL 17 + Drizzle ORM                                     |
| Walidacja | Zod                                                             |
| Testy     | Vitest — **1413 testów**                                        |
| UI        | Tailwind 3 + własny design system (`packages/ui`, tokeny OKLCH) |
| Auth      | Discord OAuth2 (własna implementacja, zero zależności)          |

**Rozmiar**: 370 plików TS/TSX (232 w `apps/`, 138 w `packages/`).

---

## 4. ⚠️ JAK WDROŻYĆ ZMIANĘ (krytyczne — łatwo się pomylić)

```bash
# 1. Lokalnie
git add -A
git commit -m "..."
git push origin master

# 2. Na serwerze
ssh -i ~/.ssh/id_ed25519 ubuntu@51.83.128.47
cd /opt/tibians
git pull

# 3. Rebuild TYLKO zmienionego serwisu (nie całego stacku)
sudo docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build web
#                                                                                   ^^^^
#                                                              web | scraper | caddy
```

### 🔴 PUŁAPKA: `--env-file .env.production` jest OBOWIĄZKOWY

Compose domyślnie czyta `.env`, nie `.env.production`. Bez tej flagi **padnie**:

```
error while interpolating services.caddy.environment.DOMAIN:
required variable DOMAIN is missing a value
```

**Uwaga**: `DEPLOYMENT.md` w repo podaje komendę BEZ tej flagi — to błąd w dokumentacji,
do poprawienia.

### Weryfikacja po wdrożeniu

```bash
# Zdrowie (powinno być 200 + db:ok + tibiadata:ok)
curl -s https://tibian.click/api/health

# Strony
curl -so /dev/null -w "%{http_code}" https://tibian.click/pl
```

**⚠️ `HTTP 200` to NIE weryfikacja UI.** Ten błąd popełniono wielokrotnie —
patrz sekcja 7.

---

## 5. Co DZIAŁA (zweryfikowane)

| Funkcja                                                | Stan   | Weryfikacja                             |
| ------------------------------------------------------ | ------ | --------------------------------------- |
| 14 kalkulatorów (UI, walidacja, layout)                | ✅     | w przeglądarce                          |
| **True Skill** (formuła + selektory)                   | ✅     | Knight/Sword 127+40% → **123,47**       |
| Bazaar: lista, filtry, detal, compare, SSE, statystyki | ✅ UI  | 0 aukcji — patrz §6.1                   |
| Workspace, blog, bosses, reference                     | ✅     | w przeglądarce                          |
| **Logowanie Discord** (sesja, OAuth2, 4 trasy)         | ✅ kod | brak `CLIENT_ID/SECRET` — patrz §6.5    |
| i18n PL/EN (parzystość kluczy)                         | ✅     | —                                       |
| Strona **Privacy**                                     | ✅     | `/pl/privacy` → 200                     |
| OG images (dynamiczne)                                 | ✅     | 200, `image/png`                        |
| SEO: sitemap, robots, hreflang, JSON-LD                | ✅     | —                                       |
| SSL, HTTP/3, security headers                          | ✅     | —                                       |
| Deploy: Docker, Caddy, firewall, swap                  | ✅     | —                                       |
| Scraper: parsery, scheduler, advisory lock             | ✅ kod | **zablokowany przez Cloudflare** — §6.1 |
| Baza: 26 tabel, migracje, seed                         | ✅     | 36+22+23 wierszy seeda                  |

**Testy**: 1413 przechodzi · **typecheck**: 9/9 pakietów · **lint**: 0 błędów

---

## 6. Co NIE DZIAŁA — lista znanych problemów

### ✅ 6.1 ROZWIĄZANE (2026-09-17): WARP + headless browser (do wdrożenia na produkcję)

**Objaw**: `0 aktywnych aukcji`, `scrape_runs` pokazuje `auctions_found: 0`.

**Przyczyna** (potwierdzona): twarda blokada Cloudflare dla VPS — Managed Challenge
(`cf-mitigated: challenge`), przepuszcza TYLKO prawdziwą przeglądarkę. curl/undici/
Go (TibiaData) nie przechodzą — także przez WARP.

**ROZWIĄZANIE przetestowane na VPS (0 €/mies.):**

1. **WARP** (darmowy VPN Cloudflare) — tryb proxy SOCKS5 na `127.0.0.1:40000`,
   zainstalowany na VPS, `warp-svc` enabled (auto-start).
2. **FlareSolverr** (headless Chromium + HTTP API) z proxy WARP:
   - 25/25 kolejnych stron listy → HTTP 200, ~0,8–1,2 s/strona,
   - detal aukcji (487 KB) w ~1,15 s,
   - „Challenge not detected!" — przez WARP challenge nie występuje.
3. **CloakBrowser** (stealth Chromium) + WARP — działa równie dobrze (plan B).
4. Ślepe uliczki: curl przez WARP → 403; GitHub Actions (Azure) → 403;
   self-host TibiaData na tym VPS → throttle. Publiczne `api.tibiadata.com`
   działa z VPS (→ przełączyć `TIBIADATA_BASE_URL`).

**Wdrożenie w toku**: transport `flaresolverr` w scraperze + serwis w compose.
Szczegóły: `.omo/notepads/tibians/cloudflare-warp-solution.md`.

### ✅ 6.10 ROZWIĄZANE (2026-09-17, sesja 2): parser detalu v2 pod REALNY HTML + harvest słowników

**Objaw (historyczny)**: parser detalu zwracał `isSuccessful: true` + puste dane
(`name: undefined`, `skills: 0`, `items: 0`) na prawdziwym HTML z tibia.com.

**Przyczyna (historyczna)**: fixture'y detalu v1 (T31/T33) były **„mirrorami
strukturalnymi"** — HTML wymyślony przez agenta (Cloudflare blokował pobranie
prawdziwej strony). Parser szukał klas (`CharacterInfo`, `BidInfo`,
`SkillsContainer`), których prawdziwy tibia.com **NIE UŻYWA**.

**Naprawa (v2) — co zostało zrobione**:

1. **Parser detalu przepisany** (`apps/scraper/src/scrapers/auction-detail.ts`)
   pod realny layout: `.AuctionHeader/.AuctionCharacterName/.AuctionOutfitImage`,
   `.ShortAuctionData*` (Minimum|Current|Winning Bid + daty CET/CEST),
   `.AuctionTimer[data-timestamp]` (Unix epoch końca — spójny z parserem listy),
   `td.LabelColumn/LevelColumn` (skille), `span.LabelV` (charm points, gold,
   hirelings, prey slots, charm/weekly expansion), `.SpecialCharacterFeatures
.Entry` + `usp-category-N.png` (USP), `#ajax-target-type-{0..6}`
   (items / store / mounts / outfits / familiars).
2. **Guard „to nie detal"**: brak `.AuctionCharacterName` / pól nagłówka /
   `.CharacterDetailsBlock` → `auction: null` + `parseError` (koniec cichych
   śmieciowych wierszy; scheduler zapisze błąd w `scrape_errors`).
3. **Harvest słowników** (NOWE — rozwiązuje problem pustych FK):
   detal zwraca `reference` = świat + nazwy/obrazki items/outfits/mounts;
   `upsertAuction` robi `ensureReferenceData` (ON CONFLICT DO NOTHING)
   przed relacjami → FK `auction_items.item_id → items.id` itd. są spełnione
   od pierwszego scrape'a. Tabele referencyjne wypełniają się same.
4. **Migracja 0002**: `worlds.region/pvp_type/battleye` → NULL-owalne
   (harvest wstawia tylko id+name; reszta z TibiaData).
5. **`tier` itemów**: kolumna jest NOT NULL (PK) — parser ustawia `0`
   (= base/nieznany); mapper normalizuje `?? 0`.
6. **Testy**: 285/285 przechodzi. Detale testowane na **5 żywych kopiach 1:1**
   (`auction-detail-live-{2259395,2252245,2258972,2255748,2258274}.html`);
   stare mirror-fixture'y detalu USUNIĘTE; benchmark waloryzacji przeniesiony
   na żywy fixture (Lancelot, 153 363 TC).

**Ograniczenia v2 (świadome, udokumentowane w kodzie)**:

- `skillLoyalties` puste — nowy layout nie publikuje loyalty % per skill
  (tylko adnotacja USP „(Loyalty bonus not included)").
- Item Summary ma paginację (np. „» Results: 399", 6 stron) — v2 czyta
  stronę 1 (~76 pozycji); kolejne strony do dociągnięcia w iteracji.
- Tier foringu itemów nie występuje w HTML.

**Weryfikacja**: parser na 5 żywych fixture'ach — wszystkie pola zgodne
z ręczną analizą HTML (identity/skille/daty/charms/gems/flagi/relacje/USP).

**Odrzucone opcje** (dla historii): proxy residential/ISP (~5-15 €/mies.),
scraping API (~30-100 €/mies.), zmiana VPS (niepewna). WARP+Browser = 0 €
i przetestowane.

### 🔴 6.2 Wycena postaci (Character Value) — wagi z sufitu

**Objaw**: postać kupiona za **2301 TC** wyceniona na **33 937 TC**.

**Przyczyna**: wagi w `packages/db/src/seed/valuation-rules.ts` są **wymyślone**:

```
base_level_weight:      50 TC × level  →  232 lvl = 11 600 TC
feature_soul_war:   12 000 TC
feature_primal_ordeal: 12 000 TC
feature_world_transfer: 15 000 TC
```

**DECYZJA UŻYTKOWNIKA**: wycena ma być liczona **z danych Bazaar** (porównanie
podobnych postaci: skill, profesja, level), a **nie** z zaszytych wag.

**Blokada**: brak danych Bazaar, dopóki scraper nie działa (§6.1).
**To zadanie jest ZABLOKOWANE przez 6.1.**

### 🟡 6.3 Duplikat nagłówka sekcji na stronie głównej

**Status**: naprawione dla „Kończące się w ciągu godziny".
**Do sprawdzenia**: czy analogiczny problem nie występuje w innych miejscach.

### 🟡 6.4 Tekst wychodzi za prawą krawędź

**Objaw** (na zrzucie strony głównej): `(0) brak kończących się aukcji`
wychodzi poza kontener.
**Gdzie**: `apps/web/src/components/home/ending-soon-section-live.tsx` —
nagłówek z `justify-between`, licznik nie ma `min-w-0`/`truncate`.

### 🟡 6.5 Discord — brak danych aplikacji

Kod gotowy, ale brak `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` w `.env.production`.
**Instrukcja**: `DEPLOYMENT.md` §13.2.
**Uwaga**: `SESSION_SECRET` jest już wygenerowany na serwerze.

### 🟡 6.6 PWA install prompt — do usunięcia

**Opinia użytkownika**: „po co to komuś instalować i robić skrót jak może po prostu
wejść na stronę, bezsensowne to jest" — **słuszna**.

**Do zrobienia**: usunąć automatyczny prompt, zostawić sam manifest.
**Gdzie**: `apps/web/src/components/pwa/install-prompt.tsx`.

### 🟡 6.7 Blog — treści „na start" do wymiany + brak panelu

3 posty wygenerowane automatycznie, brzmią sztucznie.
**Użytkownik chce sam pisać artykuły** i potrzebuje do tego panelu (na końcu).

### 🟢 6.8 `pnpm build` pada na Windows (nie błąd kodu)

`EPERM` przy `output: "standalone"` — symlinki wymagają trybu deweloperskiego.
**Kompilacja się udaje** (`BUILD_ID` powstaje); pada tylko kopiowanie standalone.
**W Dockerze/Linuxie nie występuje.**

### 🟢 6.9 Niezweryfikowane

- **Error boundary** (`app/[locale]/error.tsx`) — dev overlay zasłania renderowanie.
  Do sprawdzenia na produkcji przy okazji wywołania prawdziwego błędu.
- **Pełny przepływ logowania Discord** — wymaga prawdziwych danych aplikacji.

---

## 7. 🔴 KRYTYCZNA LEKCJA PROCESOWA

**Ten projekt był weryfikowany `HTTP 200` + testami jednostkowymi — i to zawiodło.**

Przykłady realnych błędów, które **przeszły** typecheck i 1412 testów,
a użytkownik znalazł je **w przeglądarce**:

| Błąd                                                            | Dlaczego testy nie złapały                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Cały CSS nie był podpięty** — portal wyglądał jak surowy HTML | `globals.css` nie był importowany przez nic; curl nie renderuje CSS                                     |
| **Formuła True Skill** — 123 → 90,71                            | Test i implementacja miały **ten sam błąd**                                                             |
| **20 etykiet nawigacji pustych**                                | next-intl zwracał obiekt zamiast stringa; `tsc` tego nie widzi                                          |
| **Strona główna 500**                                           | `useAuctionLive` tworzył kontroler w `useState` (czyli też na SSR), a `EventSource` nie istnieje w Node |
| **`INTERVAL 24 hour`** bez apostrofów                           | Błąd składni SQL — ujawnia się tylko z prawdziwą bazą                                                   |
| **Wagi wyceny**                                                 | Wymyślone liczby; nikt ich nie skonfrontował z rynkiem                                                  |

### Zasady dla kontynuującego

1. **`HTTP 200` ≠ działa.** Zawsze rób zrzut ekranu (Playwright) i **popatrz**.
2. **Test może utrwalać błąd.** Jeśli test i implementacja powstawały razem —
   porównaj z **zewnętrznym źródłem** (TibiaWiki), nie tylko z testem.
3. **Sprawdź z prawdziwą bazą.** SQL-owe i SSR-owe błędy nie ujawniają się inaczej.
4. **Liczby konfrontuj z rzeczywistością.** Wycena 33k za postać za 2,3k to sygnał.
5. **Przy weryfikacji HTML/a11y**: stringi w odpowiedzi mogą pochodzić z payloadu
   RSC/i18n, nie z DOM. Sprawdzaj markery DOM (`role="alert"`, klasy) — nie same stringi.

### Playwright — jak czytać źródła zablokowane Cloudflare

`curl` i `webfetch` dostają **403** na `tibia.fandom.com` i `tibia.com`.
**Playwright przechodzi** (prawdziwa przeglądarka). Tak zdobyto formuły z Wiki:

```
browser_navigate → https://tibia.fandom.com/wiki/Formulae
browser_navigate → https://tibia.fandom.com/wiki/Loyalty_System
browser_evaluate → document.querySelector('.mw-parser-output').innerText
```

---

## 8. Co ZOSTAŁO — lista zadań (w kolejności ustalonej z użytkownikiem)

### A) ✅ ZROBIONE — True Skill

Formuła z TibiaWiki, stałe profesji, selektory, testy. Commit `aa2b6ae`.

### B) ⏳ NASTĘPNE — audyt formuł z TibiaWiki

**Materiał źródłowy już zdobyty** (strona `Formulae`). Do porównania:

| Kalkulator                                   | Co sprawdzić                                                                              | Źródło                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------- |
| **Exercise Weapons / Training**              | Stałe A (Magic 1600, Melee 50, Distance 30, Shielding 100, Fishing 20) i `b` per profesja | Formulae §Skills                    |
| **Experience**                               | `50·lvl³ − 150·lvl² + 400·lvl` — porównać z `xp-table.ts`                                 | Formulae §Experience                |
| **Stamina**                                  | Strefy regeneracji; **użytkownik zgłosił, że „nie działa"** — sprawdzić                   | Formulae (brak) / TibiaWiki Stamina |
| Leech, Exp Share, Imbuing, Blessings, Charms | Kolejne                                                                                   | Formulae / TibiaWiki                |

**Metoda**: dla każdego kalkulatora pokazać użytkownikowi **konkretny wynik liczbowy**
i **spytać czy się zgadza** z jego doświadczeniem w grze. Inaczej powtórzymy błąd
True Skill (kod i test z tym samym błędem).

**Uwaga**: użytkownik zgłosił, że **kalkulator Stamina nie działa** — prawdopodobnie
błąd w kodzie poza duplikatem w menu (duplikat już naprawiony).

### C) ⏳ NA KOŃCU — panel do bloga

Użytkownik chce **sam pisać artykuły** bez dotykania plików `.mdx`.
Wymagania:

- logowanie Discordem (już działa)
- lista postów, edytor, zapis do bazy
- dostęp tylko dla właściciela (weryfikacja po Discord ID)

**Obecny stan bloga**: pliki MDX w `apps/web/src/content/blog/{pl,en}/*.mdx`
z frontmatterem:

```yaml
---
title: "..."
date: "2026-09-14"
author: "..."
excerpt: "..."
tags: [...]
locale: "pl"
---
```

Loader: `apps/web/src/lib/blog/index.ts`.

### D) ⏳ PO B — wygląd (redesign)

**Kierunek od użytkownika**:

> „wygląd ma być **nowoczesny ale unikatowy**, nie ma być kopią żadnej strony.
> Tak aby nie było, że to **wygenerowano przez AI**."

**Konsekwencje** — uciec od generycznego „Tailwind/shadcn look":

- własna skala typograficzna i rytm odstępów (nie `gap-4` wszędzie)
- **asymetryczne** layouty (nie wszystko wyśrodkowane)
- wyrazista tożsamość kolorystyczna (mamy OKLCH w `packages/ui`)
- gęstość informacji jak w narzędziu, nie jak w landingu
- detale spójne, ale nie domyślne

**Metoda**: pokazać użytkownikowi **2-3 warianty** do wyboru, nie zgadywać.

### E) ⏳ ZABLOKOWANE — wycena (§6.2) i scraper (§6.1)

---

## 9. Gdzie szukać — mapa plików

| Czego szukasz                       | Plik                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| **Formuły kalkulatorów**            | `packages/calc/src/formulas/*.ts`                                      |
| **True Skill (naprawiona formuła)** | `packages/calc/src/formulas/true-skill.ts`                             |
| **Testy formuł**                    | `packages/calc/src/formulas/__tests__/*.test.ts`                       |
| Kalkulatory UI                      | `apps/web/src/app/[locale]/calculators/*/`                             |
| Bazaar UI                           | `apps/web/src/app/[locale]/bazaar/`, `apps/web/src/components/bazaar/` |
| Zapytania DB (web)                  | `apps/web/src/lib/server/auctions.ts`                                  |
| Zapytania DB (scraper)              | `packages/db/src/queries/`                                             |
| Schemat bazy                        | `packages/db/src/schema/*.ts`                                          |
| Migracje                            | `packages/db/migrations/*.sql`                                         |
| **Wagi wyceny (do wymiany)**        | `packages/db/src/seed/valuation-rules.ts`                              |
| Scraper — HTTP                      | `apps/scraper/src/http-client.ts`                                      |
| Scraper — scheduler                 | `apps/scraper/src/scheduler.ts`                                        |
| Scraper — bootstrap                 | `apps/scraper/src/start.ts`                                            |
| Auth                                | `apps/web/src/lib/auth/{session,discord,use-auth}.ts`                  |
| Tłumaczenia                         | `apps/web/messages/{pl,en}.json`                                       |
| Design system                       | `packages/ui/src/{tokens,styles,typography}.css`                       |
| Nagłówek / nawigacja                | `apps/web/src/components/layout/{header,mobile-sheet}.tsx`             |
| **Instrukcja wdrożenia**            | `DEPLOYMENT.md`                                                        |
| **Blueprint scrapera**              | `SCRAPER-BOOTSTRAP.md`                                                 |
| Plan projektu (88 zadań)            | `.omo/plans/tibians.md`                                                |
| Notatki z sesji                     | `.omo/notepads/tibians/{learnings,issues}.md`                          |

---

## 10. Historia sesji — co zostało naprawione

Poprzednia sesja zakończyła 88-zadaniowy plan z 1413 testami **i portalem,
który nie działał**. Ta sesja to głównie **naprawa błędów znalezionych
przez uruchomienie produktu**.

| Commit    | Co naprawiono                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ca7441e` | **Scraper w ogóle nie startował** — brakowało 13 metod `SchedulerDb`, adaptera, bootstrapu. `Dockerfile` wskazywał plik, który tylko eksportował funkcję. |
| `ca7441e` | Usunięto 108 artefaktów builda zacommitowanych w `src/` + bug aliasu `@tibians/db/seed` w vitest                                                          |
| `9409c49` | **Discord OAuth od zera** — w repo były tylko placeholdery                                                                                                |
| `c5fc1c3` | **OG images 404** — jeden route handler zamiast ~20 plików                                                                                                |
| `5f5bd52` | **20 etykiet nawigacji renderowało się puste** (obiekty zamiast stringów)                                                                                 |
| `17eb32e` | **Strona główna 500** — `EventSource` w SSR                                                                                                               |
| `53060ec` | **Strona główna 500** — `INTERVAL 24 hour` bez apostrofów + `tsx` w złym miejscu                                                                          |
| `1695bf1` | **`/bazaar` 500** przy niedostępnej bazie — nieosłonięty `Promise.all`                                                                                    |
| `7fda70e` | **CAŁY CSS NIE BYŁ PODPIĘTY** — `globals.css` bez importu                                                                                                 |
| `f2e9a59` | Brak faviconu + duplikat nagłówka sekcji                                                                                                                  |
| `55ad59d` | **Formuła True Skill** — bonus mnoży PUNKTY, nie poziomy                                                                                                  |
| `94e96f1` | Duplikat Stamina w menu + brak strony Privacy                                                                                                             |
| `aa2b6ae` | Selektory profesji/skilla w True Skill                                                                                                                    |
| `aeb6aa0` | Diagnoza CF + odkrycie: fixture'y detalu były FIKCYJNE (mirror, nie realny HTML)                                                                          |
| `8e9f52f` | **Parser detalu v2 pod REALNY layout tibia.com** + harvest słowników (items/outfits/mounts/worlds → FK spełnione) + migracja 0002 + 5 żywych fixture'ów   |
| `cf56987` | **Transport browser**: serwis `browser-fetch` (CloakBrowser+WARP, API FlareSolverr-compatible) + adapter Requester + compose (fallback profil)            |
| `6863533` | Docs: DEPLOYMENT §8b (WARP + browser-fetch: instalacja, ufw, token, test, troubleshooting)                                                                |
| `7e86ebf` | Fix: pnpm w obrazie scrapera (naprawa `db:migrate` w kontenerze)                                                                                          |

Pełna lista: `git log --oneline`

### Sesja 2026-09-17 (nr 2) — co ustalono i zrobiono

1. **Parser detalu v2** — przepisany na realny DOM (patrz §6.10). Testy 297/297.
   Detale testowane na 5 ŻYWYCH kopiach 1:1; mirror-fixture'y usunięte.
2. **Harvest słowników** — detal zwraca `reference` (świat + items/outfits/mounts
   z nazwami); `upsertAuction` robi `ensureReferenceData` przed relacjami.
   Baza wypełnia tabele referencyjne sama przy scrape'ie (koniec pustych FK).
3. **Transport przez przeglądarkę** — serwis `browser-fetch` (CloakBrowser +
   WARP) z API zgodnym z FlareSolverr; scraper wybiera transport env-em
   (`SCRAPER_FETCH_MODE=browser`). FlareSolverr = fallback (profil `fallback`).
   **Przetestowane na produkcji**: fetch Bazaar przez serwis → HTTP 200,
   246 KB, 50 auctionid, 0 challenge markers, ~4 s (z pierwszym startem Chrome).
4. **Bezpieczeństwo**: port 8192 tylko dla sieci dockerowych (ufw) + token
   `BROWSER_FETCH_TOKEN`; serwis w host network (dostęp do WARP).
5. **Deploy**: migracja 0002 (worlds nullable) + restart scrapera na nowym kodzie.
6. **Backfill DZIAŁA** (potwierdzone na produkcji): baza rośnie przez cały
   czas (2119+ aukcji o 21:30, licznik live na portalu), filtry facetów
   liczą się z danych, tabela renderuje się ze zrzutu ekranu (25/h).

### Bugi produkcyjne złapane i naprawione w trakcie backfillu (2026-09-17)

| #   | Objaw                                                                                                                         | Przyczyna                                                                                                                                                                                                                                      | Fix (commit)                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Cannot switch to a different thread` przy każdym fetchu                                                                      | Playwright sync API nie jest thread-safe; ThreadingHTTPServer obsługuje każdy request w innym wątku                                                                                                                                            | Dedykowany wątek przeglądarki + kolejka zadań (`5bb61fd`)                                                                                                                                                                           |
| 2   | `violates foreign key auctions_world_id_worlds_id_fk` (każda aukcja)                                                          | `ensureReferenceData` był PO insercie aukcji, a FK world wymaga świata PRZED                                                                                                                                                                   | Przeniesione na początek transakcji (`a76cdaa`)                                                                                                                                                                                     |
| 3   | `duplicate key ... auction_items_auction_id_item_id_tier_pk`                                                                  | Ten sam item w Item Summary i Store Item Summary → 2 wiersze relacji (dedupe był per-kontener)                                                                                                                                                 | Globalny dedupe: quantity sumowane, isStore OR (`f2b1ab6`) + test regresyjny                                                                                                                                                        |
| 4   | Scraper czekał 15 min na pierwszy scrape po restarcie                                                                         | `setInterval` odpala pierwszą iterację po pełnym interwale                                                                                                                                                                                     | Kickoff full+endingSoon natychmiast po starcie (`56381b4`)                                                                                                                                                                          |
| 5   | `db:migrate` w kontenerze: `Cannot find module '/app/pnpm'`                                                                   | Brak pnpm w obrazie runnera                                                                                                                                                                                                                    | `npm i -g pnpm@9.15.9` w Dockerfile.scraper (`7e86ebf`)                                                                                                                                                                             |
| 6   | `Invalid vocation: "None"` — aukcje bez profesji pomijane (~kilka %)                                                          | tibia.com realnie renderuje `Vocation: None` (postacie challenge/Rookgaard; `None` nie było w kontrakcie)                                                                                                                                      | `None` w `VocationSchema` + parserze + UI (`4828436`)                                                                                                                                                                               |
| 7   | Build web padał: `'users' is not exported from '../schema'`                                                                   | Webpack (Next) rozwiązywał importy bez rozszerzenia do starego `.js` obok `.ts` w `packages/db/src`                                                                                                                                            | Usunięte 88 artefaktów `.js/.d.ts/map` + `resolve.extensions` preferuje `.ts` (`820729c`)                                                                                                                                           |
| 8   | Strona bazaru rzucała `MISSING_MESSAGE: Bazaar.filters.vocation.none`                                                         | Dodano opcję „None" do UI, ale brakowało klucza tłumaczenia w `messages/{pl,en}.json`                                                                                                                                                          | Klucz dodany (PL „Bez profesji", EN „None") (`590575c`)                                                                                                                                                                             |
| 9   | CAŁA baza miała tylko promowane wokacje — np. „Royal Paladin" na level 8 (211/214 aukcji < lvl 20)                            | Parser awansował bazowe wokacje na liście i w detalu (`normalizeVocation`, `vocationToPromoted`: Paladin → Royal Paladin)                                                                                                                      | Zachowanie formy z tibia.com (bez awansu) + `VocationPromotedSchema` z formami bazowymi + refine + testy (`9c2a835`)                                                                                                                |
| 10  | Timer końca aukcji NIEWIDOCZNY (ciemny motyw) — „nie widać timera, bo taki kolor tekstu"                                      | `warning.foreground` w tailwind = `var(--bg-base)` (kolor TŁA!); użycia z `bg-warning/10` → tekst = tło                                                                                                                                        | Nowy token `--warning-foreground` (light: ciemny amber, dark: jasny amber) + przepięcie w tailwind (`4f19992`)                                                                                                                      |
| 11  | Link „Otwórz kalkulator True Skill" (detal aukcji) niewidoczny                                                                | Ten sam wzorzec: `text-info-foreground` (= `var(--bg-base)`) na `bg-background`                                                                                                                                                                | `text-info` — spójnie z sąsiednimi linkami (`e2065b8`)                                                                                                                                                                              |
| 12  | GBE/YBE ODWROTNE (Antica pokazywana jako GBE, Nevia jako YBE)                                                                 | `protected`→GBE, `initially protected`→YBE — a na tibia.com jest ODWROTNIE: `icon_battleye.gif` = żółta (YBE), `icon_battleyeinitial.gif` = zielona (GBE)                                                                                      | Badge + tłumaczenia + lista światów poprawione (protected→YBE, initially→GBE); dane w bazie były OK (`2d008fa`)                                                                                                                     |
| 13  | **Filtry bazaru NIE DZIAŁAŁY** — „nic się nie zmienia, cały czas ta sama lista postaci" (żaden parametr URL nie dawał efektu) | `auctionFiltersSchema` i `paginationSchema` są `.strict()`, a parsowane w JEDNYM try/catch — klucz z drugiego schematu (`page` w filtrach, `levelMin` w paginacji) rzucał → catch → fallback do **PUSTYCH filtrów**. Efekt: zawsze pełna lista | `splitBazaarParams()` (web) dzieli klucze po `.shape` schematów; `auctionFiltersObject` wydzielony z refine'ów (żeby `.shape` był dostępny); nieznane klucze (utm_*) ignorowane; `history/` — ta sama naprawa paginacji (`77ad445`) |
| 14  | 2 aukcje (Penumbra) NIGDY nie wchodziły — `violates foreign key auctions_world_id_worlds_id_fk` (69 błędów w logach)          | Parser nadaje nieznanym światom deterministyczny hash (`resolveWorldId` → `hashToSmallint`), a „Penumbra" ma w bazie id=62 ≠ hash=13731; insert świata z hashem odbijał się od UNIQUE(name) → aukcja leciała z nieistniejącym `world_id`       | `upsertAuction`: po `ensureReferenceData` wyrównuje `world_id` do ID z `worlds` po nazwie (`1c4ff4c`)                                                                                                                               |
| 15  | `ending-soon` stał godzinami — „Advisory lock busy" ×1497, aukcje po terminie nie zamykane                                    | Advisory locki są session-scoped; restart kontenera (bez graceful shutdown) zostawił zombie-sesję trzymającą lock (12 h)                                                                                                                       | Ręcznie: `pg_terminate_backend`; na stałe: `PG_APP_NAME` + cleanup zombie-sesji przy starcie scrapera (`1c4ff4c`)                                                                                                                   |
| 16  | „Wyczyść wszystko" nic nie robiło po wejściu z URL (np. `?levelMin=800`)                                                      | `lastSerialized` startował z `""` → pierwszy reset: `buildQueryString({}) === "" === lastSerialized` → no-op (brak nawigacji)                                                                                                                  | Init ref z bieżącego URL na mount (`ee39d96`)                                                                                                                                                                                       |
| 17  | Filtry „Gemy (minimum)" i „Store counts (minimum)" nigdy nie działały (mimo UI)                                               | Pola istniały tylko w UI/hooku — brak w schemacie i w WHERE                                                                                                                                                                                    | Podłączone do schematu + WHERE (`ee39d96`)                                                                                                                                                                                          |
| 18  | Lista „aktywnych" pokazywała karty z badge „Zakończona" („lista wypełnia się zakończonymi")                                   | Skutek #15: aukcje po terminie ze starym statusem `active`; sortowanie po `auction_end` stawiało je na górze listy                                                                                                                             | Naprawa #15 + defensywa `auction_end > now()` dla statusu active (`ee39d96`)                                                                                                                                                        |

### Sesja 2026-09-18 (nr 3) — `/bazaar`: naprawa filtrów + sekcja Store items

1. **FIX filtrów** (bug #13, patrz tabela wyżej). Testy regresyjne:
   `apps/web/src/lib/server/__tests__/bazaar-params.test.ts` (9 testów).
2. **Presety usunięte** — komponent `preset-dropdown.tsx` (git rm) + użycie w toolbarze + eksport w barrelu.
3. **BattlEye w filtrach** — opcja „Wyłączone" usunięta (na Tibii nie ma światów bez BattlEye; zostają zielone/żółte).
4. **Skill minimum** — thumb slidera 44→20 px + input liczbowy obok (wpisywanie wartości — wygodne na mobile).
5. **„Must-have" → „Zawiera"** / „Includes" — nazwa nie sugeruje wymogu.
6. **Store items** (nowa sekcja, wzór: ExevoPan): Training Dummy, Gold Pouch, Gold Converter,
   Hirelings, Imbuement Shrine, Reward Shrine, Mailbox — filtr `EXISTS` po nazwie itemu
   (`items.is_store_item`), liczniki facetowe (`getStoreItemFacetCounts`). Przeniesione
   z „Zawiera": Charm Expansion, Prey Slot, Weekly Task Expansion, World Transfer.
7. **Nowe filtry z ExevoPan** (sekcja „Różne"): `biddedOnly` (`bid_type=current`),
   `charmPointsMin/Max`, `tcInvestedMin/Max`.
8. **Research ExevoPan** (panel filtrów z bundle i18n — `tmp-verify/exevo.html`): pełna lista:
   Szukaj nazwy · Klasa postaci · Serwer · BattlEye (green/yellow) · Store items ·
   Tibia Coins invested · Bidded only · Rzadkie przedmioty · Rzadkie osiągnięcia ·
   Różne (rzadkie nazwy) · Min/Max charm points · multi-select: imbuementy, charmy, gemy,
   questy, osiągnięcia, przedmioty. **Nie mamy jeszcze**: rzadkie osiągnięcia, rzadkie nazwy
   postaci, multi-selecty imbuementów/charmów/questów/osiągnięć (`achievement_points` jest
   w bazie — do rozważenia).
9. **Tagi „Różne"** (sesja nr 4, `ee39d96`): pigułki jak ExevoPan — Soul War, Primal Ordeal,
   Dużo charmów (≥3000), Dużo questów (≥25), Dużo przedmiotów z Tibia Store (≥10),
   Rzadkie nazwy postaci (regex nicku); progi dobrane z rozkładów produkcji (p75–p90).
   Podłączone też filtry, które istniały tylko w UI (nie działały): gemy i store counts
   (+ nowe `questsMin` i `rareNicknames`).
10. **Sticky sidebar** — własny scroll (`max-h-[calc(100vh-6rem)]` + `overflow-y-auto`);
    „Wyczyść wszystko" naprawione (bug #16); defensywa „Zakończona" na liście aktywnej (#18).
11. **Scraper**: naprawa FK na Penumbra (#14) + auto-cleanup zombie-locków przy starcie
    (#15) — `PG_APP_NAME=tibians-scraper` + `pg_terminate_backend` sesji o tej nazwie
    (`1c4ff4c`). Zweryfikowane: FK errors 0, 6 aukcji Penumbry weszło, ending-soon żyje.
12. **BattlEye**: „Zielone"/„Żółte" bez dopisków w nawiasie (PL/EN) — `ee39d96`.

### Znane drobiazgi (do zrobienia)

- **Skill loyalty** — nowy layout nie publikuje % lojalności (§6.10).
- **Paginacja itemów** — czytana tylko strona 1 sekcji Item Summary.
- **Reference loop (T32)** — pełny skan `static.tibia.com` nie idzie przez
  browser transport; harvest z detali pokrywa na razie słowniki.
- **Regiony/PvP światów** — ✅ uzupełnione jednorazowym upsertem: 96 światów
  z TibiaData (`api.tibiadata.com/v4/worlds` przez WARP) — region EU/NA/BR,
  pvp_type, battleye (`release` → „initially protected", data → „protected").
  Oceania (3 światy: Oceanis/Stralis/Victoris) zostaje NULL — enum `region`
  ma tylko EU/NA/BR; do rozważenia rozszerzenie enuma w przyszłości.
  Filtr „Świat" na bazarze pokazuje teraz pełną listę z licznikami per świat.
- **„Zakończona" w tabeli bazaar** — część wierszy na liście „kończące się
  najwcześniej" ma status zakończonej; zbadać czy strona nie powinna
  filtrować `ended` przy sortowaniu po czasie zakończenia.

---

## 11. Szybki start dla nowego agenta

```
1. Przeczytaj TEN plik.
2. `git clone https://github.com/dras1911/tibians.git && cd tibians`
3. `pnpm install`
4. `pnpm typecheck && pnpm test` — powinno być 9/9 i 1413 testów.
5. Przeczytaj `DEPLOYMENT.md` (wdrożenie) i `SCRAPER-BOOTSTRAP.md` (scraper).
6. Zapytaj użytkownika, co robimy: B (audyt formuł), C (panel bloga),
   D (wygląd) — albo coś nowego.

ZASADY:
- NIE ufaj `HTTP 200`. Rób zrzut ekranu i PATRZ.
- NIE ufaj testom, jeśli pisał je ten sam agent co kod — porównuj z TibiaWiki.
- Cloudflare blokuje curl na tibia.com i tibia.fandom.com → użyj Playwrighta.
- Przy zmianach: commit → push → `git pull` na serwerze →
  `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build <serwis>`
- Sekrety są TYLKO na serwerze (`/opt/tibians/.env.production`, chmod 600).
```

---

## 12. Czego NIE robić

- ❌ **Nie commituj `.env.production`** — jest w `.gitignore`
- ❌ **Nie wysyłaj klucza prywatnego SSH** — leży u użytkownika (`~/.ssh/id_ed25519`)
- ❌ **Nie zmieniaj interfejsu `SchedulerDb`** (`apps/scraper/src/scheduler.ts`) —
  230 testów scrapera na nim stoi
- ❌ **Nie włączaj gatingu premium** przed podłączeniem płatności — nikt nie może
  zostać premium, więc bramka tylko ukryje treść
- ❌ **Nie usuwaj `rawJson`** przy upsercie aukcji — kolumna NOT NULL
- ❌ **Nie wstawiaj `pricePerLevel`/`searchVector`** — są GENERATED w Postgresie
- ❌ **Nie używaj `Test-Path` bez `-LiteralPath`** na Windows —
  ścieżki z `[locale]` są traktowane jako wildcard

---

## 13. Stan zapisany

```
Commit:     77ad445 (local == remote)
Testy:      scraper 296 · web 147 · shared 106 — zielone
Typecheck:  ruszane pakiety (shared/db/web/scraper) — 0 błędów
Kontenery:  5/5 działają
MCP:        tibians_db podłączony (read-only, tunel 15432) — patrz §14
Strona:     https://tibian.click (200)
Wokacje:    dane naprawiają się po fixie (bazowe formy wracają: Knight/Paladin/…)
Flagi:      regiony jako SVG (public/flags, flag-icons MIT) — emoji flag NIE renderują się na Windows
            ani w headless Chromium (pokazują litery); komponent `RegionFlag` (f17013d)
Home:       hero (mniejszy) + sekcja „kończące się" z 9 aukcjami (grid 3 kol.); usunięte
            „Ostatnio dodane" i kalkulatory; karty: ikony skilli, stonowane tagi atutów
Porównanie: wspólny stan localStorage (`useCompareSelection`) + pasek `CompareBar`
            (fixed bottom) → `/bazaar/compare?a=&b=`; działa na home i bazaarze (3e4b5d8)
Bazar:      filtry DZIAŁAJĄ (bug #13 — `splitBazaarParams`); nowe sekcje: „Store items"
            (7 itemów + przeniesione Charm/Prey/Weekly/WorldTransfer) i „Różne"
            (biddedOnly, charm points i TC invested min/max); bez presetów; BattlEye
            tylko zielone/żółte; „Zawiera" zamiast „Must-have" (77ad445)
```

---

## 14. MCP Postgres (dev tooling — bezpośredni dostęp do bazy prod)

Skonfigurowane 2026-09-17. Pozwala asystentowi (Hermes) czytać bazę produkcyjną
przez MCP — bez ręcznego SSH do VPS przy każdym zapytaniu.

**Architektura (bezpieczeństwo):**

- Baza na VPS wystawiona **tylko na `127.0.0.1:5432`** VPS-a
  (`docker-compose.prod.yml`: `db.ports: "127.0.0.1:5432:5432"`) — nie do świata.
- **Tunel SSH** z lokalnej maszyny: `ssh -N -L 15432:127.0.0.1:5432 ubuntu@51.83.128.47`
  → baza dostępna lokalnie na porcie **15432**.
- Serwer MCP (read-only — jedyne narzędzie to `query`):
  `npx -y @modelcontextprotocol/server-postgres 'postgresql://tibians:${env:TIBIANS_DB_PASSWORD}@127.0.0.1:15432/tibians'`
- Sekret: `TIBIANS_DB_PASSWORD` w `.env` **Hermesa** (`$LOCALAPPDATA/hermes/.env`),
  w `config.yaml` tylko referencja `${env:TIBIANS_DB_PASSWORD}` — hasła NIE ma w repo.
- Rejestracja: `hermes mcp add tibians_db --command npx --args -y @modelcontextprotocol/server-postgres '<conn>'`
  (prompt „Enable all tools?" — odpowiedź `Y`; nieinteraktywnie: `printf 'Y\n' | hermes mcp add ...`).

**Weryfikacja (zrobiona):**

- `hermes mcp test tibians_db` → ✓ Connected, 1 tool (`query`).
- E2E: `query` przez stdio → `SELECT COUNT(*) FROM auctions` → liczba z bazy prod. ✅
- `hermes mcp list` może pokazać warning o nierozwiniętym `${env:...}` (kolejność
  ładowania `.env` w CLI) — kosmetyczny; agent rozwija referencję przy starcie serwera
  (`tools/mcp_tool_config.py:_interpolate_env_vars`).

**Eksploatacja:** tunel musi żyć (proces `ssh -N -L ...`); po restarcie maszyny odtworzyć.
Narzędzia MCP ładują się przy starcie Hermesa — po `hermes mcp add` potrzebna nowa sesja.
