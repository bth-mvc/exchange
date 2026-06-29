import { createHmac } from 'node:crypto'
import { logger } from '../logger.js'

export interface WebhookPayload {
  id: string
  event: string
  data: Record<string, unknown>
  timestamp: string
}

export async function sendWebhook(
  url: string,
  secret: string,
  payload: WebhookPayload,
): Promise<void> {
  const body = JSON.stringify(payload)
  const signature = createHmac('sha256', secret).update(body).digest('hex')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
      },
      body,
    })
    logger.info({ url, status: res.status }, 'Webhook sent')
  } catch (err) {
    logger.warn({ url, err }, 'Webhook delivery failed')
  }
}
