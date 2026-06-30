---
name: project-context
description: "Exchange-serverns syfte, nuläge och deployment-arkitektur"
metadata: 
  node_type: memory
  type: project
  originSessionId: ecf3e3de-2de8-4a3c-9a96-827afaebfcd8
---

Exchange är gemensam tokenbörsen för BTH:s MVC-kurs. Studenter (klienter) ansluter mot den via REST, HMAC-webhooks och SSE. Exchange är inte studentkod — den driftsätts av kursteamet.

**Nuläge (2026-06-30):** Version 1.0.1 taggad och pushad. CI + deploy-workflows triggas på `v*`-taggar.

**Produktionssetup:** DigitalOcean-droplet, Docker-container via `docker-compose.prod.yml`, host-installerad Caddy hanterar TLS. Ingen Caddy i prod-compose-filen.

**Nyckelberoendet:** Exchange verifierar API-nycklar mot api-servern (`POST /service/verify`) med 24h in-memory cache. Om api-servern är nere och nyckeln saknas i cache → 401 (fail-closed).

**DEV_API_KEY-bypass:** I `NODE_ENV=development` accepteras `DEV_API_KEY` utan att kontakta api-servern. Gör att exchange kan testas lokalt utan api-server.

**Tre miljöer:**
- Lokal dev: `.env` + `npm run dev` (port 4001)
- Lokal Docker: `.env.docker` + `docker-compose.prod.yml` (port 4000, ingen Caddy)
- Produktion: `.env.docker` på server + host Caddy + `docker-compose.prod.yml`

**Why:** Separation mellan env-filer förhindrar att Docker- och dev-konfiguration blandar sig.

**How to apply:** Vid frågor om deploy eller test — kolla vilken miljö Mikael jobbar i och välj rätt .env och compose-fil.
