import type { SessionStore } from '@agentsy/shared';

/**
 * Routing state for model replica failover continuity.
 *
 * Tracks the failover chain across replica attempts so that resumed
 * sessions can continue from where the previous attempt left off
 * without repeating already-failed replicas.
 */
export interface RoutingState {
  /** Replicas that have been attempted (in order of attempt). */
  attemptedReplicas: string[];
  /** The replica currently being used (or last used). */
  currentReplicaId: string;
  /** How many times the failure has escalated (0 = initial). */
  escalationLevel: number;
  /** Ordered chain of replica IDs visited during failover. */
  failoverChain: string[];
}

/**
 * Serializable runtime state snapshot for mid-run checkpointing.
 *
 * Captures enough state so the runtime loop can restore execution after
 * an interruption, tool boundary, or explicit save point.
 */
export interface RuntimeCheckpoint {
  id: string;
  /** Queue of messages leading up to this point. */
  messageQueue: { role: string; content: string }[];
  /** Arbitrary metadata for extensions (guardrails, memory, etc.). */
  metadata?: Record<string, unknown>;
  /** Ordered list of pending tool calls at the checkpoint moment. */
  pendingToolCalls: { id: string; name: string; args: unknown }[];
  /**
   * Routing metadata for retry/failover continuity.
   * Preserves which replicas and logical models have been attempted
   * so that resumed sessions avoid already-failed replicas.
   */
  routingMetadata?: {
    attemptedReplicaIds: string[];
    attemptedLogicalModelIds: string[];
    currentLogicalModelId?: string;
    currentReplicaId?: string;
    escalationLevel?: number;
  };
  /**
   * Routing state for model replica failover continuity.
   * Captures the full failover chain for observability and recovery.
   */
  routingState?: RoutingState;
  /** Active subagents and their state summaries. */
  subagentStates: { id: string; status: string; result?: unknown }[];
  timestamp: number;
}

let _checkpointCounter = 0;
function nextCheckpointId(): string {
  _checkpointCounter++;
  return `rtchk_${Date.now()}_${_checkpointCounter}`;
}

// codacy:disable security/HardcodedPassword -- Not a password, it's a store key prefix
const CHECKPOINT_KEY = 'runtime_checkpoint';

/**
 * Save a runtime checkpoint to the session store.
 *
 * Called at configurable points during execution (before every tool call,
 * every Nth turn, on explicit request). The checkpoint is overwritten on
 * each call — only the most recent checkpoint is retained.
 *
 * @param state - Current runtime state to persist.
 * @param sessionStore - The session store for persistence.
 * @returns The created `RuntimeCheckpoint` with its id and timestamp.
 */
export function checkpoint(
  state: Omit<RuntimeCheckpoint, 'id' | 'timestamp'>,
  sessionStore: Pick<SessionStore, 'setValue'>
): RuntimeCheckpoint {
  const cp: RuntimeCheckpoint = {
    id: nextCheckpointId(),
    timestamp: Date.now(),
    pendingToolCalls: state.pendingToolCalls,
    messageQueue: state.messageQueue,
    subagentStates: state.subagentStates,
    ...(state.metadata ? { metadata: state.metadata } : {})
  };

  sessionStore.setValue(CHECKPOINT_KEY, cp);

  return cp;
}

/**
 * Load the most recent runtime checkpoint from the session store.
 *
 * @param sessionStore - The session store to read from.
 * @returns The checkpoint, or `null` if none exists.
 */
export function loadCheckpoint(sessionStore: Pick<SessionStore, 'getValue'>): RuntimeCheckpoint | null {
  const raw = sessionStore.getValue(CHECKPOINT_KEY);
  if (!raw) {
    return null;
  }

  const cp = raw as RuntimeCheckpoint;
  if (typeof cp.id !== 'string' || typeof cp.timestamp !== 'number' || !Array.isArray(cp.pendingToolCalls)) {
    return null;
  }

  return cp;
}

/**
 * Delete the current runtime checkpoint from the session store.
 */
export function clearCheckpoint(sessionStore: Pick<SessionStore, 'removeValue'>): void {
  sessionStore.removeValue(CHECKPOINT_KEY);
}

// codacy:disable security/HardcodedPassword -- Not a password, it's a store key prefix
const ROUTING_STATE_KEY = 'routing_state';

/**
 * Save routing state to the session store for failover continuity.
 *
 * Persists the current failover chain so that resumed sessions can
 * continue from where the previous attempt left off.
 *
 * @param state - The routing state to persist.
 * @param sessionStore - The session store for persistence.
 */
export function saveRoutingState(state: RoutingState, sessionStore: Pick<SessionStore, 'setValue'>): void {
  sessionStore.setValue(ROUTING_STATE_KEY, state);
}

/**
 * Load the most recent routing state from the session store.
 *
 * @param sessionStore - The session store to read from.
 * @returns The routing state, or `null` if none exists.
 */
export function loadRoutingState(sessionStore: Pick<SessionStore, 'getValue'>): RoutingState | null {
  const raw = sessionStore.getValue(ROUTING_STATE_KEY);
  if (!raw) {
    return null;
  }

  const state = raw as RoutingState;
  if (
    !Array.isArray(state.attemptedReplicas) ||
    typeof state.currentReplicaId !== 'string' ||
    typeof state.escalationLevel !== 'number' ||
    !Array.isArray(state.failoverChain)
  ) {
    return null;
  }

  return state;
}

/**
 * Clear the routing state from the session store.
 */
export function clearRoutingState(sessionStore: Pick<SessionStore, 'removeValue'>): void {
  sessionStore.removeValue(ROUTING_STATE_KEY);
}
