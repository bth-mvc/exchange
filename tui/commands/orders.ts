import { BaseCommand } from '@dbwebb/tui'
import { makeClient, type Req } from '../client.js'

interface OrderResponse {
  id: string
  token: string
  side: string
  amount: number
  price: number
  status: string
}

export class OrdersCommands extends BaseCommand {
  private readonly req: Req

  static descriptions = {
    buy: 'buy <token> <amount> <price>   Lägg en köporder',
    sell: 'sell <token> <amount> <price>  Lägg en säljorder',
  }

  constructor() {
    super()
    const url = (process.env.EXCHANGE_URL ?? 'http://localhost:4000').replace(/\/$/, '')
    const apiKey = process.env.API_KEY ?? ''
    this.req = makeClient(url, apiKey)
  }

  private async place(side: 'buy' | 'sell', token: string, amount: string, price: string): Promise<string> {
    if (!token || !amount || !price) return `Usage: orders ${side} <token> <amount> <price>`
    const amt = parseInt(amount, 10)
    const prc = parseFloat(price)
    if (isNaN(amt) || amt <= 0) return 'amount måste vara ett positivt heltal.'
    if (isNaN(prc) || prc <= 0) return 'price måste vara ett positivt tal.'

    const res = await this.req('POST', '/orders', { token: token.toUpperCase(), side, amount: amt, price: prc })
    if (!res.ok) return `Error ${res.status}: ${await res.text()}`
    const order = (await res.json()) as OrderResponse
    const total = (order.amount * order.price).toFixed(2)

    return [
      `Order lagd: ${order.id}`,
      `  Token  : ${order.token}`,
      `  Sida   : ${order.side}`,
      `  Antal  : ${order.amount}`,
      `  Pris   : ${order.price.toFixed(2)}`,
      `  Total  : ${total}`,
      `  Status : ${order.status}`,
      '',
      '→ Matchas inom ~1 sek. Kör "portfolio show" eller "trades list" för att se resultatet.',
    ].join('\n')
  }

  async buy(token: string, amount: string, price: string): Promise<string> {
    return this.place('buy', token, amount, price)
  }

  async sell(token: string, amount: string, price: string): Promise<string> {
    return this.place('sell', token, amount, price)
  }
}
