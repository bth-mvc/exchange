import { db, ensureStudent } from '../db.js'
import { env } from '../config/env.js'
import { nextId } from '../idGen.js'
import { placeAndMatch } from './matching.js'
import { tokens } from './tokens.js'

const MM_ACRONYM = env.MARKET_MAKER_ACRONYM

/** Liquidity floor: keeps a two-sided quote resting around the reference price for every token. */
export function runMarketMakerSweep(): void {
  ensureStudent(MM_ACRONYM)
  db.prepare(`DELETE FROM orders WHERE acronym = ? AND status = 'open'`).run(MM_ACRONYM)

  for (const token of tokens) {
    const spread = token.price * env.MARKET_MAKER_SPREAD_PCT
    quote(token.id, 'buy', +(token.price - spread).toFixed(2))
    quote(token.id, 'sell', +(token.price + spread).toFixed(2))
  }
}

/** Places one side of the MM's quote through the normal matching path, so it can immediately
 *  cross a favorably priced resting order instead of just sitting next to it unmatched. */
function quote(token: string, side: 'buy' | 'sell', price: number): void {
  placeAndMatch(nextId('order'), {
    acronym: MM_ACRONYM,
    token,
    side,
    amount: env.MARKET_MAKER_QUOTE_AMOUNT,
    price,
  })
}
