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
    balance    REAL NOT NULL DEFAULT 100000,
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
    status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
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

  CREATE TABLE IF NOT EXISTS news (
    id           TEXT PRIMARY KEY,
    token        TEXT NOT NULL,
    sentiment    TEXT NOT NULL,
    impact       TEXT NOT NULL,
    headline     TEXT NOT NULL,
    pct          REAL,
    duration_sec INTEGER,
    timestamp    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_news_timestamp ON news (timestamp);

  CREATE TABLE IF NOT EXISTS price_ticks (
    token     TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    price     REAL NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_price_ticks ON price_ticks (token, timestamp);

  CREATE TABLE IF NOT EXISTS price_days (
    token TEXT NOT NULL,
    day   TEXT NOT NULL,
    close REAL NOT NULL,
    PRIMARY KEY (token, day)
  );

  CREATE TABLE IF NOT EXISTS value_days (
    acronym TEXT NOT NULL,
    day     TEXT NOT NULL,
    value   REAL NOT NULL,
    PRIMARY KEY (acronym, day)
  );

  CREATE TABLE IF NOT EXISTS token_state (
    token      TEXT PRIMARY KEY,
    price      REAL NOT NULL,
    base_price REAL NOT NULL
  );
`)

// Databases from before webhook secrets: add the column; ensureStudent fills it in.
const studentColumns = db.prepare(`PRAGMA table_info(students)`).all() as { name: string }[]
if (!studentColumns.some((c) => c.name === 'webhook_secret')) {
  db.exec(`ALTER TABLE students ADD COLUMN webhook_secret TEXT`)
}

// Databases from before cancel: the status CHECK does not allow 'cancelled'. SQLite cannot change
// a CHECK, so the table is copied into a new one with the current definition.
const ordersSql = (
  db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'`).get() as {
    sql: string
  }
).sql
if (!ordersSql.includes("'cancelled'")) {
  db.transaction(() => {
    db.exec(
      ordersSql
        .replace(/CREATE TABLE (IF NOT EXISTS )?orders/, 'CREATE TABLE orders_new')
        .replace(
          "CHECK (status IN ('open', 'filled'))",
          "CHECK (status IN ('open', 'filled', 'cancelled'))",
        ),
    )
    db.exec(`INSERT INTO orders_new SELECT * FROM orders`)
    db.exec(`DROP TABLE orders`)
    db.exec(`ALTER TABLE orders_new RENAME TO orders`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_match ON orders (token, side, status, price)`)
  })()
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

/** What a new student starts with. Set explicitly on insert: a column DEFAULT in an
 *  existing database keeps the value from when the table was created. */
export const STARTING_BALANCE = 100_000

/** Creates the student on first use, with a webhook secret of their own. */
export function ensureStudent(acronym: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO students (acronym, balance, webhook_secret) VALUES (?, ?, ?)`,
  ).run(acronym, STARTING_BALANCE, newWebhookSecret())
  db.prepare(
    `UPDATE students SET webhook_secret = ? WHERE acronym = ? AND webhook_secret IS NULL`,
  ).run(newWebhookSecret(), acronym)
}
