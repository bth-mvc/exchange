---
name: feedback-style
description: "Preferenser för kodstilar, beslutsfattande och kommunikation i detta projekt"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ecf3e3de-2de8-4a3c-9a96-827afaebfcd8
---

Följ api-serverns mönster när du är osäker — det är referensimplementationen för deploy, CI/CD och miljöstruktur.

**Why:** Mikael har redan driftsatt api-servern och den fungerar. Exchange ska bete sig likadant för att minska kognitiv last.

**How to apply:** Innan du föreslår en ny lösning, kontrollera hur api-servern gör det. Använd samma filnamn, samma script-namn, samma Caddy-mönster, samma GitHub Actions-struktur.

---

CI och deploy är fristående — de körs parallellt, inte sekventiellt.

**Why:** Lokalt `npm run check` är den primära grinden innan en tagg pushas. Deploy kopplas inte till CI för att inte blockera deploy om CI är långsam eller flakig.

**How to apply:** Håll `ci.yml` och `deploy.yml` separata. Länka dem inte med `needs:`.

---

Kort och koncis kommunikation på svenska. Inga onödiga förklaringar.

**Why:** Mikael är erfaren och behöver inte få saker förklarade från grunden.

**How to apply:** Håll svar korta. Fokusera på vad som ändrades och vad som är nästa steg.
