# exchange

[![CI](https://github.com/bth-mvc/exchange/actions/workflows/ci.yml/badge.svg)](https://github.com/bth-mvc/exchange/actions/workflows/ci.yml)

Tokenbörsen för MVC-kursen vid BTH. Gemensam exchange-server som alla studenters applikationer ansluter mot.

## Kommandon

| Kommando | Vad |
|---|---|
| `npm run dev` | Starta lokalt med hot reload |
| `npm run tui` | Interaktivt CLI mot lokal dev-server |
| `npm run tui:docker` | Interaktivt CLI mot lokal Docker-instans |
| `npm run tui:prod` | Interaktivt CLI mot produktionsservern |
| `npm run check` | Typecheck + lint + format + test |
| `npm test` | Kör tester |
| `npm run test:coverage` | Tester med coverage-rapport |
| `npm run build` | Kompilera TypeScript |
| `npm run release:patch` | Kör check, bumpar patch-version och pushar tagg |
| `npm run clean` | Ta bort node_modules och package-lock |
| `npm run clean:all` | Ta även bort dist, coverage och data |

---

## 1. Lokalt (utan Docker)

```bash
cp .env.example .env   # justera PORT och SERVICE_TOKEN
npm install
npm run dev
```

`DEV_API_KEY` i `.env` gör att exchange accepterar den nyckeln utan att kontakta api-servern — du kan testa lokalt utan att ha api-servern igång.

Verifiera i en annan terminal:

```bash
curl http://localhost:4001/health
# {"status":"ok","uptime":...}
```

Testa med TUI (servern igång i en terminal, TUI i en annan):

```bash
npm run tui
> server health
> assets
> orders buy FIKA 10 10.50
> portfolio show
```

---

## 2. Lokalt med Docker

```bash
cp .env.docker.example .env.docker   # justera SERVICE_TOKEN och PORT
docker compose -f docker-compose.prod.yml up -d --build
```

Exchange binder på `127.0.0.1:PORT` (default 4000) utan Caddy framför.

Verifiera:

```bash
curl http://localhost:4000/health
# {"status":"ok","uptime":...}
```

Testa med TUI — sätt `EXCHANGE_URL=http://localhost:4000` i `.env.docker` och kör:

```bash
npm run tui:docker
> server health
> assets
```

Stoppa:

```bash
docker compose -f docker-compose.prod.yml down
```

---

## 3. Produktion

Se [DEPLOY.md](DEPLOY.md) för fullständig guide: droplet-setup, host-Caddy, CD via GitHub Actions.

Testa mot produktionsservern med TUI:

```bash
cp .env.prod.example .env.prod   # fyll i EXCHANGE_URL och API_KEY
npm run tui:prod
> server health
> board show
```

---

## API

Swagger UI finns på `/docs` när servern körs. Se även [CLAUDE.md](CLAUDE.md) för fullständigt API-kontrakt.

TUI-kommandon som fungerar i alla tre miljöer:

```
> server health                 # kolla att servern är igång
> server docs                   # visa URL till Swagger UI
> assets                        # lista alla tokens med pris
> market orderbook FIKA         # visa orderboken för FIKA
> orders buy FIKA 10 10.50      # köp 10 FIKA à 10.50
> orders sell SUDO 5 25.00      # sälj 5 SUDO à 25.00
> portfolio show                # se din portfölj
> trades list                   # se dina senaste trades
> board show                    # leaderboard
> help                          # lista alla kommandon
```
