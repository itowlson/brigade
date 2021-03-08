import "mocha"
import { assert } from "chai"

import { Job } from "../src/jobs"
import { Runnable } from "../src/runnables"

describe("Error handlers", () => {

  describe("If a tried item succeeds", () => {
    it("the error handler does not run", async () => {
      const ledger = Array.of<string>()
      const composite = Job.try(succeed(() => ledger.push("main"))).onError(succeed(() => ledger.push("handler")))
      assert.isTrue(await succeeded(composite.run()))
      assert.equal(ledger.length, 1)
      assert.equal(ledger[0], "main")
    })
  })

  describe("If a tried item fails", () => {
    it("the composite fails", async () => {
      const ledger = Array.of<string>()
      const composite = Job.try(fail(() => ledger.push("main"))).onError(succeed(() => ledger.push("handler")))
      assert.isFalse(await succeeded(composite.run()))
    })
    it("the error handler runs", async () => {
      const ledger = Array.of<string>()
      const composite = Job.try(fail(() => ledger.push("main"))).onError(succeed(() => ledger.push("handler")))
      assert.isFalse(await succeeded(composite.run()))
      assert.equal(ledger.length, 2)
      assert.equal(ledger[0], "main")
      assert.equal(ledger[1], "handler")
    })
  })
})

function fail(f?: () => void): Runnable {
  return {
    async run() { if (f) { f() } throw new Error("fail") }
  }
}

function succeed(f?: () => void): Runnable {
  return {
    async run() { if (f) { f() } }
  }
}

async function succeeded(promise: Promise<void>): Promise<boolean> {
  try {
    await promise
    return true
  } catch (e) {
    return false
  }
}
