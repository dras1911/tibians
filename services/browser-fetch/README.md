# browser-fetch — mikroserwis renderujący strony przez CloakBrowser

## Po co to jest

`tibia.com` jest chroniony przez **Cloudflare Managed Challenge**. Żądania
z IP VPS (OVH) dostają `403 Attention Required!`; sam challenge przechodzi
dopiero **prawdziwa przeglądarka przez WARP** (Cloudflare WARP proxy na
`127.0.0.1:40000` — patrz `HANDOFF.md` §6.1).

Ten serwis opakowuje **CloakBrowser** (stealth Chromium z patchami
fingerprintów na poziomie C++) w proste HTTP API, dzięki czemu scraper
(Node) pozostaje zwykłym klientem HTTP i nie wozi w sobie Playwrighta.

## API

`POST /v1` — JSON, zgodny z podzbiorem **FlareSolverr**:

```bash
# pobranie strony
curl -s http://127.0.0.1:8192/v1 -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-BF-Token: <token jeśli ustawiony>' \
  -d '{"cmd":"request.get","url":"https://www.tibia.com/charactertrade/","maxTimeout":60000}'
# → {"status":"ok","solution":{"url":...,"status":200,"response":"<html>…","headers":{…}}}
# → {"status":"error","message":"…"} (HTTP 500)

# health
curl -s http://127.0.0.1:8192/v1 -X POST -d '{"cmd":"health"}'
curl -s http://127.0.0.1:8192/health        # dla docker healthcheck
```

Dzięki kompatybilności **ten sam klient w scraperze** (`browser-requester.ts`)
obsługuje i ten serwis (`:8192`), i prawdziwy FlareSolverr (`:8191`) jako
fallback — przełączenie to zmiana URL-a w env.

## Zmienne środowiskowe

| Zmienna               | Default   | Opis                                                  |
| --------------------- | --------- | ----------------------------------------------------- |
| `BF_BIND`             | `0.0.0.0` | adres nasłuchu                                        |
| `BF_PORT`             | `8192`    | port                                                  |
| `BF_TOKEN`            | —         | gdy ustawione: wymagany nagłówek `X-BF-Token`         |
| `CB_PROXY`            | —         | proxy przeglądarki (prod: `socks5://127.0.0.1:40000`) |
| `BF_HEADLESS`         | `1`       | `0` = headed (Xvfb jest w obrazie)                    |
| `BF_HUMANIZE`         | `0`       | `1` = human-like ruchy myszy/klawiatury               |
| `BF_CHALLENGE_WAIT_S` | `15`      | maks. oczekiwanie na przejście challenge              |
| `BF_TIMEOUT_MS`       | `60000`   | domyślny `maxTimeout`                                 |

## Bezpieczeństwo (WAŻNE)

Serwis renderuje dowolne strony przez WARP — **nie może być publiczny**:

1. `ufw`: `allow from 172.16.0.0/12 to any port 8192 proto tcp`, resztę blokuje
   domyślna polityka `deny` (serwis w `network_mode: host` nie omija ufw —
   w odróżnieniu od portów publikowanych przez dockera),
2. opcjonalny token `BF_TOKEN` / `BROWSER_FETCH_TOKEN` (nagłówek `X-BF-Token`).

## Uruchomienie (produkcja)

```bash
# w katalogu repo na VPS
docker compose --env-file .env.production -f docker-compose.prod.yml up -d browser
docker logs -f tibians-browser       # "browser-fetch listening on 0.0.0.0:8192"
```

Fallback FlareSolverr (profil `fallback`):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile fallback up -d flaresolverr
```

## Uwagi eksploatacyjne

- **Jeden page naraz** (globalny lock) — celowo: chroni tibia.com przed
  zbyt agresywnym ruchem; przepustowość ~1 strona/s wystarcza dla cykli
  scrapera (15 min Full / 30 s EndingSoon).
- Chrome jest **singletonem**; po crashu serwis sam robi jeden restart
  (patrz `_reset_browser` w `server.py`).
- Logi: standardowe (json-file driver w compose, `docker logs tibians-browser`).
- Wersja CloakBrowser w obrazie: `cloakhq/cloakbrowser:latest` (free binary;
  log przy starcie pokazuje wersję).
