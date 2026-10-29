import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db.js'
import type { OrderRow, TradeRow } from '../db.js'
import { env } from '../config/env.js'

const { placeAndMatch } = await import('./matching.js')
const { runMarketMakerSweep, quoteAmount } = await import('./marketMaker.js')
const { getToken } = await import('./tokens.js')

const MM = env.MARKET_MAKER_ACRONYM

function mmOrders(token: string): OrderRow[] {
  return db
    .prepare(`SELECT * FROM orders WHERE acronym = ? AND token = ? ORDER BY side`)
    .all(MM, token) as OrderRow[]
}

/** The market maker's best bid and best ask: the levels closest to the reference price. */
function bestQuotes(token: string): { bid: OrderRow; ask: OrderRow } {
  const orders = mmOrders(token)
  const bids = orders.filter((o) => o.side === 'buy').sort((a, b) => b.price - a.price)
  const asks = orders.filter((o) => o.side === 'sell').sort((a, b) => a.price - b.price)
  return { bid: bids[0], ask: asks[0] }
}

function sides(token: string): string[] {
  return [...new Set(mmOrders(token).map((o) => o.side))]
}

beforeEach(() => {
  db.prepare('DELETE FROM orders').run()
  db.prepare('DELETE FROM trades').run()
  db.prepare('DELETE FROM holdings').run()
  db.prepare('DELETE FROM students').run()
  db.prepare('DELETE FROM webhooks').run()
})

describe('runMarketMakerSweep', () => {
  it('quotes a two-sided book around the reference price', () => {
    runMarketMakerSweep()

    const { bid, ask } = bestQuotes('FIKA')
    expect(bid.price).toBeLessThan(10.0)
    expect(ask.price).toBeGreaterThan(10.0)
    expect(bid.remaining).toBe(quoteAmount(10.0))
    expect(ask.remaining).toBe(quoteAmount(10.0))
  })

  it('quotes a ladder: each level further out and larger', () => {
    runMarketMakerSweep()

    const asks = mmOrders('FIKA')
      .filter((o) => o.side === 'sell')
      .sort((a, b) => a.price - b.price)
    expect(asks).toHaveLength(env.MARKET_MAKER_LEVELS)
    for (let i = 1; i < asks.length; i++) {
      expect(asks[i].price).toBeGreaterThan(asks[i - 1].price)
      expect(asks[i].remaining).toBeGreaterThan(asks[i - 1].remaining)
    }
  })

  it('quotes wider while a big news event moves the token', () => {
    const hodl = getToken('HODL')!
    runMarketMakerSweep()
    const normal = bestQuotes('HODL')
    hodl.inEvent = true
    runMarketMakerSweep()
    hodl.inEvent = false
    const wide = bestQuotes('HODL')

    const spread = (q: { bid: OrderRow; ask: OrderRow }) => q.ask.price - q.bid.price
    expect(spread(wide)).toBeCloseTo(spread(normal) * env.MARKET_MAKER_EVENT_SPREAD_FACTOR)
  })

  it('sizes each quote by value, so cheap tokens get more units', () => {
    expect(quoteAmount(10.0)).toBe(Math.round(env.MARKET_MAKER_QUOTE_VALUE / 10))
    expect(quoteAmount(0.69)).toBeGreaterThan(quoteAmount(100.0))
    expect(quoteAmount(env.MARKET_MAKER_QUOTE_VALUE * 10)).toBe(1)
  })

  it('replaces stale quotes instead of accumulating them', () => {
    runMarketMakerSweep()
    runMarketMakerSweep()

    expect(mmOrders('FIKA')).toHaveLength(2 * env.MARKET_MAKER_LEVELS)
  })

  it('registers the market maker as a visible student', () => {
    runMarketMakerSweep()

    const row = db.prepare('SELECT * FROM students WHERE acronym = ?').get(MM)
    expect(row).toBeTruthy()
  })

  it('leaves a student order resting when its price is outside the MM spread', () => {
    runMarketMakerSweep()

    placeAndMatch('order-lowball', {
      acronym: 'aaa',
      token: 'FIKA',
      side: 'buy',
      amount: 5,
      price: 1.0,
    })

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get('order-lowball') as OrderRow
    expect(order.status).toBe('open')
    expect(order.remaining).toBe(5)
  })

  it('fills a student order that crosses the MM quote', () => {
    runMarketMakerSweep()
    const mmSell = bestQuotes('FIKA').ask

    placeAndMatch('order-cross', {
      acronym: 'aaa',
      token: 'FIKA',
      side: 'buy',
      amount: 5,
      price: mmSell.price,
    })

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get('order-cross') as OrderRow
    expect(order.status).toBe('filled')

    const trades = db.prepare('SELECT * FROM trades WHERE acronym = ?').all(MM) as TradeRow[]
    expect(trades).toHaveLength(1)
    // Only the student gets a webhook, not the market maker.
    expect(db.prepare('SELECT acronym FROM webhooks').all()).toEqual([{ acronym: 'aaa' }])
  })

  it('fills a student order that crosses its quote, at the student price', () => {
    placeAndMatch('order-cheap-sell', {
      acronym: 'aaa',
      token: 'FIKA',
      side: 'sell',
      amount: 5,
      price: 9.5,
    })

    runMarketMakerSweep()

    const order = db
      .prepare('SELECT * FROM orders WHERE id = ?')
      .get('order-cheap-sell') as OrderRow
    expect(order.status).toBe('filled')
    const trade = db.prepare('SELECT * FROM trades WHERE acronym = ?').get('aaa') as TradeRow
    expect(trade.price).toBe(9.5)
    expect(db.prepare('SELECT acronym FROM webhooks').all()).toEqual([{ acronym: 'aaa' }])
  })

  it('keeps a full book on the side that crossed a student order', () => {
    placeAndMatch('order-high-bid', {
      acronym: 'aaa',
      token: 'FIKA',
      side: 'buy',
      amount: 5,
      price: 10.5,
    })

    runMarketMakerSweep()

    const asks = mmOrders('FIKA').filter((o) => o.side === 'sell')
    expect(asks).toHaveLength(env.MARKET_MAKER_LEVELS)
    // The level that traded rests with what is left of it
    expect(Math.min(...asks.map((o) => o.remaining))).toBe(quoteAmount(10.0) - 5)
  })

  it('keeps what is left of a level after a trade, and refills it a little per sweep', () => {
    runMarketMakerSweep()
    const ask = bestQuotes('FIKA').ask
    placeAndMatch('order-take', {
      acronym: 'aaa',
      token: 'FIKA',
      side: 'buy',
      amount: 100,
      price: ask.price,
    })

    runMarketMakerSweep()

    const refill = Math.ceil(ask.amount * env.MARKET_MAKER_REFILL_PCT)
    expect(bestQuotes('FIKA').ask.remaining).toBe(ask.amount - 100 + refill)
  })

  it('goes short when it sells more than it holds', () => {
    runMarketMakerSweep()
    const mmSell = bestQuotes('FIKA').ask

    placeAndMatch('order-buy', {
      acronym: 'aaa',
      token: 'FIKA',
      side: 'buy',
      amount: 5,
      price: mmSell.price,
    })

    const row = db
      .prepare('SELECT amount FROM holdings WHERE acronym = ? AND token = ?')
      .get(MM, 'FIKA') as { amount: number }
    expect(row.amount).toBe(-5)
  })

  it('stops buying a token when its position is at the limit', () => {
    runMarketMakerSweep()
    const units = env.MARKET_MAKER_MAX_POSITION_VALUE / 10
    db.prepare('INSERT INTO holdings (acronym, token, amount) VALUES (?, ?, ?)').run(
      MM,
      'FIKA',
      units,
    )

    runMarketMakerSweep()

    expect(sides('FIKA')).toEqual(['sell'])
  })
})
