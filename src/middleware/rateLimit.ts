import type { Request, Response, NextFunction } from 'express'
import { env } from '../config/env.js'
import { logger } from '../logger.js'

interface Window {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  max: number
  windowMs: number
}

// Fixed window per student: at most `max` requests per `windowMs`. Over the limit the
// answer is 429 with Retry-After (whole seconds until the window resets), which is what
// the students' retry with backoff (issue 06-30) reads. Runs after apiKeyAuth, so the
// window is counted per acronym, not per raw key.
export function createRateLimit({ max, windowMs }: RateLimitOptions) {
  const windows = new Map<string, Window>()

  return function rateLimit(_req: Request, res: Response, next: NextFunction): void {
    const acronym = (res.locals.student as { acronym: string }).acronym
    const now = Date.now()
    let window = windows.get(acronym)

    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + windowMs }
      windows.set(acronym, window)
    }

    window.count++
    res.setHeader('RateLimit-Limit', max)
    res.setHeader('RateLimit-Remaining', Math.max(0, max - window.count))

    if (window.count > max) {
      const retryAfter = Math.ceil((window.resetAt - now) / 1000)
      if (window.count === max + 1) {
        logger.warn({ acronym, max, windowMs }, 'Rate limit exceeded')
      }
      res.setHeader('Retry-After', retryAfter)
      res.status(429).json({ error: 'Too many requests' })
      return
    }

    next()
  }
}

export const rateLimit = createRateLimit({
  max: env.RATE_LIMIT_MAX,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
})
