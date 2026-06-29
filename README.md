# exchange

[![CI](https://github.com/bth-mvc/exchange/actions/workflows/ci.yml/badge.svg)](https://github.com/bth-mvc/exchange/actions/workflows/ci.yml)

Tokenbörsen för MVC-kursen vid BTH. Gemensam exchange-server som alla studenters applikationer ansluter mot.

## Komma igång

```bash
cp .env.example .env   # fyll i SERVICE_TOKEN (och API_KEY_SERVER_URL om inte localhost)
npm install
npm run dev
```

## Kommandon

| Kommando | Vad |
|---|---|
| `npm run dev` | Starta med hot reload |
| `npm run tui` | Interaktivt CLI för test och admin |
| `npm run check` | Typecheck + lint + format + test |
| `npm test` | Kör tester |
| `npm run test:coverage` | Tester med coverage-rapport |
| `npm run build` | Kompilera TypeScript |
| `npm run clean` | Ta bort node_modules och package-lock |
| `npm run clean:all` | Ta även bort dist, coverage och data |

## Testa med TUI

Servern har ett interaktivt CLI för att manuellt testa alla endpoints. Kräver en giltig API-nyckel från api-servern.

Lägg till i `.env`:

```
EXCHANGE_URL=http://localhost:4001
API_KEY=mvc_din-nyckel-här
```

Starta sedan TUI:n (med servern igång i en annan terminal):

```bash
npm run tui
```

Exempel på kommandon i TUI:n:

```
> assets                        # lista alla tokens med pris
> market orderbook FIKA         # visa orderboken för FIKA
> orders buy FIKA 10 10.50      # köp 10 FIKA à 10.50
> orders sell SUDO 5 25.00      # sälj 5 SUDO à 25.00
> portfolio show                # se din portfölj
> trades list                   # se dina senaste trades
> board show                    # leaderboard
> help                          # lista alla kommandon
> exit                          # avsluta
```

Kommandogruppen kan utelämnas om den matchar `defaultGroup` (som är `market`). Skriv alltså bara `assets` istället för `market assets`.

## Testa med Docker

```bash
cp .env.example .env   # fyll i SERVICE_TOKEN, API_KEY_SERVER_URL och DOMAIN
docker compose up -d --build
```

Verifiera:

```bash
curl http://localhost/health
# {"status":"ok","uptime":...}

curl http://localhost/assets -H "X-Api-Key: <din-nyckel>"
```

> Sätt `DOMAIN=localhost` i `.env` för lokal Docker-testning utan TLS.

## API

Swagger UI finns på `/docs` när servern körs. Se även [CLAUDE.md](CLAUDE.md) för fullständigt API-kontrakt.

## Driftsättning

Se [DEPLOY.md](DEPLOY.md).
