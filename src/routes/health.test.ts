import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'

describe('GET /health', () => {
  it('returns ok without API key', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.version).toEqual(expect.any(String))
  })
})
