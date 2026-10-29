import { db, ensureStudent } from '../db.js'
import { env } from '../config/env.js'
import { nextId } from '../idGen.js'
import { placeAndMatch } from './matching.js'
import { tokens } from './tokens.js'

const MM_ACRONYM = env.MARKET_MAKER_ACRONYM

/** Liquidity floor: keeps a ladder of quotes resting around the reference price for every token,
 *  MARKET_MAKER_LEVELS levels on each side. The first level is MARKET_MAKER_SPREAD_PCT from the
 *  reference price, each further level MARKET_MAKER_LEVEL_STEP_PCT further out and half a quote
 *  larger, so the book has depth and a large order moves through several prices. The first level
 *  is worth about MARKET_MAKER_QUOTE_VALUE, so a cheap token gets many units and an expensive one
 *  few, and every token offers the same liquidity in money. A level that crosses a student's
 *  resting order trades with it at the student's price, so a bid above the ask side does not
 *  empty the book. It stops adding to a position that has grown past
 *  MARKET_MAKER_MAX_POSITION_VALUE in either direction. A level that has been traded against
 *  keeps what is left of it and grows back by MARKET_MAKER_REFILL_PCT of its size per sweep, so a
 *  trade shows in the book instead of being hidden by the next sweep. While a big news event
 *  moves a token, the spread is MARKET_MAKER_EVENT_SPREAD_FACTOR wider, so the ramp does not eat
 *  it up. */
export function runMarketMakerSweep(): void {
  ensureStudent(MM_ACRONYM)
  const left = leftOfLastSweep()
  placed.clear()
  db.prepare(`DELETE FROM orders WHERE acronym = ? AND status = 'open'`).run(MM_ACRONYM)

  for (const token of tokens) {
    const amount = quoteAmount(token.price)

    for (let level = 0; level < env.MARKET_MAKER_LEVELS; level++) {
      // Asked per level, since a level that trades with a student changes it
      const position = positionValue(token.id, token.price)
      const spread =
        token.price *
        (env.MARKET_MAKER_SPREAD_PCT + level * env.MARKET_MAKER_LEVEL_STEP_PCT) *
        (token.inEvent ? env.MARKET_MAKER_EVENT_SPREAD_FACTOR : 1)
      const size = Math.round(amount * (1 + level / 2))
      if (position < env.MARKET_MAKER_MAX_POSITION_VALUE) {
        quote(token.id, 'buy', level, size, +(token.price - spread).toFixed(2), left)
      }
      if (position > -env.MARKET_MAKER_MAX_POSITION_VALUE) {
        quote(token.id, 'sell', level, size, +(token.price + spread).toFixed(2), left)
      }
    }
  }
}

/** The order placed for each level in the last sweep, by token, side and level. */
const placed = new Map<string, string>()

function key(token: string, side: 'buy' | 'sell', level: number): string {
  return `${token}:${side}:${level}`
}

/** What is left of each level placed in the last sweep, before it is removed. A level whose
 *  order is gone from the database (a restart, or the tests) is not in the map and starts full. */
function leftOfLastSweep(): Map<string, number> {
  const get = db.prepare(`SELECT remaining FROM orders WHERE id = ?`)
  const left = new Map<string, number>()
  for (const [level, id] of placed) {
    const row = get.get(id) as { remaining: number } | undefined
    if (row) left.set(level, row.remaining)
  }
  return left
}

/** A full level, or what was left of it plus MARKET_MAKER_REFILL_PCT of the full size. */
function refill(size: number, left: number | undefined): number {
  if (left === undefined) return size
  return Math.min(size, left + Math.ceil(size * env.MARKET_MAKER_REFILL_PCT))
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

/** Places one level of the quote. If it crosses a student's order, it trades with it at the
 *  student's price, like any order that crosses the book, and the rest of the level rests. */
function quote(
  token: string,
  side: 'buy' | 'sell',
  level: number,
  size: number,
  price: number,
  left: Map<string, number>,
): void {
  const amount = refill(size, left.get(key(token, side, level)))
  const id = nextId('order')
  placeAndMatch(id, { acronym: MM_ACRONYM, token, side, amount, price })
  placed.set(key(token, side, level), id)
}
