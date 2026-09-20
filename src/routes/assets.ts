import { Router } from 'express'
import { db } from '../db.js'
import { tokens, getToken } from '../market/tokens.js'

export const assetsRouter = Router()

interface BookLevel {
  price: number
  amount: number
}

function bookSide(token: string, side: 'buy' | 'sell', order: 'ASC' | 'DESC'): BookLevel[] {
  return db
    .prepare(
      `SELECT price, SUM(remaining) AS amount FROM orders
       WHERE token = ? AND side = ? AND status = 'open' AND remaining > 0
       GROUP BY price
       ORDER BY price ${order}
       LIMIT 10`,
    )
    .all(token, side) as BookLevel[]
}

assetsRouter.get('/', (_req, res) => {
  res.json(tokens)
})

assetsRouter.get('/:id/orderbook', (req, res) => {
  const token = getToken(req.params.id)
  if (!token) {
    res.status(404).json({ error: 'Token not found' })
    return
  }

  res.json({
    token: token.id,
    bids: bookSide(token.id, 'buy', 'DESC').map((level) => ({ ...level, side: 'buy' })),
    asks: bookSide(token.id, 'sell', 'ASC').map((level) => ({ ...level, side: 'sell' })),
  })
})
