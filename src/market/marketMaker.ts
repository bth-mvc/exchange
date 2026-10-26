import { db, ensureStudent } from '../db.js'
import { env } from '../config/env.js'
import { nextId } from '../idGen.js'
import { insertOrder } from './matching.js'
import { tokens } from './tokens.js'

const MM_ACRONYM = env.MARKET_MAKER_ACRONYM

/** Liquidity floor: keeps a two-sided quote resting around the reference price for every token.
 *  Each side is worth about MARKET_MAKER_QUOTE_VALUE, so a cheap token gets many units and an
 *  expensive one few, and every token offers the same liquidity in money. The market maker only
 *  provides liquidity: it never takes a student's order, and it stops adding to a position that
 *  has grown past MARKET_MAKER_MAX_POSITION_VALUE in either direction. */
export function runMarketMakerSweep(): void {
  ensureStudent(MM_ACRONYM)
  db.prepare(`DELETE FROM orders WHERE acronym = ? AND status = 'open'`).run(MM_ACRONYM)

  for (const token of tokens) {
    const spread = token.price * env.MARKET_MAKER_SPREAD_PCT
    const amount = quoteAmount(token.price)
    const position = positionValue(token.id, token.price)

    if (position < env.MARKET_MAKER_MAX_POSITION_VALUE) {
      quote(token.id, 'buy', amount, +(token.price - spread).toFixed(2))
    }
    if (position > -env.MARKET_MAKER_MAX_POSITION_VALUE) {
      quote(token.id, 'sell', amount, +(token.price + spread).toFixed(2))
    }
  }
}

/** Whole units worth about MARKET_MAKER_QUOTE_VALUE at this price, at least one. */
export function quoteAmount(price: number): number {
  return Math.max(1, Math.round(env.MARKET_MAKER_QUOTE_VALUE / price))
}

/** What the market maker holds of a token, in money; negative when it is short. */
function positionValue(token: string, price: number): number {
  const row = db
    .prepare(`SELECT amount FROM holdings WHERE acronym = ? AND token = ?`)
    .get(MM_ACRONYM, token) as { amount: number } | undefined
  return (row?.amount ?? 0) * price
}

/** Rests one side of the quote without matching it. If it would cross a student's order, that
 *  side is skipped for this sweep: the student's price is already better than the market
 *  maker's, so it leaves the trade to the students instead of taking it. */
function quote(token: string, side: 'buy' | 'sell', amount: number, price: number): void {
  const opposite = side === 'buy' ? 'sell' : 'buy'
  const crossing = side === 'buy' ? 'price <= ?' : 'price >= ?'
  const crosses = db
    .prepare(
      `SELECT 1 FROM orders
       WHERE token = ? AND side = ? AND status = 'open' AND remaining > 0 AND ${crossing}`,
    )
    .get(token, opposite, price)
  if (crosses) return

  insertOrder(nextId('order'), { acronym: MM_ACRONYM, token, side, amount, price })
}
