import { db, ensureStudent } from '../db.js'
import type { OrderRow } from '../db.js'
import { nextId } from '../idGen.js'
import { enqueueOrderFilled } from '../webhook/queue.js'
import { broadcast } from './simulator.js'
import { nudgePrice } from './tokens.js'

export interface PlaceOrderInput {
  acronym: string
  token: string
  side: 'buy' | 'sell'
  amount: number
  price: number
  userId?: string
}

function getOrder(id: string): OrderRow {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow
}

export function insertOrder(id: string, input: PlaceOrderInput): OrderRow {
  db.prepare(
    `INSERT INTO orders (id, acronym, token, side, price, amount, remaining, status, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
  ).run(
    id,
    input.acronym,
    input.token,
    input.side,
    input.price,
    input.amount,
    input.amount,
    input.userId ?? null,
  )
  return getOrder(id)
}

function findCrossingMaker(taker: OrderRow): OrderRow | undefined {
  const makerSide = taker.side === 'buy' ? 'sell' : 'buy'
  const priceCompare = taker.side === 'buy' ? '<=' : '>='
  const orderBy = taker.side === 'buy' ? 'price ASC, rowid ASC' : 'price DESC, rowid ASC'

  return db
    .prepare(
      `SELECT * FROM orders
       WHERE token = ? AND side = ? AND status = 'open' AND remaining > 0
         AND acronym != ? AND price ${priceCompare} ?
       ORDER BY ${orderBy}
       LIMIT 1`,
    )
    .get(taker.token, makerSide, taker.acronym, taker.price) as OrderRow | undefined
}

/** Settles one party's side of a fill: trade row, holdings/balance, order remaining, webhook. */
export function settleFill(
  order: OrderRow,
  amount: number,
  price: number,
  timestamp: string,
): void {
  const total = amount * price
  ensureStudent(order.acronym)

  const tradeId = nextId('trade')
  db.prepare(
    `INSERT INTO trades (id, acronym, token, side, amount, price, total, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(tradeId, order.acronym, order.token, order.side, amount, price, total, timestamp)

  if (order.side === 'buy') {
    db.prepare(
      `INSERT INTO holdings (acronym, token, amount) VALUES (?, ?, ?)
       ON CONFLICT(acronym, token) DO UPDATE SET amount = amount + excluded.amount`,
    ).run(order.acronym, order.token, amount)
    db.prepare(`UPDATE students SET balance = balance - ? WHERE acronym = ?`).run(
      total,
      order.acronym,
    )
  } else {
    db.prepare(
      // Only the market maker can sell more than it holds; it then goes short (negative).
      `INSERT INTO holdings (acronym, token, amount) VALUES (?, ?, -?)
       ON CONFLICT(acronym, token) DO UPDATE SET amount = amount + excluded.amount`,
    ).run(order.acronym, order.token, amount)
    db.prepare(`UPDATE students SET balance = balance + ? WHERE acronym = ?`).run(
      total,
      order.acronym,
    )
  }

  const remaining = order.remaining - amount
  const status = remaining <= 0 ? 'filled' : 'open'
  db.prepare(`UPDATE orders SET remaining = ?, status = ? WHERE id = ?`).run(
    remaining,
    status,
    order.id,
  )
  order.remaining = remaining
  order.status = status

  enqueueOrderFilled(order, amount, price, timestamp)
}

/**
 * Why a student cannot place an order, or undefined if they can. Open orders
 * reserve what they may still spend (buy) or deliver (sell).
 */
export function insufficientFunds(
  acronym: string,
  token: string,
  side: 'buy' | 'sell',
  amount: number,
  price: number,
): string | undefined {
  ensureStudent(acronym)

  if (side === 'buy') {
    const { balance } = db
      .prepare(`SELECT balance FROM students WHERE acronym = ?`)
      .get(acronym) as {
      balance: number
    }
    const { reserved } = db
      .prepare(
        `SELECT COALESCE(SUM(remaining * price), 0) AS reserved FROM orders
         WHERE acronym = ? AND side = 'buy' AND status = 'open'`,
      )
      .get(acronym) as { reserved: number }
    const available = balance - reserved
    return amount * price > available + 1e-9
      ? `Insufficient balance: the order costs ${+(amount * price).toFixed(2)}, available ${+available.toFixed(2)}`
      : undefined
  }

  const holding = db
    .prepare(`SELECT amount FROM holdings WHERE acronym = ? AND token = ?`)
    .get(acronym, token) as { amount: number } | undefined
  const { reserved } = db
    .prepare(
      `SELECT COALESCE(SUM(remaining), 0) AS reserved FROM orders
       WHERE acronym = ? AND token = ? AND side = 'sell' AND status = 'open'`,
    )
    .get(acronym, token) as { reserved: number }
  const available = (holding?.amount ?? 0) - reserved
  return amount > available
    ? `Insufficient holdings: the order sells ${amount} ${token}, available ${available}`
    : undefined
}

/** Matches an inserted order against the resting book on price/time priority. */
export function matchOrder(id: string): void {
  const run = db.transaction(() => {
    let taker = getOrder(id)

    while (taker.remaining > 0) {
      const maker = findCrossingMaker(taker)
      if (!maker) break

      const fillAmount = Math.min(taker.remaining, maker.remaining)
      const fillPrice = maker.price
      const timestamp = new Date().toISOString()

      settleFill(maker, fillAmount, fillPrice, timestamp)
      settleFill(taker, fillAmount, fillPrice, timestamp)
      nudgePrice(taker.token, fillPrice, fillAmount * fillPrice)
      broadcast('trade', {
        token: taker.token,
        side: taker.side,
        amount: fillAmount,
        price: fillPrice,
        total: fillAmount * fillPrice,
        timestamp,
      })

      taker = getOrder(taker.id)
    }
  })

  run()
}

/** Inserts an order and matches it against the resting book. */
export function placeAndMatch(id: string, input: PlaceOrderInput): void {
  insertOrder(id, input)
  matchOrder(id)
}
