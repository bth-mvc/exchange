import type { Response } from 'express'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { addSseClient, removeSseClient, broadcast, startPriceSimulator } from './simulator.js'
import { tokens } from './tokens.js'

function fakeClient() {
  return { write: vi.fn() } as unknown as Response
}

describe('broadcast', () => {
  it('writes an SSE-formatted message to every registered client', () => {
    const client = fakeClient()
    addSseClient(client)

    broadcast('price', { token: 'FIKA', price: 12.34 })

    expect(client.write).toHaveBeenCalledWith(
      `event: price\ndata: ${JSON.stringify({ token: 'FIKA', price: 12.34 })}\n\n`,
    )
    removeSseClient(client)
  })

  it('stops writing to a client after it has been removed', () => {
    const client = fakeClient()
    addSseClient(client)
    removeSseClient(client)

    broadcast('price', { token: 'FIKA', price: 1 })

    expect(client.write).not.toHaveBeenCalled()
  })
})

describe('startPriceSimulator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('moves a token price by at most 2% and broadcasts a price event', () => {
    const client = fakeClient()
    addSseClient(client)
    const before = tokens.map((t) => t.price)

    startPriceSimulator()
    vi.advanceTimersByTime(3000)

    expect(client.write).toHaveBeenCalledTimes(1)
    const [[message]] = (client.write as ReturnType<typeof vi.fn>).mock.calls
    expect(message).toMatch(/^event: price\ndata: /)

    const data = JSON.parse(message.split('data: ')[1]) as { token: string; price: number }
    const token = tokens.find((t) => t.id === data.token)
    expect(token).toBeDefined()
    const originalPrice = before[tokens.indexOf(token!)]
    expect(token!.price).toBeCloseTo(data.price)
    expect(Math.abs(token!.price - originalPrice)).toBeLessThanOrEqual(originalPrice * 0.02 + 0.01)
    expect(token!.price).toBeGreaterThan(0)

    removeSseClient(client)
  })
})
