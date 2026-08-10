import type { SessionStore } from '@agentsy/session';
import type { RuntimeSnapshot } from '@agentsy/shared';

/**
 * Keys used within {@link InterruptionCheckpoint.metadata}
 * for routing/failover state.
 */
export const METADATA_ATTEMPTED_REPLICAS = 'attemptedReplicas' as const;
export const METADATA_ESCALATION_STATE = 'escalationState' as const;

/**
 * A serializable interruption checkpoint stored in the session.
 *
 * The `metadata` bag carries routing state for failover:
 * - `attemptedReplicas` — replica IDs that have been tried
 * - `escalationState` — optional escalation context
 *
 * Use {@link getFailedReplicas} and {@link markReplicaAttempted}
 * for type-safe access.
 */
export interface InterruptionCheckpoint {
  id: string;
  metadata?: Record<string, unknown>;
  reason: string;
  sessionId: string;
  snapshot: RuntimeSnapshot;
  timestamp: number;
}

let _checkpointCounter = 0;
function nextCheckpointId(): string {
  _checkpointCounter++;
  return `chk_${Date.now()}_${_checkpointCounter}`;
}

// codacy:disable security/HardcodedPassword -- Not a password, it's a store key prefix
const CHECKPOINT_KEY_PREFIX = 'interruption_checkpoint:';

/**
 * Create an interruption checkpoint.
 *
 * Serializes the current runtime snapshot and halts execution by storing
 * the checkpoint in the session store. The session's state is preserved
 * so it can be resumed later via {@link resumeFromCheckpoint}.
 *
 * @param sessionId - The session being interrupted.
 * @param reason - Human-readable reason for the interruption.
 * @param snapshot - The current `RuntimeSnapshot` to preserve.
 * @param sessionStore - The session store for persisting checkpoints.
 * @param metadata - Optional extra context (e.g. pending tool call IDs).
 * @returns The created `InterruptionCheckpoint`.
 */
export function createInterruption(
  sessionId: string,
  reason: string,
  snapshot: RuntimeSnapshot,
  sessionStore: Pick<SessionStore, 'setValue'>,
  metadata?: Record<string, unknown>
): InterruptionCheckpoint {
  const id = nextCheckpointId();
  const timestamp = Date.now();

  const checkpoint: InterruptionCheckpoint = {
    id,
    sessionId,
    reason,
    timestamp,
    snapshot,
    ...(metadata ? { metadata } : {})
  };

  sessionStore.setValue(`${CHECKPOINT_KEY_PREFIX}${id}`, checkpoint);

  return checkpoint;
}

/**
 * Resume execution from a stored interruption checkpoint.
 *
 * Loads the checkpoint from the session store and returns it so the
 * runtime loop can restore state and continue. The returned checkpoint
 * includes the full metadata bag, which carries routing / failover state
 * (`attemptedReplicas`, `escalationState`) that was recorded before the
 * interruption. Use {@link getFailedReplicas} and
 * {@link getEscalationState} to extract routing information.
 *
 * @param checkpointId - The checkpoint id (returned by `createInterruption`).
 * @param sessionStore - The session store to read from.
 * @returns The restored `InterruptionCheckpoint`, or `null` if not found.
 */
export function resumeFromCheckpoint(
  checkpointId: string,
  sessionStore: Pick<SessionStore, 'getValue'>
): InterruptionCheckpoint | null {
  const raw = sessionStore.getValue(`${CHECKPOINT_KEY_PREFIX}${checkpointId}`);
  if (!raw) {
    return null;
  }

  const checkpoint = raw as InterruptionCheckpoint;

  // Basic structural validation
  if (
    typeof checkpoint.id !== 'string' ||
    typeof checkpoint.sessionId !== 'string' ||
    typeof checkpoint.timestamp !== 'number' ||
    !checkpoint.snapshot
  ) {
    return null;
  }

  return checkpoint;
}

/**
 * Extract the list of replica IDs that have been attempted for this
 * checkpoint during failover. Returns an empty array when no replicas
 * have been recorded.
 *
 * @param checkpoint - The interruption checkpoint to inspect.
 * @returns A list of replica identifiers.
 */
export function getFailedReplicas(checkpoint: InterruptionCheckpoint): string[] {
  const raw = checkpoint.metadata?.[METADATA_ATTEMPTED_REPLICAS];
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

/**
 * Record that a specific replica was attempted for this checkpoint.
 * Mutates `checkpoint.metadata` in-place, creating the metadata bag if
 * it does not yet exist. Duplicate replica IDs are silently ignored.
 *
 * @param checkpoint - The checkpoint to update.
 * @param replicaId - The replica identifier to mark as attempted.
 */
export function markReplicaAttempted(checkpoint: InterruptionCheckpoint, replicaId: string): void {
  checkpoint.metadata ??= {};

  const replicas = checkpoint.metadata[METADATA_ATTEMPTED_REPLICAS];
  if (!Array.isArray(replicas)) {
    checkpoint.metadata[METADATA_ATTEMPTED_REPLICAS] = [replicaId];
  } else if (!replicas.includes(replicaId)) {
    replicas.push(replicaId);
  }
}

/**
 * Extract the escalation state stored in the checkpoint metadata, or
 * `null` when none is present.
 *
 * @param checkpoint - The checkpoint to inspect.
 * @returns The escalation state object, or `null`.
 */
export function getEscalationState(checkpoint: InterruptionCheckpoint): Record<string, unknown> | null {
  const raw = checkpoint.metadata?.[METADATA_ESCALATION_STATE];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

/**
 * Set the escalation state on a checkpoint's metadata. Creates the
 * metadata bag if it does not yet exist.
 *
 * @param checkpoint - The checkpoint to update.
 * @param state - Escalation context to store.
 */
export function setEscalationState(checkpoint: InterruptionCheckpoint, state: Record<string, unknown>): void {
  checkpoint.metadata ??= {};
  checkpoint.metadata[METADATA_ESCALATION_STATE] = state;
}
