import type { Response } from 'express'
import { tokens } from './tokens.js'

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
    const change = token.price * (Math.random() * 0.04 - 0.02)
    token.price = Math.max(0.01, +(token.price + change).toFixed(2))
    broadcast('price', { token: token.id, price: token.price, timestamp: new Date().toISOString() })
  }, 3000)
}
