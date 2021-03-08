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
