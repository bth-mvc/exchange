import { app } from './app.js'
import { env } from './config/env.js'
import { logger } from './logger.js'
import { runMarketMakerSweep } from './market/marketMaker.js'
import { startPriceSimulator } from './market/simulator.js'
import { broadcastOrderbooks } from './market/orderbook.js'
import { startNewsFeed } from './market/news.js'
import { startHistory } from './market/history.js'
import { startTrends } from './market/trend.js'

app.listen(env.PORT, () => {
  logger.info(`Exchange running on http://localhost:${env.PORT}`)
  startHistory()
  startPriceSimulator()
  if (env.NEWS_ENABLED) startNewsFeed()
  if (env.TREND_ENABLED) startTrends()
  setInterval(() => {
    runMarketMakerSweep()
    broadcastOrderbooks()
  }, env.MARKET_MAKER_SWEEP_INTERVAL_MS)
})
