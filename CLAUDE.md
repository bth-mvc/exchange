# CLAUDE.md — bth-mvc/exchange

## Vad det här repot är

Exchange-servern för MVC-kursen och ops-kursen vid BTH. En gemensam tokenbörsen som alla studenters applikationer ansluter mot — studenten är *klient*, exchange är *extern infrastruktur*.

Exchange-servern är **inte** studentkod. Den driftsätts av kursteamet och körs under kursens gång.

## Kursernas relation till exchange

```
Studentsserver (bth-mvc/mvc-<akronym>)
    ↕ REST + HMAC-webhooks + SSE
Exchange-server (detta repo)
```

- **MVC-kursen (kmom05-06):** Studenten bygger börskopplingen mot exchange
- **Ops-kursen:** Studenten (eller kursteamet) driftsätter exchange på en riktig server

## API-kontrakt

Exchange exponerar tre kommunikationskanaler. Detta kontrakt är fast — studenterna implementerar mot det, exchange får inte ändra det utan att studenternas kod uppdateras.

### Autentisering

Alla endpoints kräver API-nyckel, antingen som header eller query-parameter:
```
X-Api-Key: <api-key>
  eller
?api_key=<api-key>
```

### REST-endpoints

| Method | Path | Beskrivning |
|---|---|---|
| `GET` | `/assets` | Lista alla tokens med aktuellt pris |
| `GET` | `/assets/:id/orderbook` | Orderbok för en specifik token |
| `POST` | `/orders` | Lägg en order (buy/sell) |
| `GET` | `/trades` | Handelshistorik med cursor-paginering |
| `GET` | `/portfolio` | Studentens portfölj på börsen |
| `GET` | `/leaderboard` | Rankningslista för alla användare |

#### `POST /orders` — request body
```json
{
  "token": "FIKA",
  "side": "buy",
  "amount": 10,
  "price": 10.50,
  "userId": "user-123"
}
```

#### `POST /orders` — response (201)
```json
{
  "id": "order-1234567890",
  "token": "FIKA",
  "side": "buy",
  "amount": 10,
  "price": 10.50,
  "status": "open"
}
```

#### `GET /trades` — cursor-paginering
```
GET /trades?limit=20&cursor=trade-abc123
```
```json
{
  "trades": [...],
  "cursor": "trade-xyz789"
}
```

### HMAC-webhooks

När en order matchas skickar exchange en POST till studentservern:

**URL:** konfigureras via `WEBHOOK_URL` (studentens registrerade URL)
**Header:** `X-Webhook-Signature: sha256=<hmac-hex>`
**Secret:** `WEBHOOK_SECRET` (delad hemlighet per student)

**Webhook-payload:**
```json
{
  "id": "wh-1234567890",
  "event": "order.filled",
  "data": {
    "orderId": "order-1234567890",
    "userId": "user-123",
    "token": "FIKA",
    "side": "buy",
    "amount": 10,
    "price": 10.50,
    "total": 105.0
  },
  "timestamp": "2026-06-01T10:23:45.000Z"
}
```

HMAC-signatur beräknas med `sha256` över hela JSON-strängen.

### SSE market feed

```
GET /market/feed
```

SSE-stream med två eventtyper:

| Event | Data |
|---|---|
| `connected` | `{ message: "Connected to market feed" }` |
| `price` | `{ token, price, timestamp }` — var 3:e sekund |
| `trade` | `{ token, side, amount, price, total, timestamp }` — vid matchad order |

## Tokens

Sex tokens i tre kategorier:

| ID | Namn | Typ | Startpris |
|---|---|---|---|
| `FIKA` | Fika Token | stable | 10.00 |
| `SUDO` | Sudo Token | stable | 25.00 |
| `YOLO` | Yolo Token | volatile | 4.20 |
| `DEPLOY` | Deploy Token | volatile | 42.00 |
| `MEME` | Meme Token | volatile | 0.69 |
| `HODL` | Hodl Token | yield | 100.00 |

## Lokal mock (i student-skeletonen)

Studenterna arbetar mot en lokal mock under development — `mock/` i `bth-mvc/teacher`-repot. Mock:en implementerar samma API-kontrakt och körs via Docker Compose.

Exchange (detta repo) är den riktiga servern som körs under kursen.

## Tech stack

Exchange-servern är skriven i **Node.js/Express** (JavaScript, ESM). Avsiktligt enkelt — den ska inte vara ett läromedel i sig, utan fungera pålitligt som extern tjänst.

## Nyckelverifiering mot api-servern

Exchange verifierar studenters API-nycklar mot `bth-mvc/api-server` via `POST /service/verify`. Svaret innehåller `webhookUrl` och `webhookSecret` per student — exchange behöver dessa för att skicka webhooks vid matchade ordrar.

### Verifieringsflöde

```
Student → POST /orders (X-Api-Key: mvc_xxx)
Exchange → POST api-server/service/verify { apiKey: "mvc_xxx" }
Api-server → { valid: true, acronym: "abc", webhookUrl: "...", webhookSecret: "..." }
Exchange → cachat i minnet, svarar studenten
```

### Cache-strategi

Verifieringsresultatet cachas **i minnet med 24 timmars TTL** per API-nyckel. Det innebär:

- Inga upprepade anrop till api-servern under ett dygn
- Exchange fortsätter fungera om api-servern är tillfälligt nere (för sedan cachade nycklar)
- Återkallning slår igenom vid nästa cache-expiry (max 24h)
- Vid omstart töms cachen — alla nycklar verifieras på nytt vid första anropet

Implementation: en `Map<apiKey, { data, expiresAt }>` räcker. Ingen extern cache (Redis etc.) behövs.

### Fallback-beteende

Om api-servern inte svarar och nyckeln inte finns i cachen → returnera `401 Unauthorized`. Fail-closed är rätt val för en börs.

## Miljövariabler

| Variabel | Default | Beskrivning |
|---|---|---|
| `PORT` | `4000` | Port att lyssna på |
| `API_KEY_SERVER_URL` | `http://localhost:5000` | URL till api-servern |
| `SERVICE_TOKEN` | — | X-Service-Token för anrop till api-servern (krävs) |
| `KEY_CACHE_TTL_MS` | `86400000` | Cache-TTL i ms (default 24h) |

## API-dokumentation

Swagger UI finns på `/docs` när servern körs — genererat från `swagger.yml`.

## Driftsättning

Exchange ska köras som en fristående Docker-container. Ops-kursen lär studenterna att driftsätta den (eller liknande infrastruktur) på en VM.

## Relation till andra repon

| Repo | Relation |
|---|---|
| `bth-mvc/teacher` | MVC-kursen — student-skeletonen ansluter mot exchange. Mock finns i `mock/` |
| `bth-ops/teacher` | Ops-kursen — exchange är ett av driftsättningsobjekten |
