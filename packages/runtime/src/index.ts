import { randomUUID } from 'node:crypto';

import type { SessionStore } from '@agentsy/session';
import type {
  RuntimeLoopOptions as BaseRuntimeLoopOptions,
  RuntimeExecutor,
  RuntimeLoop,
  RuntimeOptions,
  RuntimeSnapshot,
  RuntimeTask,
  RuntimeTaskContext,
  RuntimeTaskResult,
  RuntimeWorkflowExecutor,
  RuntimeWorkflowTask
} from '@agentsy/types';

export type {
  RuntimeExecutor,
  RuntimeLoop,
  RuntimeOptions,
  RuntimeSnapshot,
  RuntimeTask,
  RuntimeTaskContext,
  RuntimeTaskResult,
  RuntimeWorkflowExecutor,
  RuntimeWorkflowTask
} from '@agentsy/types';
export type { PolicyApprovalHookOptions, ToolPolicyRule } from './approval/approval-hook.js';
export { createPolicyApprovalHook } from './approval/approval-hook.js';
// Approval subpath — re-export so the ./approval entry point code is reachable
export type { ApprovalManagerOptions, PendingApproval } from './approval/approval-manager.js';
export { ApprovalManager } from './approval/approval-manager.js';
export {
  type BuildRuntimeContextInput,
  buildRuntimeContext,
  type RuntimeContextReuse,
  type RuntimeReusableSegment
} from './cache-aware-context.js';
export type { RuntimeCheckpoint } from './checkpoint.js';
export { checkpoint, clearCheckpoint, loadCheckpoint } from './checkpoint.js';
export type {
  GuardrailResult,
  InputGuardrail,
  OutputGuardrail,
  ToolGuardrail
} from './guardrails/index.js';
export { executeRuntimeHelper } from './helpers/execute-helper.js';
export { type RuntimeHelperCheckpoint, toRuntimeHelperCheckpoint } from './helpers/helper-checkpoint.js';
export type { RuntimeHelperExecutionResult, RuntimeHelperExecutor, RuntimeHelperInvocation } from './helpers/types.js';
export type {
  ActiveSkill,
  AgentLoopHandle,
  AgentSessionMode,
  AgentStepResult,
  ApprovalGate,
  BudgetHookOptions,
  CreateMemoryPostTurnHookOptions,
  CreateMemoryPreTurnHookOptions,
  HookHandler,
  HookRegistry,
  HookResult,
  InstructionFile,
  InstructionsDiscoverer,
  MemoryCapturer,
  MemoryItem,
  MemoryRetriever,
  PlanAgentDefinition,
  PlanResult,
  PlanTask,
  PostToolCallEvent,
  PreToolCallEvent,
  RuntimeHookEvent,
  SessionOptions,
  SkillActivator,
  SkillDiscoverer,
  SkillMetadata
} from './hooks/index.js';
// Hook registry and lifecycle events
export {
  createAgentSession,
  createApprovalHook,
  createBudgetHook,
  createInputGuardrailHook,
  createInstructionsHook,
  createMemoryPostTurnHook,
  createMemoryPreTurnHook,
  createOutputGuardrailHook,
  createRuntimeHookRegistry,
  createSkillsHook,
  createToolInputGuardrailHook,
  createToolOutputGuardrailHook,
  extractObservations,
  formatPlan,
  generatePlan,
  isDestructiveTool
} from './hooks/index.js';
export type { InterruptionCheckpoint } from './interruption.js';
// Interruption and checkpoint
export {
  createInterruption,
  getEscalationState,
  getFailedReplicas,
  markReplicaAttempted,
  resumeFromCheckpoint,
  setEscalationState
} from './interruption.js';
export {
  buildRuntimeMemoryContextXml,
  injectRuntimeMemoryContext,
  type RuntimeCitation,
  type RuntimeMemoryEvidence,
  type RuntimeMemoryInjectionOptions
} from './memory-injection.js';

export type RuntimeLoopOptions = Omit<BaseRuntimeLoopOptions, 'sessionStore'> & {
  sessionStore?: SessionStore;
};

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Runtime task failed');
}

function createEmptySnapshot(sessionId: string, depth: number): RuntimeSnapshot {
  return {
    childSnapshots: [],
    completedTaskIds: [],
    depth,
    results: [],
    sessionId,
    updatedAt: Date.now()
  };
}

function createRuntimeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function isRuntimeTaskResult(value: unknown): value is RuntimeTaskResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.taskId === 'string' &&
    (candidate.status === 'completed' || candidate.status === 'failed' || candidate.status === 'skipped') &&
    typeof candidate.startedAt === 'number' &&
    typeof candidate.finishedAt === 'number'
  );
}

function isRuntimeSnapshot(value: unknown): value is RuntimeSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sessionId === 'string' &&
    typeof candidate.depth === 'number' &&
    Array.isArray(candidate.completedTaskIds) &&
    candidate.completedTaskIds.every(taskId => typeof taskId === 'string') &&
    Array.isArray(candidate.results) &&
    candidate.results.every(isRuntimeTaskResult) &&
    Array.isArray(candidate.childSnapshots) &&
    candidate.childSnapshots.every(isRuntimeSnapshot) &&
    typeof candidate.updatedAt === 'number'
  );
}

function cloneSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  return {
    childSnapshots: snapshot.childSnapshots.map(cloneSnapshot),
    completedTaskIds: [...snapshot.completedTaskIds],
    depth: snapshot.depth,
    results: snapshot.results.map(result => ({ ...result })),
    sessionId: snapshot.sessionId,
    updatedAt: snapshot.updatedAt
  };
}

export function loadRuntimeSnapshotFromSession(
  sessionStore: Pick<SessionStore, 'getValue'>,
  snapshotKey = 'runtimeSnapshot'
): RuntimeSnapshot | null {
  const snapshot = sessionStore.getValue(snapshotKey);
  return isRuntimeSnapshot(snapshot) ? cloneSnapshot(snapshot) : null;
}

export function saveRuntimeSnapshotToSession(
  sessionStore: Pick<SessionStore, 'setValue'>,
  snapshot: RuntimeSnapshot,
  snapshotKey = 'runtimeSnapshot'
): void {
  sessionStore.setValue(snapshotKey, cloneSnapshot(snapshot));
}

function getExecutionOrder(tasks: RuntimeWorkflowTask[]): RuntimeWorkflowTask[] {
  const taskMap = new Map(tasks.map(task => [task.id, task]));
  const ordered: RuntimeWorkflowTask[] = [];
  const temporary = new Set<string>();
  const permanent = new Set<string>();

  const visit = (task: RuntimeWorkflowTask): void => {
    if (permanent.has(task.id)) {
      return;
    }

    if (temporary.has(task.id)) {
      throw new Error(`Runtime workflow contains a cycle at task "${task.id}"`);
    }

    temporary.add(task.id);

    for (const dependencyId of task.dependsOn ?? []) {
      const dependency = taskMap.get(dependencyId);
      if (!dependency) {
        throw new Error(`Runtime workflow task "${task.id}" depends on missing task "${dependencyId}"`);
      }
      visit(dependency);
    }

    temporary.delete(task.id);
    permanent.add(task.id);
    ordered.push(task);
  };

  for (const task of tasks) {
    visit(task);
  }

  return ordered;
}

export const createRuntimeExecutor = (options: RuntimeOptions = {}): RuntimeExecutor => {
  const executeWithResults = async (
    tasks: RuntimeTask[],
    signal: AbortSignal = new AbortController().signal
  ): Promise<RuntimeTaskResult[]> => {
    const results: RuntimeTaskResult[] = [];

    for (const task of tasks) {
      if (signal.aborted) {
        break;
      }

      const startedAt = Date.now();
      options.onTaskStart?.(task);

      try {
        await task.run(signal, options.taskContext ?? createDetachedRuntimeTaskContext());
        const result: RuntimeTaskResult = {
          finishedAt: Date.now(),
          startedAt,
          status: 'completed',
          taskId: task.id
        };
        results.push(result);
        options.onTaskComplete?.(result, task);
      } catch (error) {
        const runtimeError = toError(error);
        options.onError?.(runtimeError, task);
        const result: RuntimeTaskResult = {
          error: runtimeError,
          finishedAt: Date.now(),
          startedAt,
          status: 'failed',
          taskId: task.id
        };
        results.push(result);
        options.onTaskComplete?.(result, task);
      }
    }

    return results;
  };

  const execute = async (tasks: RuntimeTask[], signal: AbortSignal = new AbortController().signal): Promise<void> => {
    await executeWithResults(tasks, signal);
  };

  return {
    execute,
    executeWithResults
  };
};

function createDetachedRuntimeTaskContext(): RuntimeTaskContext {
  return {
    depth: 0,
    sessionId: 'runtime-detached',
    spawn() {
      throw new Error('Runtime spawning is unavailable without an attached runtime loop context');
    }
  };
}

function initializeLoopSnapshot(options: RuntimeLoopOptions, sessionId: string, depth: number): RuntimeSnapshot {
  const persisted = options.sessionStore
    ? loadRuntimeSnapshotFromSession(options.sessionStore, options.snapshotKey)
    : null;
  return options.snapshot !== undefined && options.snapshot !== null
    ? cloneSnapshot(options.snapshot)
    : (persisted ?? createEmptySnapshot(sessionId, depth));
}

export function createRuntimeLoop(options: RuntimeLoopOptions = {}): RuntimeLoop {
  const sessionId = options.sessionId ?? createRuntimeId('runtime');
  const depth = options.depth ?? 0;
  const maxDepth = options.maxDepth ?? 3;
  let snapshot = initializeLoopSnapshot(options, sessionId, depth);

  const spawn = async (tasks: RuntimeTask[], signal = new AbortController().signal, childSessionId?: string) => {
    if (depth + 1 > maxDepth) {
      throw new Error(`Runtime spawn depth exceeded maxDepth (${maxDepth})`);
    }

    const nextChildSessionId = childSessionId ?? `${sessionId}:child:${snapshot.childSnapshots.length + 1}`;
    const childLoop = createRuntimeLoop({
      ...options,
      depth: depth + 1,
      maxDepth,
      sessionId: nextChildSessionId
    });
    const childSnapshot = await childLoop.execute(tasks, signal);
    snapshot = {
      ...snapshot,
      childSnapshots: [...snapshot.childSnapshots, childSnapshot],
      updatedAt: Date.now()
    };

    if (options.sessionStore) {
      saveRuntimeSnapshotToSession(options.sessionStore, snapshot, options.snapshotKey);
    }

    return cloneSnapshot(childSnapshot);
  };

  const executor = createRuntimeExecutor({
    ...options,
    taskContext: {
      depth,
      sessionId,
      spawn
    }
  });

  return {
    async execute(tasks, signal = new AbortController().signal) {
      const completedTaskIds = new Set(snapshot.completedTaskIds);
      const pendingTasks = tasks.filter(task => !completedTaskIds.has(task.id));
      const results = await executor.executeWithResults(pendingTasks, signal);

      const nextCompletedTaskIds = [...snapshot.completedTaskIds];
      for (const result of results) {
        if (result.status === 'completed' && !completedTaskIds.has(result.taskId)) {
          nextCompletedTaskIds.push(result.taskId);
          completedTaskIds.add(result.taskId);
        }
      }

      snapshot = {
        childSnapshots: snapshot.childSnapshots,
        completedTaskIds: nextCompletedTaskIds,
        depth,
        results: [...snapshot.results, ...results],
        sessionId,
        updatedAt: Date.now()
      };

      if (options.sessionStore) {
        saveRuntimeSnapshotToSession(options.sessionStore, snapshot, options.snapshotKey);
      }

      return cloneSnapshot(snapshot);
    },

    getDepth() {
      return depth;
    },

    getSnapshot() {
      return cloneSnapshot(snapshot);
    },

    spawn
  };
}

export function createRuntimeWorkflowExecutor(options: RuntimeLoopOptions = {}): RuntimeWorkflowExecutor {
  const loop = createRuntimeLoop(options);

  return {
    async execute(tasks, signal) {
      const orderedTasks = getExecutionOrder(tasks);
      return await loop.execute(orderedTasks, signal);
    }
  };
}

// Phase 4 — Virtual sandbox
export * from './sandbox/policy/secrets-guard.js';
export * from './sandbox/virtual/container-detector.js';
export * from './sandbox/virtual/dynamic-trigger.js';
export * from './sandbox/virtual/router.js';
export * from './sandbox/virtual/virtual-sandbox.js';
