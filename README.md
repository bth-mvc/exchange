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
| `npm run check` | Typecheck + lint + format + test |
| `npm test` | Kör tester |
| `npm run test:coverage` | Tester med coverage-rapport |
| `npm run build` | Kompilera TypeScript |
| `npm run clean` | Ta bort node_modules och package-lock |
| `npm run clean:all` | Ta även bort dist, coverage och data |

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
