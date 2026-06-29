import { CommandRegistry, TuiShell } from '@dbwebb/tui'
import { ServerCommands } from './commands/server.js'
import { MarketCommands } from './commands/market.js'
import { OrdersCommands } from './commands/orders.js'
import { TradesCommands } from './commands/trades.js'
import { PortfolioCommands } from './commands/portfolio.js'
import { BoardCommands } from './commands/board.js'

const exchangeUrl = (process.env.EXCHANGE_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const apiKey = process.env.API_KEY ?? ''

if (!apiKey) console.warn('Varning: API_KEY är inte satt — anrop till exchange kommer att misslyckas.')

const registry = new CommandRegistry()
registry.register('server', new ServerCommands())
registry.register('market', new MarketCommands())
registry.register('orders', new OrdersCommands())
registry.register('trades', new TradesCommands())
registry.register('portfolio', new PortfolioCommands())
registry.register('board', new BoardCommands())

new TuiShell(registry, {
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
}).start()
