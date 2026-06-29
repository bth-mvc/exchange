import { Router } from 'express'
import { db } from '../db.js'
import type { TradeRow } from '../db.js'

export const tradesRouter = Router()

tradesRouter.get('/', (req, res) => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? '20'), 100)
  const cursor = req.query.cursor as string | undefined
  const { acronym } = res.locals.student as { acronym: string }

  let trades: TradeRow[]

  if (cursor) {
    trades = db
      .prepare(
        `SELECT * FROM trades WHERE acronym = ? AND timestamp < (
           SELECT timestamp FROM trades WHERE id = ?
         ) ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(acronym, cursor, limit) as TradeRow[]
  } else {
    trades = db
      .prepare(`SELECT * FROM trades WHERE acronym = ? ORDER BY timestamp DESC LIMIT ?`)
      .all(acronym, limit) as TradeRow[]
  }

  const nextCursor = trades.length === limit ? trades[trades.length - 1].id : null
  res.json({ trades, cursor: nextCursor })
})
