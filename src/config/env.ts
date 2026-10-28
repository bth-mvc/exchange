import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  API_KEY_SERVER_URL: z.string().url().default('http://localhost:5000'),
  SERVICE_TOKEN: z.string().min(1),
  KEY_CACHE_TTL_MS: z.coerce.number().default(86_400_000),
  DEV_API_KEY: z.string().optional(),
  DB_PATH: z.string().default('./data/exchange.db'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MARKET_MAKER_SWEEP_INTERVAL_MS: z.coerce.number().default(1000),
  MARKET_MAKER_ACRONYM: z.string().min(1).default('marvin'),
  MARKET_MAKER_SPREAD_PCT: z.coerce.number().default(0.02),
  MARKET_MAKER_LEVELS: z.coerce.number().int().min(1).default(5),
  MARKET_MAKER_LEVEL_STEP_PCT: z.coerce.number().default(0.01),
  MARKET_MAKER_QUOTE_VALUE: z.coerce.number().default(5000),
  MARKET_MAKER_MAX_POSITION_VALUE: z.coerce.number().default(50_000),
  PRICE_BAND_PCT: z.coerce.number().default(0.1),
  PRICE_IMPACT: z.coerce.number().default(0.25),
  PRICE_REVERSION: z.coerce.number().default(0.02),
  BASE_REVERSION: z.coerce.number().default(0.00003),
  MARKET_MAKER_EVENT_SPREAD_FACTOR: z.coerce.number().default(2.5),
  NEWS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  NEWS_INTERVAL_MS: z.coerce.number().default(600_000),
  NEWS_TOKEN_GAP_MS: z.coerce.number().default(3_600_000),
  NEWS_RAMP_MS: z.coerce.number().default(10_000),
  BIG_EVENT_INTERVAL_MS: z.coerce.number().default(14_400_000),
  BIG_EVENT_RAMP_MS: z.coerce.number().default(180_000),
  RUMOR_LEAD_MS: z.coerce.number().default(180_000),
  RUMOR_ACCURACY: z.coerce.number().min(0).max(1).default(0.75),
  NEWS_KEEP_DAYS: z.coerce.number().default(1),
  BIG_EVENT_KEEP_DAYS: z.coerce.number().default(60),
  HISTORY_SAMPLE_MS: z.coerce.number().default(10_000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
})

export const env = schema.parse(process.env)
