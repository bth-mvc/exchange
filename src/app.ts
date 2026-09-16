import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { parse } from 'yaml'
import { apiKeyAuth } from './middleware/apiKeyAuth.js'
import { errorHandler } from './middleware/errorHandler.js'
import { assetsRouter } from './routes/assets.js'
import { ordersRouter } from './routes/orders.js'
import { tradesRouter } from './routes/trades.js'
import { portfolioRouter } from './routes/portfolio.js'
import { leaderboardRouter } from './routes/leaderboard.js'
import { marketRouter } from './routes/market.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const spec = parse(readFileSync(join(__dirname, '..', 'openapi.yaml'), 'utf8'))

// process.cwd() is the package.json directory in both dev (repo root) and the
// Docker image (WORKDIR /app) — unlike __dirname, which shifts by one level
// once src/ is compiled into dist/src/.
const { version } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  version: string
}

export const app = express()

app.use(express.json())

app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version, uptime: process.uptime() })
})

app.use(apiKeyAuth)

app.use('/assets', assetsRouter)
app.use('/orders', ordersRouter)
app.use('/trades', tradesRouter)
app.use('/portfolio', portfolioRouter)
app.use('/leaderboard', leaderboardRouter)
app.use('/market', marketRouter)

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.use(errorHandler)
