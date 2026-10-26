import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db.js'
import type { OrderRow, TradeRow } from '../db.js'
import { env } from '../config/env.js'

const { placeAndMatch } = await import('./matching.js')
const { runMarketMakerSweep, quoteAmount } = await import('./marketMaker.js')

const MM = env.MARKET_MAKER_ACRONYM

function mmOrders(token: string): OrderRow[] {
  return db
    .prepare(`SELECT * FROM orders WHERE acronym = ? AND token = ? ORDER BY side`)
    .all(MM, token) as OrderRow[]
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

    const [buy, sell] = mmOrders('FIKA')
    expect(buy.side).toBe('buy')
    expect(sell.side).toBe('sell')
    expect(buy.price).toBeLessThan(10.0)
    expect(sell.price).toBeGreaterThan(10.0)
    expect(buy.remaining).toBe(quoteAmount(10.0))
    expect(sell.remaining).toBe(quoteAmount(10.0))
  })

  it('sizes each quote by value, so cheap tokens get more units', () => {
    expect(quoteAmount(10.0)).toBe(Math.round(env.MARKET_MAKER_QUOTE_VALUE / 10))
    expect(quoteAmount(0.69)).toBeGreaterThan(quoteAmount(100.0))
    expect(quoteAmount(env.MARKET_MAKER_QUOTE_VALUE * 10)).toBe(1)
  })

  it('replaces stale quotes instead of accumulating them', () => {
    runMarketMakerSweep()
    runMarketMakerSweep()

    expect(mmOrders('FIKA')).toHaveLength(2)
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
    const [, mmSell] = mmOrders('FIKA')

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

  it('never takes a student order, it skips the side that would cross it', () => {
    placeAndMatch('order-cheap-sell', {
      acronym: 'aaa',
      token: 'FIKA',
      side: 'sell',
      amount: 5,
      price: 5.0,
    })

    runMarketMakerSweep()

    const order = db
      .prepare('SELECT * FROM orders WHERE id = ?')
      .get('order-cheap-sell') as OrderRow
    expect(order.status).toBe('open')
    expect(mmOrders('FIKA').map((o) => o.side)).toEqual(['sell'])
  })

  it('goes short when it sells more than it holds', () => {
    runMarketMakerSweep()
    const [, mmSell] = mmOrders('FIKA')

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

    expect(mmOrders('FIKA').map((o) => o.side)).toEqual(['sell'])
  })
})
