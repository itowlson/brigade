import { Event } from "./events"
import { GraphBuilder, GraphItemSpec } from "./graph"
import { ConcurrentGroup, SerialGroup } from "./groups"
import { ErrorNotifier, ErrorNotifying } from "./onerror"
import { NO_BACKOFF, Retry, RetryConfiguration } from "./retry"
import { Runnable } from "./runnables"

const defaultTimeout: number = 1000 * 60 * 15

/**
 * A Brigade job.
 * 
 * Instances of Job represent containers that your Brigade script can
 * run using the Job#run method.
 * 
 * The Job#primaryContainer, initialized from the constructor image argument, determines
 * how long the job runs and whether it is considered successful. By default, the container is simply
 * executed (via its default entry point). Set the Job#primaryContainer#command
 * property to run a specific command in the container instead.
 * Other containers, specified via Job#sidecarContainers, are automatically
 * terminated a short time after the primary container completes.
 * 
 * Job also provides static methods for building up runnable
 * elements out of more basic ones. For example, to compose
 * a set of workloads into a sequence, you can use the
 * Job.sequence method.
 */
export class Job implements Runnable {
  /** The name of the job. */
  public name: string

  /** Provides configuration options for the job's primary container. */
  public primaryContainer: Container

  /** Specifies sidecar containers to run alongside the primary container. */
  public sidecarContainers: { [key: string]: Container } = {}

  /**
   * The duration, in milliseconds, after which Brigade should automatically
   * terminate and fail the job if it has not completed. The default is 15
   * minutes.
   */
  public timeout: number = defaultTimeout

  /** Specifies requirements for the job execution environment. */
  public host: JobHost = new JobHost()

  /** The event that triggered the job. */
  protected event: Event

  /**
   * Constructs a new Job.
   * @param name The name of the job
   * @param image The OCI image reference for the primary container
   * @param event The event that triggered the job
   */
  constructor(
    name: string,
    image: string,
    event: Event
  ) {
    this.name = name
    this.primaryContainer = new Container(image)
    this.event = event
  }

  /**
   * Runs the job.
   * 
   * When you run the job, Brigade runs all the containers, primary and sidecar.
   * When the primary container exits, the job ends. If sidecars are still running
   * at this point, Brigade terminates them after a short delay.
   * 
   * NOTE: In a local test environment, this function does not run the containers,
   * but instead automatically succeeds. In the real Brigade runtime environment,
   * the containers run as described.
   * 
   * @returns A Promise which completes when the primary container completes. If the
   * primary container succeeded (exited with code 0), the Promise resolves; if the
   * primary container failed (exited with nonzero code) or timed out, the Promise
   * rejects. Sidecars do not affect success or failure of the job.
   */
  public run(): Promise<void> {
    return Promise.resolve()
  }

  /**
   * Gets the job logs.
   * 
   * If the job has multiple containers, this aggregates the logs from them all.
   * 
   * NOTE: In a local test environment, this function returns a dummy log. In the
   * real Brigade runtime environment, it returns the actual container logs.
   */
  public logs(): Promise<string> {
    return Promise.resolve("skipped logs")
  }

  /**
   * Specifies a Runnable that executes one or more containers. The
   * image argument specifies the primary container, which determines
   * how long the job runs and whether it is considered successful.
   * By default, the primary container is simply
   * executed (via its default entry point). Set the Job#primaryContainer#command
   * property to run a specific command in the container instead.
   * Other containers, specified via Job#sidecarContainers, are automatically
   * terminated after the primary container completes.
   * 
   * (Note: This is equivalent to `new Job(...)`. It is provided so that
   * script authors have the option of a consistent style for creating
   * and composing jobs and groups.)
   * 
   * @param name The name of the job
   * @param image The OCI image reference for the primary container
   * @param event The event that triggered the job
   */
  public static container(
    name: string,
    image: string,
    event: Event
  ): Job {
    return new Job(name, image, event)
  }

  /**
   * Specifies a Runnable composed of sub-Runnables (such as jobs
   * or concurrent groups) running one after another.
   * A new Runnable is started only when the previous one completes.
   * The sequence completes when the last Runnable has completed (or when any
   * Runnable fails).
   * 
   * @param runnables The work items to be run in sequence
   */
  public static sequence(...runnables: Runnable[]): SerialGroup {
    return new SerialGroup(...runnables)
  }

  /**
   * Specifies a Runnable composed of sub-Runnables (such as jobs
   * or sequential groups) running concurrently.
   * When run, all Runnables are started simultaneously (subject to
   * scheduling constraints).
   * The concurrent group completes when all Runnables have completed.
   * 
   * @param runnables The work items to be run in parallel
   */
  public static concurrent(...runnables: Runnable[]): ConcurrentGroup {
    return new ConcurrentGroup(...runnables)
  }

  /**
   * Specifies a Runnable that tries and retries a sub-Runnable (such
   * as a Job) until it succeeds.
   * 
   * If the Runnable is retried, it is re-run from the start. For
   * composite Runnables such as groups or graphs, this means that 
   * if they partially succeeded, the parts that succeeded will be
   * re-run. It is often better to build the composite from `retry`
   * Runnables rather than to retry the composite.
   * 
   * By default, retries happen immediately on failure. To wait
   * between retries, use the RetryConfiguration#withBackoff method.
   * The syntax is `Job.retry(...).withBackoff(...)`.
   * 
   * @param runnable The work item to be run and retried if necessary
   * @param maxAttempts The maximum number of times to try to run the work
   * item. This must be a positive number.
   */
  public static retry(runnable: Runnable, maxAttempts: number): Runnable & RetryConfiguration {
    return new Retry(runnable, maxAttempts, NO_BACKOFF)
  }

  /**
   * Specifies a Runnable that consists of sub-Runnables with
   * dependencies between them. This provides finer control than
   * Job.sequence and Job.concurrent, at the expense of being more
   * complex to specify.
   * @param spec Describes the Runnables and how they depend on each
   * other. This is an object whose keys are IDs, and whose values
   * are either Runnables or pairs of "Runnable plus IDs of the entries
   * it depends on"
   */
  public static graph(spec: { [key: string]: GraphItemSpec }): Runnable {
    return GraphBuilder.build(spec)
  }

  /**
   * Specifies a Runnable that tries a sub-Runnable, and if that fails
   * then runs an error handler. To avoid ambiguity, the error handler is
   * not passed to the Job.try function, but via a separate onError
   * function: the syntax is `Job.try(...).onError(...)`.
   * 
   * If the main Runnable fails, then the `try` fails; unlike JavaScript's
   * `catch` construct, try...onError does not swallow the error.
   * 
   * @param runnable The work item to be attempted and for which you want
   * to receive failure notification
   */
  public static try(runnable: Runnable): ErrorNotifying {
    return new ErrorNotifier(runnable)
  }
}

/**
 * A single OCI container in a Job.
 */
export class Container {
  /** The OCI image that the container should run. */
  public image: string
  /**
   * Specifies under what conditions the host node should re-fetch an image
   * that is already in its local cache. The permitted values are as IfNotPresent
   * (the default) and Always.
   */
  public imagePullPolicy = "IfNotPresent"
  /** The working directory for the process running in the container. */
  public workingDirectory = ""
  /**
   * The command to run in the container. If not specified, the default entry point
   * of the container is called.
   * 
   * Only the first element of the array is the actual command. Subsequent elements
   * are treated as arguments. For example, a command of ["echo", "hello"] is
   * equivalent to running 'echo hello'. A common convention is to use the command
   * array for subcommands and the arguments array for argument values.
   * 
   * @example
   * job.primaryContainer.command = ["helm", "install"]
   * job.primaryContainer.arguments = ["stable/nginx", "-g"]
   */
  public command: string[] = []
  /**
   * The arguments to pass to Container#command.  If the command includes arguments
   * already, the arguments property are appended. A common convention is to use the command
   * array for subcommands and the arguments array for argument values.
   * 
   * @example
   * job.primaryContainer.command = ["helm", "install"]
   * job.primaryContainer.arguments = ["stable/nginx", "-g"]
   * 
   */
  public arguments: string[] = []
  /**
   * Environment variables to set in the container. These are often derived from
   * project settings such as secrets.
   * 
   * You can safely pass secrets via environment variables, because Brigade treats
   * all enviroment variables as secrets.
   * 
   * @example
   * job.primaryContainer.env.AUTH_TOKEN = e.project.secrets.authToken  // e is event that triggered the handler
   */
  public environment: { [key: string]: string } = {}
  /**
   * The path in the container's file system where, if applicable, the
   * Brigade worker's shared workspace should be mounted. If empty (the default),
   * the Job does not have access to the shared workspace.
   * 
   * The shared workspace must be enabled at the project configuration level
   * for containers to access it. If it is not enabled, you should leave this
   * property empty.
   */
  public workspaceMountPath = ""
  /**
   * The path in the container's file system where, if applicable,
   * source code retrieved from a version control system repository should be
   * mounted. If empty (the default), Brigade will not mount any source
   * code automatically.
   * 
   * Source code mounting must be enabled at the project configuration level
   * for containers to access it. If it is not enabled, you should leave this
   * property empty.
   */
  public sourceMountPath = ""
  /**
   * Whether the container should run with privileged permissions. This is
   * typically required only for "Docker in Docker" scenarios where the
   * container must run its own Docker daemon.
   * 
   * Privileged execution may be disallowed by Brigade project configuration.
   * If so, the container will run unprivileged.
   */
  public privileged = false
  /**
   * Whether the container should mount the host's Docker socket into its own
   * file system. This is typically required only for "Docker-out-of-Docker" ("DooD")
   * scenarios where the container needs to use the host's Docker daemon.
   * This is strongly discouraged for almost all use cases.
   * 
   * Host Docker socket access may be disallowed by Brigade project configuration.
   * If so, the container will run without such access.
   */
  public useHostDockerSocket = false

  /**
   * Constructs a new Container.
   * @param image The OCI reference to the container image
   */
  constructor(image: string) {
    this.image = image
  }
}

/**
 * The execution environment required by a Job.
 */
export class JobHost {
  /**
   * The OS required by the Job. Valid values are "linux" and "windows". When empty,
   * Brigade assumes "linux".
   */
  public os?: string
  /**
   * Specifies labels that must be present on the substrate node to
   * host a Job. This provides an opaque mechanism for communicating Job needs
   * such as specific hardware like an SSD or GPU.
   */
  public nodeSelector: { [key: string]: string } = {}
}
