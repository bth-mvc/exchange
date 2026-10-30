import type { Response } from 'express'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from '../db.js'
import { env } from '../config/env.js'
import {
  pickNewsToken,
  bigEventDirection,
  bigEventChange,
  rampPrice,
  smallNews,
  bigEvent,
  pruneNews,
  recentNews,
} from './news.js'
import { tokens, getToken } from './tokens.js'
import { addSseClient, removeSseClient } from './simulator.js'

/** A stand-in for Math.random that returns the given values in turn. */
function sequence(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]
}

function fakeClient() {
  return { write: vi.fn() } as unknown as Response
}

function eventsOf(client: Response, event: string) {
  return vi
    .mocked(client.write)
    .mock.calls.map(([m]) => m as string)
    .filter((m) => m.startsWith(`event: ${event}\n`))
    .map((m) => JSON.parse(m.split('data: ')[1]))
}

const original = tokens.map((t) => ({ ...t }))

beforeEach(() => {
  db.prepare('DELETE FROM news').run()
  tokens.forEach((t, i) => Object.assign(t, original[i], { inEvent: false, trend: undefined }))
})

describe('pickNewsToken', () => {
  it('weights volatile tokens higher than stable ones', () => {
    const counts: Record<string, number> = {}
    for (let i = 0; i < 1000; i++) {
      const t = pickNewsToken(tokens, new Map(), 0, () => i / 1000)!
      counts[t.type] = (counts[t.type] ?? 0) + 1
    }
    expect(counts.volatile / 3).toBeGreaterThan(counts.stable / 2)
  })

  it('skips tokens that had news within the gap', () => {
    const now = 10 * env.NEWS_TOKEN_GAP_MS
    const lastAt = new Map(tokens.filter((t) => t.id !== 'HODL').map((t) => [t.id, now - 1000]))
    expect(pickNewsToken(tokens, lastAt, now, () => 0.5)?.id).toBe('HODL')
  })

  it('returns undefined when every token is resting', () => {
    const lastAt = new Map(tokens.map((t) => [t.id, 0]))
    expect(pickNewsToken(tokens, lastAt, 1000, () => 0.5)).toBeUndefined()
  })
})

describe('bigEventDirection', () => {
  it('is a fair coin at the start price', () => {
    expect(bigEventDirection(10, 10, () => 0.49)).toBe(1)
    expect(bigEventDirection(10, 10, () => 0.51)).toBe(-1)
  })

  it('leans back towards the anchor', () => {
    expect(bigEventDirection(15, 10, () => 0.3)).toBe(-1)
    expect(bigEventDirection(7, 10, () => 0.7)).toBe(1)
  })
})

describe('bigEventChange', () => {
  it('returns the size in the given direction', () => {
    expect(bigEventChange(10, 10, 0.2, 1)).toBeCloseTo(0.2)
    expect(bigEventChange(10, 10, 0.2, -1)).toBeCloseTo(-0.2)
  })

  it('keeps the base price within 0.5-2 times the start price', () => {
    expect(10 * (1 + bigEventChange(10, 6, 0.25, 1))).toBeCloseTo(12)
    expect(5.5 * (1 + bigEventChange(5.5, 10, 0.25, -1))).toBeCloseTo(5)
  })
})

describe('rampPrice', () => {
  it('moves a cheap token even when each step is less than a cent', () => {
    const meme = getToken('MEME')!
    let applied = 0
    for (let step = 1; step <= 20; step++) {
      applied = rampPrice(meme, (0.1 * step) / 20, applied)
    }
    expect(meme.price).toBeCloseTo(0.79)
  })
})

describe('smallNews', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('publishes, stores and pushes the price', () => {
    const client = fakeClient()
    addSseClient(client)
    // token pick, positive, high, first headline
    const news = smallNews(sequence(0.99, 0.1, 0.9, 0))!
    vi.advanceTimersByTime(env.NEWS_RAMP_MS)
    removeSseClient(client)

    expect(news).toMatchObject({ token: 'HODL', sentiment: 'positive', impact: 'high' })
    expect(news.headline).toContain('HODL')
    expect(eventsOf(client, 'news')).toEqual([news])
    expect(recentNews({ limit: 10 })).toEqual([news])
    expect(getToken('HODL')!.price).toBeCloseTo(103)
    expect(getToken('HODL')!.basePrice).toBe(100)
  })

  it('leans towards the direction of a trend', () => {
    for (const t of tokens) t.trend = { pctPerDay: -0.01, endsAt: Infinity }
    // token pick, 0.35 is positive without a trend
    expect(smallNews(sequence(0.99, 0.35, 0.9, 0))!.sentiment).toBe('negative')
  })
})

describe('bigEvent', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends a rumour, then moves the base price over the ramp', () => {
    const client = fakeClient()
    addSseClient(client)
    // token DEPLOY, direction up, size 20 %, rumour right, headlines
    const rumor = bigEvent(sequence(0.3, 0.1, 0.666, 0.1, 0))!
    const deploy = getToken('DEPLOY')!
    expect(rumor).toMatchObject({ token: 'DEPLOY', impact: 'rumor', sentiment: 'positive' })
    expect(deploy.inEvent).toBe(true)

    vi.advanceTimersByTime(env.RUMOR_LEAD_MS)
    const [, big] = eventsOf(client, 'news')
    expect(big).toMatchObject({ impact: 'big', sentiment: 'positive', pct: 20 })
    expect(big.durationSec).toBe(env.BIG_EVENT_RAMP_MS / 1000)

    vi.advanceTimersByTime(env.BIG_EVENT_RAMP_MS)
    removeSseClient(client)
    expect(deploy.basePrice).toBeCloseTo(50.4)
    expect(deploy.price).toBeCloseTo(50.4)
    expect(deploy.inEvent).toBe(false)
  })

  it('never picks a stable token', () => {
    for (let i = 0; i < 10; i++) {
      tokens.forEach((t) => (t.inEvent = false))
      expect(bigEvent(() => i / 10)!.token).not.toMatch(/FIKA|SUDO/)
    }
  })
})

describe('pruneNews and recentNews', () => {
  function insert(id: string, token: string, impact: string, timestamp: string) {
    db.prepare(
      `INSERT INTO news (id, token, sentiment, impact, headline, timestamp)
       VALUES (?, ?, 'positive', ?, 'x', ?)`,
    ).run(id, token, impact, timestamp)
  }

  it('keeps big events longer than small news', () => {
    const now = Date.parse('2026-10-28T12:00:00Z')
    insert('a', 'YOLO', 'low', '2026-10-26T12:00:00.000Z')
    insert('b', 'YOLO', 'big', '2026-10-26T12:00:00.000Z')
    insert('c', 'YOLO', 'big', '2026-07-01T12:00:00.000Z')
    pruneNews(now)
    expect(recentNews({ limit: 10 }).map((n) => n.id)).toEqual(['b'])
  })

  it('filters by token and impact, newest first', () => {
    insert('a', 'YOLO', 'low', '2026-10-28T10:00:00.000Z')
    insert('b', 'YOLO', 'big', '2026-10-28T11:00:00.000Z')
    insert('c', 'MEME', 'big', '2026-10-28T12:00:00.000Z')
    expect(recentNews({ limit: 10 }).map((n) => n.id)).toEqual(['c', 'b', 'a'])
    expect(recentNews({ limit: 10, token: 'YOLO' }).map((n) => n.id)).toEqual(['b', 'a'])
    expect(recentNews({ limit: 10, impacts: ['big'] }).map((n) => n.id)).toEqual(['c', 'b'])
  })
})
