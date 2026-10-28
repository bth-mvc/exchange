import { Router } from 'express'
import { tokens, getToken } from '../market/tokens.js'
import { orderbook } from '../market/orderbook.js'

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

  res.json(orderbook(token.id))
})
