import { Runnable } from "./runnables"

/*

desired UX e.g.

Job.graph({
  a1: Job.container("a1"),
  a2: Job.container("a2"),
  a3: Job.container("a3"),
  a4: Job.container("a4"),
  b1: { action: Job.serial(...), dependsOn: ["a1", "a2"] },
  b2: { action: Job.concurrent(...), dependsOn: ["a2", "a3"] },
  c1: { action: Job.container("c1"), dependsOn: ["b1", "b2", "a4"] },
})

Job.graph({
  a1: Job.container("a1"),
  a2: Job.container("a2"),
  a3: Job.container("a3"),
  a4: Job.container("a4"),
  b1: [Job.serial(...), dependsOn("a1", "a2")],
  b2: [Job.concurrent(...), dependsOn("a2", "a3")],
  c1: [Job.container("c1"), dependsOn("b1", "b2", "a4")],
})

*/

interface Dependencies {
  readonly dependsOn: ReadonlyArray<string>
}

export type GraphItemSpec =
  Runnable |
  { readonly action: Runnable, readonly dependsOn?: ReadonlyArray<string> } |
  [ Runnable, Dependencies ]

export function dependsOn(...ids: string[]): Dependencies {
  return { dependsOn: Array.of(...ids) }
}

function isRunnable(spec: GraphItemSpec): spec is Runnable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!((spec as any).run)
}

function isKeyedObject(spec: GraphItemSpec): spec is { readonly action: Runnable, readonly dependsOn?: ReadonlyArray<string> } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!((spec as any).action)  
}

function canonicalise(spec: GraphItemSpec): [Runnable, ReadonlyArray<string>] {
  if (isRunnable(spec)) {
    return [spec, []]
  } else if (isKeyedObject(spec)) {
    return [spec.action, spec.dependsOn || []]
  } else {
    return [spec[0], spec[1].dependsOn]
  }
}

function toQueuedRunnable(id: string, spec: GraphItemSpec): QueuedRunnable {
  const [runnable, dependsOn] = canonicalise(spec)
  return {
    id,
    value: runnable,
    dependsOn,
    status: QueuedRunnableStatus.NotStarted
  }
}

export class GraphBuilder {
  static build(spec: { [key: string]: GraphItemSpec }): Runnable {
    const items = Object.entries(spec).map(([id, gis]) => toQueuedRunnable(id, gis))
    return new DependencyGraph(items)
  }
}

class DependencyGraph implements Runnable {
  constructor(private readonly items: ReadonlyArray<QueuedRunnable>) {}

  async run(): Promise<void> {
    if (!this.allReachable()) {
      throw new Error("not all items in the graph are reachable")
    }

    const inProgress = new Map<string, Promise<QueuedRunnable>>()
    for (;;) {
      if (this.allDone()) {
        return
      }

      // ready => not started and all dependencies satisfied
      const ready = this.readyItems()

      // start all ready items
      for (const r of ready) {
        r.status = QueuedRunnableStatus.InProgress
        inProgress.set(r.id, run(r))
      }
      
      // when any item finishes, check for new items that are now ready
      const finished = await Promise.race(inProgress.values())
      inProgress.delete(finished.id)
      if (finished.status === QueuedRunnableStatus.Failed) {
        throw `${finished.id} failed`  // TODO: cancel things and propagate details
      } else {
        continue
      }
    }
  }

  private allDone(): boolean {
    return this.items.every((item) => item.status === QueuedRunnableStatus.Completed || item.status === QueuedRunnableStatus.Failed)
  }
  
  private allReachable(): boolean {
    const reachableCache = new Map<string, boolean>()
    return this.items.every((item) => this.isReachable(item, reachableCache))
  }

  private isReachable(item: QueuedRunnable | undefined, reachableCache: Map<string, boolean>): boolean {
    if (item === undefined) {
      return false
    }
    if (item.dependsOn.length === 0) {
      reachableCache.set(item.id, true)
      return true
    }
    const cached = reachableCache.get(item.id)
    if (cached !== undefined) {
      return cached
    }
    const reachable = item.dependsOn.every((id) => this.isReachable(this.item(id), reachableCache))
    reachableCache.set(item.id, reachable)
    return reachable
  }

  private readyItems(): QueuedRunnable[] {
    return this.items.filter((item) => this.isReady(item))  // we need the pointful style for this binding
  }

  private isReady(runnable: QueuedRunnable): boolean {
    return runnable.status === QueuedRunnableStatus.NotStarted &&
      this.areDependenciesSatisfied(runnable)
  }

  private areDependenciesSatisfied(runnable: QueuedRunnable): boolean {
    return runnable.dependsOn.every((dep) => this.item(dep)?.status === QueuedRunnableStatus.Completed)
  }

  private item(id: string): QueuedRunnable | undefined {
    return this.items.find((item) => item.id === id)
  }
}

async function run(runnable: QueuedRunnable): Promise<QueuedRunnable> {
  try {
    await runnable.value.run()
    runnable.status = QueuedRunnableStatus.Completed
  } catch (e) {
    runnable.status = QueuedRunnableStatus.Failed
  }
  return runnable
}

interface QueuedRunnable {
  readonly id: string
  readonly dependsOn: ReadonlyArray<string>
  readonly value: Runnable
  status: QueuedRunnableStatus
}

enum QueuedRunnableStatus {
  NotStarted,
  InProgress,
  Completed,
  Failed,
}
