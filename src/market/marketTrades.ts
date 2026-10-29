import { db } from '../db.js'

/** A fill as the `trade` event shows it: order ids, not students, so a server can mark its
 *  own trades without learning who the other party was. */
export interface MarketTrade {
  buyOrderId: string
  sellOrderId: string
  token: string
  side: string
  amount: number
  price: number
  total: number
  timestamp: string
}

interface MarketTradeRow {
  buy_order_id: string
  sell_order_id: string
  token: string
  side: string
  amount: number
  price: number
  total: number
  timestamp: string
}

/** Saves a fill, so a page that opens later can show the latest trades. recordPrices deletes
 *  the ones older than a day. */
export function recordMarketTrade(t: MarketTrade): void {
  db.prepare(
    `INSERT INTO market_trades (token, buy_order_id, sell_order_id, side, amount, price, total, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(t.token, t.buyOrderId, t.sellOrderId, t.side, t.amount, t.price, t.total, t.timestamp)
}

/** The token's latest fills, newest first. */
export function recentTrades(token: string, limit: number): MarketTrade[] {
  const rows = db
    .prepare(`SELECT * FROM market_trades WHERE token = ? ORDER BY id DESC LIMIT ?`)
    .all(token, limit) as MarketTradeRow[]
  return rows.map((r) => ({
    buyOrderId: r.buy_order_id,
    sellOrderId: r.sell_order_id,
    token: r.token,
    side: r.side,
    amount: r.amount,
    price: r.price,
    total: r.total,
    timestamp: r.timestamp,
  }))
}
