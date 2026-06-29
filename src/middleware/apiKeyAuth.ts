import type { Request, Response, NextFunction } from 'express'
import { env } from '../config/env.js'
import { logger } from '../logger.js'

interface VerifiedStudent {
  acronym: string
  webhookUrl: string
  webhookSecret: string
}

interface CacheEntry {
  data: VerifiedStudent
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = (req.headers['x-api-key'] as string) ?? (req.query.api_key as string)

  if (!apiKey) {
    res.status(401).json({ error: 'Missing API key' })
    return
  }

  if (env.NODE_ENV === 'development' && env.DEV_API_KEY && apiKey === env.DEV_API_KEY) {
    res.locals.student = { acronym: 'dev', webhookUrl: '', webhookSecret: 'dev-secret' }
    next()
    return
  }

  const cached = cache.get(apiKey)
  if (cached && Date.now() < cached.expiresAt) {
    res.locals.student = cached.data
    next()
    return
  }

  try {
    const response = await fetch(`${env.API_KEY_SERVER_URL}/service/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': env.SERVICE_TOKEN,
      },
      body: JSON.stringify({ apiKey }),
    })

    const result = (await response.json()) as { valid: boolean } & Partial<VerifiedStudent>

    if (!result.valid) {
      res.status(401).json({ error: 'Invalid API key' })
      return
    }

    const student: VerifiedStudent = {
      acronym: result.acronym!,
      webhookUrl: result.webhookUrl!,
      webhookSecret: result.webhookSecret!,
    }

    cache.set(apiKey, { data: student, expiresAt: Date.now() + env.KEY_CACHE_TTL_MS })
    res.locals.student = student
    next()
  } catch (err) {
    logger.error({ err }, 'API key server unreachable')
    res.status(503).json({ error: 'Authentication service unavailable' })
  }
}
