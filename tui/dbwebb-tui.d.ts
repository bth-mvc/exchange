declare module '@dbwebb/tui' {
  export class BaseCommand {
    publicMethods(): string[]
    help(): string
  }

  export class CommandRegistry {
    register(name: string, instance: BaseCommand): void
    dispatch(tokens: string[]): Promise<{ ok: boolean; message: string }>
  }

  export interface TuiShellOptions {
    welcomeMessage?: string
    defaultGroup?: string
  }

  export class TuiShell {
    constructor(registry: CommandRegistry, options?: TuiShellOptions)
    start(): void
  }
}
