import { Runnable } from "./runnables"

export interface ErrorNotifying {
  onError(handler: Runnable): Runnable
}

export class ErrorNotifier implements ErrorNotifying {
  constructor(private readonly runnable: Runnable) { }

  onError(handler: Runnable): Runnable {
    const main = this.runnable
    return {
      async run(): Promise<void> {
        try {
          await main.run()
        } catch (e) {
          await handler.run()
          throw e
        }
      }
    }
  }
}
