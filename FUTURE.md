# Future

Idéer som vi funderar på till nästa kursrunda (om ett år), inte nu. Saker att göra i närtid
ligger i `TODO.md`.

- [ ] **Spår B — nyhetsflöde kopplat till en färdig AI-integration (BTH:s ChatGPT-mini)** —
      inte beslutat, Mikael funderar (2026-09-16). Kräver Spår A som grund (samma
      `news`-event, samma sentiment/impact-payload) — AI-delen är ett tolkningslager ovanpå,
      inte en ersättning.

      **Idén**: ge studenten en i princip färdig klient mot BTH:s interna ChatGPT-mini-tjänst
          (exakt endpoint/auth okänt än — måste tas fram innan detta kan skopas vidare), så att
          studenten kan låta sin kmom10-bot fråga en LLM om hur den ska tolka/reagera på
          nyhetsrubriken, istället för att bara tröskla på `sentiment`/`impact` direkt. Poängen är
          inte att lära ut LLM-integration (se konflikten nedan) — poängen är att ge boten ett
          extra, färdigpaketerat verktyg att välja att använda eller inte.

          **Konflikt att lösa innan detta kan bli ett krav:** `teacher/kmom/outside-scope.mdx`
          rad 9–23 säger uttryckligen att AI/LLM-integration valdes bort från MVC-kursen och
          sparas till ops-kursen (skäl: överbelastning av en redan tung kurs, API-kostnader per
          student, nyckelhantering, snabbt föråldrade mönster). Att införa det här är ett
          medvetet avsteg från det beslutet, inte en detalj — kräver ett aktivt beslut, inte bara
          en kodändring.

          **Tajmingsfråga, olöst:** kmom10 är examinerande och sent i kursen — om AI-delen ska
          kännas som mer än en sista-veckan-krydda vill man nog introducera den redan i kmom06
          (mer tid att jobba med den delen), inte bara som en kmom10-tillvalsstrategi. Det ändrar
          var i kursen den hör hemma, inte bara om.

          **Om det bedöms vara för mycket för MVC-kursen:** input till `NEXT-COURSE.md` (ops-
          kursen) — inte gjort ännu, väntar på beslutet ovan.

- [ ] **Smeknamn på leaderboarden.** Idag visar
      `GET /leaderboard` studentens BTH-akronym, som klasskamrater känner igen
      (pseudonymt, inte anonymt). Idé: kolumnen `nickname` i `students`, en endpoint som
      `PUT /me/nickname` (med API-nyckeln), och leaderboarden visar smeknamnet om det finns,
      annars en neutral etikett som "Trader 7" i stället för akronymen. Studenten sätter det
      via Bruno/Swagger i 06-50. Beslut 2026-10-26: inte nu, pseudonymt räcker i år.

- [ ] **Yield-utdelning och marknadshändelser.** Föreläsningen om tokenbörsen beskrev HODL som
      en yield-token med automatisk utdelning varje timme (`event: yield` i SSE) och
      marknadshändelser som flyttar priser. Inget av det är byggt i v1.3.0; HODL handlas som
      vilken token som helst. Beslut 2026-10-27: borttaget ur föreläsningen och kmom05.mdx tills
      vidare. Om det byggs: utdelning i `portfolio`-saldot, ett `yield`-event i
      `/market/feed`, och samma i mocken, sedan tillbaka i föreläsningen.
