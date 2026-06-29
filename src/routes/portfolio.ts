import { Router } from 'express'
import { db, ensureStudent } from '../db.js'
import type { StudentRow, HoldingRow } from '../db.js'
import { currentPrice } from '../market/tokens.js'

export const portfolioRouter = Router()

portfolioRouter.get('/', (_req, res) => {
  const { acronym } = res.locals.student as { acronym: string }
  ensureStudent(acronym)

  const student = db.prepare(`SELECT * FROM students WHERE acronym = ?`).get(acronym) as StudentRow
  const holdings = db
    .prepare(`SELECT * FROM holdings WHERE acronym = ? AND amount > 0`)
    .all(acronym) as HoldingRow[]

  const holdingsWithValue = holdings.map((h) => ({
    token: h.token,
    amount: h.amount,
    currentPrice: currentPrice(h.token),
    value: +(h.amount * currentPrice(h.token)).toFixed(2),
  }))

  const totalValue = +(
    student.balance + holdingsWithValue.reduce((sum, h) => sum + h.value, 0)
  ).toFixed(2)

  res.json({
    balance: +student.balance.toFixed(2),
    totalValue,
    holdings: holdingsWithValue,
  })
})
