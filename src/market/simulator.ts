import type { Response } from 'express'
import { env } from '../config/env.js'
import { tokens, setPrice } from './tokens.js'

const clients = new Set<Response>()

export function addSseClient(res: Response): void {
  clients.add(res)
}

export function removeSseClient(res: Response): void {
  clients.delete(res)
}

export function broadcast(event: string, data: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    res.write(message)
  }
}

export function startPriceSimulator(): void {
  setInterval(() => {
    const token = tokens[Math.floor(Math.random() * tokens.length)]
    const noise = token.price * (Math.random() * 0.04 - 0.02)
    const pull = (token.basePrice - token.price) * env.PRICE_REVERSION
    setPrice(token.id, token.price + noise + pull)
    broadcast('price', { token: token.id, price: token.price, timestamp: new Date().toISOString() })
  }, 3000)
}
