import { Router } from 'express'
import { z } from 'zod'
import { db, ensureStudent } from '../db.js'
import { getToken } from '../market/tokens.js'
import { broadcast } from '../market/simulator.js'
import { sendWebhook } from '../webhook/sender.js'

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

  const { acronym, webhookUrl, webhookSecret } = res.locals.student as {
    acronym: string
    webhookUrl: string
    webhookSecret: string
  }

  const orderId = `order-${Date.now()}`
  res.status(201).json({ id: orderId, token, side, amount, price, status: 'open' })

  setTimeout(() => {
    const total = amount * price
    const tradeId = `trade-${Date.now()}`
    const timestamp = new Date().toISOString()

    ensureStudent(acronym)

    db.prepare(
      `INSERT INTO trades (id, acronym, token, side, amount, price, total, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(tradeId, acronym, token, side, amount, price, total, timestamp)

    if (side === 'buy') {
      db.prepare(
        `INSERT INTO holdings (acronym, token, amount) VALUES (?, ?, ?)
         ON CONFLICT(acronym, token) DO UPDATE SET amount = amount + excluded.amount`,
      ).run(acronym, token, amount)
      db.prepare(`UPDATE students SET balance = balance - ? WHERE acronym = ?`).run(total, acronym)
    } else {
      db.prepare(
        `INSERT INTO holdings (acronym, token, amount) VALUES (?, ?, 0)
         ON CONFLICT(acronym, token) DO UPDATE SET amount = MAX(0, amount - ?)`,
      ).run(acronym, token, amount)
      db.prepare(`UPDATE students SET balance = balance + ? WHERE acronym = ?`).run(total, acronym)
    }

    broadcast('trade', { token, side, amount, price, total, timestamp })

    const payload = {
      id: `wh-${Date.now()}`,
      event: 'order.filled',
      data: { orderId, ...(userId && { userId }), token, side, amount, price, total },
      timestamp,
    }
    sendWebhook(webhookUrl, webhookSecret, payload)
  }, 1000)
})
