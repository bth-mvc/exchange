---
name: feedback-dev-env
description: "Lärdomar kring .env-struktur, Docker-setup och portkonflikter"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ecf3e3de-2de8-4a3c-9a96-827afaebfcd8
---

Separera alltid `.env` (lokal dev) från `.env.docker` (Docker). Blanda dem inte i samma fil.

**Why:** Att ha dev- och prod-sektioner i samma .env-fil ledde till att produktionsvärden åsidosatte dev-värden.

**How to apply:** Tre env-filer: `.env` (lokal), `.env.docker` (Docker), `.env.prod` (TUI mot prod). Alla gitignoreras. Exempelfiler finns committade.

---

`tsx --env-file=.env` krävs för att ladda .env i dev-scriptet. Utan flaggan laddas inte .env-filen.

---

`better-sqlite3` kräver `python3 make g++` i Docker builder-steget (node-gyp kompilerar native addon). Kopiera `node_modules` från builder-steget till prod-imagen — kör inte `npm ci` igen i prod-steget.

---

Caddy-portar ska vara konfigurerbara via `HTTP_PORT`/`HTTPS_PORT` i .env.docker för att undvika konflikter med nginx eller andra tjänster på samma maskin.

**Why:** Port 80 var upptagen av nginx när Caddy startades i Docker lokalt.

**How to apply:** I prod körs inte Caddy i Docker alls — bara host-Caddy. `docker-compose.prod.yml` har ingen Caddy-service.
