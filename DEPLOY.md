# Driftsättning

Exchange-servern körs som en Docker-container bakom Caddy (auto-TLS via Let's Encrypt) på en DigitalOcean-droplet. Ny kod deployas automatiskt när du pushar en `v*`-tagg till GitHub.

Exchange är beroende av api-servern för nyckelverifiering — se till att api-servern är uppe och åtkomlig innan du startar exchange.

## Förutsättningar

- DigitalOcean-konto
- Domännamn med en A-record som pekar på dropletens IP (`exchange.example.com → <IP>`)
- api-servern körs och är åtkomlig (på samma droplet eller separat)
- GitHub-repo med Actions aktiverat

---

## 1. Skapa droplet

På DigitalOcean:

- **Image:** Ubuntu 24.04 LTS
- **Size:** Basic, 1 GB RAM räcker gott
- **Authentication:** SSH-nyckel (lägg till din publika nyckel)
- Notera dropletens IP-adress

> exchange och api-server kan köras på samma droplet om du vill minimera kostnaden. Ge dem då olika portar internt (4000 respektive 5000) och separata Caddy-subdomäner.

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
cp .env.example .env
nano .env
```

Fyll i:

```
SERVICE_TOKEN=<samma värde som SERVICE_TOKEN i api-serverns .env>
API_KEY_SERVER_URL=https://api.example.com
DOMAIN=exchange.example.com
NODE_ENV=production
```

Generera tokens med: `openssl rand -hex 32`

### Skapa datakatalogen

```bash
mkdir -p /opt/exchange/data
```

### Starta tjänsten

```bash
docker compose up -d
```

Caddy hämtar automatiskt ett TLS-certifikat från Let's Encrypt vid första uppstarten. Verifiera:

```bash
curl https://exchange.example.com/health
# {"status":"ok","uptime":...}
```

---

## 3. Konfigurera CD (GitHub Actions)

CD-pipelinen SSH:ar in på servern och kör `git pull && docker compose up -d --build` vid ny tagg.

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

## 4. Deploya en ny version

```bash
git tag v1.0.0
git push --tags
```

GitHub Actions kör `.github/workflows/deploy.yml` som SSH:ar in och startar om containrarna med den nya koden.

---

## Nyttiga kommandon på servern

```bash
# Visa körande containrar
docker compose ps

# Visa loggar (följ)
docker compose logs -f

# Starta om
docker compose restart

# Uppdatera manuellt (utan CD)
git pull && docker compose up -d --build

# Stoppa allt
docker compose down
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
docker compose down
rm /opt/exchange/data/exchange.db
docker compose up -d
```

Alla studenters portföljer och handelshistorik raderas. Studenternas API-nycklar berörs inte (de lever i api-servern).
