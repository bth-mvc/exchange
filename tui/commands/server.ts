import { BaseCommand } from '@dbwebb/tui'

interface HealthResponse {
  status: string
  uptime: number
}

export class ServerCommands extends BaseCommand {
  private readonly url: string

  static descriptions = {
    health: 'health   Kontrollera att servern är igång',
    docs: 'docs     Visa URL till Swagger UI',
  }

  constructor() {
    super()
    this.url = (process.env.EXCHANGE_URL ?? 'http://localhost:4000').replace(/\/$/, '')
  }

  async health(): Promise<string> {
    const res = await fetch(`${this.url}/health`)
    if (!res.ok) return `Error ${res.status}: ${await res.text()}`
    const data = (await res.json()) as HealthResponse
    const uptime = Math.floor(data.uptime)
    const h = Math.floor(uptime / 3600)
    const m = Math.floor((uptime % 3600) / 60)
    const s = uptime % 60
    const uptimeStr = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`
    return `Status: ${data.status}  Uptime: ${uptimeStr}`
  }

  async docs(): Promise<string> {
    return `Swagger UI: ${this.url}/docs`
  }
}
