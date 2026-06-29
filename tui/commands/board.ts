import { BaseCommand } from '@dbwebb/tui'
import { makeClient, type Req } from '../client.js'

interface LeaderboardEntry {
  rank: number
  acronym: string
  totalValue: number
  buys: number
  sells: number
  lastTradeAt: string | null
}

export class BoardCommands extends BaseCommand {
  private readonly req: Req

  static descriptions = {
    show: 'show   Visa leaderboard',
  }

  constructor() {
    super()
    const url = (process.env.EXCHANGE_URL ?? 'http://localhost:4001').replace(/\/$/, '')
    const apiKey = process.env.API_KEY ?? ''
    this.req = makeClient(url, apiKey)
  }

  async show(): Promise<string> {
    const res = await this.req('GET', '/leaderboard')
    if (!res.ok) return `Error ${res.status}: ${await res.text()}`
    const entries = (await res.json()) as LeaderboardEntry[]

    if (entries.length === 0) return 'Inga studenter registrerade ännu.'

    const header = 'Rank  Akronym       Totalvärde   Köp   Sälj  Senaste trade'
    const sep = '----  ------------  -----------  ----  ----  -------------------'
    const lines = entries.map((e) => {
      const last = e.lastTradeAt ? e.lastTradeAt.replace('T', ' ').slice(0, 19) : '-'
      return (
        `${String(e.rank).padStart(4)}  ${e.acronym.padEnd(12)}  ` +
        `${e.totalValue.toFixed(2).padStart(11)}  ` +
        `${String(e.buys).padStart(4)}  ${String(e.sells).padStart(4)}  ${last}`
      )
    })
    return [header, sep, ...lines].join('\n')
  }
}
