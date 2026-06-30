# Driftsättning

Exchange-servern körs som en Docker-container bakom Caddy, med nginx som yttre reverse proxy (TLS via certbot). Ny kod deployas automatiskt när du pushar en `v*`-tagg till GitHub.

Exchange är beroende av api-servern för nyckelverifiering — se till att api-servern är uppe och åtkomlig innan du startar exchange.

## Förutsättningar

- DigitalOcean-droplet (delas med api-server och övriga tjänster)
- Domännamn med en A-record som pekar på dropletens IP (`exchange.example.com → <IP>`)
- nginx och certbot installerade på dropleten
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
HTTP_PORT=8082
HTTPS_PORT=8442
API_KEY_SERVER_URL=https://api.example.com
SERVICE_TOKEN=<samma värde som SERVICE_TOKEN i api-serverns .env>
KEY_CACHE_TTL_MS=86400000
DB_PATH=./data/exchange.db
NODE_ENV=production
DOMAIN=exchange.example.com
```

Generera SERVICE_TOKEN med: `openssl rand -hex 32`

### Skapa datakatalogen

```bash
mkdir -p /opt/exchange/data
```

### Starta tjänsten

```bash
docker compose --env-file .env.docker up -d --build
```

---

## 3. Konfigurera nginx

Exchange Caddy lyssnar på `HTTP_PORT` (8082) internt. Nginx proxyas dit och hanterar TLS.

Skapa `/etc/nginx/sites-available/exchange`:

```nginx
server {
    server_name exchange.example.com;

    location / {
        proxy_pass http://localhost:8082;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection '';
    }
}
```

Aktivera och hämta TLS-certifikat:

```bash
ln -s /etc/nginx/sites-available/exchange /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d exchange.example.com
```

Verifiera:

```bash
curl https://exchange.example.com/health
# {"status":"ok","uptime":...}
```

> SSE-endpoints (`/market/feed`) kräver att nginx inte buffrar svaret. Lägg till `proxy_buffering off;` i location-blocket om du märker problem med SSE.

---

## 4. Konfigurera CD (GitHub Actions)

CD-pipelinen SSH:ar in på servern och kör `git pull && docker compose --env-file .env.docker up -d --build` vid ny tagg.

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
git tag v1.0.1
git push --tags
```

GitHub Actions kör `.github/workflows/deploy.yml` som SSH:ar in och startar om containrarna med den nya koden.

---

## Nyttiga kommandon på servern

```bash
# Visa körande containrar
docker compose --env-file .env.docker ps

# Visa loggar (följ)
docker compose --env-file .env.docker logs -f

# Starta om
docker compose --env-file .env.docker restart

# Uppdatera manuellt (utan CD)
git pull && docker compose --env-file .env.docker up -d --build

# Stoppa allt
docker compose --env-file .env.docker down
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
docker compose --env-file .env.docker down
rm /opt/exchange/data/exchange.db
docker compose --env-file .env.docker up -d
```

Alla studenters portföljer och handelshistorik raderas. Studenternas API-nycklar berörs inte (de lever i api-servern).
