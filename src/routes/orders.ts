import { Router } from 'express'
import { z } from 'zod'
import { nextId } from '../idGen.js'
import { db } from '../db.js'
import type { OrderRow } from '../db.js'
import { cancelOrder, insertOrder, insufficientFunds, matchOrder } from '../market/matching.js'
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

const ListSchema = z.object({
  status: z.enum(['open', 'filled', 'cancelled']).default('open'),
})

function orderView(o: OrderRow) {
  return {
    id: o.id,
    ...(o.user_id && { userId: o.user_id }),
    token: o.token,
    side: o.side,
    amount: o.amount,
    remaining: o.remaining,
    price: o.price,
    status: o.status,
    createdAt: o.created_at,
  }
}

/** The student's own orders with a status, newest first (open ones by default). */
ordersRouter.get('/', (req, res) => {
  const result = ListSchema.safeParse(req.query)
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0].message })
    return
  }

  const { acronym } = res.locals.student as { acronym: string }
  const orders = db
    .prepare(`SELECT * FROM orders WHERE acronym = ? AND status = ? ORDER BY rowid DESC LIMIT 100`)
    .all(acronym, result.data.status) as OrderRow[]
  res.json(orders.map(orderView))
})

ordersRouter.delete('/:id', (req, res) => {
  const { acronym } = res.locals.student as { acronym: string }
  const result = cancelOrder(acronym, req.params.id)
  if (result === 'not-found') {
    res.status(404).json({ error: 'Order not found' })
    return
  }
  if (result === 'not-open') {
    res.status(409).json({ error: 'Order is not open: it is already filled or cancelled' })
    return
  }
  res.json(orderView(result))
})
