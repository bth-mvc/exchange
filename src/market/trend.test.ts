import { describe, it, expect, beforeEach } from 'vitest'
import { env } from '../config/env.js'
import { startTrend, stepTrend, TREND_STEP_MS } from './trend.js'
import { tokens, getToken } from './tokens.js'

/** A stand-in for Math.random that returns the given values in turn. */
function sequence(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]
}

const day = 86_400_000
const original = tokens.map((t) => ({ ...t }))

beforeEach(() => {
  tokens.forEach((t, i) => Object.assign(t, original[i], { trend: undefined }))
})

describe('startTrend', () => {
  it('picks direction, rate and length', () => {
    const yolo = getToken('YOLO')!
    // up, lowest rate, longest
    startTrend(yolo, 0, sequence(0.1, 0, 1))
    expect(yolo.trend).toEqual({ pctPerDay: env.TREND_MIN_PCT, endsAt: env.TREND_MAX_DAYS * day })
  })

  it('leans back towards the start price', () => {
    const yolo = getToken('YOLO')!
    yolo.anchor = 6.3
    startTrend(yolo, 0, sequence(0.3, 0.5, 0.5))
    expect(yolo.trend!.pctPerDay).toBeLessThan(0)
  })
})

describe('stepTrend', () => {
  it('moves anchor and base price by the rate', () => {
    const deploy = getToken('DEPLOY')!
    deploy.basePrice = 44
    deploy.trend = { pctPerDay: 0.02, endsAt: 10 * day }

    stepTrend(deploy, day, day)
    expect(deploy.anchor).toBeCloseTo(42.84)
    expect(deploy.basePrice).toBeCloseTo(44.88)
    expect(deploy.trend).toBeDefined()
  })

  it('ends when the time is up', () => {
    const deploy = getToken('DEPLOY')!
    deploy.trend = { pctPerDay: 0.02, endsAt: day }
    stepTrend(deploy, day, TREND_STEP_MS)
    expect(deploy.trend).toBeUndefined()
  })

  it('stops at twice the start price', () => {
    const deploy = getToken('DEPLOY')!
    deploy.anchor = 83
    deploy.basePrice = 83.5
    deploy.trend = { pctPerDay: 0.02, endsAt: 10 * day }

    stepTrend(deploy, day, day)
    expect(deploy.anchor).toBe(84)
    expect(deploy.basePrice).toBe(84)
    expect(deploy.trend).toBeUndefined()
  })

  it('starts trends only on volatile tokens', () => {
    for (const t of tokens) stepTrend(t, 0, TREND_STEP_MS, () => 0)
    expect(tokens.filter((t) => t.trend).map((t) => t.type)).toEqual([
      'volatile',
      'volatile',
      'volatile',
    ])
  })

  it('starts about once every TREND_GAP_MS', () => {
    const yolo = getToken('YOLO')!
    stepTrend(yolo, 0, TREND_STEP_MS, () => TREND_STEP_MS / env.TREND_GAP_MS + 1e-9)
    expect(yolo.trend).toBeUndefined()
  })
})
