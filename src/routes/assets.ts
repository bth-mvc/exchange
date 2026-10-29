import { Router } from 'express'
import { tokens, getToken } from '../market/tokens.js'
import { orderbook } from '../market/orderbook.js'
import { priceHistory, ranges } from '../market/history.js'
import type { Range } from '../market/history.js'
import { recentTrades } from '../market/marketTrades.js'

export const assetsRouter = Router()

/** The tokens with their current price. The base and start prices stay inside the exchange:
 *  they say where the price is heading, which a bot should not get for free. */
assetsRouter.get('/', (_req, res) => {
  res.json(tokens.map(({ id, name, type, price }) => ({ id, name, type, price })))
})

assetsRouter.get('/:id/orderbook', (req, res) => {
  const token = getToken(req.params.id)
  if (!token) {
    res.status(404).json({ error: 'Token not found' })
    return
  }

  res.json(orderbook(token.id))
})

/** The token's price over `range` (10m, 1d or 30d), oldest first, for drawing a chart. */
assetsRouter.get('/:id/history', (req, res) => {
  const token = getToken(req.params.id)
  if (!token) {
    res.status(404).json({ error: 'Token not found' })
    return
  }
  const range = ((req.query.range as string | undefined) ?? '1d') as Range
  if (!ranges.includes(range)) {
    res.status(400).json({ error: `Unknown range ${range}, use ${ranges.join(', ')}` })
    return
  }
  res.json({ token: token.id, range, points: priceHistory(token.id, range) })
})

/** The token's latest trades on the exchange, newest first, as the `trade` event shows them. */
assetsRouter.get('/:id/trades', (req, res) => {
  const token = getToken(req.params.id)
  if (!token) {
    res.status(404).json({ error: 'Token not found' })
    return
  }
  const limit = Number(req.query.limit ?? 20)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    res.status(400).json({ error: 'limit must be a whole number from 1 to 100' })
    return
  }
  res.json({ token: token.id, trades: recentTrades(token.id, limit) })
})
