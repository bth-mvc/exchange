import { CommandRegistry } from '@dbwebb/tui'
import { ServerCommands } from './commands/server.js'
import { MarketCommands } from './commands/market.js'
import { OrdersCommands } from './commands/orders.js'
import { TradesCommands } from './commands/trades.js'
import { PortfolioCommands } from './commands/portfolio.js'
import { BoardCommands } from './commands/board.js'

/** Builds the same command registry the interactive shell uses — shared so tests can drive
 *  real commands against a real server the same way `--file` mode would, without starting a shell. */
export function createRegistry(): CommandRegistry {
  const registry = new CommandRegistry()
  registry.register('server', new ServerCommands())
  registry.register('market', new MarketCommands())
  registry.register('orders', new OrdersCommands())
  registry.register('trades', new TradesCommands())
  registry.register('portfolio', new PortfolioCommands())
  registry.register('board', new BoardCommands())
  return registry
}
