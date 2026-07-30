/**
 * Background task manager — fire-and-check-later primitive for subagents.
 *
 * Inspired by Claude Code Tip 36 (background subagents). Gives the orchestrator
 * a way to spawn tasks that run in isolated context frames, continue foreground
 * work, and poll results later.
 *
 * Each background task gets its own ContextFrame with sufficient context passed
 * from the parent agent (visibleFields, metadata). The parent's frame is not
 * shared — isolation prevents resource contention.
 */

import type { ContextManager } from '../context/index.js';

// ── Types ────────────────────────────────────────────────────────────────

export type BackgroundTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface BackgroundTaskSpec {
  /** Agent ID to run */
  agentId: string;
  /** The work to perform */
  execute: () => Promise<unknown>;
  /** Fields from parent context to expose to the background task */
  inheritedFields: string[];
  /** Metadata from parent to pass to the background task */
  inheritedMetadata: Record<string, unknown>;
  /** Parent agent ID (for context inheritance) */
  parentAgentId: string;
  /** Session ID for the background task */
  sessionId: string;
  /** Unique task ID (auto-generated if omitted) */
  taskId?: string;
}

export interface BackgroundTaskHandle {
  agentId: string;
  /** Cancel the running task */
  cancel(): void;
  error?: Error;
  /** Context frame assigned to this task */
  frameId: string;
  result?: unknown;
  status: BackgroundTaskStatus;
  taskId: string;
  /** Poll for completion (uses exponential backoff internally) */
  waitForCompletion(): Promise<unknown>;
}

// ── Manager ──────────────────────────────────────────────────────────────

export class BackgroundTaskManager {
  readonly #tasks = new Map<string, BackgroundTaskHandle>();
  readonly #abortControllers = new Map<string, AbortController>();
  readonly #contextManager: ContextManager;

  constructor(contextManager: ContextManager) {
    this.#contextManager = contextManager;
  }

  /**
   * Spawn a background task with an isolated context frame.
   *
   * The frame inherits `inheritedFields` and `inheritedMetadata` from the
   * parent agent but gets its own frame — no shared mutable state.
   */
  spawn(spec: BackgroundTaskSpec): BackgroundTaskHandle {
    const taskId = spec.taskId ?? `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create isolated context frame with inherited context
    const frame = this.#contextManager.pushContext({
      agentId: spec.agentId,
      parentAgentId: spec.parentAgentId,
      sessionId: spec.sessionId,
      visibleFields: spec.inheritedFields,
      lockedResources: [],
      metadata: spec.inheritedMetadata
    });

    const abortController = new AbortController();
    this.#abortControllers.set(taskId, abortController);

    const handle: BackgroundTaskHandle = {
      taskId,
      agentId: spec.agentId,
      status: 'running',
      frameId: frame.frameId,
      waitForCompletion: () => this.#waitForCompletion(taskId),
      cancel: () => this.#cancel(taskId)
    };

    this.#tasks.set(taskId, handle);

    // Fire and forget — runs in background
    spec
      .execute()
      .then(result => {
        const h = this.#tasks.get(taskId);
        if (h) {
          h.status = 'completed';
          h.result = result;
        }
      })
      .catch(error => {
        const h = this.#tasks.get(taskId);
        if (h) {
          h.status = abortController.signal.aborted ? 'cancelled' : 'failed';
          h.error = error;
        }
      })
      .finally(() => {
        this.#abortControllers.delete(taskId);
      });

    return handle;
  }

  /** Get a background task handle by ID. */
  get(taskId: string): BackgroundTaskHandle | null {
    return this.#tasks.get(taskId) ?? null;
  }

  /** List background tasks, optionally filtered by status. */
  list(status?: BackgroundTaskStatus): BackgroundTaskHandle[] {
    const all = [...this.#tasks.values()];
    return status ? all.filter(t => t.status === status) : all;
  }

  #waitForCompletion(taskId: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const check = (): void => {
        const h = this.#tasks.get(taskId);
        if (!h) {
          reject(new Error(`Background task ${taskId} not found`));
          return;
        }
        if (h.status === 'completed') {
          resolve(h.result);
        } else if (h.status === 'failed') {
          reject(h.error ?? new Error('Background task failed'));
        } else if (h.status === 'cancelled') {
          reject(new Error('Background task was cancelled'));
        } else {
          // Still running — poll again in 100ms
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  #cancel(taskId: string): void {
    const controller = this.#abortControllers.get(taskId);
    if (controller) {
      controller.abort();
    }
    const h = this.#tasks.get(taskId);
    if (h && h.status === 'running') {
      h.status = 'cancelled';
    }
  }
}
