import { BaseCommand } from '@dbwebb/tui'
import { makeClient, type Req } from '../client.js'

interface Trade {
  id: string
  token: string
  side: string
  amount: number
  price: number
  total: number
  timestamp: string
}

interface TradesResponse {
  trades: Trade[]
  cursor: string | null
}

export class TradesCommands extends BaseCommand {
  private readonly req: Req

  static descriptions = {
    list: 'list [antal]   Visa senaste trades (default 10)',
  }

  constructor() {
    super()
    const url = (process.env.EXCHANGE_URL ?? 'http://localhost:4000').replace(/\/$/, '')
    const apiKey = process.env.API_KEY ?? ''
    this.req = makeClient(url, apiKey)
  }

  async list(limitArg?: string): Promise<string> {
    const limit = limitArg ? Math.min(parseInt(limitArg, 10), 100) : 10
    const res = await this.req('GET', `/trades?limit=${limit}`)
    if (!res.ok) return `Error ${res.status}: ${await res.text()}`
    const data = (await res.json()) as TradesResponse

    if (data.trades.length === 0) return 'Inga trades ännu.'

    const header = 'Token   Sida   Antal  Pris        Total       Tidpunkt'
    const sep = '------  -----  -----  ----------  ----------  -------------------'
    const lines = data.trades.map((t) => {
      const ts = t.timestamp.replace('T', ' ').slice(0, 19)
      return (
        `${t.token.padEnd(6)}  ${t.side.padEnd(5)}  ` +
        `${String(t.amount).padStart(5)}  ` +
        `${t.price.toFixed(2).padStart(10)}  ` +
        `${t.total.toFixed(2).padStart(10)}  ${ts}`
      )
    })

    const result = [header, sep, ...lines]
    if (data.cursor) result.push(`\n(fler trades finns — cursor: ${data.cursor})`)
    return result.join('\n')
  }
}
