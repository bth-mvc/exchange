declare module '@dbwebb/tui' {
  export type CommandStatus = 'ok' | 'warn' | 'fail'

  export class CommandResult {
    status: CommandStatus
    message: string
  }

  export class BaseCommand {
    publicMethods(): string[]
    help(): string
    ok(message: string): CommandResult
    warn(message: string): CommandResult
    fail(message: string): CommandResult
  }

  export class CommandRegistry {
    register(name: string, instance: BaseCommand): void
    dispatch(tokens: string[]): Promise<{ ok: boolean; status: CommandStatus; message: string }>
  }

  export interface TuiShellOptions {
    welcomeMessage?: string
    defaultGroup?: string
    historyFile?: string
  }

  export class TuiShell {
    constructor(registry: CommandRegistry, options?: TuiShellOptions)
    start(): void
  }
}
