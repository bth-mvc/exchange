import { BaseCommand } from '@dbwebb/tui'
import { makeClient, type Req } from '../client.js'

interface Token {
  id: string
  name: string
  type: string
  price: number
}

interface OrderBookEntry {
  price: number
  amount: number
}

interface OrderBook {
  token: string
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
}

export class MarketCommands extends BaseCommand {
  private readonly req: Req

  static descriptions = {
    assets: 'assets                   Lista alla tokens med aktuellt pris',
    orderbook: 'orderbook <token>        Visa orderboken för en token (FIKA, SUDO, YOLO...)',
  }

  constructor() {
    super()
    const url = (process.env.EXCHANGE_URL ?? 'http://localhost:4001').replace(/\/$/, '')
    const apiKey = process.env.API_KEY ?? ''
    this.req = makeClient(url, apiKey)
  }

  async assets(): Promise<string> {
    const res = await this.req('GET', '/assets')
    if (!res.ok) return `Error ${res.status}: ${await res.text()}`
    const tokens = (await res.json()) as Token[]

    const header = 'Token   Namn                Typ        Pris'
    const sep = '------  ------------------  ---------  --------'
    const lines = tokens.map(
      (t) =>
        `${t.id.padEnd(6)}  ${t.name.padEnd(18)}  ${t.type.padEnd(9)}  ${t.price.toFixed(2).padStart(8)}`,
    )
    return [header, sep, ...lines].join('\n')
  }

  async orderbook(token: string): Promise<string> {
    if (!token) return 'Usage: market orderbook <token>'
    const res = await this.req('GET', `/assets/${token.toUpperCase()}/orderbook`)
    if (res.status === 404) return `Token "${token.toUpperCase()}" finns inte.`
    if (!res.ok) return `Error ${res.status}: ${await res.text()}`
    const ob = (await res.json()) as OrderBook

    const lines = [
      `Orderbok: ${ob.token}`,
      '',
      'KÖPBUD (bids)              SÄLJBUD (asks)',
      'Pris        Antal          Pris        Antal',
      '----------  -----          ----------  -----',
    ]
    const len = Math.max(ob.bids.length, ob.asks.length)
    for (let i = 0; i < len; i++) {
      const bid = ob.bids[i]
      const ask = ob.asks[i]
      const b = bid ? `${bid.price.toFixed(2).padStart(10)}  ${String(bid.amount).padStart(5)}` : ' '.repeat(18)
      const a = ask ? `${ask.price.toFixed(2).padStart(10)}  ${String(ask.amount).padStart(5)}` : ''
      lines.push(`${b}         ${a}`)
    }
    return lines.join('\n')
  }
}
