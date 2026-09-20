import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '../db.js'
import type { OrderRow, TradeRow } from '../db.js'
import { env } from '../config/env.js'

vi.mock('../webhook/sender.js', () => ({ sendWebhook: vi.fn() }))

const { placeAndMatch } = await import('./matching.js')
const { runMarketMakerSweep } = await import('./marketMaker.js')
const { sendWebhook } = await import('../webhook/sender.js')

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
  vi.mocked(sendWebhook).mockClear()
})

describe('runMarketMakerSweep', () => {
  it('quotes a two-sided book around the reference price', () => {
    runMarketMakerSweep()

    const [buy, sell] = mmOrders('FIKA')
    expect(buy.side).toBe('buy')
    expect(sell.side).toBe('sell')
    expect(buy.price).toBeLessThan(10.0)
    expect(sell.price).toBeGreaterThan(10.0)
    expect(buy.remaining).toBe(env.MARKET_MAKER_QUOTE_AMOUNT)
    expect(sell.remaining).toBe(env.MARKET_MAKER_QUOTE_AMOUNT)
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
      webhookUrl: 'http://localhost:9999/wh',
      webhookSecret: 'secret',
    })

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get('order-cross') as OrderRow
    expect(order.status).toBe('filled')

    const trades = db.prepare('SELECT * FROM trades WHERE acronym = ?').all(MM) as TradeRow[]
    expect(trades).toHaveLength(1)
    expect(sendWebhook).toHaveBeenCalledTimes(1)
  })

  it('opportunistically crosses a favorably priced resting order when requoting', () => {
    placeAndMatch('order-cheap-sell', {
      acronym: 'aaa',
      token: 'FIKA',
      side: 'sell',
      amount: 5,
      price: 5.0,
      webhookUrl: 'http://localhost:9999/wh',
      webhookSecret: 'secret',
    })

    runMarketMakerSweep()

    const order = db
      .prepare('SELECT * FROM orders WHERE id = ?')
      .get('order-cheap-sell') as OrderRow
    expect(order.status).toBe('filled')
  })
})
