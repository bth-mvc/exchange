# Driftsättning

Exchange-servern körs som en Docker-container bakom Caddy (auto-TLS via Let's Encrypt) på **samma DigitalOcean-droplet som api-servern** (`apikeys.dbwebb.se`) — en host-installerad Caddy hanterar TLS och routing för alla tjänster på dropleten. Ny kod deployas automatiskt när du pushar en `v*`-tagg till GitHub: GitHub Actions bygger imagen och pushar den till GitHub Container Registry (GHCR), sedan SSH:ar samma workflow in på droppleten och drar hem den färdigbyggda imagen. Droppleten bygger alltså aldrig imagen själv (sparar RAM/CPU på den delade instansen).

Produktionsdomän: `https://exchange.dbwebb.se`

Exchange är beroende av api-servern för nyckelverifiering — se till att api-servern är uppe och åtkomlig innan du startar exchange.

## Förutsättningar

- Samma DigitalOcean-droplet som api-servern (ingen ny droplet behövs — se `bth-mvc/api-server`s DEPLOY.md för hur den sattes upp)
- Domännamn `exchange.dbwebb.se` med en A-record som pekar på samma IP som `apikeys.dbwebb.se`
- Docker och Caddy redan installerade på dropleten (gjordes vid api-server-driftsättningen)
- api-servern körs och är åtkomlig
- GitHub-repo med Actions aktiverat

---

## 1. Droplet

Ingen ny droplet behövs — exchange driftsätts på samma droplet som api-servern. Om det här är en helt ny droplet (inget annat kör på den än), se api-serverns DEPLOY.md avsnitt 1–2 för att skapa den, köra `scripts/droplet-setup.sh` (installerar Docker, Caddy, brandvägg) och sätta A-record.

Lägg till en andra A-record som pekar på samma IP: `exchange.dbwebb.se → <samma IP som apikeys.dbwebb.se>`.

---

## 2. Serversetup (kör en gång via SSH)

```bash
ssh root@<IP>
```

### Klona repot

```bash
mkdir -p /opt/exchange
cd /opt/exchange
git clone https://github.com/bth-mvc/exchange.git .
```

> Om repot är privat: skapa ett [GitHub deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) och klona med SSH: `git clone git@github.com:bth-mvc/exchange.git .`

### Miljövariabler

```bash
cp .env.docker.example .env.docker
nano .env.docker
```

Fyll i:

```
PORT=4000
API_KEY_SERVER_URL=https://apikeys.dbwebb.se
SERVICE_TOKEN=<samma värde som SERVICE_TOKEN i api-serverns .env.docker>
NODE_ENV=production
DOMAIN=exchange.dbwebb.se
```

Generera SERVICE_TOKEN med: `openssl rand -hex 32`

> `HTTP_PORT`, `HTTPS_PORT` och TUI-variablerna behövs inte i prod — Caddy körs på host.

### Skapa datakatalogen

```bash
mkdir -p /opt/exchange/data
```

### Starta exchange

Imagen dras från GHCR (bygg och pusha en gång via `.github/workflows/deploy.yml` innan detta steg, se avsnitt 3–4, eller bygg och pusha manuellt en gång för hand):

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Exchange lyssnar nu på `127.0.0.1:4000` — inte åtkomlig utifrån utan Caddy.

---

## 3. Konfigurera host-Caddy

Lägg till ett block för exchange i `/etc/caddy/Caddyfile` — **samma fil som api-servern redan har ett block i**, lägg bara till ytterligare ett:

```
exchange.dbwebb.se {
    reverse_proxy localhost:4000
}
```

> Porten måste matcha `PORT` i `.env.docker`.

Ladda om Caddy:

```bash
systemctl reload caddy
```

Caddy hämtar automatiskt TLS-certifikat från Let's Encrypt. Verifiera:

```bash
curl https://exchange.dbwebb.se/health
# {"status":"ok","uptime":...}
```

> **SSE:** `/market/feed` är en SSE-endpoint. Caddy buffrar inte SSE-svar som standard — ingen extra konfiguration behövs.

---

## 4. Konfigurera CD (GitHub Actions)

CD-pipelinen har två jobb: `build-and-push` bygger imagen och pushar den till `ghcr.io/bth-mvc/exchange` (autentiserat med det inbyggda `GITHUB_TOKEN`, ingen extra secret behövs), sedan SSH:ar `deploy` in på servern och kör `git pull && docker compose -f docker-compose.prod.yml pull && ... up -d` vid ny tagg.

### Gör GHCR-paketet publikt (engångssteg, efter första pushen)

Repot är publikt och imagen innehåller inget känsligt (inga tokens eller nyckeldata bakas in i den) — håll paketet publikt så slipper droppleten autentisera sig mot GHCR för att dra imagen, samma upplägg som `api-server`.

> **Förutsättning:** organisationen måste tillåta publika paket — samma engångsinställning som redan gjordes för api-server: **`https://github.com/organizations/bth-mvc/settings/packages`** → kryssa i **"Public packages"**.

Efter att `deploy.yml` kört en gång (så paketet finns): **GitHub → bth-mvc → Packages → `exchange` → Package settings → Change visibility → Public.**

Om deploy-jobbet misslyckas med `error from registry: unauthorized` vid `docker compose pull`: paketet är fortfarande privat.

### Skapa SSH-nyckelpar för deploy

GitHub Actions behöver kunna SSH:a in på servern. Eftersom exchange delar droplet med api-server kan du antingen återanvända samma privata nyckel som secret här också (samma `SSH_USER`/`SSH_HOST` som api-server-repot redan har), eller generera en egen:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy-exchange" -f ~/.ssh/deploy_key_exchange -N ""
```

Lägg till **publika** nyckeln på servern:

```bash
cat ~/.ssh/deploy_key_exchange.pub >> /root/.ssh/authorized_keys
```

### Lägg till GitHub Secrets

I repot: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Värde |
|---|---|
| `SSH_HOST` | Dropletens IP-adress |
| `SSH_USER` | `root` (eller din deploy-användare) |
| `SSH_PRIVATE_KEY` | Innehållet i `~/.ssh/deploy_key` (privata nyckeln) |

---

## 5. Deploya en ny version

```bash
npm run release:patch   # eller release:minor / release:major
```

Kör check, bumpar versionen och pushar en tagg — GitHub Actions deployas automatiskt.

---

## Nyttiga kommandon på servern

```bash
# Visa körande containrar
docker compose -f docker-compose.prod.yml ps

# Visa loggar (följ)
docker compose -f docker-compose.prod.yml logs -f

# Starta om
docker compose -f docker-compose.prod.yml restart

# Uppdatera manuellt (utan CD) — kräver att en image redan är pushad till GHCR
git pull && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d

# Stoppa allt
docker compose -f docker-compose.prod.yml down
```

## Säkerhetskopia av databasen

SQLite-filen ligger i `./data/exchange.db`:

```bash
cp /opt/exchange/data/exchange.db /opt/exchange/data/exchange.$(date +%Y%m%d).db
```

Schemalägg med cron:

```bash
0 3 * * * cp /opt/exchange/data/exchange.db /opt/exchange/data/exchange.$(date +\%Y\%m\%d).db
```

## Nollställ databasen (ny kursomgång)

```bash
docker compose -f docker-compose.prod.yml down
rm /opt/exchange/data/exchange.db
docker compose -f docker-compose.prod.yml up -d
```

Alla studenters portföljer och handelshistorik raderas. Studenternas API-nycklar berörs inte (de lever i api-servern).
