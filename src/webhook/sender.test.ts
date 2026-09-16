import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendWebhook } from './sender.js'

describe('sendWebhook', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signs the payload with HMAC-SHA256 over the exact request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const payload = {
      id: 'wh-1',
      event: 'order.filled',
      data: {
        orderId: 'order-1',
        token: 'FIKA',
        side: 'buy' as const,
        amount: 10,
        price: 10.5,
        total: 105,
      },
      timestamp: '2026-06-01T10:23:45.000Z',
    }

    await sendWebhook('http://localhost:9999/wh', 'shared-secret', payload)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:9999/wh')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')

    const expectedSignature = createHmac('sha256', 'shared-secret').update(init.body).digest('hex')
    expect(init.headers['X-Webhook-Signature']).toBe(`sha256=${expectedSignature}`)
    expect(JSON.parse(init.body)).toEqual(payload)
  })

  it('swallows delivery errors instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    await expect(
      sendWebhook('http://localhost:9999/wh', 'secret', {
        id: 'wh-2',
        event: 'order.filled',
        data: {},
        timestamp: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined()
  })
})
