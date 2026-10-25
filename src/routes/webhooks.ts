import { Router } from 'express'
import { z } from 'zod'
import { ackWebhooks, getWebhookSecret, pendingWebhooks } from '../webhook/queue.js'

export const webhooksRouter = Router()

webhooksRouter.get('/secret', (_req, res) => {
  const { acronym } = res.locals.student as { acronym: string }
  res.json({ secret: getWebhookSecret(acronym) })
})

webhooksRouter.get('/pending', (req, res) => {
  const { acronym } = res.locals.student as { acronym: string }
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100)
  res.json({ webhooks: pendingWebhooks(acronym, limit) })
})

const AckSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
})

webhooksRouter.post('/pending/ack', (req, res) => {
  const result = AckSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0].message })
    return
  }
  const { acronym } = res.locals.student as { acronym: string }
  res.json({ acked: ackWebhooks(acronym, result.data.ids) })
})
