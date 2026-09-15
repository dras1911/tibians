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
docker compose -f docker-compose.prod.yml up -d --build

# Sprawdź status (wszystkie powinny być "healthy" po ~2-3 min)
docker compose -f docker-compose.prod.yml ps
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
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f caddy

# Caddy czeka na DNS? Sprawdź:
docker compose -f docker-compose.prod.yml logs caddy | grep -i "acme\|certificate"
```

---

## 7. Migracje bazy + seed

```bash
cd /opt/tibians

# 1. Zastosuj schemat (tworzy ~21 tabel + indeksy + materialized view)
docker compose -f docker-compose.prod.yml exec web \
  node -e "console.log('migrate via db package')" 2>/dev/null || true

# Właściwa migracja (przez kontener db z tsx):
docker compose -f docker-compose.prod.yml exec db \
  psql -U tibians -d tibians -c "\dt"
# → powinno być pusto przed migracją

# Uruchom migrację z hosta (wymaga pnpm):
# ── ALTERNATYWA: użyj kontenera scraper (ma pełne node_modules + tsx)
docker compose -f docker-compose.prod.yml exec scraper \
  pnpm --filter @tibians/db db:migrate

# 2. Zaseeduj dane referencyjne (imbuementy, valuation rules, calculator config)
docker compose -f docker-compose.prod.yml exec scraper \
  pnpm --filter @tibians/db db:seed

# Weryfikacja
docker compose -f docker-compose.prod.yml exec db \
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

## 9. ⚠️ Pierwszy scrape (WAŻNE — przeczytaj przed uruchomieniem)

> **ZNANA LUKA**: kontener `scraper` w obecnej wersji **nie uruchamia automatycznie schedulera**.
> `apps/scraper/src/index.ts` eksportuje funkcję `startScheduler()`, ale nie ma jeszcze
> produkcyjnego bootstrapu (`apps/scraper/scripts/start.ts`) ani adaptera `wiring.ts`
> (Drizzle → interfejs `SchedulerDb`). Bez tego baza pozostanie **pusta** i portal
> pokaże „0 aukcji".
>
> **Aby dokończyć** — patrz §9.2 poniżej.

### 9.1 Co działa już teraz
- ✅ Strony renderują się (puste listy — brak danych)
- ✅ Kalkulatory działają (czysto klientowe, nie potrzebują bazy)
- ✅ Blog, premium, reference (część z TibiaData) działają
- ❌ Bazaar pokazuje 0 aukcji (brak danych)

### 9.2 Dokończenie scrapingu (2 pliki)

**Plik 1**: `apps/scraper/src/wiring.ts` — adapter Drizzle → `SchedulerDb`:
```typescript
import type { Pool } from "pg";
import type { SchedulerDb } from "./scheduler.js";
// Implementuje wszystkie metody interfejsu SchedulerDb (patrz src/scheduler.ts):
//   fetchAllAuctionSummaries, upsertAuction, archiveFinishedAuctions,
//   getEndingSoonIds, upsertItems, upsertOutfits, upsertMounts, …scrape_runs
// Deleguje do zapytań z packages/db/src/queries (T34).
export function createPgSchedulerDb(pool: Pool): SchedulerDb { /* … */ }
export function createPgAdvisoryLockClient(pool: Pool): AdvisoryLockClient { /* … */ }
```

**Plik 2**: `apps/scraper/scripts/start.ts` — bootstrap:
```typescript
import { pool, closeDb } from "@tibians/db";
import { startScheduler } from "../src/index.js";
import { createPgSchedulerDb, createPgAdvisoryLockClient } from "../src/wiring.js";

const db = createPgSchedulerDb(pool);
const lock = createPgAdvisoryLockClient(pool);
const handle = startScheduler(db, { lockClient: lock });

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, async () => {
    await handle.stop();
    await closeDb();
    process.exit(0);
  });
}
console.log("[scraper] scheduler started");
```

**Następnie**:
```bash
# 1. Zmień CMD w Dockerfile.scraper z:
#      CMD ["node", "apps/scraper/dist/index.js"]
#    na:
#      CMD ["node", "--import", "tsx/esm", "apps/scraper/scripts/start.ts"]
# 2. Rebuild + restart
cd /opt/tibians
docker compose -f docker-compose.prod.yml up -d --build scraper
docker compose -f docker-compose.prod.yml logs -f scraper
```

**Weryfikacja działania:**
```bash
# Po ~15 min sprawdź czy dane się pojawiły
docker compose -f docker-compose.prod.yml exec db \
  psql -U tibians -d tibians -c "SELECT COUNT(*), status FROM auctions GROUP BY status;"
# → active | ~2500

curl -s https://tibians.tools/api/health | jq '.scrapeFreshnessMinutes'
# → liczba < 30
```

### 9.3 Tryb ręczny (obejście na już)
Jeśli chcesz zobaczyć dane bez czekania na dokończenie §9.2, uruchom scrape ręcznie:
```bash
docker compose -f docker-compose.prod.yml exec scraper pnpm --filter @tibians/scraper scrap:auctions
```
> ⚠️ Wymaga również uzupełnienia `src/cli/scrap-auctions.ts` (obecnie nie istnieje — `package.json` wskazuje na brakujący plik).

---

## 10. Monitoring

### 10.1 Codzienne komendy
```bash
cd /opt/tibians

# Status wszystkich serwisów
docker compose -f docker-compose.prod.yml ps

# Zasoby (CPU/RAM/dysk)
docker stats --no-stream
df -h /

# Logi na żywo
docker compose -f docker-compose.prod.yml logs -f --tail=50
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
docker compose -f docker-compose.prod.yml exec -T db \
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
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U tibians -d postgres -c "DROP DATABASE IF EXISTS tibians_restore_test; CREATE DATABASE tibians_restore_test;"
gunzip -c "$LATEST" | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U tibians -d tibians_restore_test

# 2. Sprawdź czy dane są
docker compose -f docker-compose.prod.yml exec db \
  psql -U tibians -d tibians_restore_test -c "SELECT COUNT(*) FROM auctions;"

# 3. Sprzątanie
docker compose -f docker-compose.prod.yml exec db \
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
docker compose -f docker-compose.prod.yml up -d --build

# 3. Migracje (jeśli zmienił się schemat)
docker compose -f docker-compose.prod.yml exec scraper pnpm --filter @tibians/db db:migrate

# 4. Weryfikacja
sleep 30
curl -s https://tibians.tools/api/health | jq
docker compose -f docker-compose.prod.yml ps
```

**Rollback awaryjny:**
```bash
git log --oneline -5              # znajdź dobry commit
git checkout <SHA>                 # przełącz
docker compose -f docker-compose.prod.yml up -d --build
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

### 13.2 Discord OAuth (Faza 6, T78-T80)
1. https://discord.com/developers/applications → **New Application** → `Tibians`
2. **OAuth2** → Redirect URL: `https://tibians.tools/api/auth/discord/callback`
3. Skopiuj `CLIENT_ID` + `CLIENT_SECRET` do `.env.production`
4. Wygeneruj `SESSION_SECRET` (`openssl rand -hex 32`)
5. `docker compose up -d --build web`

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
| Portal pokazuje 0 aukcji | Scraper nie działa (patrz §9) | Dokończ §9.2 |
| `scrapeFreshnessMinutes` > 30 | Scraper padł / rate-limit | `docker compose logs scraper`; sprawdź czy Tibia nie blokuje IP |
| Brakuje miejsca na dysku | Historia aukcji rośnie | `docker system prune -a`; rozważ większy wolumen |
| Wolne odpowiedzi | Brak cache / za mały VPS | Sprawdź `docker stats`; rozważ CX42 |
| Tibia blokuje IP (403/429) | Zbyt agresywny scraping | Zwiększ `DELAY_MS` w `apps/scraper/src/config.ts`, zmniejsz `MAX_CONCURRENT` |

### Diagnostyka krok po kroku
```bash
# 1. Czy kontenery żyją?
docker compose -f docker-compose.prod.yml ps

# 2. Czy sieć wewnętrzna działa?
docker compose -f docker-compose.prod.yml exec web wget -qO- http://db:5432 2>&1 | head -1
docker compose -f docker-compose.prod.yml exec web wget -qO- http://tibiadata:8080/readyz

# 3. Czy web widzi bazę?
docker compose -f docker-compose.prod.yml exec web node -e "console.log(process.env.DATABASE_URL ? 'env OK' : 'env MISSING')"

# 4. Pełny restart (zachowuje dane)
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

## 15. ⚠️ Znane luki w obecnej wersji (stan: 2026-09-15)

Te elementy **wymagają dokończenia** zanim portal będzie w pełni funkcjonalny:

| # | Luka | Wpływ | Gdzie naprawić |
|---|---|---|---|
| 1 | **Brak `apps/scraper/src/wiring.ts`** — adapter Drizzle → `SchedulerDb` | Scraper nie może zapisywać do bazy | §9.2 |
| 2 | **Brak `apps/scraper/scripts/start.ts`** — bootstrap schedulera | Kontener scrapera nic nie robi | §9.2 |
| 3 | **Brak `apps/scraper/src/cli/*.ts`** — `package.json` wskazuje na 4 nieistniejące pliki | `pnpm scrap:*` nie działa | §9.3 |
| 4 | **`Dockerfile.scraper` CMD** wskazuje `dist/index.js`, który tylko eksportuje | Kontener "działa" ale nie scrapuje | §9.2 (zmiana CMD) |
| 5 | Brak integracji Discord OAuth w UI (`components/auth/`) | Login niedostępny | §13.2 |
| 6 | Gating premium nie jest wpięty w strony (mechanizm gotowy: T83/T85/T86) | Wszyscy widzą free tier | Faza 7 |
| 7 | Brak `og-default.png` (manifest/OG) | Podgląd w social media bez obrazka | dodać do `public/` |

**Szacowany czas na dokończenie luk 1-4 (krytyczne dla Bazaar)**: ~2-3 h pracy agenta.

---

## 16. Ściągawka komend

```bash
# ─── Podstawy ────────────────────────────────────────────────
cd /opt/tibians
alias dc="docker compose -f docker-compose.prod.yml"

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
