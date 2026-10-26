import { Router } from 'express'
import { z } from 'zod'
import { nextId } from '../idGen.js'
import { insertOrder, insufficientFunds, matchOrder } from '../market/matching.js'
import { getToken, outsidePriceBand } from '../market/tokens.js'

export const ordersRouter = Router()

const OrderSchema = z.object({
  token: z.string().toUpperCase(),
  side: z.enum(['buy', 'sell']),
  amount: z.number().int().positive(),
  price: z.number().positive(),
  userId: z.string().optional(),
})

ordersRouter.post('/', (req, res) => {
  const result = OrderSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0].message })
    return
  }

  const { token, side, amount, price, userId } = result.data
  if (!getToken(token)) {
    res.status(400).json({ error: `Unknown token: ${token}` })
    return
  }

  const offBand = outsidePriceBand(token, price)
  if (offBand) {
    res.status(400).json({ error: offBand })
    return
  }

  const { acronym } = res.locals.student as { acronym: string }

  const shortfall = insufficientFunds(acronym, token, side, amount, price)
  if (shortfall) {
    res.status(400).json({ error: shortfall })
    return
  }

  // Insert now, so the next order already sees this one's reservation; match after the response.
  const orderId = nextId('order')
  insertOrder(orderId, { acronym, token, side, amount, price, userId })
  res.status(201).json({ id: orderId, token, side, amount, price, status: 'open' })

  setImmediate(() => matchOrder(orderId))
})
