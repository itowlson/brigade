import { Runnable } from "./runnables"
import { sleep } from "./utils/sleep"

/**
 * Describes a backoff strategy for pausing between retries.
 */
export interface Backoff {
  /** The number of seconds to wait before the first retry */
  baseSeconds: number
  /** The amount by which to multiply the wait between consecutive retries */
  factor: number
  /**
   * The maximum number of seconds to wait between retries. If a wait would
   * exceed maxSeconds, Brigade waits maxSeconds instead.
   */
  maxSeconds: number
}

export const NO_BACKOFF = {
  baseSeconds: 0,
  factor: 1,
  maxSeconds: 3600
}

/**
 * Configures how work will be retried.
 */
export interface RetryConfiguration {
  /**
   * Configures a retriable Runnable to wait between retries.
   * @param backoff The strategy that determines the wait between retries
   */
  withBackoff(backoff: Backoff): Runnable & RetryConfiguration
}

export class Retry implements Runnable, RetryConfiguration {
  constructor(private readonly impl: Runnable, private readonly maxAttempts: number, private readonly backoff: Backoff) {
    if (maxAttempts < 1) {
      throw new Error("maxAttempts must be positive")
    }
  }

  async run(): Promise<void> {
    let attemptCount = 0
    let nextBackoffSeconds = this.backoff.baseSeconds
    while (attemptCount < this.maxAttempts) {
      attemptCount++
      try {
        await this.impl.run()
        return
      } catch (e) {
        if (attemptCount >= this.maxAttempts) {
          throw e
        } else {
          await sleep(nextBackoffSeconds * 1000)
          nextBackoffSeconds = Math.min(nextBackoffSeconds * this.backoff.factor, this.backoff.maxSeconds)
        }
      }
    }
  }

  withBackoff(backoff: Backoff): Runnable & RetryConfiguration {
    return new Retry(this.impl, this.maxAttempts, backoff)
  }
}
