import type { Response } from 'express'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createHmac } from 'node:crypto'
import { db } from '../db.js'
import type { OrderRow, TradeRow } from '../db.js'

function flush() {
  return new Promise((resolve) => setImmediate(resolve))
}

function fakeSseClient() {
  return { write: vi.fn() } as unknown as Response
}

// Orders are checked against balance and holdings, so give each mocked student
// some of every token to sell.
function giveTokens(acronym: string, amount = 100) {
  db.prepare(`INSERT OR IGNORE INTO students (acronym) VALUES (?)`).run(acronym)
  for (const token of ['FIKA', 'SUDO', 'YOLO', 'DEPLOY', 'MEME', 'HODL']) {
    db.prepare(`INSERT OR REPLACE INTO holdings (acronym, token, amount) VALUES (?, ?, ?)`).run(
      acronym,
      token,
      amount,
    )
  }
}

async function mockStudent(acronym: string) {
  giveTokens(acronym)
  const { apiKeyAuth } = await import('../middleware/apiKeyAuth.js')
  vi.mocked(apiKeyAuth).mockImplementationOnce(async (_req, res, next) => {
    res.locals.student = { acronym }
    next()
  })
}

// Mock apiKeyAuth so tests don't call the real api-server
vi.mock('../middleware/apiKeyAuth.js', () => ({
  apiKeyAuth: vi.fn((_req, res, next) => {
    res.locals.student = { acronym: 'tst' }
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
  db.prepare('DELETE FROM webhooks').run()
  db.prepare('DELETE FROM value_days').run()
  db.prepare('DELETE FROM market_trades').run()
})

describe('GET /assets', () => {
  it('returns token list', async () => {
    const res = await request(app).get('/assets').set('X-Api-Key', 'any')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(6)
    expect(res.body[0]).toHaveProperty('id')
    expect(res.body[0]).toHaveProperty('price')
    expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'name', 'price', 'type'])
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
    expect(res.body.bids).toEqual([{ price: 9.5, amount: 5, side: 'buy', marketMaker: false }])
    expect(res.body.asks).toEqual([])
  })

  it('aggregates multiple resting orders at the same price into one book level', async () => {
    await mockStudent('bka')
    await request(app).post('/orders').set('X-Api-Key', 'ba').send({
      token: 'MEME',
      side: 'buy',
      amount: 100,
      price: 0.65,
    })
    await mockStudent('bkb')
    await request(app).post('/orders').set('X-Api-Key', 'bb').send({
      token: 'MEME',
      side: 'buy',
      amount: 50,
      price: 0.65,
    })
    await flush()

    const res = await request(app).get('/assets/MEME/orderbook').set('X-Api-Key', 'any')
    expect(res.body.bids).toEqual([{ price: 0.65, amount: 150, side: 'buy', marketMaker: false }])
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

describe('POST /orders — balance and holdings', () => {
  it('rejects a buy that costs more than the balance', async () => {
    const res = await request(app).post('/orders').set('X-Api-Key', 'any').send({
      token: 'HODL',
      side: 'buy',
      amount: 1001,
      price: 100,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/^Insufficient balance/)
  })

  it('counts open buy orders as reserved', async () => {
    const order = { token: 'HODL', side: 'buy', amount: 600, price: 100 }
    const first = await request(app).post('/orders').set('X-Api-Key', 'any').send(order)
    const second = await request(app).post('/orders').set('X-Api-Key', 'any').send(order)
    expect(first.status).toBe(201)
    expect(second.status).toBe(400)
  })

  it('rejects a sell of tokens the student does not have', async () => {
    const res = await request(app).post('/orders').set('X-Api-Key', 'any').send({
      token: 'FIKA',
      side: 'sell',
      amount: 1,
      price: 10,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/^Insufficient holdings/)
  })

  it('counts open sell orders as reserved', async () => {
    const order = { token: 'FIKA', side: 'sell', amount: 60, price: 10.5 }
    await mockStudent('rsv')
    const first = await request(app).post('/orders').set('X-Api-Key', 'r').send(order)
    await mockStudent('rsv')
    const second = await request(app).post('/orders').set('X-Api-Key', 'r').send(order)
    expect(first.status).toBe(201)
    expect(second.status).toBe(400)
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

  it('queues one webhook per fill with a stable orderId and userId passthrough', async () => {
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
    const rows = db.prepare('SELECT body FROM webhooks').all() as { body: string }[]
    const takerWebhooks = rows
      .map((row) => JSON.parse(row.body) as WebhookPayload)
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

  it('nudges the token reference price towards a real trade, not all the way', async () => {
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

    const price = getToken('SUDO')!.price
    expect(price).toBeGreaterThan(25)
    expect(price).toBeLessThan(27.5)
  })

  it('refuses an order priced outside the band around the market price', async () => {
    await mockStudent('band')
    const res = await request(app).post('/orders').set('X-Api-Key', 'bd').send({
      token: 'FIKA',
      side: 'buy',
      amount: 1,
      price: 1.0,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/outside the allowed band/)
  })
})

describe('webhooks', () => {
  async function fill() {
    await mockStudent('whs')
    await request(app).post('/orders').set('X-Api-Key', 's').send({
      token: 'FIKA',
      side: 'sell',
      amount: 2,
      price: 10.0,
    })
    await request(app).post('/orders').set('X-Api-Key', 'any').send({
      token: 'FIKA',
      side: 'buy',
      amount: 2,
      price: 10.0,
    })
    await flush()
  }

  it('gives each student a webhook secret of their own', async () => {
    const res = await request(app).get('/webhooks/secret').set('X-Api-Key', 'any')
    expect(res.status).toBe(200)
    expect(res.body.secret).toMatch(/^whsec_[0-9a-f]{48}$/)

    await mockStudent('other')
    const other = await request(app).get('/webhooks/secret').set('X-Api-Key', 'o')
    expect(other.body.secret).not.toBe(res.body.secret)
  })

  it('returns pending webhooks signed with the student secret', async () => {
    await fill()
    const secret = (await request(app).get('/webhooks/secret').set('X-Api-Key', 'any')).body
      .secret as string

    const res = await request(app).get('/webhooks/pending').set('X-Api-Key', 'any')
    expect(res.status).toBe(200)
    expect(res.body.webhooks).toHaveLength(1)

    const [webhook] = res.body.webhooks as { id: string; body: string; signature: string }[]
    const expected = `sha256=${createHmac('sha256', secret).update(webhook.body).digest('hex')}`
    expect(webhook.signature).toBe(expected)
    expect(JSON.parse(webhook.body)).toMatchObject({
      id: webhook.id,
      event: 'order.filled',
      data: { token: 'FIKA', side: 'buy', amount: 2, price: 10, total: 20 },
    })
  })

  it('keeps a webhook pending until it is acked', async () => {
    await fill()
    const first = await request(app).get('/webhooks/pending').set('X-Api-Key', 'any')
    const again = await request(app).get('/webhooks/pending').set('X-Api-Key', 'any')
    expect(again.body.webhooks).toEqual(first.body.webhooks)

    const ids = (first.body.webhooks as { id: string }[]).map((w) => w.id)
    const ack = await request(app)
      .post('/webhooks/pending/ack')
      .set('X-Api-Key', 'any')
      .send({ ids })
    expect(ack.body).toEqual({ acked: 1 })

    const after = await request(app).get('/webhooks/pending').set('X-Api-Key', 'any')
    expect(after.body.webhooks).toEqual([])
  })

  it('does not let a student see or ack another student’s webhooks', async () => {
    await fill()
    const mine = await request(app).get('/webhooks/pending').set('X-Api-Key', 'any')
    const ids = (mine.body.webhooks as { id: string }[]).map((w) => w.id)

    await mockStudent('nosy')
    const ack = await request(app).post('/webhooks/pending/ack').set('X-Api-Key', 'n').send({ ids })
    expect(ack.body).toEqual({ acked: 0 })

    await mockStudent('nosy')
    const theirs = await request(app).get('/webhooks/pending').set('X-Api-Key', 'n')
    expect(theirs.body.webhooks).toEqual([])
  })

  it('returns 400 for an ack without ids', async () => {
    const res = await request(app).post('/webhooks/pending/ack').set('X-Api-Key', 'any').send({})
    expect(res.status).toBe(400)
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
    expect(res.body.balance).toBe(100000)
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

    expect(seller).toMatchObject({ buys: 0, sells: 1, turnover: 100 })
    expect(buyer).toMatchObject({ buys: 1, sells: 0, turnover: 100 })
  })

  it('with since, counts only later trades and ranks by growth since that day', async () => {
    db.prepare(
      `INSERT INTO students (acronym, balance) VALUES ('big', 150000), ('small', 60000)`,
    ).run()
    db.prepare(
      `INSERT INTO value_days (acronym, day, value) VALUES
         ('big', '2026-10-20', 140000), ('big', '2026-10-26', 160000), ('small', '2026-10-26', 50000)`,
    ).run()
    db.prepare(
      `INSERT INTO trades (id, acronym, token, side, amount, price, total, timestamp) VALUES
         ('t1', 'big', 'FIKA', 'buy', 10, 10, 100, '2026-10-21T10:00:00.000Z'),
         ('t2', 'big', 'FIKA', 'sell', 10, 10, 100, '2026-10-27T10:00:00.000Z')`,
    ).run()

    const all = (await request(app).get('/leaderboard')).body
    expect(all.map((e: { acronym: string }) => e.acronym)).toEqual(['big', 'small'])
    expect(all[0]).toMatchObject({ buys: 1, sells: 1, turnover: 200 })
    expect(all[0]).not.toHaveProperty('changePct')

    const week = (await request(app).get('/leaderboard?since=2026-10-26')).body
    expect(week[0]).toMatchObject({ rank: 1, acronym: 'small', startValue: 50000, changePct: 20 })
    expect(week[1]).toMatchObject({
      acronym: 'big',
      buys: 0,
      sells: 1,
      turnover: 100,
      changePct: -6.25,
    })
  })

  it('without a snapshot, since compares with the starting balance', async () => {
    db.prepare(`INSERT INTO students (acronym, balance) VALUES ('new', 110000)`).run()
    const res = await request(app).get('/leaderboard?since=2026-10-26')
    expect(res.body[0]).toMatchObject({ startValue: 100000, changePct: 10 })
  })

  it('refuses a since that is not a date', async () => {
    expect((await request(app).get('/leaderboard?since=last-week')).status).toBe(400)
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

describe('GET /assets/:id/history', () => {
  it('returns the points for a range', async () => {
    db.prepare('DELETE FROM price_ticks').run()
    db.prepare(`INSERT INTO price_ticks (token, timestamp, price) VALUES ('FIKA', ?, 10.5)`).run(
      new Date().toISOString(),
    )
    const res = await request(app).get('/assets/fika/history?range=10m')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ token: 'FIKA', range: '10m', points: [{ price: 10.5 }] })
  })

  it('refuses an unknown token or range', async () => {
    expect((await request(app).get('/assets/NOPE/history')).status).toBe(404)
    expect((await request(app).get('/assets/FIKA/history?range=1y')).status).toBe(400)
  })
})

describe('GET /assets/:id/trades', () => {
  it('returns the latest fills on the token, newest first, without students', async () => {
    await mockStudent('qqx')
    await request(app).post('/orders').set('X-Api-Key', 'a').send({
      token: 'FIKA',
      side: 'sell',
      amount: 3,
      price: 9.5,
    })
    await flush()
    await mockStudent('qqy')
    const buy = await request(app).post('/orders').set('X-Api-Key', 'b').send({
      token: 'FIKA',
      side: 'buy',
      amount: 2,
      price: 9.5,
    })
    await flush()

    const res = await request(app).get('/assets/fika/trades?limit=5')
    expect(res.status).toBe(200)
    expect(res.body.token).toBe('FIKA')
    expect(res.body.trades).toHaveLength(1)
    expect(res.body.trades[0]).toMatchObject({
      buyOrderId: buy.body.id,
      token: 'FIKA',
      side: 'buy',
      amount: 2,
      price: 9.5,
      total: 19,
    })
    expect(JSON.stringify(res.body)).not.toMatch(/qqx|qqy/)
  })

  it('refuses an unknown token or a bad limit', async () => {
    expect((await request(app).get('/assets/NOPE/trades')).status).toBe(404)
    expect((await request(app).get('/assets/FIKA/trades?limit=0')).status).toBe(400)
    expect((await request(app).get('/assets/FIKA/trades?limit=abc')).status).toBe(400)
  })
})

describe('GET /market/news', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM news').run()
    const insert = db.prepare(
      `INSERT INTO news (id, token, sentiment, impact, headline, pct, duration_sec, timestamp)
       VALUES (?, ?, 'positive', ?, 'x', ?, ?, ?)`,
    )
    insert.run('n1', 'YOLO', 'low', null, null, '2026-10-28T10:00:00.000Z')
    insert.run('n2', 'YOLO', 'big', 15, 180, '2026-10-28T11:00:00.000Z')
  })

  it('returns stored news, newest first, with pct and durationSec on big events', async () => {
    const res = await request(app).get('/market/news')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      expect.objectContaining({ id: 'n2', impact: 'big', pct: 15, durationSec: 180 }),
      {
        id: 'n1',
        token: 'YOLO',
        sentiment: 'positive',
        impact: 'low',
        headline: 'x',
        timestamp: '2026-10-28T10:00:00.000Z',
      },
    ])
  })

  it('filters by impact and token', async () => {
    expect((await request(app).get('/market/news?impact=big')).body).toHaveLength(1)
    expect((await request(app).get('/market/news?token=meme')).body).toHaveLength(0)
  })

  it('refuses an unknown token or impact', async () => {
    expect((await request(app).get('/market/news?token=NOPE')).status).toBe(404)
    expect((await request(app).get('/market/news?impact=huge')).status).toBe(400)
  })
})

describe('GET /orders and DELETE /orders/:id', () => {
  async function restingBuy(amount = 10, price = 9.5) {
    const res = await request(app)
      .post('/orders')
      .set('X-Api-Key', 'any')
      .send({ token: 'FIKA', side: 'buy', amount, price })
    await flush()
    return res.body.id as string
  }

  function webhookBodies() {
    return (db.prepare('SELECT body FROM webhooks ORDER BY rowid').all() as { body: string }[]).map(
      (w) => JSON.parse(w.body) as { event: string; data: Record<string, unknown> },
    )
  }

  it('lists the student own open orders', async () => {
    const id = await restingBuy()
    await mockStudent('other')
    await request(app)
      .post('/orders')
      .set('X-Api-Key', 'o')
      .send({ token: 'FIKA', side: 'buy', amount: 1, price: 9.4 })

    const res = await request(app).get('/orders').set('X-Api-Key', 'any')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ id, token: 'FIKA', remaining: 10, status: 'open' })
  })

  it('cancels an open order, releases its reservation and queues order.cancelled', async () => {
    const id = await restingBuy(10_000, 9.5)
    const before = await request(app)
      .post('/orders')
      .set('X-Api-Key', 'any')
      .send({ token: 'FIKA', side: 'buy', amount: 10_000, price: 9.5 })
    expect(before.status).toBe(400)

    const res = await request(app).delete(`/orders/${id}`).set('X-Api-Key', 'any')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id, status: 'cancelled', remaining: 10_000 })

    const after = await request(app)
      .post('/orders')
      .set('X-Api-Key', 'any')
      .send({ token: 'FIKA', side: 'buy', amount: 10_000, price: 9.5 })
    expect(after.status).toBe(201)
    expect(webhookBodies().map((w) => w.event)).toEqual(['order.cancelled'])
    expect(webhookBodies()[0].data).toMatchObject({ orderId: id, status: 'cancelled' })
  })

  it('answers 404 for another student order and 409 for one that is not open', async () => {
    const id = await restingBuy()
    await mockStudent('other')
    const foreign = await request(app).delete(`/orders/${id}`).set('X-Api-Key', 'o')
    expect(foreign.status).toBe(404)

    await request(app).delete(`/orders/${id}`).set('X-Api-Key', 'any')
    const again = await request(app).delete(`/orders/${id}`).set('X-Api-Key', 'any')
    expect(again.status).toBe(409)
  })

  it('tells a partial fill from a complete one in order.filled', async () => {
    const id = await restingBuy(10, 10.0)
    await mockStudent('sss')
    await request(app)
      .post('/orders')
      .set('X-Api-Key', 's')
      .send({ token: 'FIKA', side: 'sell', amount: 4, price: 10.0 })
    await flush()

    const [filled] = webhookBodies().filter((w) => w.data.orderId === id)
    expect(filled.data).toMatchObject({ amount: 4, remaining: 6, status: 'open' })
  })

  it('names the buy and sell order ids in the trade event', async () => {
    const { addSseClient, removeSseClient } = await import('../market/simulator.js')
    const client = fakeSseClient()
    addSseClient(client)
    const id = await restingBuy(2, 10.0)
    await mockStudent('sss')
    const sell = await request(app)
      .post('/orders')
      .set('X-Api-Key', 's')
      .send({ token: 'FIKA', side: 'sell', amount: 2, price: 10.0 })
    await flush()
    removeSseClient(client)

    const writes = vi.mocked(client.write).mock.calls.map((c) => String(c[0]))
    const trade = writes.find((w) => w.startsWith('event: trade'))
    expect(trade).toContain(`"buyOrderId":"${id}"`)
    expect(trade).toContain(`"sellOrderId":"${sell.body.id}"`)
  })
})
