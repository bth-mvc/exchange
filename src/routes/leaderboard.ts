import { Router } from 'express'
import { db } from '../db.js'
import type { StudentRow } from '../db.js'
import { env } from '../config/env.js'
import { studentValue } from '../market/history.js'

export const leaderboardRouter = Router()

const STARTING_BALANCE = 100_000

/** Everyone ranked by total value. `turnover` is the money traded (bought plus sold). With
 *  `since` (a date, YYYY-MM-DD), buys, sells and turnover count only trades from that day on,
 *  each entry gets `startValue` (its value when that day began) and `changePct`, and the list
 *  is ranked by `changePct` instead, so a weekly league compares growth, not size. */
leaderboardRouter.get('/', (req, res) => {
  const since = req.query.since as string | undefined
  if (since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    res.status(400).json({ error: 'since must be a date, YYYY-MM-DD' })
    return
  }

  const students = db.prepare(`SELECT * FROM students`).all() as StudentRow[]
  const tradeStats = db.prepare(
    `SELECT SUM(side = 'buy') AS buys, SUM(side = 'sell') AS sells,
            COALESCE(SUM(total), 0) AS turnover, MAX(timestamp) AS lastTradeAt
     FROM trades WHERE acronym = ? AND timestamp >= ?`,
  )
  const startValue = db.prepare(
    `SELECT value FROM value_days WHERE acronym = ? AND day >= ? ORDER BY day LIMIT 1`,
  )

  const ranked = students
    .map((s) => {
      const totalValue = +studentValue(s).toFixed(2)
      const stats = tradeStats.get(s.acronym, since ?? '') as {
        buys: number | null
        sells: number | null
        turnover: number
        lastTradeAt: string | null
      }
      const entry = {
        acronym: s.acronym,
        // The market maker is listed too, so you can follow whether it wins or loses.
        marketMaker: s.acronym === env.MARKET_MAKER_ACRONYM,
        totalValue,
        buys: stats.buys ?? 0,
        sells: stats.sells ?? 0,
        turnover: +stats.turnover.toFixed(2),
        lastTradeAt: stats.lastTradeAt,
        registeredAt: s.created_at,
      }
      if (since === undefined) return entry
      const start =
        (startValue.get(s.acronym, since) as { value: number } | undefined)?.value ??
        STARTING_BALANCE
      return {
        ...entry,
        startValue: +start.toFixed(2),
        changePct: +(((totalValue - start) / start) * 100).toFixed(2),
      }
    })
    .sort((a, b) =>
      since === undefined
        ? b.totalValue - a.totalValue
        : (b as { changePct: number }).changePct - (a as { changePct: number }).changePct,
    )
    .map((s, i) => ({ rank: i + 1, ...s }))

  res.json(ranked)
})
