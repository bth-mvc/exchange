import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db.js'
import { env } from '../config/env.js'

const { insertOrder } = await import('./matching.js')
const { orderbook } = await import('./orderbook.js')

beforeEach(() => {
  db.prepare('DELETE FROM orders').run()
  db.prepare('DELETE FROM students').run()
})

function rest(id: string, acronym: string, side: 'buy' | 'sell', amount: number, price: number) {
  insertOrder(id, { acronym, token: 'FIKA', side, amount, price })
}

describe('orderbook', () => {
  it('aggregates open orders by price, best price first on each side', () => {
    rest('b1', 'aaa', 'buy', 5, 9.8)
    rest('b2', 'bbb', 'buy', 3, 9.8)
    rest('b3', 'aaa', 'buy', 2, 9.9)
    rest('a1', 'aaa', 'sell', 4, 10.2)
    rest('a2', 'bbb', 'sell', 1, 10.1)

    const book = orderbook('FIKA')

    expect(book.bids.map((l) => [l.price, l.amount])).toEqual([
      [9.9, 2],
      [9.8, 8],
    ])
    expect(book.asks.map((l) => [l.price, l.amount])).toEqual([
      [10.1, 1],
      [10.2, 4],
    ])
  })

  it('marks the levels where the market maker has an order', () => {
    rest('s1', 'aaa', 'sell', 1, 10.1)
    rest('m1', env.MARKET_MAKER_ACRONYM, 'sell', 100, 10.2)
    rest('s2', 'aaa', 'sell', 1, 10.2)

    const book = orderbook('FIKA')

    expect(book.asks.map((l) => l.marketMaker)).toEqual([false, true])
  })
})
