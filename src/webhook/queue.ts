import { createHmac } from 'node:crypto'
import { env } from '../config/env.js'
import { db, ensureStudent } from '../db.js'
import type { OrderRow, StudentRow } from '../db.js'
import { nextId } from '../idGen.js'

export interface PendingWebhook {
  id: string
  body: string
  signature: string
}

/** `sha256=<hex>` — the same value a pushed webhook carries in X-Webhook-Signature. */
export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

export function getWebhookSecret(acronym: string): string {
  ensureStudent(acronym)
  const row = db
    .prepare(`SELECT webhook_secret FROM students WHERE acronym = ?`)
    .get(acronym) as Pick<StudentRow, 'webhook_secret'>
  return row.webhook_secret
}

/**
 * Queues a webhook for the order's student. Nothing is pushed: a student's server is usually
 * not reachable from the internet, so it polls GET /webhooks/pending and acks what it has
 * handled. The market maker gets no webhooks.
 */
function enqueue(order: OrderRow, event: string, data: object, timestamp: string): void {
  if (order.acronym === env.MARKET_MAKER_ACRONYM) {
    return
  }

  const id = nextId('wh')
  const body = JSON.stringify({
    id,
    event,
    data: {
      orderId: order.id,
      ...(order.user_id && { userId: order.user_id }),
      token: order.token,
      side: order.side,
      ...data,
    },
    timestamp,
  })
  const signature = signBody(getWebhookSecret(order.acronym), body)

  db.prepare(`INSERT INTO webhooks (id, acronym, body, signature) VALUES (?, ?, ?, ?)`).run(
    id,
    order.acronym,
    body,
    signature,
  )
}

/** `order.filled` for one fill. `remaining` and `status` tell whether the order is now filled
 *  or still open with a part left (a partial fill). */
export function enqueueOrderFilled(
  order: OrderRow,
  amount: number,
  price: number,
  timestamp: string,
): void {
  enqueue(
    order,
    'order.filled',
    { amount, price, total: amount * price, remaining: order.remaining, status: order.status },
    timestamp,
  )
}

/** `order.cancelled` when an open order is cancelled; `remaining` is the part that never filled. */
export function enqueueOrderCancelled(order: OrderRow, timestamp: string): void {
  enqueue(
    order,
    'order.cancelled',
    { amount: order.amount, price: order.price, remaining: order.remaining, status: 'cancelled' },
    timestamp,
  )
}

/** Unacked webhooks for a student, oldest first. */
export function pendingWebhooks(acronym: string, limit: number): PendingWebhook[] {
  return db
    .prepare(
      `SELECT id, body, signature FROM webhooks
       WHERE acronym = ? AND acked_at IS NULL
       ORDER BY rowid ASC
       LIMIT ?`,
    )
    .all(acronym, limit) as PendingWebhook[]
}

/** Marks the student's own webhooks as handled; unknown or foreign ids are ignored. */
export function ackWebhooks(acronym: string, ids: string[]): number {
  const ack = db.prepare(
    `UPDATE webhooks SET acked_at = datetime('now')
     WHERE id = ? AND acronym = ? AND acked_at IS NULL`,
  )
  const run = db.transaction(() => ids.reduce((sum, id) => sum + ack.run(id, acronym).changes, 0))
  const acked = run()
  db.prepare(`DELETE FROM webhooks WHERE acked_at < datetime('now', '-7 days')`).run()
  return acked
}
