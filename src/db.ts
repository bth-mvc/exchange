import Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { env } from './config/env.js'

const dbPath = env.NODE_ENV === 'test' ? ':memory:' : env.DB_PATH

if (dbPath !== ':memory:') {
  mkdirSync(dirname(dbPath), { recursive: true })
}

export const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    acronym    TEXT PRIMARY KEY,
    balance    REAL NOT NULL DEFAULT 10000,
    webhook_secret TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS holdings (
    acronym TEXT NOT NULL,
    token   TEXT NOT NULL,
    amount  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (acronym, token)
  );

  CREATE TABLE IF NOT EXISTS trades (
    id        TEXT PRIMARY KEY,
    acronym   TEXT NOT NULL,
    token     TEXT NOT NULL,
    side      TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    amount    INTEGER NOT NULL,
    price     REAL NOT NULL,
    total     REAL NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id             TEXT PRIMARY KEY,
    acronym        TEXT NOT NULL,
    token          TEXT NOT NULL,
    side           TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    price          REAL NOT NULL,
    amount         INTEGER NOT NULL,
    remaining      INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled')),
    user_id        TEXT,
    webhook_url    TEXT,
    webhook_secret TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_match ON orders (token, side, status, price);

  CREATE TABLE IF NOT EXISTS webhooks (
    id         TEXT PRIMARY KEY,
    acronym    TEXT NOT NULL,
    body       TEXT NOT NULL,
    signature  TEXT NOT NULL,
    acked_at   TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_webhooks_pending ON webhooks (acronym, acked_at);
`)

// Databases from before webhook secrets: add the column; ensureStudent fills it in.
const studentColumns = db.prepare(`PRAGMA table_info(students)`).all() as { name: string }[]
if (!studentColumns.some((c) => c.name === 'webhook_secret')) {
  db.exec(`ALTER TABLE students ADD COLUMN webhook_secret TEXT`)
}

export interface StudentRow {
  acronym: string
  balance: number
  webhook_secret: string
  created_at: string
}

export interface HoldingRow {
  acronym: string
  token: string
  amount: number
}

export interface TradeRow {
  id: string
  acronym: string
  token: string
  side: string
  amount: number
  price: number
  total: number
  timestamp: string
}

export interface OrderRow {
  id: string
  acronym: string
  token: string
  side: string
  price: number
  amount: number
  remaining: number
  status: string
  user_id: string | null
  webhook_url: string | null
  webhook_secret: string | null
  created_at: string
}

function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`
}

/** Creates the student on first use, with a webhook secret of their own. */
export function ensureStudent(acronym: string): void {
  db.prepare(`INSERT OR IGNORE INTO students (acronym, webhook_secret) VALUES (?, ?)`).run(
    acronym,
    newWebhookSecret(),
  )
  db.prepare(
    `UPDATE students SET webhook_secret = ? WHERE acronym = ? AND webhook_secret IS NULL`,
  ).run(newWebhookSecret(), acronym)
}
