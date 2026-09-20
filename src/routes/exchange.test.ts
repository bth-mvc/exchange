import type { Response } from 'express'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { db } from '../db.js'
import type { OrderRow, TradeRow } from '../db.js'

vi.mock('../webhook/sender.js', () => ({ sendWebhook: vi.fn() }))

function flush() {
  return new Promise((resolve) => setImmediate(resolve))
}

function fakeSseClient() {
  return { write: vi.fn() } as unknown as Response
}

async function mockStudent(acronym: string, webhookSecret = 'test-secret-16-chars') {
  const { apiKeyAuth } = await import('../middleware/apiKeyAuth.js')
  vi.mocked(apiKeyAuth).mockImplementationOnce(async (_req, res, next) => {
    res.locals.student = { acronym, webhookUrl: 'http://localhost:9999/wh', webhookSecret }
    next()
  })
}

// Mock apiKeyAuth so tests don't call the real api-server
vi.mock('../middleware/apiKeyAuth.js', () => ({
  apiKeyAuth: vi.fn((_req, res, next) => {
    res.locals.student = {
      acronym: 'tst',
      webhookUrl: 'http://localhost:9999/wh',
      webhookSecret: 'test-secret-16-chars',
    }
    next()
  }),
}))

// Import app after mock is set up
const { app } = await import('../app.js')

beforeEach(async () => {
  db.prepare('DELETE FROM orders').run()
  db.prepare('DELETE FROM trades').run()
  db.prepare('DELETE FROM holdings').run()
  db.prepare('DELETE FROM students').run()
  const { sendWebhook } = await import('../webhook/sender.js')
  vi.mocked(sendWebhook).mockClear()
})

describe('GET /assets', () => {
  it('returns token list', async () => {
    const res = await request(app).get('/assets').set('X-Api-Key', 'any')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(6)
    expect(res.body[0]).toHaveProperty('id')
    expect(res.body[0]).toHaveProperty('price')
  })
})

describe('GET /assets/:id/orderbook', () => {
  it('returns an empty book when no orders are resting', async () => {
    const res = await request(app).get('/assets/FIKA/orderbook').set('X-Api-Key', 'any')
    expect(res.status).toBe(200)
    expect(res.body.token).toBe('FIKA')
    expect(res.body.bids).toEqual([])
    expect(res.body.asks).toEqual([])
  })

  it('reflects a resting order that has no counterparty', async () => {
    await mockStudent('aaa')
    await request(app).post('/orders').set('X-Api-Key', 'a').send({
      token: 'FIKA',
      side: 'buy',
      amount: 5,
      price: 9.5,
    })
    await flush()

    const res = await request(app).get('/assets/FIKA/orderbook').set('X-Api-Key', 'any')
    expect(res.body.bids).toEqual([{ price: 9.5, amount: 5, side: 'buy' }])
    expect(res.body.asks).toEqual([])
  })

  it('aggregates multiple resting orders at the same price into one book level', async () => {
    await mockStudent('bka')
    await request(app).post('/orders').set('X-Api-Key', 'ba').send({
      token: 'MEME',
      side: 'buy',
      amount: 100,
      price: 0.5,
    })
    await mockStudent('bkb')
    await request(app).post('/orders').set('X-Api-Key', 'bb').send({
      token: 'MEME',
      side: 'buy',
      amount: 50,
      price: 0.5,
    })
    await flush()

    const res = await request(app).get('/assets/MEME/orderbook').set('X-Api-Key', 'any')
    expect(res.body.bids).toEqual([{ price: 0.5, amount: 150, side: 'buy' }])
  })

  it('returns 404 for unknown token', async () => {
    const res = await request(app).get('/assets/UNKNOWN/orderbook').set('X-Api-Key', 'any')
    expect(res.status).toBe(404)
  })
})

describe('POST /orders', () => {
  it('returns 201 with order details', async () => {
    const res = await request(app).post('/orders').set('X-Api-Key', 'any').send({
      token: 'FIKA',
      side: 'buy',
      amount: 5,
      price: 10.0,
    })
    expect(res.status).toBe(201)
    expect(res.body.id).toMatch(/^order-/)
    expect(res.body.status).toBe('open')
  })

  it('returns 400 for unknown token', async () => {
    const res = await request(app).post('/orders').set('X-Api-Key', 'any').send({
      token: 'UNKNOWN',
      side: 'buy',
      amount: 5,
      price: 10.0,
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing fields', async () => {
    const res = await request(app).post('/orders').set('X-Api-Key', 'any').send({ token: 'FIKA' })
    expect(res.status).toBe(400)
  })
})

describe('POST /orders — matching', () => {
  it('matches two crossing orders from different students', async () => {
    await mockStudent('aaa')
    const sell = await request(app).post('/orders').set('X-Api-Key', 'a').send({
      token: 'FIKA',
      side: 'sell',
      amount: 10,
      price: 10.0,
    })
    expect(sell.status).toBe(201)

    await mockStudent('bbb')
    const buy = await request(app).post('/orders').set('X-Api-Key', 'b').send({
      token: 'FIKA',
      side: 'buy',
      amount: 10,
      price: 10.0,
    })
    expect(buy.status).toBe(201)

    await flush()

    const trades = db.prepare('SELECT * FROM trades').all() as TradeRow[]
    expect(trades).toHaveLength(2)
    expect(trades.map((t) => t.acronym).sort()).toEqual(['aaa', 'bbb'])
    expect(trades.every((t) => t.price === 10 && t.amount === 10)).toBe(true)

    const orders = db.prepare('SELECT * FROM orders').all() as OrderRow[]
    expect(orders.every((o) => o.status === 'filled' && o.remaining === 0)).toBe(true)
  })

  it('does not match a student against their own resting order', async () => {
    await mockStudent('aaa')
    await request(app).post('/orders').set('X-Api-Key', 'a').send({
      token: 'FIKA',
      side: 'sell',
      amount: 10,
      price: 10.0,
    })
    await mockStudent('aaa')
    await request(app).post('/orders').set('X-Api-Key', 'a').send({
      token: 'FIKA',
      side: 'buy',
      amount: 10,
      price: 10.0,
    })
    await flush()

    const orders = db.prepare('SELECT * FROM orders').all() as OrderRow[]
    expect(orders.every((o) => o.status === 'open')).toBe(true)
    expect(db.prepare('SELECT * FROM trades').all()).toEqual([])
  })

  it('fills a taker across multiple resting makers, partially if needed', async () => {
    await mockStudent('ddd')
    await request(app).post('/orders').set('X-Api-Key', 'd').send({
      token: 'FIKA',
      side: 'sell',
      amount: 10,
      price: 10.5,
    })
    await mockStudent('eee')
    await request(app).post('/orders').set('X-Api-Key', 'e').send({
      token: 'FIKA',
      side: 'sell',
      amount: 15,
      price: 10.8,
    })
    await mockStudent('ccc')
    const buy = await request(app).post('/orders').set('X-Api-Key', 'c').send({
      token: 'FIKA',
      side: 'buy',
      amount: 30,
      price: 11.0,
    })
    const takerId = buy.body.id as string

    await flush()

    const orders = db.prepare('SELECT * FROM orders').all() as OrderRow[]
    const taker = orders.find((o) => o.id === takerId)!
    expect(taker.status).toBe('open')
    expect(taker.remaining).toBe(5)

    const makers = orders.filter((o) => o.id !== takerId)
    expect(makers.every((o) => o.status === 'filled')).toBe(true)

    const cccTrades = db.prepare('SELECT * FROM trades WHERE acronym = ?').all('ccc') as TradeRow[]
    expect(cccTrades).toHaveLength(2)
    expect(cccTrades.map((t) => t.amount).sort((a, b) => a - b)).toEqual([10, 15])
  })

  it('sends one webhook per fill with a stable orderId and userId passthrough', async () => {
    const { sendWebhook } = await import('../webhook/sender.js')

    await mockStudent('mkr')
    await request(app).post('/orders').set('X-Api-Key', 'm').send({
      token: 'FIKA',
      side: 'sell',
      amount: 4,
      price: 10.0,
    })
    await mockStudent('mkr2')
    await request(app).post('/orders').set('X-Api-Key', 'm2').send({
      token: 'FIKA',
      side: 'sell',
      amount: 6,
      price: 10.0,
    })
    await mockStudent('tkr')
    const buy = await request(app).post('/orders').set('X-Api-Key', 't').send({
      token: 'FIKA',
      side: 'buy',
      amount: 10,
      price: 10.0,
      userId: 'user-42',
    })
    const takerId = buy.body.id as string

    await flush()

    interface WebhookPayload {
      event: string
      data: { orderId: string; userId?: string; amount: number }
    }
    const takerWebhooks = vi
      .mocked(sendWebhook)
      .mock.calls.map(([, , payload]) => payload as unknown as WebhookPayload)
      .filter((payload) => payload.data.orderId === takerId)

    expect(takerWebhooks).toHaveLength(2)
    expect(takerWebhooks.every((p) => p.event === 'order.filled')).toBe(true)
    expect(takerWebhooks.every((p) => p.data.userId === 'user-42')).toBe(true)
    expect(takerWebhooks.map((p) => p.data.amount).sort((a, b) => a - b)).toEqual([4, 6])
  })

  it('broadcasts an SSE trade event for a real match', async () => {
    const { addSseClient, removeSseClient } = await import('../market/simulator.js')
    const client = fakeSseClient()
    addSseClient(client)

    await mockStudent('ssea')
    await request(app).post('/orders').set('X-Api-Key', 'sa').send({
      token: 'YOLO',
      side: 'sell',
      amount: 3,
      price: 4.2,
    })
    await mockStudent('sseb')
    await request(app).post('/orders').set('X-Api-Key', 'sb').send({
      token: 'YOLO',
      side: 'buy',
      amount: 3,
      price: 4.2,
    })
    await flush()

    removeSseClient(client)

    const tradeMessage = (client.write as ReturnType<typeof vi.fn>).mock.calls
      .map(([message]) => message as string)
      .find((message) => message.startsWith('event: trade'))

    expect(tradeMessage).toBeDefined()
    const data = JSON.parse(tradeMessage!.split('data: ')[1]) as {
      token: string
      amount: number
      price: number
    }
    expect(data).toMatchObject({ token: 'YOLO', amount: 3, price: 4.2 })
  })

  it('updates the token reference price from a real trade', async () => {
    const { getToken } = await import('../market/tokens.js')

    await mockStudent('pxa')
    await request(app).post('/orders').set('X-Api-Key', 'pa').send({
      token: 'SUDO',
      side: 'sell',
      amount: 2,
      price: 27.5,
    })
    await mockStudent('pxb')
    await request(app).post('/orders').set('X-Api-Key', 'pb').send({
      token: 'SUDO',
      side: 'buy',
      amount: 2,
      price: 27.5,
    })
    await flush()

    expect(getToken('SUDO')?.price).toBe(27.5)
  })
})

describe('GET /trades', () => {
  it('returns empty trades initially', async () => {
    const res = await request(app).get('/trades').set('X-Api-Key', 'any')
    expect(res.status).toBe(200)
    expect(res.body.trades).toEqual([])
    expect(res.body.cursor).toBeNull()
  })
})

describe('GET /portfolio', () => {
  it('returns default portfolio for new student', async () => {
    const res = await request(app).get('/portfolio').set('X-Api-Key', 'any')
    expect(res.status).toBe(200)
    expect(res.body.balance).toBe(10000)
    expect(res.body.holdings).toEqual([])
  })
})

describe('GET /leaderboard', () => {
  interface LeaderboardEntry {
    acronym: string
    buys: number
    sells: number
  }

  it('returns empty list when no students', async () => {
    const res = await request(app).get('/leaderboard').set('X-Api-Key', 'any')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('reflects buy/sell counts after real trades', async () => {
    await mockStudent('lba')
    await request(app).post('/orders').set('X-Api-Key', 'la').send({
      token: 'HODL',
      side: 'sell',
      amount: 1,
      price: 100,
    })
    await mockStudent('lbb')
    await request(app).post('/orders').set('X-Api-Key', 'lb').send({
      token: 'HODL',
      side: 'buy',
      amount: 1,
      price: 100,
    })
    await flush()

    const res = await request(app).get('/leaderboard').set('X-Api-Key', 'any')
    const entries = res.body as LeaderboardEntry[]
    const seller = entries.find((e) => e.acronym === 'lba')
    const buyer = entries.find((e) => e.acronym === 'lbb')

    expect(seller).toMatchObject({ buys: 0, sells: 1 })
    expect(buyer).toMatchObject({ buys: 1, sells: 0 })
  })
})

describe('GET /market/feed', () => {
  it('returns 401 without API key', async () => {
    // Reset mock for this test to simulate missing key
    const { apiKeyAuth } = await import('../middleware/apiKeyAuth.js')
    vi.mocked(apiKeyAuth).mockImplementationOnce(async (_req, res, _next) => {
      res.status(401).json({ error: 'Missing API key' })
    })
    const res = await request(app).get('/market/feed')
    expect(res.status).toBe(401)
  })
})
