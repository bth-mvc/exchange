import { BaseCommand } from '@dbwebb/tui'
import { makeClient, type Req } from '../client.js'

interface Holding {
  token: string
  amount: number
  currentPrice: number
  value: number
}

interface Portfolio {
  balance: number
  totalValue: number
  holdings: Holding[]
}

export class PortfolioCommands extends BaseCommand {
  private readonly req: Req

  static descriptions = {
    show: 'show   Visa din portfölj och innehav',
  }

  constructor() {
    super()
    const url = (process.env.EXCHANGE_URL ?? 'http://localhost:4000').replace(/\/$/, '')
    const apiKey = process.env.API_KEY ?? ''
    this.req = makeClient(url, apiKey)
  }

  async show(): Promise<string> {
    const res = await this.req('GET', '/portfolio')
    if (!res.ok) return `Error ${res.status}: ${await res.text()}`
    const p = (await res.json()) as Portfolio

    const lines = [
      `Kontanter : ${p.balance.toFixed(2)} kr`,
      `Totalvärde: ${p.totalValue.toFixed(2)} kr`,
    ]

    if (p.holdings.length === 0) {
      lines.push('', 'Inga innehav.')
    } else {
      lines.push('', 'Innehav:')
      lines.push('Token   Antal  Pris        Värde')
      lines.push('------  -----  ----------  ----------')
      for (const h of p.holdings) {
        lines.push(
          `${h.token.padEnd(6)}  ${String(h.amount).padStart(5)}  ` +
            `${h.currentPrice.toFixed(2).padStart(10)}  ` +
            `${h.value.toFixed(2).padStart(10)}`,
        )
      }
    }

    return lines.join('\n')
  }
}
