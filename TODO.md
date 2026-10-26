# To Do

Mina egna anteckningar: saker att göra i närtid. Idéer till nästa kursrunda ligger i
`FUTURE.md`.

- [ ] **Startkapital 100 000 i stället för 10 000** (beslut 2026-10-26): koden klar lokalt
      (`STARTING_BALANCE` i `src/db.ts` sätts uttryckligen vid insert, eftersom en kolumns DEFAULT
      inte ändras i en befintlig databas; teacher-repots mock, solution och issuer klara).
      Kvar: deploy, och på do5 `UPDATE students SET balance = balance + 90000` (efter backup).

- [ ] **Balansera market makern mot det större startkapitalet.** Idag lägger den 100 enheter per
      token och sida varje sekund, ±2 % kring priset (`MARKET_MAKER_QUOTE_AMOUNT`,
      `MARKET_MAKER_SPREAD_PCT`). Med 100 000 kan en student köpa slut på det snabbt; hitta en
      nivå där marknaden fungerar (likviditet, prisrörelse, market makerns egen balans).

- [ ] `npm audit`: 3 kvarvarande moderate-varningar i vitest/@vitest/coverage-v8/@vitest/mocker
      (path traversal i mock-redirect, GHSA-82fw-gwwq-j7x9). Dev-only, ingen fix uppströms
      ännu — bevaka och kör `npm audit fix` när en patchad version finns.

- [ ] **Spår A — nyhetsflöde utan AI** (SSE `news`-event) — svängningar med en förklaring,
      inte bara brus. Enklare lösning, kör vidare på den här. Bygg efter matchningsmotorn
      ovan, inte innan (se beroende nedan).

      **Pedagogiskt syfte**: dels en förklaring till varför priser rör sig ("varför rör sig
          FIKA-priset just nu?" — redan nämnt som ett bra diskussionsmoment i `kmom05.mdx` rad
          183), dels en byggsten till kmom10:s trading-bot-uppgift (grundkrav + "avancerad
          strategi"-listan för högre betyg) — en nyhetsdriven strategi är en naturlig ny post i
          den listan, mer avancerad än ren tröskel-/glidande-medelvärde-logik.

          **Krav:**
          - Fejkat flöde, inte ett riktigt nyhets-API — samma resonemang som för matchningsmotorn:
            kontrollerad timing/frekvens (testbart, inga externa beroenden) väger tyngre än
            realism här. Ett bibliotek av rubriker per tokenkategori (stable/volatile/yield),
            slumpat med skev frekvens (fler händelser för volatila tokens, matchar redan
            `docs/EXCHANGE.md`s beskrivning av dem).
          - **Strukturerad payload, inte bara text** — annars går den inte att bygga en bot mot,
            bara att läsa som människa. Minst: `token`, `sentiment`
            (`positive`/`negative`/`neutral`), `impact` (`low`/`medium`/`high`), plus `headline`
            för människor. `sentiment`+`impact` är det en bot kan agera på programmatiskt.
          - Nyheten ska påverka priset genom samma referensprismekanism som
            matchningsmotorns market-maker (föregående TODO-post) — inte som en separat
            pris-override. Två oberoende sätt att flytta priset på skulle kunna motsäga varandra.
          - Nytt SSE-event `news` bredvid `price`/`trade`, samma mönster. Kontraktet är
            additivt igen — lägg till, ändra inte befintliga events (studentens SSE-relay från
            05-60 ska inte behöva ändras för att plocka upp den nya eventtypen).
          - Tidsfördelen är avsiktlig, inte en bugg att designa bort: en bot som prenumererar på
            `news` och handlar direkt hinner före en människa som läser rubriken — det är precis
            vad kmom10:s trading-bot-uppgift vill demonstrera (algoritmisk reaktionshastighet vs
            manuell handel).

          **Beroende**: kräver att matchningsmotorns referensprissättning finns på plats först
          (se posten ovan) — det finns ingen mekanism att hooka nyhetspåverkan i förrän dess.

          **Öppen fråga, inte avgjord här**: om nyhetsflödet ska nämnas explicit som en post i
          kmom10.mdx:s lista över bot-strategier ("Listan nedan är inspiration, inte en
          begränsning") — inte gjort, bara flaggat.

- [x] Riktig matchningsmotor för `/orders` — **klar** (5244802 matchning med pris/tid och delfyllnad,
      bf292bb market maker som likviditetsbotten; trades sätter priset). Ursprunglig text:
      just nu fylls varje order automatiskt efter 1s
      oavsett orderbok/motpart, och orderboken i `/assets/:id/orderbook` är syntetisk
      (beräknad från priset, inte verkliga ordrar). Görs efter att servern är klar och
      driftsatt.

      **Pedagogiskt syfte** (se `bth-mvc/teacher`, `kmom05.mdx`): hela poängen med en
          gemensam börs är att "dina ordrar påverkar priser som alla andra studenter ser i
          realtid" — det håller inte förrän ordrar faktiskt matchas mot varandra istället för
          att auto-fyllas oavsett motpart. Studenten ska inte skriva någon del av detta själv
          (exchange är inte studentkod, se CLAUDE.md) — allt nedan är exchange-sidans jobb, och
          studentens kod ska inte behöva ändras när det landar.

          **Krav:**
          - Kontraktet är fast (CLAUDE.md) — request/response-format för `/orders`, webhooks och
            SSE-events får inte ändras, bara beteendet bakom dem.
          - Riktig orderbok: limit-ordrar läggs in och matchas mot motpart på pris/tid, annars
            ligger de kvar öppna. `/assets/:id/orderbook` ska spegla verkliga liggande ordrar,
            inte vara syntetisk.
          - Delfyllnad ska stödjas (en order kan matchas i flera steg) — en webhook per fyllnad,
            samma `order.filled`-payload-form som idag.
          - Priset ska röra sig av verkliga trades, inte bara av `market/simulator.ts` oberoende
            av matchningen — annars är "du påverkar marknaden" fortfarande fejk trots riktig
            matchning.
          - Likviditetsbotten: en bakgrunds-market-maker som kan vara motpart när ingen annan
            student handlar just då (kvällstid, tidigt i kursen, ojämn kursaktivitet), så att
            ordrar fortfarande löser sig inom rimlig tid oavsett hur många som är aktiva.
          - Sanity check: `kmom-dry-run`-skillet i teacher-repot (Claude-som-student mot en
            testrepo) förutsätter idag att en order fylls inom ~1s. Matchningsmotorn måste
            garantera att varje order löses inom en avgränsad, förutsägbar tid (via
            likviditetsbotten ovan) så att automatiserade dry-runs inte hänger sig.

          **Webhook-leverans på live — löst 2026-10-25 (polling):** exchange köar signerade
          webhooks per student och pushar inget; studenten pollar `GET /webhooks/pending` och
          kvitterar med `POST /webhooks/pending/ack`. Hemligheten ägs av exchange
          (`GET /webhooks/secret`), inte av api-servern. Se CLAUDE.md, "HMAC-webhooks".
