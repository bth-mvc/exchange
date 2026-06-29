import type { Request, Response, NextFunction } from 'express'
import { logger } from '../logger.js'

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error({ err }, 'Unhandled error')
  res.status(500).json({ error: 'Internal server error' })
}
