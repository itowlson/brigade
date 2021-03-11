import "mocha"
import { assert } from "chai"

import { Job } from "../src/jobs"
import { Runnable } from "../src/runnables"

describe("Retry combinator", () => {

  describe("Max attempts", () => {
    it("must not be zero", async () => {
      assert.throws(() => Job.retry(succeedOnNth(1), 0))
    })
    it("must not be negative", async () => {
      assert.throws(() => Job.retry(succeedOnNth(1), -1))
    })
  })

  describe("If the work item succeeds on the first attempt", () => {
    it("it is not rerun", async () => {
      const ledger = Array.of<string>()
      const retry = Job.retry(succeedOnNth(1, () => ledger.push("ran")), 10)
      await retry.run()
      assert.equal(ledger.length, 1)
    })
  })


  describe("If the work item fails", () => {
    it("it is not retried if limited to one attempt", async () => {
      const ledger = Array.of<string>()
      const retry = Job.retry(succeedOnNth(2, () => ledger.push("ran")), 1)
      assert.isFalse(await succeeded(retry.run()))
      assert.equal(ledger.length, 1)
    })
    it("the retry composite succeeds if a subsequent attempt sucdeeds", async () => {
      const ledger = Array.of<string>()
      const retry = Job.retry(succeedOnNth(3, () => ledger.push("ran")), 5)
      assert.isTrue(await succeeded(retry.run()))
      assert.equal(ledger.length, 3)
    })
    it("the retry composite fails if all attempts fail", async () => {
      const ledger = Array.of<string>()
      const retry = Job.retry(succeedOnNth(10, () => ledger.push("ran")), 5)
      assert.isFalse(await succeeded(retry.run()))
      assert.equal(ledger.length, 5)
    })
  })

  describe("If there is a backoff", () => {
    const backoff = { baseSeconds: 0.05, factor: 2, maxSeconds: 0.2 }
    it("it starts at the base time [slow]", async () => {
      const ledger = Array.of<number>()
      const retry = Job.retry(succeedOnNth(3, () => ledger.push(Date.now())), 3).withBackoff(backoff)
      assert.isTrue(await succeeded(retry.run()))
      assert.equal(ledger.length, 3)
      assert.approximately(ledger[1] - ledger[0], 50, 30)
    })
    it("it increases by the specified factor [slow]", async () => {
      const ledger = Array.of<number>()
      const retry = Job.retry(succeedOnNth(4, () => ledger.push(Date.now())), 4).withBackoff(backoff)
      assert.isTrue(await succeeded(retry.run()))
      assert.equal(ledger.length, 4)
      assert.approximately(ledger[1] - ledger[0], 50, 30)
      assert.approximately(ledger[2] - ledger[1], 100, 30)
      assert.approximately(ledger[3] - ledger[2], 200, 30)
    })
    it("it caps at the maximum [slow]", async () => {
      const ledger = Array.of<number>()
      const retry = Job.retry(succeedOnNth(5, () => ledger.push(Date.now())), 5).withBackoff(backoff)
      assert.isTrue(await succeeded(retry.run()))
      assert.equal(ledger.length, 5)
      assert.approximately(ledger[3] - ledger[2], 200, 30)
      assert.approximately(ledger[4] - ledger[3], 200, 30)
    })
  })
})

async function succeeded(promise: Promise<void>): Promise<boolean> {
  try {
    await promise
    return true
  } catch (e) {
    return false
  }
}

function succeedOnNth(successIndex: number, f?: () => void): Runnable {
  let attemptIndex = 0
  return {
    async run() {
      ++attemptIndex
      if (f) { f() }
      if (attemptIndex >= successIndex) {
        return
      }
      throw "fail"
    }
  }
}
