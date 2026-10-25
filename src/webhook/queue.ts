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
 * Queues an `order.filled` webhook for the order's student. Nothing is pushed:
 * a student's server is usually not reachable from the internet, so it polls
 * GET /webhooks/pending and acks what it has handled.
 */
export function enqueueOrderFilled(
  order: OrderRow,
  amount: number,
  price: number,
  timestamp: string,
): void {
  if (order.acronym === env.MARKET_MAKER_ACRONYM) {
    return
  }

  const id = nextId('wh')
  const body = JSON.stringify({
    id,
    event: 'order.filled',
    data: {
      orderId: order.id,
      ...(order.user_id && { userId: order.user_id }),
      token: order.token,
      side: order.side,
      amount,
      price,
      total: amount * price,
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
