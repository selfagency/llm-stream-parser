/**
 * Observability and distributed tracing types including AG-UI protocol events.
 */

export const EventType = {
  RUN_STARTED: 'run:started',
  RUN_FINISHED: 'run:finished',
  RUN_ERROR: 'run:error',
  RUN_INTERRUPTED: 'run:interrupted',
  STEP_STARTED: 'step:started',
  STEP_FINISHED: 'step:finished',
  TEXT_MESSAGE_START: 'text_message:start',
  TEXT_MESSAGE_CONTENT: 'text_message:content',
  TEXT_MESSAGE_END: 'text_message:end',
  REASONING_START: 'reasoning:start',
  REASONING_END: 'reasoning:end',
  REASONING_MESSAGE_START: 'reasoning_message:start',
  REASONING_MESSAGE_CONTENT: 'reasoning_message:content',
  REASONING_MESSAGE_END: 'reasoning_message:end',
  TOOL_CALL_START: 'tool_call:start',
  TOOL_CALL_ARGS: 'tool_call:args',
  TOOL_CALL_END: 'tool_call:end',
  TOOL_CALL_RESULT: 'tool_call:result',
  MESSAGES_SNAPSHOT: 'messages:snapshot',
  STATE_SNAPSHOT: 'state:snapshot',
  STATE_DELTA: 'state:delta'
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

/**
 * Base AG-UI event
 */
export interface BaseAgUiEvent {
  runId: string;
  threadId?: string;
  timestamp: string;
  type: EventType;
}

/**
 * Run started event
 */
export interface RunStartedEvent extends BaseAgUiEvent {
  inputs?: Record<string, unknown>;
  parentRunId?: string;
  type: 'run:started';
}

/**
 * Run finished event
 */
export interface RunFinishedEvent extends BaseAgUiEvent {
  outcome: {
    type: 'success' | 'failure' | 'interrupted' | 'interrupt';
  };
  type: 'run:finished';
  usage?: unknown;
}

/**
 * Step started event
 */
export interface StepStartedEvent extends BaseAgUiEvent {
  stepIndex: number;
  type: 'step:started';
}

/**
 * Step finished event
 */
export interface StepFinishedEvent extends BaseAgUiEvent {
  outputLength: number;
  stepIndex: number;
  type: 'step:finished';
}

/**
 * Run interrupted event
 */
export interface RunInterruptedEvent extends BaseAgUiEvent {
  interrupts?: {
    id: string;
    reason: string;
    options?: {
      message?: string;
    };
  }[];
  message?: string;
  reason?: string;
  type: 'run:interrupted';
}

/**
 * Run error event
 */
export interface RunErrorEvent extends BaseAgUiEvent {
  error: { message: string; code?: string };
  type: 'run:error';
}

/**
 * Text message content event
 */
export interface TextMessageContentEvent extends BaseAgUiEvent {
  content: string;
  messageId: string;
  type: 'text_message:content';
}

/**
 * Reasoning start event
 */
export interface ReasoningStartEvent extends BaseAgUiEvent {
  messageId?: string;
  type: 'reasoning:start';
}

/**
 * Reasoning end event
 */
export interface ReasoningEndEvent extends BaseAgUiEvent {
  messageId?: string;
  type: 'reasoning:end';
}

/**
 * Reasoning message start event
 */
export interface ReasoningMessageStartEvent extends BaseAgUiEvent {
  messageId: string;
  type: 'reasoning_message:start';
}

/**
 * Reasoning message content event
 */
export interface ReasoningMessageContentEvent extends BaseAgUiEvent {
  content: string;
  encryptedValue?: string;
  messageId: string;
  type: 'reasoning_message:content';
}

/**
 * Reasoning message end event
 */
export interface ReasoningMessageEndEvent extends BaseAgUiEvent {
  messageId: string;
  type: 'reasoning_message:end';
}

/**
 * Tool call start event
 */
export interface ToolCallStartEvent extends BaseAgUiEvent {
  toolCallId: string;
  toolName: string;
  type: 'tool_call:start';
}

/**
 * Tool call arguments event
 */
export interface ToolCallArgsEvent extends BaseAgUiEvent {
  args: string | Record<string, unknown>;
  toolCallId: string;
  type: 'tool_call:args';
}

/**
 * Tool call end event
 */
export interface ToolCallEndEvent extends BaseAgUiEvent {
  output?: string;
  toolCallId: string;
  type: 'tool_call:end';
}

/**
 * State snapshot event
 */
export interface StateSnapshotEvent extends BaseAgUiEvent {
  state: Record<string, unknown>;
  type: 'state:snapshot';
}

/**
 * State delta event
 */
export interface StateDeltaEvent extends BaseAgUiEvent {
  delta: JsonPatchOperation[];
  type: 'state:delta';
}

/**
 * Simplified JSON Patch operation for AG-UI state synchronization.
 */
export interface JsonPatchOperation {
  from?: string;
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
}

/**
 * Union of all AG-UI protocol events.
 */
export type AgUiEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | RunInterruptedEvent
  | TextMessageContentEvent
  | ReasoningStartEvent
  | ReasoningEndEvent
  | ReasoningMessageStartEvent
  | ReasoningMessageContentEvent
  | ReasoningMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | StepStartedEvent
  | StepFinishedEvent
  | StateSnapshotEvent
  | StateDeltaEvent;
