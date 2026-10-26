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
  MARKET_MAKER_QUOTE_VALUE: z.coerce.number().default(5000),
  MARKET_MAKER_MAX_POSITION_VALUE: z.coerce.number().default(50_000),
  PRICE_BAND_PCT: z.coerce.number().default(0.1),
  PRICE_IMPACT: z.coerce.number().default(0.25),
  PRICE_REVERSION: z.coerce.number().default(0.02),
})

export const env = schema.parse(process.env)
