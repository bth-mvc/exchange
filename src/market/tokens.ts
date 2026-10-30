import { env } from '../config/env.js'

export interface Token {
  id: string
  name: string
  type: 'stable' | 'volatile' | 'yield'
  /** Reference price: what the market shows, what the market maker quotes around and what
   *  holdings are valued at. Trades nudge it, they do not set it. */
  price: number
  /** Where the price simulator pulls the reference price back to over time. Big news events
   *  and trends move it, so a new level lasts; it drifts slowly back towards the anchor. */
  basePrice: number
  /** The price the token started the course at. */
  startPrice: number
  /** Where the base price drifts back to and big events lean towards: the start price, until a
   *  trend moves it. */
  anchor: number
  /** A slow drift of the anchor and base price, a fraction per day, until `endsAt` (ms). */
  trend?: { pctPerDay: number; endsAt: number }
  /** True while a big news event moves the price; the market maker quotes wider meanwhile. */
  inEvent?: boolean
}

export const tokens: Token[] = [
  { id: 'FIKA', name: 'Fika Token', type: 'stable', price: 10.0 },
  { id: 'SUDO', name: 'Sudo Token', type: 'stable', price: 25.0 },
  { id: 'YOLO', name: 'Yolo Token', type: 'volatile', price: 4.2 },
  { id: 'DEPLOY', name: 'Deploy Token', type: 'volatile', price: 42.0 },
  { id: 'MEME', name: 'Meme Token', type: 'volatile', price: 0.69 },
  { id: 'HODL', name: 'Hodl Token', type: 'yield', price: 100.0 },
].map((t) => ({
  ...t,
  type: t.type as Token['type'],
  basePrice: t.price,
  startPrice: t.price,
  anchor: t.price,
}))

export function getToken(id: string): Token | undefined {
  return tokens.find((t) => t.id === id.toUpperCase())
}

export function currentPrice(tokenId: string): number {
  return getToken(tokenId)?.price ?? 0
}

export function setPrice(tokenId: string, price: number): void {
  const token = getToken(tokenId)
  if (token) {
    token.price = Math.max(0.01, +price.toFixed(2))
  }
}

/** Moves the reference price a step towards a trade's price. A fill worth a full market maker
 *  quote moves it PRICE_IMPACT of the way, a smaller fill less, so one trade between two
 *  students at an odd price cannot drag the market along. */
export function nudgePrice(tokenId: string, tradePrice: number, tradeValue: number): void {
  const token = getToken(tokenId)
  if (!token) return
  const weight = Math.min(1, tradeValue / env.MARKET_MAKER_QUOTE_VALUE) * env.PRICE_IMPACT
  setPrice(tokenId, token.price + (tradePrice - token.price) * weight)
}

/** Why an order's price is refused, or undefined if it is within the band around the
 *  reference price. Keeps orders near the market, so prices cannot be pushed with odd orders. */
export function outsidePriceBand(tokenId: string, price: number): string | undefined {
  const reference = currentPrice(tokenId)
  const low = +(reference * (1 - env.PRICE_BAND_PCT)).toFixed(2)
  const high = +(reference * (1 + env.PRICE_BAND_PCT)).toFixed(2)
  return price < low || price > high
    ? `Price ${price} is outside the allowed band ${low}-${high} around the market price ${reference}`
    : undefined
}
