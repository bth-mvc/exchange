import { app } from './app.js'
import { env } from './config/env.js'
import { logger } from './logger.js'
import { startPriceSimulator } from './market/simulator.js'

app.listen(env.PORT, () => {
  logger.info(`Exchange running on http://localhost:${env.PORT}`)
  startPriceSimulator()
})
