import { Router } from 'express'
import { tokens, getToken } from '../market/tokens.js'

export const assetsRouter = Router()

assetsRouter.get('/', (_req, res) => {
  res.json(tokens)
})

assetsRouter.get('/:id/orderbook', (req, res) => {
  const token = getToken(req.params.id)
  if (!token) {
    res.status(404).json({ error: 'Token not found' })
    return
  }
  const base = token.price
  res.json({
    token: token.id,
    bids: [
      { price: +(base * 0.98).toFixed(2), amount: 5, side: 'buy' },
      { price: +(base * 0.95).toFixed(2), amount: 12, side: 'buy' },
      { price: +(base * 0.9).toFixed(2), amount: 25, side: 'buy' },
    ],
    asks: [
      { price: +(base * 1.02).toFixed(2), amount: 8, side: 'sell' },
      { price: +(base * 1.05).toFixed(2), amount: 15, side: 'sell' },
      { price: +(base * 1.1).toFixed(2), amount: 20, side: 'sell' },
    ],
  })
})
