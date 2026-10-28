import { db } from '../db.js'
import { env } from '../config/env.js'
import { tokens } from './tokens.js'
import { broadcast } from './simulator.js'

export interface BookLevel {
  price: number
  amount: number
  side: 'buy' | 'sell'
  /** True when the market maker has an order on this level, so a client can mark it. */
  marketMaker: boolean
}

export interface Orderbook {
  token: string
  bids: BookLevel[]
  asks: BookLevel[]
}

const DEPTH = 10

function bookSide(token: string, side: 'buy' | 'sell', order: 'ASC' | 'DESC'): BookLevel[] {
  const rows = db
    .prepare(
      `SELECT price, SUM(remaining) AS amount, MAX(acronym = ?) AS mm FROM orders
       WHERE token = ? AND side = ? AND status = 'open' AND remaining > 0
       GROUP BY price
       ORDER BY price ${order}
       LIMIT ${DEPTH}`,
    )
    .all(env.MARKET_MAKER_ACRONYM, token, side) as { price: number; amount: number; mm: number }[]
  return rows.map((r) => ({ price: r.price, amount: r.amount, side, marketMaker: r.mm === 1 }))
}

/** The open orders for a token, aggregated by price: bids highest first, asks lowest first. */
export function orderbook(token: string): Orderbook {
  return { token, bids: bookSide(token, 'buy', 'DESC'), asks: bookSide(token, 'sell', 'ASC') }
}

const lastSent = new Map<string, string>()

/** Sends an `orderbook` event for every token whose book changed since the last call. Runs after
 *  each market maker sweep, so clients follow the book without polling the REST endpoint. */
export function broadcastOrderbooks(): void {
  for (const token of tokens) {
    const book = orderbook(token.id)
    const json = JSON.stringify(book)
    if (lastSent.get(token.id) === json) continue
    lastSent.set(token.id, json)
    broadcast('orderbook', { ...book, timestamp: new Date().toISOString() })
  }
}
