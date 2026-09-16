# To Do

Mina egna anteckningar.

- [ ] Riktig matchningsmotor för `/orders` — just nu fylls varje order automatiskt efter 1s
      oavsett orderbok/motpart, och orderboken i `/assets/:id/orderbook` är syntetisk
      (beräknad från priset, inte verkliga ordrar). Görs efter att servern är klar och
      driftsatt.
- [ ] `npm audit`: 3 kvarvarande moderate-varningar i vitest/@vitest/coverage-v8/@vitest/mocker
      (path traversal i mock-redirect, GHSA-82fw-gwwq-j7x9). Dev-only, ingen fix uppströms
      ännu — bevaka och kör `npm audit fix` när en patchad version finns.