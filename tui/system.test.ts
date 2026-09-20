import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '../src/db.js'

vi.mock('../src/webhook/sender.js', () => ({ sendWebhook: vi.fn() }))

// Mock apiKeyAuth so the test server doesn't call the real api-server — same
// pattern as src/routes/exchange.test.ts, just imported from tui/'s location.
vi.mock('../src/middleware/apiKeyAuth.js', () => ({
  apiKeyAuth: vi.fn((_req, res, next) => {
    res.locals.student = {
      acronym: 'tst',
      webhookUrl: 'http://localhost:9999/wh',
      webhookSecret: 'test-secret-16-chars',
    }
    next()
  }),
}))

async function mockStudent(acronym: string) {
  const { apiKeyAuth } = await import('../src/middleware/apiKeyAuth.js')
  vi.mocked(apiKeyAuth).mockImplementationOnce(async (_req, res, next) => {
    res.locals.student = {
      acronym,
      webhookUrl: 'http://localhost:9999/wh',
      webhookSecret: 'test-secret-16-chars',
    }
    next()
  })
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve))
}

const { app } = await import('../src/app.js')
const { createRegistry } = await import('./registry.js')

let server: Server
let registry: ReturnType<typeof createRegistry>

// Real HTTP server on a random free port — the tui commands use fetch(), not
// supertest's in-process request, so this needs an actual listening socket.
beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  const port = (server.address() as AddressInfo).port
  process.env.EXCHANGE_URL = `http://localhost:${port}`
  process.env.API_KEY = 'any'
  registry = createRegistry()
})

afterAll(() => {
  server.close()
})

beforeEach(() => {
  db.prepare('DELETE FROM orders').run()
  db.prepare('DELETE FROM trades').run()
  db.prepare('DELETE FROM holdings').run()
  db.prepare('DELETE FROM students').run()
})

describe('tui commands against a real server', () => {
  it('reports server health', async () => {
    const res = await registry.dispatch(['server', 'health'])
    expect(res.ok).toBe(true)
    expect(res.message).toContain('Status: ok')
  })

  it('lists assets and rejects an unknown token orderbook lookup', async () => {
    const assets = await registry.dispatch(['market', 'assets'])
    expect(assets.message).toContain('FIKA')

    const missing = await registry.dispatch(['market', 'orderbook', 'NOPE'])
    expect(missing.ok).toBe(false)
    expect(missing.message).toContain('finns inte')
  })

  it('rejects an invalid order with a readable message instead of throwing', async () => {
    const res = await registry.dispatch(['orders', 'buy', 'FIKA', '-5', '11'])
    expect(res.ok).toBe(false)
    expect(res.status).toBe('fail')
    expect(res.message).toContain('positivt heltal')
  })

  it('runs a scripted session — sell, see it resting, cross it, then read it back', async () => {
    await mockStudent('sel')
    const sell = await registry.dispatch(['orders', 'sell', 'FIKA', '10', '11'])
    expect(sell.ok).toBe(true)
    expect(sell.message).toContain('Order lagd')
    await flush()

    const book = await registry.dispatch(['market', 'orderbook', 'FIKA'])
    expect(book.message).toContain('11.00')

    await mockStudent('byr')
    const buy = await registry.dispatch(['orders', 'buy', 'FIKA', '10', '11'])
    expect(buy.ok).toBe(true)
    await flush()

    await mockStudent('sel')
    const trades = await registry.dispatch(['trades', 'list'])
    expect(trades.message).toContain('FIKA')

    const board = await registry.dispatch(['board', 'show'])
    expect(board.message).toContain('sel')
    expect(board.message).toContain('byr')
  })
})
