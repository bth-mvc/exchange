import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  API_KEY_SERVER_URL: z.string().url().default('http://localhost:5000'),
  SERVICE_TOKEN: z.string().min(1),
  KEY_CACHE_TTL_MS: z.coerce.number().default(86_400_000),
  DB_PATH: z.string().default('./data/exchange.db'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export const env = schema.parse(process.env)
