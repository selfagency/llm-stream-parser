/**
 * Runtime execution infrastructure types.
 */

/**
 * A runtime task that can be executed.
 */
export interface RuntimeTask {
  /** Task identifier. */
  id: string;

  /** Run the task. */
  run(signal: AbortSignal, context: RuntimeTaskContext): Promise<void>;
}

/**
 * Runtime task with dependency information.
 */
export interface RuntimeWorkflowTask extends RuntimeTask {
  /** Task IDs this task depends on. */
  dependsOn?: string[];
}

/**
 * Result from executing a runtime task.
 */
export interface RuntimeTaskResult {
  /** Error if execution failed. */
  error?: Error;

  /** Finish timestamp. */
  finishedAt: number;

  /** Start timestamp. */
  startedAt: number;

  /** Execution status. */
  status: 'completed' | 'failed' | 'skipped';
  /** Task identifier. */
  taskId: string;
}

/**
 * Snapshot of runtime execution state.
 */
export interface RuntimeSnapshot {
  /** Snapshots from child executions. */
  childSnapshots: RuntimeSnapshot[];

  /** IDs of completed tasks. */
  completedTaskIds: string[];

  /** Execution depth (for nested tasks). */
  depth: number;

  /** Results from executed tasks. */
  results: RuntimeTaskResult[];
  /** Session identifier. */
  sessionId: string;

  /** Last update timestamp. */
  updatedAt: number;
}

/**
 * Context provided to running tasks.
 */
export interface RuntimeTaskContext {
  /** Execution depth. */
  depth: number;
  /** Session identifier. */
  sessionId: string;

  /** Spawn child tasks for parallel execution. */
  spawn(tasks: RuntimeTask[], signal?: AbortSignal, sessionId?: string): Promise<RuntimeSnapshot>;
}

/**
 * Options for runtime executor.
 */
export interface RuntimeOptions {
  /** Error handler. */
  onError?: (error: Error, task: RuntimeTask) => void;

  /** Handler called when task completes. */
  onTaskComplete?: (result: RuntimeTaskResult, task: RuntimeTask) => void;

  /** Handler called when task starts. */
  onTaskStart?: (task: RuntimeTask) => void;

  /** Task context to inject. */
  taskContext?: RuntimeTaskContext;
}

/**
 * Runtime executor that can run tasks.
 */
export interface RuntimeExecutor {
  /** Execute tasks without returning results. */
  execute(tasks: RuntimeTask[], signal?: AbortSignal): Promise<void>;

  /** Execute tasks and return results. */
  executeWithResults(tasks: RuntimeTask[], signal?: AbortSignal): Promise<RuntimeTaskResult[]>;
}

/**
 * Options for runtime loop with persistence.
 */
export interface RuntimeLoopOptions extends RuntimeOptions {
  /** Initial execution depth. */
  depth?: number;

  /** Maximum execution depth (prevents infinite recursion). */
  maxDepth?: number;
  /** Session identifier. */
  sessionId?: string;

  /** Session store for persistence. */
  sessionStore?: unknown;

  /** Initial snapshot (for resuming). */
  snapshot?: RuntimeSnapshot;

  /** Key to store snapshot under. */
  snapshotKey?: string;
}

/**
 * Runtime loop that tracks state and supports persistence.
 */
export interface RuntimeLoop {
  /** Execute tasks and return updated snapshot. */
  execute(tasks: RuntimeTask[], signal?: AbortSignal): Promise<RuntimeSnapshot>;

  /** Get current execution depth. */
  getDepth(): number;

  /** Get current snapshot. */
  getSnapshot(): RuntimeSnapshot;

  /** Spawn child tasks in a new execution context. */
  spawn(tasks: RuntimeTask[], signal?: AbortSignal, sessionId?: string): Promise<RuntimeSnapshot>;
}

/**
 * Workflow executor that respects dependencies.
 */
export interface RuntimeWorkflowExecutor {
  /** Execute workflow tasks respecting dependency order. */
  execute(tasks: RuntimeWorkflowTask[], signal?: AbortSignal): Promise<RuntimeSnapshot>;
}
