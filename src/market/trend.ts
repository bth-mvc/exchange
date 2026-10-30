import { env } from '../config/env.js'
import { logger } from '../logger.js'
import { tokens } from './tokens.js'
import type { Token } from './tokens.js'
import { bigEventDirection } from './news.js'

const day = 86_400_000

/** How often the trends are moved along. */
export const TREND_STEP_MS = 60_000

/** Gives a token a trend: 0.5-2 % a day (TREND_MIN_PCT-TREND_MAX_PCT) for 3-10 days
 *  (TREND_MIN_DAYS-TREND_MAX_DAYS). The direction leans back towards the start price, like a
 *  big event's leans towards the anchor, so a token that has drifted far tends to turn. */
export function startTrend(token: Token, now: number, rand = Math.random): void {
  const direction = bigEventDirection(token.anchor, token.startPrice, rand)
  const pct = env.TREND_MIN_PCT + rand() * (env.TREND_MAX_PCT - env.TREND_MIN_PCT)
  const days = env.TREND_MIN_DAYS + rand() * (env.TREND_MAX_DAYS - env.TREND_MIN_DAYS)
  token.trend = { pctPerDay: direction * pct, endsAt: now + days * day }
  logger.info(
    `Trend ${token.id}: ${(direction * pct * 100).toFixed(2)} % a day for ${days.toFixed(1)} days`,
  )
}

/** Moves a trending token's anchor and base price by the trend's rate for `elapsedMs`, kept
 *  within 0.5-2 times the start price. The trend ends when its time is up or the anchor hits
 *  that limit. A volatile token without a trend starts one about every TREND_GAP_MS. */
export function stepTrend(token: Token, now: number, elapsedMs: number, rand = Math.random): void {
  if (!token.trend) {
    if (token.type === 'volatile' && rand() < elapsedMs / env.TREND_GAP_MS) {
      startTrend(token, now, rand)
    }
    return
  }
  const low = 0.5 * token.startPrice
  const high = 2 * token.startPrice
  const factor = 1 + (token.trend.pctPerDay * elapsedMs) / day
  const anchor = token.anchor * factor
  token.anchor = Math.min(high, Math.max(low, anchor))
  token.basePrice = Math.min(high, Math.max(low, token.basePrice * factor))
  if (now >= token.trend.endsAt || anchor !== token.anchor) {
    token.trend = undefined
  }
}

/** Moves the trends along every TREND_STEP_MS. */
export function startTrends(): void {
  setInterval(() => {
    for (const token of tokens) stepTrend(token, Date.now(), TREND_STEP_MS)
  }, TREND_STEP_MS)
}
