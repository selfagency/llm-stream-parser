/**
 * Hook event types for the runtime lifecycle.
 *
 * These discriminated-union events are fired by the `HookRegistry` at
 * specific points in the task execution lifecycle. Each handler receives
 * the full event context and can return a `HookResult` to influence
 * whether execution continues, blocks, or transforms the payload.
 */

/** Result returned by a single hook handler. */
export type HookResult =
  | { continue: true }
  | { continue: true; transform: unknown }
  | { continue: false; reason: string }
  | { transform: unknown }
  | {
      continue: false;
      reason: string;
      approvalRequired: { approvalId: string };
      actionName: string;
      params: Record<string, unknown>;
    };

/** Fired when raw user input arrives, before any model call. */
export interface UserPromptSubmitEvent {
  input: string;
  sessionId: string;
  type: 'UserPromptSubmit';
}

/** Fired before a tool call executes. Deterministic — never prompt-based. */
export interface PreToolCallEvent {
  args: unknown;
  sessionId: string;
  toolName: string;
  type: 'PreToolCall';
}

/** Fired after a tool call completes with its result. */
export interface PostToolCallEvent {
  args: unknown;
  result: unknown;
  sessionId: string;
  toolName: string;
  type: 'PostToolCall';
}

/** Fired before context compaction, allowing critical items to be pinned. */
export interface PreCompactEvent {
  contextSize: number;
  sessionId: string;
  type: 'PreCompact';
}

/** Fired when a spawned subagent terminates. */
export interface SubagentStopEvent {
  result: unknown;
  sessionId: string;
  subagentId: string;
  type: 'SubagentStop';
}

/** Fired when the session ends. */
export interface StopEvent {
  reason: string;
  sessionId: string;
  type: 'Stop';
}

/** Fired before a model response is returned to the user. */
export interface PreResponseEvent {
  response: unknown;
  sessionId: string;
  type: 'PreResponse';
}

/** Fired after a response has been delivered to the user. */
export interface PostResponseEvent {
  response: unknown;
  sessionId: string;
  type: 'PostResponse';
}

// =============================================================================
// Model-call lifecycle events (Phase 3.7 replica routing)
// =============================================================================

/** Fired before a model call is dispatched, with the selected replica. */
export interface PreModelCallEvent {
  estimatedTokens: number;
  logicalModelId: string;
  providerId: string;
  replicaId: string;
  sessionId: string;
  type: 'PreModelCall';
}

/** Fired after a model call completes successfully. */
export interface PostModelCallEvent {
  actualTokens: number;
  costUsd: number;
  latencyMs: number;
  logicalModelId: string;
  providerId: string;
  replicaId: string;
  sessionId: string;
  type: 'PostModelCall';
}

/** Fired when a model call fails. */
export interface ModelCallFailedEvent {
  attempt: number;
  error: string;
  logicalModelId: string;
  providerId: string;
  replicaId: string;
  sessionId: string;
  type: 'ModelCallFailed';
}

/** Fired when the gateway switches to a different replica mid-session. */
export interface ModelReplicaSwitchedEvent {
  fromReplicaId: string;
  logicalModelId: string;
  reason: string;
  sessionId: string;
  toProviderId: string;
  toReplicaId: string;
  type: 'ModelReplicaSwitched';
}

/** Fired after a model selection decision with full diagnostics. */
export interface ModelSelectionDiagnosticsEvent {
  attemptedReplicaIds: string[];
  candidateCount: number;
  logicalModelId: string;
  rejectedCandidates: Array<{
    id: string;
    reasons: string[];
    score: number;
  }>;
  selectedReplicaId: string | undefined;
  selectionTimeMs: number;
  sessionId: string;
  tier: string;
  type: 'ModelSelectionDiagnostics';
}

export interface HelperStartEvent {
  helperId: string;
  sessionId: string;
  type: 'HelperStart';
}

export interface HelperCompleteEvent {
  helperId: string;
  sessionId: string;
  type: 'HelperComplete';
}

export interface HelperFailedEvent {
  error: string;
  helperId: string;
  sessionId: string;
  type: 'HelperFailed';
}

// =============================================================================
// Phase 10 guardrail lifecycle events
// =============================================================================

/** Fired before retrieval (RAG) operation. */
export interface PreRetrievalEvent {
  query: string;
  retrievalDomains: readonly string[];
  sessionId: string;
  type: 'PreRetrieval';
}

/** Fired after retrieval (RAG) completes. */
export interface PostRetrievalEvent {
  results: Array<{ content: string; sourceUrl?: string }>;
  retrievalDomains: readonly string[];
  retrieved: Array<{ content: string; source: string }>;
  sessionId: string;
  type: 'PostRetrieval';
}

/** Fired before memory write operations. */
export interface PreMemoryWriteEvent {
  entries: Array<{
    content: string;
    trustScore: number;
    type: 'instruction' | 'note' | 'fact' | 'preference';
    isHighTrust: boolean;
    updatedAt: string;
    previousContent?: string;
  }>;
  memoryEnabled: boolean;
  sessionId: string;
  type: 'PreMemoryWrite';
}

/** Fired before high-impact action execution. */
export interface PreActionEvent {
  actionName: string;
  approvalGranted?: boolean;
  approvalTimestamp?: string;
  approvedBy?: string;
  params: Record<string, unknown>;
  sessionId: string;
  type: 'PreAction';
}

/** Fired before outbound network requests (egress). */
export interface PreEgressEvent {
  body?: string;
  headers?: Record<string, string>;
  method: string;
  requestSizeBytes: number;
  sessionId: string;
  type: 'PreEgress';
  url: string;
}

/** Union of all runtime hook events. */
export type RuntimeHookEvent =
  | UserPromptSubmitEvent
  | PreToolCallEvent
  | PostToolCallEvent
  | PreCompactEvent
  | SubagentStopEvent
  | StopEvent
  | PreResponseEvent
  | PostResponseEvent
  | PreModelCallEvent
  | PostModelCallEvent
  | ModelCallFailedEvent
  | ModelReplicaSwitchedEvent
  | ModelSelectionDiagnosticsEvent
  | HelperStartEvent
  | HelperCompleteEvent
  | HelperFailedEvent
  | PreRetrievalEvent
  | PostRetrievalEvent
  | PreMemoryWriteEvent
  | PreActionEvent
  | PreEgressEvent;
