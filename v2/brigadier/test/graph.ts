import "mocha"
import { assert } from "chai"

import { Job } from "../src/jobs"
import { Runnable } from "../src/runnables"
import { dependsOn } from "../src/graph"

describe("Dependency graphs", () => {

  describe("A single-item graph", () => {
    it("should succeed if the item succeeded", async () => {
      const graph = Job.graph({
        "item": succeed(),
      })
      assert.isTrue(await succeeded(graph.run()))
    })
    it("should fail if the item failed", async () => {
      const graph = Job.graph({
        "item": fail(),
      })
      assert.isFalse(await succeeded(graph.run()))
    })
  })

  describe("A minimal sequential graph", () => {
    it("should succeed if both items succeeded", async () => {
      const graph = Job.graph({
        "item1": succeed(),
        "item2": [succeed(), dependsOn("item1")]
      })
      assert.isTrue(await succeeded(graph.run()))
    })
    it("should fail if the first item failed", async () => {
      const graph = Job.graph({
        "item1": fail(),
        "item2": [succeed(), dependsOn("item1")]
      })
      assert.isFalse(await succeeded(graph.run()))
    })
    it("should fail if the second item failed", async () => {
      const graph = Job.graph({
        "item1": succeed(),
        "item2": [fail(), dependsOn("item1")]
      })
      assert.isFalse(await succeeded(graph.run()))
    })
    it("should run items in dependency order", async () => {
      const ledger = Array.of<string>()
      const graph = Job.graph({
        "item1": succeed(() => ledger.push("item1")),
        "item2": [succeed(() => ledger.push("item2")), dependsOn("item1")]
      })
      assert.isTrue(await succeeded(graph.run()))
      assert.isTrue(ledger.indexOf("item1") < ledger.indexOf("item2"))
    })
    it("should not run items that depend on failed items", async () => {
      const ledger = Array.of<string>()
      const graph = Job.graph({
        "item1": fail(() => ledger.push("item1")),
        "item2": [succeed(() => ledger.push("item2")), dependsOn("item1")]
      })
      assert.isFalse(await succeeded(graph.run()))
      assert.equal(ledger.indexOf("item2"), -1)
    })
  })

  describe("An item that depends on two other items", () => {
    it("should run if both dependencies succeeded", async () => {
      const ledger = Array.of<string>()
      const graph = Job.graph({
        "item1a": succeed(() => ledger.push("item1a")),
        "item1b": succeed(() => ledger.push("item1b")),
        "item2": [succeed(() => ledger.push("item2")), dependsOn("item1a", "item1b")]
      })
      assert.isTrue(await succeeded(graph.run()))
      assert.isTrue(ledger.indexOf("item1a") < ledger.indexOf("item2"))
      assert.isTrue(ledger.indexOf("item1b") < ledger.indexOf("item2"))
    })
    it("should not run items that depend on failed items", async () => {
      const ledger = Array.of<string>()
      const graph = Job.graph({
        "item1a": succeed(() => ledger.push("item1a")),
        "item1b": fail(() => ledger.push("item1b")),
        "item2": [succeed(() => ledger.push("item2")), dependsOn("item1a", "item1b")]
      })
      assert.isFalse(await succeeded(graph.run()))
      assert.equal(ledger.indexOf("item2"), -1)
    })
  })
})

function fail(f?: () => void): Runnable {
  return {
    async run() { if (f) { f() } throw "fail" }
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
