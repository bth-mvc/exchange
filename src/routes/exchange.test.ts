import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { db } from '../db.js'

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

beforeEach(() => {
  db.prepare('DELETE FROM trades').run()
  db.prepare('DELETE FROM holdings').run()
  db.prepare('DELETE FROM students').run()
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
  it('returns orderbook for known token', async () => {
    const res = await request(app).get('/assets/FIKA/orderbook').set('X-Api-Key', 'any')
    expect(res.status).toBe(200)
    expect(res.body.token).toBe('FIKA')
    expect(res.body.bids).toHaveLength(3)
    expect(res.body.asks).toHaveLength(3)
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
  it('returns empty list when no students', async () => {
    const res = await request(app).get('/leaderboard').set('X-Api-Key', 'any')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
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
