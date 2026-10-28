import { db } from '../db.js'
import { env } from '../config/env.js'
import { nextId } from '../idGen.js'
import { tokens, setPrice } from './tokens.js'
import type { Token } from './tokens.js'
import { broadcast } from './simulator.js'

export type Sentiment = 'positive' | 'negative' | 'neutral'
export type Impact = 'low' | 'medium' | 'high' | 'rumor' | 'big'

export interface News {
  id: string
  token: string
  sentiment: Sentiment
  impact: Impact
  headline: string
  /** Planned price change in percent, only for a big event. */
  pct?: number
  /** How long the big event's price ramp lasts, in seconds. */
  durationSec?: number
  timestamp: string
}

const headlines = {
  positive: [
    '{t} listed on a new exchange',
    'Large wallet buys {t}',
    '{t} team ships long-awaited update',
    'Analysts upgrade {t} to "buy"',
    '{t} trading volume climbs',
    'Partnership announced for {t}',
    '{t} passes security audit',
    'Influencer praises {t} on stream',
    '{t} community grows fast',
    'Fund adds {t} to its portfolio',
    '{t} fees lowered',
    'Developers flock to {t}',
  ],
  negative: [
    '{t} delisted from a small exchange',
    'Large wallet sells {t}',
    '{t} update delayed again',
    'Analysts downgrade {t} to "sell"',
    '{t} trading volume drops',
    'Partnership for {t} falls through',
    'Bug found in {t} smart contract',
    'Influencer warns about {t}',
    '{t} founder leaves the project',
    'Regulator looks into {t}',
    '{t} network congested',
    'Rumours of a hack hit {t}',
  ],
  neutral: [
    '{t} holds its annual meeting',
    '{t} publishes quarterly report',
    'New logo for {t}',
    '{t} moves its office',
    '{t} answers questions in a live chat',
    '{t} updates its documentation',
  ],
}

const bigHeadlines = {
  positive: [
    'BREAKING: {t} acquired by a large tech company',
    'BREAKING: {t} becomes official payment option at a big retailer',
    'BREAKING: {t} approved by the financial regulator',
    'BREAKING: {t} hits record user numbers',
    'BREAKING: major bank starts offering {t}',
    'BREAKING: {t} wins a large government contract',
  ],
  negative: [
    'BREAKING: {t} hacked, funds stolen',
    'BREAKING: {t} banned in a large market',
    'BREAKING: {t} under investigation for fraud',
    'BREAKING: {t} main developer arrested',
    'BREAKING: large exchange drops {t}',
    'BREAKING: critical flaw found in {t}',
  ],
}

const rumorHeadlines = {
  positive: [
    'Rumour: something big is coming for {t}',
    'Unconfirmed: {t} in takeover talks',
    'Whispers of a major deal for {t}',
    'Insiders hint at good news for {t}',
  ],
  negative: [
    'Rumour: trouble brewing at {t}',
    'Unconfirmed: {t} faces legal problems',
    'Whispers of a security issue at {t}',
    'Insiders hint at bad news for {t}',
  ],
}

const impactPct = { low: 0.01, medium: 0.02, high: 0.03 }

/** How often a token type is picked for news: volatile tokens get the most. */
const typeWeight: Record<Token['type'], number> = { stable: 1, yield: 2, volatile: 3 }

const lastNewsAt = new Map<string, number>()

function pick<T>(list: readonly T[], rand = Math.random): T {
  return list[Math.floor(rand() * list.length)]
}

/** A token for the next small news item, weighted by type. Tokens that had news within
 *  NEWS_TOKEN_GAP_MS are skipped, so a token gets at most one item an hour. Undefined if all
 *  tokens are resting. */
export function pickNewsToken(
  candidates: readonly Token[],
  lastAt: ReadonlyMap<string, number>,
  now: number,
  rand = Math.random,
): Token | undefined {
  const free = candidates.filter(
    (t) => now - (lastAt.get(t.id) ?? -Infinity) >= env.NEWS_TOKEN_GAP_MS,
  )
  const total = free.reduce((sum, t) => sum + typeWeight[t.type], 0)
  let r = rand() * total
  for (const t of free) {
    r -= typeWeight[t.type]
    if (r < 0) return t
  }
  return undefined
}

/** Up or down for a big event. It leans back towards the start price: the further the base
 *  price has moved from it, the more likely the next event goes back. */
export function bigEventDirection(
  basePrice: number,
  startPrice: number,
  rand = Math.random,
): 1 | -1 {
  const pUp = Math.min(0.85, Math.max(0.15, 0.5 - Math.log(basePrice / startPrice)))
  return rand() < pUp ? 1 : -1
}

/** The change, as a fraction, that a big event of this size and direction makes to the base
 *  price, cut so the new base stays within 0.5-2 times the start price. */
export function bigEventChange(
  basePrice: number,
  startPrice: number,
  size: number,
  direction: 1 | -1,
): number {
  const target = Math.min(
    2 * startPrice,
    Math.max(0.5 * startPrice, basePrice * (1 + direction * size)),
  )
  return target / basePrice - 1
}

/** Moves the reference price `step` further along a ramp. `applied` is how much the ramp has
 *  moved it so far; the price is rounded to cents, so the next step makes up for what the
 *  rounding left out, and a cheap token still moves. Returns the new `applied`. */
export function rampPrice(token: Token, wanted: number, applied: number): number {
  const before = token.price
  setPrice(token.id, before + (wanted - applied))
  return applied + (token.price - before)
}

/** Moves a token's price by `change` (a fraction) over `ms`, in steps of a second or two. With
 *  `moveBase`, the base price moves too, so the new level lasts. */
function ramp(
  token: Token,
  change: number,
  ms: number,
  moveBase: boolean,
  done?: () => void,
): void {
  const steps = Math.max(1, Math.round(ms / 2000))
  const delta = token.price * change
  const baseStep = moveBase ? (token.basePrice * change) / steps : 0
  let step = 0
  let applied = 0
  const timer = setInterval(() => {
    step += 1
    token.basePrice += baseStep
    applied = rampPrice(token, (delta * step) / steps, applied)
    broadcast('price', { token: token.id, price: token.price, timestamp: new Date().toISOString() })
    if (step >= steps) {
      clearInterval(timer)
      done?.()
    }
  }, ms / steps)
}

function publish(item: Omit<News, 'id' | 'timestamp'>): News {
  const news: News = { id: nextId('news'), ...item, timestamp: new Date().toISOString() }
  db.prepare(
    `INSERT INTO news (id, token, sentiment, impact, headline, pct, duration_sec, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    news.id,
    news.token,
    news.sentiment,
    news.impact,
    news.headline,
    news.pct ?? null,
    news.durationSec ?? null,
    news.timestamp,
  )
  broadcast('news', news)
  return news
}

/** Deletes small news older than NEWS_KEEP_DAYS and big events and rumours older than
 *  BIG_EVENT_KEEP_DAYS. */
export function pruneNews(now = Date.now()): void {
  const day = 86_400_000
  db.prepare(
    `DELETE FROM news WHERE (impact IN ('low', 'medium', 'high') AND timestamp < ?)
       OR timestamp < ?`,
  ).run(
    new Date(now - env.NEWS_KEEP_DAYS * day).toISOString(),
    new Date(now - env.BIG_EVENT_KEEP_DAYS * day).toISOString(),
  )
}

/** Publishes one small news item and gives the price a short push of 1-3 %, which the
 *  simulator then pulls back towards the base price. Neutral news does not move it. */
export function smallNews(rand = Math.random): News | undefined {
  const token = pickNewsToken(tokens, lastNewsAt, Date.now(), rand)
  if (!token || token.inEvent) return undefined
  lastNewsAt.set(token.id, Date.now())

  const r = rand()
  const sentiment: Sentiment = r < 0.4 ? 'positive' : r < 0.8 ? 'negative' : 'neutral'
  const impact = sentiment === 'neutral' ? 'low' : pick(['low', 'medium', 'high'] as const, rand)
  const news = publish({
    token: token.id,
    sentiment,
    impact,
    headline: pick(headlines[sentiment], rand).replace('{t}', token.id),
  })
  if (sentiment !== 'neutral') {
    const sign = sentiment === 'positive' ? 1 : -1
    ramp(token, sign * impactPct[impact as keyof typeof impactPct], env.NEWS_RAMP_MS, false)
  }
  return news
}

/** Starts a big event on a volatile or yield token: a rumour first, right in RUMOR_ACCURACY of
 *  the cases, then after RUMOR_LEAD_MS the event itself, which moves the base price 10-25 %
 *  over BIG_EVENT_RAMP_MS. The market maker quotes wider while the ramp runs. */
export function bigEvent(rand = Math.random): News | undefined {
  const free = tokens.filter((t) => t.type !== 'stable' && !t.inEvent)
  if (free.length === 0) return undefined
  const token = pick(free, rand)
  token.inEvent = true

  const direction = bigEventDirection(token.basePrice, token.startPrice, rand)
  const change = bigEventChange(token.basePrice, token.startPrice, 0.1 + rand() * 0.15, direction)
  const rumorRight = rand() < env.RUMOR_ACCURACY
  const rumorSentiment = (rumorRight ? direction : -direction) > 0 ? 'positive' : 'negative'
  const rumor = publish({
    token: token.id,
    sentiment: rumorSentiment,
    impact: 'rumor',
    headline: pick(rumorHeadlines[rumorSentiment], rand).replace('{t}', token.id),
  })

  setTimeout(() => {
    const sentiment = change >= 0 ? 'positive' : 'negative'
    publish({
      token: token.id,
      sentiment,
      impact: 'big',
      headline: pick(bigHeadlines[sentiment], rand).replace('{t}', token.id),
      pct: +(change * 100).toFixed(1),
      durationSec: Math.round(env.BIG_EVENT_RAMP_MS / 1000),
    })
    lastNewsAt.set(token.id, Date.now())
    ramp(token, change, env.BIG_EVENT_RAMP_MS, true, () => {
      token.inEvent = false
    })
  }, env.RUMOR_LEAD_MS)
  return rumor
}

/** Calls `fn` again and again, every `ms` on average (between half and one and a half). */
function every(ms: number, fn: () => void): void {
  setTimeout(
    () => {
      fn()
      every(ms, fn)
    },
    ms * (0.5 + Math.random()),
  )
}

/** Starts the news feed: small news about every NEWS_INTERVAL_MS, big events about every
 *  BIG_EVENT_INTERVAL_MS. Old news is pruned once an hour. */
export function startNewsFeed(): void {
  every(env.NEWS_INTERVAL_MS, () => smallNews())
  every(env.BIG_EVENT_INTERVAL_MS, () => bigEvent())
  setInterval(() => pruneNews(), 3_600_000)
}

/** Stored news, newest first: optionally for one token and only some impacts. */
export function recentNews(options: { limit: number; token?: string; impacts?: string[] }): News[] {
  const where: string[] = []
  const params: (string | number)[] = []
  if (options.token) {
    where.push('token = ?')
    params.push(options.token)
  }
  if (options.impacts?.length) {
    where.push(`impact IN (${options.impacts.map(() => '?').join(', ')})`)
    params.push(...options.impacts)
  }
  const rows = db
    .prepare(
      `SELECT * FROM news ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY timestamp DESC LIMIT ?`,
    )
    .all(...params, options.limit) as {
    id: string
    token: string
    sentiment: Sentiment
    impact: Impact
    headline: string
    pct: number | null
    duration_sec: number | null
    timestamp: string
  }[]
  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    sentiment: r.sentiment,
    impact: r.impact,
    headline: r.headline,
    ...(r.pct !== null && { pct: r.pct }),
    ...(r.duration_sec !== null && { durationSec: r.duration_sec }),
    timestamp: r.timestamp,
  }))
}
