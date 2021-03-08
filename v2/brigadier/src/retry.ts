import { Runnable } from "./runnables"

export class Retry implements Runnable {
  constructor(private readonly impl: Runnable, private readonly maxAttempts: number) {
    if (maxAttempts < 1) {
      throw new Error("maxAttempts must be positive")
    }
  }

  async run(): Promise<void> {
    let attemptCount = 0
    while (attemptCount < this.maxAttempts) {
      attemptCount++
      try {
        await this.impl.run()
        return
      } catch (e) {
        if (attemptCount >= this.maxAttempts) {
          throw e
        }
      }
    }
  }
}
