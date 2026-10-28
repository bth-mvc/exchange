import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db.js'
import { recordPrices, loadTokenState, priceHistory } from './history.js'
import { tokens, getToken } from './tokens.js'

const original = tokens.map((t) => ({ ...t }))

beforeEach(() => {
  db.prepare('DELETE FROM price_ticks').run()
  db.prepare('DELETE FROM price_days').run()
  db.prepare('DELETE FROM token_state').run()
  tokens.forEach((t, i) => Object.assign(t, original[i]))
})

/** Records FIKA at each price, `stepMs` apart, starting at `start`. */
function record(start: string, stepMs: number, prices: number[]): Date {
  let at = new Date(start)
  for (const price of prices) {
    getToken('FIKA')!.price = price
    recordPrices(at)
    at = new Date(at.getTime() + stepMs)
  }
  return new Date(at.getTime() - stepMs)
}

describe('priceHistory', () => {
  it('10m returns every tick of the last ten minutes, oldest first', () => {
    const now = record(
      '2026-10-28T12:00:00Z',
      60_000,
      [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
    )
    const points = priceHistory('FIKA', '10m', now)
    expect(points.map((p) => p.price)).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 21])
  })

  it('1d returns the last price in each five minutes', () => {
    const now = record('2026-10-28T12:00:00Z', 60_000, [10, 11, 12, 13, 14, 15, 16])
    expect(priceHistory('FIKA', '1d', now).map((p) => p.price)).toEqual([14, 16])
  })

  it('30d returns each day closing price', () => {
    record('2026-10-27T10:00:00Z', 3_600_000, [10, 11])
    const now = record('2026-10-28T10:00:00Z', 3_600_000, [12, 13])
    expect(priceHistory('FIKA', '30d', now)).toEqual([
      { timestamp: '2026-10-27', price: 11 },
      { timestamp: '2026-10-28', price: 13 },
    ])
  })

  it('keeps ticks for a day only', () => {
    record('2026-10-27T10:00:00Z', 1000, [10])
    record('2026-10-28T11:00:00Z', 1000, [11])
    const count = db.prepare(`SELECT COUNT(*) AS n FROM price_ticks WHERE token = 'FIKA'`).get()
    expect(count).toEqual({ n: 1 })
  })
})

describe('loadTokenState', () => {
  it('puts back price and base price after a restart', () => {
    const yolo = getToken('YOLO')!
    yolo.price = 5.5
    yolo.basePrice = 5.25
    recordPrices()
    yolo.price = 4.2
    yolo.basePrice = 4.2

    loadTokenState()
    expect(yolo.price).toBe(5.5)
    expect(yolo.basePrice).toBe(5.25)
    expect(yolo.startPrice).toBe(4.2)
  })
})
