import { db } from '../db.js'
import { env } from '../config/env.js'
import type { StudentRow } from '../db.js'
import { tokens, currentPrice } from './tokens.js'

export type Range = '10m' | '1d' | '30d'
export const ranges: Range[] = ['10m', '1d', '30d']

export interface PricePoint {
  timestamp: string
  price: number
}

/** Saves every token's price as a tick, updates today's close and stores price and base price,
 *  so a restart continues where the market was. Ticks and market trades older than a day are
 *  deleted. */
export function recordPrices(now = new Date()): void {
  const timestamp = now.toISOString()
  const day = timestamp.slice(0, 10)
  const tick = db.prepare(`INSERT INTO price_ticks (token, timestamp, price) VALUES (?, ?, ?)`)
  const close = db.prepare(
    `INSERT INTO price_days (token, day, close) VALUES (?, ?, ?)
     ON CONFLICT (token, day) DO UPDATE SET close = excluded.close`,
  )
  const state = db.prepare(
    `INSERT INTO token_state (token, price, base_price) VALUES (?, ?, ?)
     ON CONFLICT (token) DO UPDATE SET price = excluded.price, base_price = excluded.base_price`,
  )
  db.transaction(() => {
    for (const t of tokens) {
      tick.run(t.id, timestamp, t.price)
      close.run(t.id, day, t.price)
      state.run(t.id, t.price, t.basePrice)
    }
    const dayAgo = new Date(now.getTime() - 86_400_000).toISOString()
    db.prepare(`DELETE FROM price_ticks WHERE timestamp < ?`).run(dayAgo)
    db.prepare(`DELETE FROM market_trades WHERE timestamp < ?`).run(dayAgo)
  })()
}

/** A student's balance plus holdings at the current prices. */
export function studentValue(student: StudentRow): number {
  const holdings = db
    .prepare(`SELECT token, amount FROM holdings WHERE acronym = ? AND amount != 0`)
    .all(student.acronym) as { token: string; amount: number }[]
  return student.balance + holdings.reduce((sum, h) => sum + h.amount * currentPrice(h.token), 0)
}

/** Saves every student's value once a day, the first time this runs that day, so the
 *  leaderboard can tell how much each one has grown since a given day. */
export function recordValues(now = new Date()): void {
  const day = now.toISOString().slice(0, 10)
  if (db.prepare(`SELECT 1 FROM value_days WHERE day = ? LIMIT 1`).get(day)) return
  const insert = db.prepare(
    `INSERT OR IGNORE INTO value_days (acronym, day, value) VALUES (?, ?, ?)`,
  )
  const students = db.prepare(`SELECT * FROM students`).all() as StudentRow[]
  db.transaction(() => {
    for (const s of students) insert.run(s.acronym, day, studentValue(s))
  })()
}

/** Puts back the prices and base prices saved before a restart. */
export function loadTokenState(): void {
  const rows = db.prepare(`SELECT token, price, base_price FROM token_state`).all() as {
    token: string
    price: number
    base_price: number
  }[]
  for (const row of rows) {
    const token = tokens.find((t) => t.id === row.token)
    if (token) {
      token.price = row.price
      token.basePrice = row.base_price
    }
  }
}

/** A token's price over a range: `10m` every tick, `1d` the last price in each five minutes,
 *  `30d` the closing price of each day (today's so far). Oldest first. */
export function priceHistory(token: string, range: Range, now = new Date()): PricePoint[] {
  if (range === '30d') {
    const from = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10)
    return db
      .prepare(
        `SELECT day AS timestamp, close AS price FROM price_days
         WHERE token = ? AND day >= ? ORDER BY day`,
      )
      .all(token, from) as PricePoint[]
  }
  const minutes = range === '10m' ? 10 : 1440
  const from = new Date(now.getTime() - minutes * 60_000).toISOString()
  if (range === '10m') {
    return db
      .prepare(
        `SELECT timestamp, price FROM price_ticks
         WHERE token = ? AND timestamp > ? ORDER BY timestamp`,
      )
      .all(token, from) as PricePoint[]
  }
  // SQLite takes the bare column `price` from the row with MAX(timestamp) in each group.
  return db
    .prepare(
      `SELECT MAX(timestamp) AS timestamp, price FROM price_ticks
       WHERE token = ? AND timestamp > ?
       GROUP BY CAST(strftime('%s', timestamp) / 300 AS INTEGER)
       ORDER BY timestamp`,
    )
    .all(token, from) as PricePoint[]
}

/** Loads the saved prices and records them every HISTORY_SAMPLE_MS, and each student's value
 *  once a day. */
export function startHistory(): void {
  loadTokenState()
  const sample = () => {
    recordPrices()
    recordValues()
  }
  sample()
  setInterval(sample, env.HISTORY_SAMPLE_MS)
}
