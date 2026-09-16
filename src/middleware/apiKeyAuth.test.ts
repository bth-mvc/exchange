import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { apiKeyAuth } from './apiKeyAuth.js'

function buildApp() {
  const app = express()
  app.use(apiKeyAuth)
  app.get('/', (_req, res) => {
    res.json({ student: res.locals.student })
  })
  return app
}

describe('apiKeyAuth', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 401 when no API key is provided', async () => {
    const res = await request(buildApp()).get('/')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing API key')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts the key via query param', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          valid: true,
          acronym: 'qp1',
          webhookUrl: 'http://localhost/wh',
          webhookSecret: 'secret',
        }),
        { status: 200 },
      ),
    )
    const res = await request(buildApp()).get('/?api_key=query-key-1')
    expect(res.status).toBe(200)
    expect(res.body.student.acronym).toBe('qp1')
  })

  it('verifies against the api-server and caches the result', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          valid: true,
          acronym: 'abc',
          webhookUrl: 'http://localhost/wh',
          webhookSecret: 'secret',
        }),
        { status: 200 },
      ),
    )

    const app = buildApp()
    const first = await request(app).get('/').set('X-Api-Key', 'cache-key-1')
    expect(first.status).toBe(200)
    expect(first.body.student.acronym).toBe('abc')
    expect(fetch).toHaveBeenCalledTimes(1)

    const second = await request(app).get('/').set('X-Api-Key', 'cache-key-1')
    expect(second.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('returns 401 when the api-server reports the key as invalid', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ valid: false }), { status: 200 }),
    )
    const res = await request(buildApp()).get('/').set('X-Api-Key', 'invalid-key-1')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid API key')
  })

  it('fails closed with 401 when the api-server responds with an error status', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('boom', { status: 500 }))
    const res = await request(buildApp()).get('/').set('X-Api-Key', 'error-status-key-1')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid API key')
  })

  it('fails closed with 401 when the api-server is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'))
    const res = await request(buildApp()).get('/').set('X-Api-Key', 'unreachable-key-1')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid API key')
  })
})
