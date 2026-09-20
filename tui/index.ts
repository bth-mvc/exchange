import os from 'node:os'
import path from 'node:path'
import { TuiShell } from '@dbwebb/tui'
import { createRegistry } from './registry.js'

const exchangeUrl = (process.env.EXCHANGE_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const apiKey = process.env.API_KEY ?? ''

if (!apiKey)
  console.warn('Varning: API_KEY är inte satt — anrop till exchange kommer att misslyckas.')

new TuiShell(createRegistry(), {
  welcomeMessage: `Exchange — test- och admin-CLI
Tokenbörsen för MVC-kursen vid BTH.

  Server  : ${exchangeUrl}
  API-key : ${apiKey ? apiKey.slice(0, 8) + '...' : '(ej satt — sätt API_KEY i .env)'}

  Kommandogrupper:
    server    — health | docs
    market    — assets | orderbook <token>
    orders    — buy <token> <antal> <pris> | sell <token> <antal> <pris>
    trades    — list [antal]
    portfolio — show
    board     — show`,
  defaultGroup: 'market',
  historyFile: path.join(os.homedir(), '.dbwtui', 'exchange_history'),
}).start()
