import { Router } from 'express'
import { db } from '../db.js'
import type { StudentRow, HoldingRow } from '../db.js'
import { currentPrice } from '../market/tokens.js'

export const leaderboardRouter = Router()

leaderboardRouter.get('/', (_req, res) => {
  const students = db.prepare(`SELECT * FROM students`).all() as StudentRow[]

  const ranked = students
    .map((s) => {
      const holdings = db
        .prepare(`SELECT * FROM holdings WHERE acronym = ? AND amount > 0`)
        .all(s.acronym) as HoldingRow[]

      const holdingsValue = holdings.reduce((sum, h) => sum + h.amount * currentPrice(h.token), 0)
      const totalValue = +(s.balance + holdingsValue).toFixed(2)

      const trades = db
        .prepare(`SELECT COUNT(*) as count, side FROM trades WHERE acronym = ? GROUP BY side`)
        .all(s.acronym) as { count: number; side: string }[]

      const buys = trades.find((t) => t.side === 'buy')?.count ?? 0
      const sells = trades.find((t) => t.side === 'sell')?.count ?? 0
      const lastTrade = db
        .prepare(`SELECT timestamp FROM trades WHERE acronym = ? ORDER BY timestamp DESC LIMIT 1`)
        .get(s.acronym) as { timestamp: string } | undefined

      return {
        acronym: s.acronym,
        totalValue,
        buys,
        sells,
        lastTradeAt: lastTrade?.timestamp ?? null,
        registeredAt: s.created_at,
      }
    })
    .sort((a, b) => b.totalValue - a.totalValue)
    .map((s, i) => ({ rank: i + 1, ...s }))

  res.json(ranked)
})
