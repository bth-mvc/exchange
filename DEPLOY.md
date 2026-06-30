# Driftsättning

Exchange-servern körs som en Docker-container på en DigitalOcean-droplet. En host-installerad Caddy hanterar TLS och reverse proxy för alla tjänster på dropleten. Ny kod deployas automatiskt när du pushar en `v*`-tagg till GitHub.

Exchange är beroende av api-servern för nyckelverifiering — se till att api-servern är uppe och åtkomlig innan du startar exchange.

## Förutsättningar

- DigitalOcean-droplet (delas med api-server och övriga tjänster)
- Domännamn med en A-record som pekar på dropletens IP (`exchange.example.com → <IP>`)
- Docker och Caddy installerade på dropleten
- api-servern körs och är åtkomlig
- GitHub-repo med Actions aktiverat

---

## 1. Skapa droplet

På DigitalOcean:

- **Image:** Ubuntu 24.04 LTS
- **Size:** Basic, 1 GB RAM (2 GB om dropleten delar med flera tjänster)
- **Authentication:** SSH-nyckel (lägg till din publika nyckel)
- Notera dropletens IP-adress

---

## 2. Serversetup (kör en gång via SSH)

```bash
ssh root@<IP>
```

### Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### Caddy (på host)

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy
```

### Brandvägg

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
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
API_KEY_SERVER_URL=https://api.example.com
SERVICE_TOKEN=<samma värde som SERVICE_TOKEN i api-serverns .env.docker>
NODE_ENV=production
DOMAIN=exchange.example.com
```

Generera SERVICE_TOKEN med: `openssl rand -hex 32`

> `HTTP_PORT`, `HTTPS_PORT` och TUI-variablerna behövs inte i prod — Caddy körs på host.

### Skapa datakatalogen

```bash
mkdir -p /opt/exchange/data
```

### Starta exchange

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Exchange lyssnar nu på `127.0.0.1:4000` — inte åtkomlig utifrån utan Caddy.

---

## 3. Konfigurera host-Caddy

Lägg till ett block för exchange i `/etc/caddy/Caddyfile` (samma fil som api-servern använder):

```
exchange.example.com {
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
curl https://exchange.example.com/health
# {"status":"ok","uptime":...}
```

> **SSE:** `/market/feed` är en SSE-endpoint. Caddy buffrar inte SSE-svar som standard — ingen extra konfiguration behövs.

---

## 4. Konfigurera CD (GitHub Actions)

CD-pipelinen SSH:ar in på servern och kör `git pull && docker compose -f docker-compose.prod.yml up -d --build` vid ny tagg.

### Skapa SSH-nyckelpar för deploy

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""
```

Lägg till **publika** nyckeln på servern:

```bash
cat ~/.ssh/deploy_key.pub >> /root/.ssh/authorized_keys
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

# Uppdatera manuellt (utan CD)
git pull && docker compose -f docker-compose.prod.yml up -d --build

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
