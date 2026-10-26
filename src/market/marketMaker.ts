import { db, ensureStudent } from '../db.js'
import { env } from '../config/env.js'
import { nextId } from '../idGen.js'
import { placeAndMatch } from './matching.js'
import { tokens } from './tokens.js'

const MM_ACRONYM = env.MARKET_MAKER_ACRONYM

/** Liquidity floor: keeps a two-sided quote resting around the reference price for every token.
 *  Each side is worth about MARKET_MAKER_QUOTE_VALUE, so a cheap token gets many units and an
 *  expensive one few, and every token offers the same liquidity in money. */
export function runMarketMakerSweep(): void {
  ensureStudent(MM_ACRONYM)
  db.prepare(`DELETE FROM orders WHERE acronym = ? AND status = 'open'`).run(MM_ACRONYM)

  for (const token of tokens) {
    const spread = token.price * env.MARKET_MAKER_SPREAD_PCT
    const amount = quoteAmount(token.price)
    quote(token.id, 'buy', amount, +(token.price - spread).toFixed(2))
    quote(token.id, 'sell', amount, +(token.price + spread).toFixed(2))
  }
}

/** Whole units worth about MARKET_MAKER_QUOTE_VALUE at this price, at least one. */
export function quoteAmount(price: number): number {
  return Math.max(1, Math.round(env.MARKET_MAKER_QUOTE_VALUE / price))
}

/** Places one side of the MM's quote through the normal matching path, so it can immediately
 *  cross a favorably priced resting order instead of just sitting next to it unmatched. */
function quote(token: string, side: 'buy' | 'sell', amount: number, price: number): void {
  placeAndMatch(nextId('order'), {
    acronym: MM_ACRONYM,
    token,
    side,
    amount,
    price,
  })
}
