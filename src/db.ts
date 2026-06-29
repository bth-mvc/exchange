import Database from 'better-sqlite3'
import { env } from './config/env.js'

const dbPath = env.NODE_ENV === 'test' ? ':memory:' : env.DB_PATH

export const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    acronym    TEXT PRIMARY KEY,
    balance    REAL NOT NULL DEFAULT 10000,
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
`)

export interface StudentRow {
  acronym: string
  balance: number
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

export function ensureStudent(acronym: string): void {
  db.prepare(`INSERT OR IGNORE INTO students (acronym) VALUES (?)`).run(acronym)
}
