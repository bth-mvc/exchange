import { describe, it, expect, vi, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRateLimit } from './rateLimit.js'

function buildApp(max: number, windowMs: number) {
  const app = express()
  app.use((req, res, next) => {
    res.locals.student = { acronym: req.headers['x-student'] ?? 'abc' }
    next()
  })
  app.use(createRateLimit({ max, windowMs }))
  app.get('/', (_req, res) => {
    res.json({ ok: true })
  })
  return app
}

describe('rateLimit', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lets requests through up to the limit', async () => {
    const app = buildApp(2, 60_000)
    expect((await request(app).get('/')).status).toBe(200)
    const second = await request(app).get('/')
    expect(second.status).toBe(200)
    expect(second.headers['ratelimit-remaining']).toBe('0')
  })

  it('answers 429 with Retry-After over the limit', async () => {
    const app = buildApp(1, 10_000)
    await request(app).get('/')
    const res = await request(app).get('/')
    expect(res.status).toBe(429)
    expect(res.body.error).toBe('Too many requests')
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(10)
  })

  it('counts each student separately', async () => {
    const app = buildApp(1, 60_000)
    await request(app).get('/').set('X-Student', 'one')
    const other = await request(app).get('/').set('X-Student', 'two')
    expect(other.status).toBe(200)
  })

  it('opens again when the window has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const app = buildApp(1, 10_000)
    await request(app).get('/')
    expect((await request(app).get('/')).status).toBe(429)
    vi.advanceTimersByTime(10_000)
    expect((await request(app).get('/')).status).toBe(200)
  })
})
