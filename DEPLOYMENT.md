# DEPLOYMENT.md — Tibians: uruchomienie na nowym serwerze (A→Z)

> **Cel**: od zera do działającego `https://twojadomena.pl` w ~45 minut.
> Stack: Docker Compose (Caddy + Next.js + scraper + PostgreSQL 17 + TibiaData).

---

## 0. Czego potrzebujesz (checklist)

### Obowiązkowe
| Zasób | Wymagania | Koszt |
|---|---|---|
| **VPS** | 4 vCPU / 8 GB RAM / 80 GB SSD, Ubuntu 24.04 LTS | ~7 €/mies. (Hetzner CX32) |
| **Domena** | dowolna (`.pl`, `.com`, `.tools`) z dostępem do DNS | ~10 €/rok |
| **Dostęp SSH** | klucz publiczny wgrany do VPS | — |

> **Minimum absolutne**: 2 vCPU / 4 GB RAM / 40 GB — wystarczy, ale pełny scrape (2500 aukcji) może być wolny. 8 GB daje komfort.

### Opcjonalne (dla pełnych funkcji — patrz §13)
- Konto **Discord** + aplikacja OAuth (login użytkowników, Faza 6)
- Konto **Lemon Squeezy** lub **Paddle** (premium, Faza 7)
- **GitHub** repo z prawem push (albo fork)

### Czego NIE potrzebujesz
- ❌ Osobnego serwera bazy — PostgreSQL siedzi w tym samym compose
- ❌ Cloudflare — Caddy sam wystawia SSL
- ❌ Conta CipSoft — dane są publiczne

---

## 1. VPS: zamówienie i pierwsze wejście

### 1.1 Zamów Hetzner CX32
1. https://console.hetzner.cloud → **New Project** → `tibians`
2. **Add Server**:
   - Location: `Nuremberg` lub `Helsinki` (EU, blisko graczy PL)
   - Image: **Ubuntu 24.04**
   - Type: **CX32** (4 vCPU, 8 GB, 80 GB)
   - SSH key: wgraj swój klucz publiczny (`~/.ssh/id_ed25519.pub`)
   - Name: `tibians-prod`
3. Zapisz **publiczne IP** (np. `203.0.113.42`)

### 1.2 Pierwsze logowanie i hardening
```bash
ssh root@203.0.113.42

# Aktualizacja systemu
apt update && apt upgrade -y

# Podstawowy firewall
apt install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp     # HTTP/3 dla Caddy
ufw --force enable

# Swap 2 GB (ratunek przy pełnym scrape na 4 GB RAM)
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Ustaw strefę czasową (logi czytelne w PL)
timedatectl set-timezone Europe/Warsaw
```

### 1.3 Utwórz użytkownika (nie pracuj jako root)
```bash
adduser --disabled-password --gecos "" tibians
usermod -aG sudo tibians
mkdir -p /home/tibians/.ssh
cp ~/.ssh/authorized_keys /home/tibians/.ssh/
chown -R tibians:tibians /home/tibians/.ssh
chmod 700 /home/tibians/.ssh
chmod 600 /home/tibians/.ssh/authorized_keys

# Od teraz loguj się jako tibians
exit
ssh tibians@203.0.113.42
```

---

## 2. DNS: wskaż domenę na VPS

W panelu swojego rejestratora domeny dodaj rekordy:

| Typ | Nazwa | Wartość | TTL |
|---|---|---|---|
| `A` | `@` (lub `tibians.tools`) | `203.0.113.42` | 300 |
| `A` | `www` | `203.0.113.42` | 300 |

> **Caddy** użyje tego rekordu do wystawienia certyfikatu Let's Encrypt. Sprawdź propagację:
> ```bash
> dig +short tibians.tools
> # powinno zwrócić Twoje IP
> ```
> Jeśli używasz Cloudflare — **wyłącz pomarańczową chmurkę (proxy OFF)** na czas pierwszego startu. Caddy musi widzieć publiczne IP do challenge'u ACME.

---

## 3. Docker + Docker Compose

```bash
# Oficjalny skrypt instalacyjny Dockera
curl -fsSL https://get.docker.com | sudo sh

# Dodaj siebie do grupy docker (bez sudo)
sudo usermod -aG docker $USER
newgrp docker

# Weryfikacja
docker --version           # Docker version 27.x
docker compose version     # Docker Compose version v2.x
```

---

## 4. Kod: sklonuj repozytorium

```bash
sudo mkdir -p /opt/tibians
sudo chown $USER:$USER /opt/tibians

git clone https://github.com/dras1911/tibians.git /opt/tibians
cd /opt/tibians

# Sprawdź że jesteś na właściwym commicie
git log --oneline -1
```

> Repo jest publiczne — `git clone` nie wymaga tokenu.
> Jeśli prywatne: użyj `https://<TOKEN>@github.com/...` lub dodaj deploy key.

---

## 5. Sekrety: `.env.production`

```bash
cp .env.production.example .env.production
nano .env.production
```

### 5.1 Wygeneruj sekrety (skopiuj wyniki do pliku)

```bash
# Silne hasło do Postgresa
openssl rand -base64 32

# Sekrety webhooków
openssl rand -hex 32   # SCRAPER_SECRET
openssl rand -hex 32   # REVALIDATE_SECRET
```

### 5.2 Wypełnij plik

```env
# ─── Domena + SSL ────────────────────────────────────────────
DOMAIN=tibians.tools                # ← TWOJA domena (bez https://)
ACME_EMAIL=twoj@email.pl            # ← Let's Encrypt wysyła tu alerty o wygasaniu

# ─── PostgreSQL ──────────────────────────────────────────────
POSTGRES_USER=tibians
POSTGRES_PASSWORD=<wynik openssl rand -base64 32>   # ← WKLEJ
POSTGRES_DB=tibians

# ─── Aplikacja ───────────────────────────────────────────────
DATABASE_URL=postgresql://tibians:<TO_SAM_HASLO>@db:5432/tibians

# ─── Sekrety webhooków (muszą być identyczne w web i scraper) ─
SCRAPER_SECRET=<wynik openssl rand -hex 32>         # ← WKLEJ
REVALIDATE_SECRET=<wynik openssl rand -hex 32>      # ← WKLEJ

# ─── Scraper: budżet rate-limit (R11) ────────────────────────
SCRAPER_MAX_TIBIA_REQS_PER_MIN=120

# ─── TibiaData (self-host, wewnątrz sieci Docker) ────────────
TIBIADATA_BASE_URL=http://tibiadata:8080

# ─── Publiczny URL ───────────────────────────────────────────
NEXT_PUBLIC_SITE_URL=https://tibians.tools          # ← z https://

# ─── Opcjonalne (Faza 6/7 — zostaw puste jeśli nie używasz) ──
# DISCORD_CLIENT_ID=
# DISCORD_CLIENT_SECRET=
# SESSION_SECRET=
# NEXT_PUBLIC_PREMIUM_CHECKOUT_URL=
```

⚠️ **Uwaga**: `DATABASE_URL` musi mieć **to samo hasło** co `POSTGRES_PASSWORD`. Literówka = `web` nie połączy się z bazą.

```bash
# Zabezpiecz plik
chmod 600 .env.production
```

---

## 6. Start stacku

```bash
cd /opt/tibians

# Build + start (pierwszy build ~5-10 min na CX32)
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# Sprawdź status (wszystkie powinny być "healthy" po ~2-3 min)
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

**Oczekiwany wynik:**
```
NAME                  STATUS
tibians-caddy         Up (healthy)
tibians-web           Up (healthy)
tibians-scraper       Up (running)
tibians-db            Up (healthy)
tibians-tibiadata     Up (healthy)
```

### Jeśli coś nie wstaje
```bash
# Logi konkretnego serwisu
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f web
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f caddy

# Caddy czeka na DNS? Sprawdź:
docker compose --env-file .env.production -f docker-compose.prod.yml logs caddy | grep -i "acme\|certificate"
```

---

## 7. Migracje bazy + seed

```bash
cd /opt/tibians

# 1. Zastosuj schemat (tworzy ~21 tabel + indeksy + materialized view)
docker compose --env-file .env.production -f docker-compose.prod.yml exec web \
  node -e "console.log('migrate via db package')" 2>/dev/null || true

# Właściwa migracja (przez kontener db z tsx):
docker compose --env-file .env.production -f docker-compose.prod.yml exec db \
  psql -U tibians -d tibians -c "\dt"
# → powinno być pusto przed migracją

# Uruchom migrację z hosta (wymaga pnpm):
# ── ALTERNATYWA: użyj kontenera scraper (ma pełne node_modules + tsx)
docker compose --env-file .env.production -f docker-compose.prod.yml exec scraper \
  pnpm --filter @tibians/db db:migrate

# 2. Zaseeduj dane referencyjne (imbuementy, valuation rules, calculator config)
docker compose --env-file .env.production -f docker-compose.prod.yml exec scraper \
  pnpm --filter @tibians/db db:seed

# Weryfikacja
docker compose --env-file .env.production -f docker-compose.prod.yml exec db \
  psql -U tibians -d tibians -c "SELECT COUNT(*) FROM imbuements;"
# → ~23
```

---

## 8. Weryfikacja: czy działa

```bash
# 1. Health endpoint
curl -s https://tibians.tools/api/health | jq
```
**Oczekiwane:**
```json
{ "status": "ok", "db": "ok", "tibiadata": "ok", "scrapeFreshnessMinutes": null, "scrapeStale": false }
```
`scrapeFreshnessMinutes: null` = jeszcze nie było scrape'a (poprawnie przed §9).

```bash
# 2. SSL
curl -I https://tibians.tools
# → HTTP/2 200, "strict-transport-security"

# 3. Strony
curl -s -o /dev/null -w "%{http_code}\n" https://tibians.tools/pl
curl -s -o /dev/null -w "%{http_code}\n" https://tibians.tools/pl/bazaar
curl -s -o /dev/null -w "%{http_code}\n" https://tibians.tools/pl/calculators
curl -s -o /dev/null -w "%{http_code}\n" https://tibians.tools/sitemap.xml
curl -s -o /dev/null -w "%{http_code}\n" https://tibians.tools/robots.txt
# → 200 dla każdego

# 4. SSL Labs (opcjonalnie — oczekiwane A+)
# https://www.ssllabs.com/ssltest/analyze.html?d=tibians.tools
```

---

## 9. Pierwszy scrape (scraper działa automatycznie)

Kontener `scraper` uruchamia 3 pętle schedulera **od razu po starcie**:

| Pętla | Interwał | Co robi |
|---|---|---|
| **Full** | 15 min | lista 101 stron Bazaar → diff → fan-out detali → upsert do DB |
| **EndingSoon** | 30 s | aukcje kończące się <1 h (zasila SSE) |
| **Reference** | 24 h | items / outfits / mounts + kalibracja wyceny |

Pierwsze dane pojawiają się w ciągu kilku minut od `docker compose up`.

### 9.1 Weryfikacja, że scheduler wystartował

```bash
# Logi startowe (powinno być widać banner)
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=20 scraper
# → [start] Tibians scraper — bootstrap produkcyjny
# → [start] scheduler wystartował (Full 15min / EndingSoon 30s / Reference 24h)
```

### 9.2 Weryfikacja, że dane napływają (po ~5-15 min)

```bash
# 1. Ile aukcji w bazie?
docker compose --env-file .env.production -f docker-compose.prod.yml exec db \
  psql -U tibians -d tibians -c "SELECT status, COUNT(*) FROM auctions GROUP BY status;"
# → active | ~2500

# 2. Świeżość scrape'a (z health endpointu)
curl -s https://tibians.tools/api/health | jq '.scrapeFreshnessMinutes'
# → liczba < 30  (i .scrapeStale == false)

# 3. Historia runów (observability)
docker compose --env-file .env.production -f docker-compose.prod.yml exec db \
  psql -U tibians -d tibians -c \
  "SELECT run_type, status, auctions_found, errors_count FROM scrape_runs ORDER BY started_at DESC LIMIT 5;"
```

### 9.3 Tryb ręczny (jednorazowy scrape, bez czekania)

```bash
# tryby: full | endingSoon | reference
docker compose --env-file .env.production -f docker-compose.prod.yml exec scraper \
  pnpm --filter @tibians/scraper scrap:auctions

docker compose --env-file .env.production -f docker-compose.prod.yml exec scraper \
  pnpm --filter @tibians/scraper ref:scrape
```

Advisory lock jest brany identycznie jak w produkcji, więc tryb ręczny
**nie zdubluje** pracy działającego kontenera — druga iteracja zostanie
pominięta jako „lock zajęty".

### 9.4 Jeśli dane się nie pojawiają

```bash
# 1. Błędy w logach
docker compose --env-file .env.production -f docker-compose.prod.yml logs scraper | grep -iE "error|fatal"

# 2. Co mówi ostatni run?
docker compose --env-file .env.production -f docker-compose.prod.yml exec db \
  psql -U tibians -d tibians -c \
  "SELECT run_type, status, errors_count, error_summary FROM scrape_runs ORDER BY started_at DESC LIMIT 3;"

# 3. Czy są zapisane błędy szczegółowe?
docker compose --env-file .env.production -f docker-compose.prod.yml exec db \
  psql -U tibians -d tibians -c \
  "SELECT error_type, message FROM scrape_errors ORDER BY created_at DESC LIMIT 10;"
```

Najczęstsze przyczyny: brak `DATABASE_URL` w kontenerze scrapera, Tibia blokuje
IP (403/429 — patrz §14), albo brak migracji (§7).

---

## 10. Monitoring

### 10.1 Codzienne komendy
```bash
cd /opt/tibians

# Status wszystkich serwisów
docker compose --env-file .env.production -f docker-compose.prod.yml ps

# Zasoby (CPU/RAM/dysk)
docker stats --no-stream
df -h /

# Logi na żywo
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=50
```

### 10.2 Alert na padnięcie (UptimeRobot / BetterStack — darmowe)
1. Załóż konto na https://uptimerobot.com
2. **Add Monitor**:
   - Type: `HTTP(s)`
   - URL: `https://tibians.tools/api/health`
   - Interval: 5 min
   - Alert contact: Twój e-mail / Discord webhook

### 10.3 Cron: sprawdzanie świeżości scrape'a
```bash
crontab -e
```
Dodaj:
```cron
# Co 30 min: ostrzeż jeśli dane starsze niż 45 min
*/30 * * * * curl -s https://tibians.tools/api/health | grep -q '"scrapeStale":false' || echo "STALE SCRAPE $(date)" >> /var/log/tibians-alerts.log
```

---

## 11. Backup (KRYTYCZNE dla R5)

### 11.1 Skrypt backupu
```bash
nano /opt/tibians/backup.sh
```
```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/tibians
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p /opt/tibians/backups
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  pg_dump -U tibians -d tibians | gzip > "/opt/tibians/backups/tibians-${STAMP}.sql.gz"
# Retencja: 14 dni
find /opt/tibians/backups -name "tibians-*.sql.gz" -mtime +14 -delete
echo "[backup] $(date) OK"
```
```bash
chmod +x /opt/tibians/backup.sh
# Cron: codziennie 03:00
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/tibians/backup.sh >> /var/log/tibians-backup.log 2>&1") | crontab -
```

### 11.2 TEST RESTORE (obowiązkowy — backup bez testu nie istnieje)
```bash
# 1. Rozpakuj najnowszy backup do tymczasowej bazy
LATEST=$(ls -t /opt/tibians/backups/tibians-*.sql.gz | head -1)
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  psql -U tibians -d postgres -c "DROP DATABASE IF EXISTS tibians_restore_test; CREATE DATABASE tibians_restore_test;"
gunzip -c "$LATEST" | docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  psql -U tibians -d tibians_restore_test

# 2. Sprawdź czy dane są
docker compose --env-file .env.production -f docker-compose.prod.yml exec db \
  psql -U tibians -d tibians_restore_test -c "SELECT COUNT(*) FROM auctions;"

# 3. Sprzątanie
docker compose --env-file .env.production -f docker-compose.prod.yml exec db \
  psql -U tibians -d postgres -c "DROP DATABASE tibians_restore_test;"
```
> Wykonuj ten test **raz w miesiącu**. Backup, którego nie odtworzyłeś, nie jest backupem.

---

## 12. Aktualizacje

```bash
cd /opt/tibians

# 1. Nowy kod
git pull

# 2. Rebuild + restart (bez przestoju dla DB)
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# 3. Migracje (jeśli zmienił się schemat)
docker compose --env-file .env.production -f docker-compose.prod.yml exec scraper pnpm --filter @tibians/db db:migrate

# 4. Weryfikacja
sleep 30
curl -s https://tibians.tools/api/health | jq
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

**Rollback awaryjny:**
```bash
git log --oneline -5              # znajdź dobry commit
git checkout <SHA>                 # przełącz
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

---

## 13. Po starcie (kolejne kroki)

### 13.1 Aplikacja do CipSoft Fansite Programme (§18.2) — **priorytet**
1. Przeczytaj: https://www.tibia.com/community/?subtopic=fansites&page=programme
2. Przeczytaj: https://www.tibia.com/community/?subtopic=fansites&page=agreement
3. Upewnij się że spełniasz:
   - ✅ Stopka z disclaimerem CipSoft na każdej stronie (już jest — T5)
   - ✅ Regularne własne treści (blog MDX — T62)
   - ✅ Brak płatności za przedmioty/postacie z gry (nie obsługujemy płatności — linkujemy do Tibii)
   - ✅ Read-only wobec danych gry
4. Złóż aplikację (formularz na stronie Fansite Programme)

**Zysk**: link z `tibia.com` = darmowy, wysokointentowy ruch.

### 13.2 Discord OAuth — logowanie (aplikacja Discord, NIE bot)

> **Bot NIE jest potrzebny. Serwer Discord NIE jest potrzebny.**
> „Sign in with Discord" używa **Aplikacji Discord** (OAuth2), nie bota.
> Bot przydałby się wyłącznie, gdyby portal miał *działać wewnątrz* serwera
> Discord (nadawać role, pisać wiadomości) — czego nie robimy.

**Nazwa „Tibians Tools" a Twój prywatny nick**

OAuth pokazuje **nazwę aplikacji**, a nie nazwę konta właściciela. Twój osobisty
nick nie pojawi się nigdzie — jesteś właścicielem aplikacji wyłącznie technicznie.
Ekran zgody powie: *„Tibians Tools chce uzyskać dostęp do Twojego konta"*.

**Krok po kroku:**

1. https://discord.com/developers/applications → **New Application**
2. Nazwa: **`Tibians Tools`** — dokładnie to zobaczą użytkownicy
3. **General Information** → wgraj ikonę (512×512), opis i link do strony.
   Im pełniejszy profil, tym poważniej wygląda ekran zgody.
4. **OAuth2 → Redirects** → dodaj dokładnie:
   `https://tibians.tools/api/auth/callback/discord`
   (Discord wymaga HTTPS; `http://localhost:3000/api/auth/callback/discord`
   możesz dodać jako osobny wpis do developmentu)
5. Skopiuj **Client ID** + **Client Secret** → do `.env.production`
   (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`)
6. `SESSION_SECRET` → `openssl rand -hex 32` (do tego samego pliku)
7. **Uwaga na Secret**: pokazywany jest jednorazowo. Jeśli go zgubisz →
   „Reset Secret" (stary natychmiast przestaje działać).
8. `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build web`

**Zakresy (scopes)**: `identify` (id, nazwa, avatar). Dodawaj `email` tylko jeśli
faktycznie będziesz jej używać — mniej danych = lepiej dla prywatności.

> **✅ Kod logowania JEST zaimplementowany** (commit `9409c49`, T78).
> Zero nowych zależności — cały przepływ to dwa `fetch`e do Discorda.
>
> Co powstało:
> - `apps/web/src/lib/auth/session.ts` — sesja w podpisanym HMAC cookie
>   (bez tabeli sesji; TTL wymuszany serwerowo przez `<iat>`)
> - `apps/web/src/lib/auth/discord.ts` — klient OAuth2 (scope `identify`)
> - trasy: `/api/auth/login/discord`, `/api/auth/callback/discord`,
>   `/api/auth/logout`, `/api/auth/me`
> - tabela `users` (migracja `0001_needy_dreaming_celestial.sql`)
> - `UserMenu` w nagłówku (awatar + wylogowanie, albo „Zaloguj")
> - i18n: przestrzeń `Auth` w PL i EN
>
> Po ustawieniu sekretów (kroki 1-8 powyżej) logowanie działa od razu.
> **Nie trzeba dopisywać żadnego kodu.**
>
> Weryfikacja po wdrożeniu:
> ```bash
> # 1. Czy konfiguracja jest widoczna (powinno przekierować na discord.com)
> curl -sI https://tibians.tools/api/auth/login/discord | head -1
> # → HTTP/2 307  (Location: https://discord.com/oauth2/authorize?...)
>
> # 2. Stan sesji bez zalogowania
> curl -s https://tibians.tools/api/auth/me | jq
> # → { "authenticated": false, "user": null, "entitlements": { ... } }
> ```
>
> Gdy `CLIENT_ID` nie jest ustawione, `/api/auth/login/discord` zwraca
> czytelne **503 `DiscordNotConfigured`** (a nie mylący błąd po stronie Discorda).
>
> Uwaga: migracja `0001` zawiera **także** tabelę `subscriptions`, która dotąd
> nie miała własnej migracji (powstała w T83 bez regeneracji). Jest bezpieczna —
> `CREATE TABLE IF NOT EXISTS` — i przy pierwszym wdrożeniu po prostu ją utworzy.

### 13.3 Premium — Lemon Squeezy / Paddle (Faza 7, T82)
1. Załóż konto (MoR — oni obsługują VAT i faktury)
2. Utwórz produkt (subskrypcję miesięczną/roczną)
3. Ustaw webhook na `https://tibians.tools/api/billing/webhook`
4. Skopiuj checkout URL do `NEXT_PUBLIC_PREMIUM_CHECKOUT_URL`
5. Uzupełnij `LEMON_SQUEEZY_*` w env

### 13.4 Analytics — Plausible (T88, opcjonalnie)
Self-hosted kontener lub https://plausible.io (płatne).

---

## 14. Troubleshooting

| Objaw | Przyczyna | Rozwiązanie |
|---|---|---|
| `web` nie startuje (unhealthy) | DB niedostępna / złe `DATABASE_URL` | `docker compose logs db web`; sprawdź hasło w `DATABASE_URL` vs `POSTGRES_PASSWORD` |
| Caddy nie wystawia SSL | DNS nie propagował się / Cloudflare proxy ON | `dig +short twojadomena.pl` musi zwrócić IP VPS; wyłącz proxy w CF |
| `curl /api/health` → 503 | DB down lub brak tabel | Sprawdź `db: ok` w odpowiedzi; uruchom §7 (migracje) |
| Portal pokazuje 0 aukcji | Scraper nie zdążył / pada (patrz §9) | Sprawdź `logs scraper` + `scrape_runs` (§9.4) |
| `scrapeFreshnessMinutes` > 30 | Scraper padł / rate-limit | `docker compose logs scraper`; sprawdź czy Tibia nie blokuje IP |
| Brakuje miejsca na dysku | Historia aukcji rośnie | `docker system prune -a`; rozważ większy wolumen |
| Wolne odpowiedzi | Brak cache / za mały VPS | Sprawdź `docker stats`; rozważ CX42 |
| Tibia blokuje IP (403/429) | Zbyt agresywny scraping | Zwiększ `DELAY_MS` w `apps/scraper/src/config.ts`, zmniejsz `MAX_CONCURRENT` |

### Diagnostyka krok po kroku
```bash
# 1. Czy kontenery żyją?
docker compose --env-file .env.production -f docker-compose.prod.yml ps

# 2. Czy sieć wewnętrzna działa?
docker compose --env-file .env.production -f docker-compose.prod.yml exec web wget -qO- http://db:5432 2>&1 | head -1
docker compose --env-file .env.production -f docker-compose.prod.yml exec web wget -qO- http://tibiadata:8080/readyz

# 3. Czy web widzi bazę?
docker compose --env-file .env.production -f docker-compose.prod.yml exec web node -e "console.log(process.env.DATABASE_URL ? 'env OK' : 'env MISSING')"

# 4. Pełny restart (zachowuje dane)
docker compose --env-file .env.production -f docker-compose.prod.yml down
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

---

## 15. ✅ Znane luki (stan: 2026-09-15 — po naprawie scrapingu i logowania)

### Zamknięte

**Scraper (commit `ca7441e`)** — kontener realnie zapełnia bazę:

- ✅ **`packages/db/src/queries/`** — warstwa zapytań + mappery (to było „T34")
- ✅ **`apps/scraper/src/wiring.ts`** — adapter Drizzle → `SchedulerDb` (13 metod)
- ✅ **`createPgAdvisoryLockClient`** — wcześniej **nie istniał nigdzie** w repo,
  mimo że `index.ts:28` go wywoływał; używa dedykowanego połączenia, bo advisory
  locki są session-scoped (przez `pool.query()` lock znikałby natychmiast)
- ✅ **`apps/scraper/src/start.ts`** — bootstrap produkcyjny (entrypoint kontenera)
- ✅ **`apps/scraper/src/cli/scrape.ts`** — realne `scrap:*` / `ref:scrape`
  (wcześniej `package.json` wskazywał na 4 nieistniejące pliki)
- ✅ **`Dockerfile.scraper` CMD** — kontener startuje scheduler
  (wcześniej `dist/index.js` tylko eksportował funkcję → baza pusta)
- ✅ **`apps/scraper/src/index.ts`** — usunięte handlery SIGTERM/SIGINT wołające
  `process.exit(0)` natychmiast; uniemożliwiały graceful shutdown
  (drain in-flight + zwolnienie advisory locka)

**Logowanie Discord (commit `9409c49`)** — pełny przepływ OAuth2:

- ✅ **`apps/web/src/lib/auth/session.ts`** — sesja w podpisanym HMAC cookie
- ✅ **`apps/web/src/lib/auth/discord.ts`** — klient OAuth2 (scope `identify`)
- ✅ **trasy** `/api/auth/{login,callback,logout,me}`
- ✅ **tabela `users`** + migracja `0001_needy_dreaming_celestial.sql`
  (dodaje też `subscriptions`, które nie miało własnej migracji)
- ✅ **`UserMenu`** w nagłówku + przestrzeń i18n `Auth` (PL/EN)
- ✅ **12 testów** kryptografii sesji (podpis, tampering, TTL, brak sekretu)

**Higiena / bugfixy:**

- ✅ **`vitest.config.ts`** — alias `@tibians/db/seed`. Vite traktuje string `find`
  jako **prefix**, więc `@tibians/db` przesłaniał subpath i przepisywał go na
  `db/src/index.ts/seed` → `valuation.test.ts` padał na czystym HEAD
- ✅ **108 śmieci builda** (`.js`/`.js.map`/`.d.ts`/`.d.ts.map`) zacommitowanych
  wewnątrz `src/` pakietów `db` i `shared` — Vite preferował nieaktualny `.js`
- ✅ **OG images braku 404** — metadata stron referencjonowało `/og/*.png`
  (bazaar, bazaar-history, bazaar-statistics, calculators-\<slug\>, planners-\<slug\>,
  workspace), ale `public/og/` nigdy nie powstało → każdy podgląd w social media
  zwracał 404. Zamiast commitować kilkadziesiąt binariów, jeden route handler
  (`app/og/[file]/route.tsx`, `next/og`) generuje je na żądanie, a tytuł wynika
  ze sluga. **Zweryfikowane ręcznie:** `HTTP 200`, `image/png`, ~100-111 KB
- ✅ **20 zepsutych etykiet nawigacji** — `Bazaar.endingSoon`, `Bazaar.compare`,
  `Reference.items/worlds/outfits/mounts` były **obiektami** (nie stringami),
  a `Calculators.experience.{label,xp,leech,expShare}` **nie istniały**.
  Mega-menu renderował pozycje **bez tekstu** na każdej stronie, w PL i EN.
  Wykryte dopiero przez **uruchomienie aplikacji** — `tsc` tego nie widzi.
  **Zweryfikowane:** 15/15 etykiet obecnych w HTML w obu językach
- ✅ **`/bazaar` zwracał 500 przy niedostępnej bazie** — `page.tsx:167` wołał
  `listAuctions` + `getFacetCounts` + `getWorldsByRegion` w `Promise.all`
  **bez `try/catch`** (sąsiedni `getSuggestionCounts` miał `.catch()`).
  Teraz degraduje do stanu pustego. **Zweryfikowane:** `500 → 200`, nawigacja
  renderuje, komunikat stanu pustego obecny, zero `undefined` w DOM
- ✅ **Brak error boundary** — nie było `error.tsx`, `global-error.tsx` ani
  `not-found.tsx`, więc każdy nieobsłużony wyjątek dawał surowy 500.
  Dodane `app/[locale]/error.tsx` z istniejącym `ErrorState` (T66).
  ⚠️ **Status uczciwy:** kod zgodny z konwencją Next, ale renderowania
  **nie potwierdziłem** — w trybie dev overlay Next zasłania boundary,
  a `next build` nie przejdzie na tym Windowsie (`EPERM`). Do sprawdzenia
  na serwerze.

### Otwarte

| # | Luka | Wpływ | Gdzie |
|---|---|---|---|
| 1 | Gating premium nie jest wpięty w strony (mechanizm gotowy: T83/T85/T86) | Wszyscy widzą free tier, nawet po zapłacie | Faza 7 |
| 2 | Płatności (Lemon Squeezy / Paddle) — brak konta i webhooka | Nie da się kupić premium | §13.3 |
| 3 | `pnpm build` na Windows pada na `EPERM` przy `output: "standalone"` | **Tylko lokalny Windows** — symlinki wymagają trybu deweloperskiego. Kompilacja się udaje (`BUILD_ID` powstaje). W Dockerze/Linuxie działa | — |

> **Uwaga o premium**: logowanie i tabela `subscriptions` są gotowe, więc po
> podłączeniu dostawcy płatności wystarczy wpiąć `hasFeature()` w komponenty
> (mechanizm `PremiumGate` z T85 już istnieje) — to praca na godziny, nie dni.

---

## 16. Ściągawka komend

```bash
# ─── Podstawy ────────────────────────────────────────────────
cd /opt/tibians
alias dc="docker compose --env-file .env.production -f docker-compose.prod.yml"

dc ps                    # status
dc logs -f web           # logi web
dc logs -f scraper       # logi scraper
dc restart web           # restart serwisu
dc up -d --build         # przebuduj + zrestartuj wszystko
dc down                  # zatrzymaj (dane zachowane)

# ─── Baza ────────────────────────────────────────────────────
dc exec db psql -U tibians -d tibians
# → \dt (tabele), \d auctions (schemat), \q (wyjście)

# ─── Backup / restore ────────────────────────────────────────
./backup.sh
ls -lh backups/

# ─── Diagnostyka ─────────────────────────────────────────────
curl -s https://twojadomena.pl/api/health | jq
df -h / && free -h
docker stats --no-stream
```

---

## 17. Checklist startowy (wydrukuj i odhaczaj)

```
PRZYGOTOWANIE
[ ] VPS zamówiony (CX32, Ubuntu 24.04, SSH key)
[ ] Firewall (ufw: 22, 80, 443, 443/udp) + swap 2 GB
[ ] Użytkownik `tibians` utworzony
[ ] DNS: A record → IP VPS (propagacja sprawdzona)
[ ] Docker + Compose zainstalowane

KONFIGURACJA
[ ] Repo sklonowane do /opt/tibians
[ ] .env.production wypełnione (wszystkie sekrety wygenerowane)
[ ] chmod 600 .env.production

START
[ ] dc up -d --build → 5/5 serwisów healthy
[ ] Migracje wykonane (§7)
[ ] Seed wykonany (§7)
[ ] /api/health → 200 {db: ok}
[ ] SSL działa (HTTPS, HSTS)
[ ] Strony 200 (home, bazaar, calculators, sitemap, robots)

DANE
[ ] Scraper wiring + start.ts dokończone (§9.2)
[ ] Rebuild scrapera + logi pokazują "scheduler started"
[ ] Po 15 min: auctions w bazie (~2500)
[ ] /api/health → scrapeFreshnessMinutes < 30

OPERACJE
[ ] Backup cron (03:00) + TEST RESTORE wykonany
[ ] Monitoring (UptimeRobot) na /api/health
[ ] Alert na stale scrape (cron 30 min)

PO STARCIE
[ ] Aplikacja do CipSoft Fansite Programme złożona
[ ] Discord OAuth (opcjonalnie, §13.2)
[ ] Lemon Squeezy/Paddle (opcjonalnie, §13.3)
```

---

**Ostatnia aktualizacja**: 2026-09-15 · **Wersja stacku**: commit `2831571`
**Wsparcie**: `.omo/notepads/tibians/learnings.md` (pełna historia decyzji technicznych)
