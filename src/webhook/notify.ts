import type { OrderRow } from '../db.js'
import { nextId } from '../idGen.js'
import { sendWebhook } from './sender.js'

export function notifyOrderFilled(
  order: OrderRow,
  amount: number,
  price: number,
  timestamp: string,
): void {
  if (!order.webhook_url || !order.webhook_secret) {
    return
  }

  const total = amount * price
  const payload = {
    id: nextId('wh'),
    event: 'order.filled',
    data: {
      orderId: order.id,
      ...(order.user_id && { userId: order.user_id }),
      token: order.token,
      side: order.side,
      amount,
      price,
      total,
    },
    timestamp,
  }
  sendWebhook(order.webhook_url, order.webhook_secret, payload)
}
