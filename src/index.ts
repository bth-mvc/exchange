import { app } from './app.js'
import { env } from './config/env.js'
import { logger } from './logger.js'
import { runMarketMakerSweep } from './market/marketMaker.js'
import { startPriceSimulator } from './market/simulator.js'
import { broadcastOrderbooks } from './market/orderbook.js'

app.listen(env.PORT, () => {
  logger.info(`Exchange running on http://localhost:${env.PORT}`)
  startPriceSimulator()
  setInterval(() => {
    runMarketMakerSweep()
    broadcastOrderbooks()
  }, env.MARKET_MAKER_SWEEP_INTERVAL_MS)
})
