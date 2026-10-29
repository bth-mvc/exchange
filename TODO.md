# To Do

Mina egna anteckningar: saker att göra i närtid. Idéer till nästa kursrunda ligger i
`FUTURE.md`.

- [ ] **Följ Marvin (market makern) under kursen.** Prisband, knuffat referenspris, stege,
      positionsgräns (2026-10-26) och att han tar korsande studentordrar och fyller på stegvis
      (2026-10-29) finns (se CLAUDE.md, Prissättning). Håll koll på
      hans värde på leaderboarden: växer det stadigt är spreaden för bred för studenterna, sjunker
      det har någon hittat ett sätt att lura honom. Justera i `.env` på do5 vid behov.

- [ ] **Fundering: långa trender.** Idag dras `basePrice` alltid tillbaka mot tokenets
      `startPrice` (`BASE_REVERSION` i `simulator.ts`), och stora händelser lutar åt samma håll
      (`bigEventDirection` i `news.ts`). Därför syns det rätt tydligt var de högsta och lägsta
      kurserna ligger, och "köp lågt, sälj högt" mot startnivån blir en säker strategi. Idé
      (2026-10-29): ge ibland en token en trend, sakta uppåt eller nedåt under dagar eller
      veckor. Till exempel ett eget mål som rör sig några procent per dygn under en period,
      och som reversionen och riktningen på stora händelser drar mot i stället för den fasta
      `startPrice`. Fortfarande med det hårda taket 0,5–2 × ursprungligt baspris, och bara på
      volatila tokens. Öppna frågor: hur ofta, hur stark, och om trenden ska synas, t.ex. som
      en nyhet ("analytiker tror på ..."), eller bara märkas i 30-dagarsgrafen. Pedagogiskt
      ger det 10-30 ett verkligt val mellan att följa trenden (glidande medelvärde) och att
      satsa på att priset vänder.

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
            additivt igen — lägg till, ändra inte befintliga events (men se "Obs, relayen" nedan).
          - Tidsfördelen är avsiktlig, inte en bugg att designa bort: en bot som prenumererar på
            `news` och handlar direkt hinner före en människa som läser rubriken — det är precis
            vad kmom10:s trading-bot-uppgift vill demonstrera (algoritmisk reaktionshastighet vs
            manuell handel).
          - **Obs, relayen:** studentens SSE-klient från 05-60 lyssnar på namngivna events
            (`addEventListener('price' | 'trade' | …)`), så `news` (och ett ev. `orderbook`) når
            inte frontenden utan en liten ändring där. Tänkt att läggas i 06-50, och att den
            första `orderbook`/`news` som kommer fram låser upp handelsvyn i klienten.

          **Två nivåer, takt och prisverkan (skiss 2026-10-28, mockup
          `teacher/mockups/trading-view.html` i kursrepot):**

          Orderdjupet sätter inte priset hos oss: referenspriset (`token.price`) rör sig av
          simulatorns brus, dragningen mot `basePrice` och affärernas knuff, och Marvin lägger
          om sina ordrar runt det varje sekund. En nyhet flyttar därför referenspriset eller
          `basePrice`, och Marvin och prisbandet följer med inom en sekund. Studenternas
          liggande ordrar flyttas inte. Det är där det finns pengar att tjäna eller förlora.

          | | Vanlig nyhet | Stor händelse |
          |---|---|---|
          | Takt | högst 1 per token och timme, utspritt, ca 1 var 10:e minut totalt | några per dag, mest volatila tokens, aldrig stable |
          | Storlek | 1–3 % | 10–25 %, upp eller ner |
          | Flyttar | referenspriset, en knuff som klingar av, dras tillbaka mot `basePrice` | `basePrice`: den nya nivån består |
          | Förlopp | några sekunder | en ramp på 2–5 min, så att människor hinner reagera |
          | Förvarning | – | ett rykte (`impact: 'rumor'`) några minuter före, rätt i ca 75 % av fallen |

          - Payloaden för en stor händelse: `impact: 'big'`, plus `pct` (planerad förändring)
            och `durationSec` (rampen), så att en bot kan räkna på den.
          - **Tillbaka mot startvärdet över tid:** `basePrice` dras långsamt mot tokenets
            ursprungliga baspris, och riktningen på en stor händelse lutar dit: ju längre från
            ursprunget, desto troligare att nästa händelse går tillbaka. Hårt tak
            0,5–2 × ursprungligt baspris. Ingen token dör eller skenar under kursen, och
            30-dagarsgrafen får trender som ändå vänder.
          - **Marvin under en ramp:** bredare spread (t.ex. 2,5×) och ev. mindre volym tills
            rampen är klar, annars blir han uppäten och slår i positionstaket.
          - **Med få aktiva studenter** (t.ex. 5) är det i praktiken bara Marvin och nyheterna
            som rör priset. Glesa nyheter räcker och ger ett lugnt flöde. Takten kan vara
            konfigurerbar (env) för att kunna ökas när kursen är full.
          - **Historik:** spara nyheterna (senaste dygnet räcker) så att klienten kan visa dem
            som markörer i grafen. Stora händelser sparas längre och visas även i
            30-dagarsvyn (dagliga stängningspriser).

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
