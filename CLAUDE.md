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

### Rate limit

Efter nyckelkontrollen räknas anropen per student (acronym) i ett fast fönster: högst
`RATE_LIMIT_MAX` (120) anrop per `RATE_LIMIT_WINDOW_MS` (60 s). Över gränsen blir svaret 429
`{ "error": "Too many requests" }` med `Retry-After` i hela sekunder tills fönstret öppnar igen,
plus `RateLimit-Limit` och `RateLimit-Remaining` på alla svar. Studenternas retry med backoff
(issue 06-30) läser `Retry-After`. Mocken har samma beteende (`src/middleware/rateLimit.ts`).

### REST-endpoints

| Method | Path | Beskrivning |
|---|---|---|
| `GET` | `/assets` | Lista alla tokens med aktuellt pris |
| `GET` | `/assets/:id/orderbook` | Orderbok för en specifik token |
| `GET` | `/assets/:id/history?range=10m\|1d\|30d` | Prispunkter äldst först: varje tick, sista per 5 min, stängning per dag |
| `POST` | `/orders` | Lägg en order (buy/sell) |
| `GET` | `/orders?status=open` | Egna ordrar med status (`open`/`filled`/`cancelled`), nyast först, max 100 |
| `DELETE` | `/orders/:id` | Avbryt en egen öppen order (404 annans/okänd, 409 ej öppen) |
| `GET` | `/trades` | Handelshistorik med cursor-paginering |
| `GET` | `/portfolio` | Studentens portfölj på börsen |
| `GET` | `/leaderboard?since=YYYY-MM-DD` | Rankningslista, med `turnover`; med `since` periodens affärer, `startValue` och `changePct`, rankad på `changePct` |
| `GET` | `/market/news?token=&impact=&limit=` | Sparade nyheter, nyast först (se Nyheter nedan) |
| `GET` | `/webhooks/pending` | Okvitterade webhooks (polling) |
| `POST` | `/webhooks/pending/ack` | Kvittera hanterade webhooks |
| `GET` | `/webhooks/secret` | Studentens webhook-hemlighet |

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

När en studentorder fylls (helt eller delvis) eller avbryts lägger exchange en signerad webhook i en kö
per student (tabellen `webhooks`). **Exchange pushar ingenting** — studentens server kör
oftast på `localhost` och går inte att nå från internet — utan studenten pollar:

- `GET /webhooks/pending?limit=50` → `{ webhooks: [{ id, body, signature }] }`, okvitterade, äldst först
- `POST /webhooks/pending/ack` `{ ids: [...] }` → `{ acked: n }`; en post returneras tills den kvitterats
- `GET /webhooks/secret` → `{ secret: "whsec_..." }`

**Signatur:** `sha256=<hmac-hex>` av exakt `body`-strängen — samma värde som headern
`X-Webhook-Signature` har när mock-servern pushar.
**Secret:** skapas av exchange per student (`students.webhook_secret`) första gången
studenten används. Api-servern har inget med webhooks att göra.
Marknadsmakarens fyllnader köas inte. Kvitterade poster rensas efter 7 dagar.

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
    "total": 105.0,
    "remaining": 0,
    "status": "filled"
  },
  "timestamp": "2026-06-01T10:23:45.000Z"
}
```

`remaining` och `status` skiljer en delfyllnad (`status: "open"`, `remaining > 0`) från en
fylld order. `order.cancelled` har samma `data` men `amount`/`price` är orderns egna och
`remaining` den del som aldrig fylldes.

HMAC-signatur beräknas med `sha256` över hela JSON-strängen.

### SSE market feed

```
GET /market/feed
```

SSE-stream med fem eventtyper:

| Event | Data |
|---|---|
| `connected` | `{ message: "Connected to market feed" }` |
| `price` | `{ token, price, timestamp }` — var 3:e sekund |
| `trade` | `{ buyOrderId, sellOrderId, token, side, amount, price, total, timestamp }` — vid matchad order; order-id:n låter en server känna igen sina egna affärer utan att få veta motparten |
| `orderbook` | `{ token, bids, asks, timestamp }` — när en tokens orderbok ändrats, se Marvin nedan |
| `news` | `{ id, token, sentiment, impact, headline, pct?, durationSec?, timestamp }` — se Nyheter nedan |

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

## Prissättning och market makern Marvin

- **Referenspris** (`token.price`): det marknaden visar, det Marvin lägger sina ordrar kring och det
  innehav värderas till på leaderboarden. Prissimulatorn slumpar det ±2 % och drar det sakta
  tillbaka mot baspriset (`PRICE_REVERSION`). Baspriset är startpriset tills en stor nyhet
  flyttar det, och dras i sin tur mycket sakta tillbaka mot startpriset (`BASE_REVERSION`).
  Pris och baspris sparas var `HISTORY_SAMPLE_MS` (10 s) i `token_state`, så en omstart
  fortsätter där marknaden var. `/assets` visar bara `id`, `name`, `type` och `price`: baspriset
  säger vart priset är på väg och ska inte ges bort till en bot.
- **Historik:** samma sampling sparar en tick per token i `price_ticks` (ett dygn) och dagens
  stängningspris i `price_days` (för alltid), för `GET /assets/:id/history`. Första samplingen
  varje dygn (UTC) sparar också varje students värde i `value_days`, för `/leaderboard?since=`. En affär sätter det inte, den knuffar det en bit
  mot affärens pris, mer ju större affären är (`PRICE_IMPACT`, en affär värd en hel
  Marvin-order flyttar priset en fjärdedel av avståndet).
- **Prisband:** `POST /orders` nekar (400) ordrar mer än `PRICE_BAND_PCT` (10 %) från
  referenspriset, så två studenter kan inte flytta marknaden med en affär till ett påhittat pris.
- **Marvin** (`MARKET_MAKER_ACRONYM`, `marvin`) lägger varje sekund en stege per token och sida:
  `MARKET_MAKER_LEVELS` (5) nivåer, den första ±2 % kring referenspriset och värd ca 5 000 kr,
  varje nästa `MARKET_MAKER_LEVEL_STEP_PCT` (1 %) längre ut och en halv order större. Korsar en
  nivå en students vilande order handlar han med den till studentens pris och resten av nivån
  vilar (före 1.5.1 hoppade han över nivån, vilket tömde en hel sida av boken när någon bjöd över
  hans säljstege). En nivå som någon handlat mot behåller det som är kvar och fylls på med
  `MARKET_MAKER_REFILL_PCT` (10 %) av sin storlek per svep, så studenten ser sin affär i boken i
  stället för att nästa svep döljer den. Han går inte igenom
  saldokontrollen och kan blanka (negativt innehav), men slutar köpa eller sälja en token när
  positionen passerar `MARKET_MAKER_MAX_POSITION_VALUE` (50 000 kr). Han syns på leaderboarden
  (`marketMaker: true`); hans vinst eller förlust är värdet minus startkapitalet 100 000.
- **SSE `orderbook`:** efter varje svep skickas orderboken (`token`, `bids`, `asks`, `timestamp`;
  samma nivåer som `GET /assets/:id/orderbook`, med `marketMaker` per nivå) för de tokens vars
  bok har ändrats. Klienter följer boken utan att polla REST-endpointen.

## Nyheter

Ett fejkat nyhetsflöde (`src/market/news.ts`) ger prisrörelserna en förklaring och en bot något
att reagera på. Varje nyhet skickas som SSE `news` och sparas i tabellen `news`
(`GET /market/news`).

| | Vanlig nyhet | Stor händelse |
|---|---|---|
| Takt | ca var `NEWS_INTERVAL_MS` (10 min) totalt, högst en per token och `NEWS_TOKEN_GAP_MS` (1 h); volatila oftast | ca var `BIG_EVENT_INTERVAL_MS` (4 h), aldrig stable |
| `impact` | `low`/`medium`/`high`: 1/2/3 % (neutral flyttar inget) | `rumor`, sedan `big` med `pct` och `durationSec` |
| Flyttar | referenspriset under `NEWS_RAMP_MS` (10 s), sedan dras det tillbaka | referenspriset och baspriset 10–25 % under `BIG_EVENT_RAMP_MS` (3 min) |
| Sparas | `NEWS_KEEP_DAYS` (1) | `BIG_EVENT_KEEP_DAYS` (60) |

- **Rykte:** `RUMOR_LEAD_MS` (3 min) före en stor händelse, rätt riktning i `RUMOR_ACCURACY`
  (75 %) av fallen.
- **Riktning:** lutar tillbaka mot startpriset (ju längre bort, desto troligare tillbaka), och
  baspriset hålls inom 0,5–2 × startpriset. Ingen token dör eller skenar.
- **Marvin under en ramp:** spreaden är `MARKET_MAKER_EVENT_SPREAD_FACTOR` (2,5) gånger bredare.
- `NEWS_ENABLED=false` stänger av flödet. Med många aktiva studenter kan takten ökas.

## Lokal mock (i student-skeletonen)

Studenterna arbetar mot en lokal mock under development — `mock/` i `bth-mvc/teacher`-repot. Mock:en implementerar samma API-kontrakt och körs via Docker Compose.

Exchange (detta repo) är den riktiga servern som körs under kursen.

## Tech stack

Exchange-servern är skriven i **Node.js/Express** (JavaScript, ESM). Avsiktligt enkelt — den ska inte vara ett läromedel i sig, utan fungera pålitligt som extern tjänst.

## Nyckelverifiering mot api-servern

Exchange verifierar studenters API-nycklar mot `bth-mvc/api-server` via `POST /service/verify`. Svaret innehåller bara `acronym`; webhook-hemligheten ägs av exchange (se HMAC-webhooks ovan).

### Verifieringsflöde

```
Student → POST /orders (X-Api-Key: mvc_xxx)
Exchange → POST api-server/service/verify { apiKey: "mvc_xxx" }
Api-server → { valid: true, acronym: "abc" }
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
| `RATE_LIMIT_MAX` | `120` | Max antal anrop per student och fönster |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit-fönstrets längd i ms |
| `HISTORY_SAMPLE_MS` | `10000` | Hur ofta priserna sparas (historik och omstart) |
| `NEWS_ENABLED`, `NEWS_*`, `BIG_EVENT_*`, `RUMOR_*`, `BASE_REVERSION`, `MARKET_MAKER_EVENT_SPREAD_FACTOR` | se `src/config/env.ts` | Nyhetsflödet, se Nyheter ovan |

## API-dokumentation

Swagger UI finns på `/docs` när servern körs — genererat från `swagger.yml`.

## Driftsättning

Exchange ska köras som en fristående Docker-container. Ops-kursen lär studenterna att driftsätta den (eller liknande infrastruktur) på en VM.

## Relation till andra repon

| Repo | Relation |
|---|---|
| `bth-mvc/teacher` | MVC-kursen — student-skeletonen ansluter mot exchange. Mock finns i `mock/` |
| `bth-ops/teacher` | Ops-kursen — exchange är ett av driftsättningsobjekten |
