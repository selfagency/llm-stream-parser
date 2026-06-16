import type { OutputPart, ProcessedOutput, StreamChunk } from '@agentsy/core/processor';
import type { XmlToolCall } from '@agentsy/core/tool-calls';
import type { AgUiEvent, InterruptController } from '@agentsy/runtime/ag-ui';
import type { FinishReason, UsageInfo } from '@agentsy/shared';

export type { OutputPart, ProcessedOutput, StreamChunk } from '@agentsy/core/processor';
export type { FinishReason } from '@agentsy/shared';

export type StopCondition = (state: AgentLoopState) => boolean;

export interface StepResult {
  finishReason: FinishReason | undefined;
  output: ProcessedOutput;
  toolCalls: XmlToolCall[];
  usage: UsageInfo | undefined;
}

export interface AgentLoopState {
  consecutiveIdenticalCalls: number;
  lastOutput: ProcessedOutput;
  stepIndex: number;
  steps: StepResult[];
  toolCallCount: number;
}

export interface AgentLoopContext {
  messages: unknown[];
  runId: string;
  signal: AbortSignal;
  state: AgentLoopState;
  stepIndex: number;
  threadId?: string;
}

export interface AgentLoopStepContext extends AgentLoopContext {
  stepResult: StepResult;
}

export interface AgentLoopToolContext extends AgentLoopStepContext {
  approvedToolCalls?: XmlToolCall[];
  deniedToolCalls?: XmlToolCall[];
  toolApprovalMode?: ToolApprovalMode;
  toolCalls: XmlToolCall[];
  toolResultMessages?: unknown[];
}

export type AgentLoopAbortReason = 'abort' | 'interrupt';
export type ToolApprovalMode = 'allow' | 'ask' | 'deny' | 'auto';
export type ToolApprovalDecision = 'allow' | 'deny';

export interface ToolApprovalContext extends AgentLoopToolContext {
  mode: ToolApprovalMode;
}

export interface ToolApprovalResult {
  approvedToolCalls?: XmlToolCall[];
  decision?: ToolApprovalDecision;
  deniedToolCalls?: XmlToolCall[];
  reason?: string;
}

export type AgentLoopOutcome = 'success' | 'interrupt' | 'error' | 'abort';

export interface AgentLoopFinalContext extends AgentLoopContext {
  finalOutput: ProcessedOutput;
  outcome: AgentLoopOutcome;
}

export interface AgentLoopStepOverrides {
  afterFinal?: AgentLoopOptions['afterFinal'];
  afterStep?: AgentLoopOptions['afterStep'];
  afterToolCall?: AgentLoopOptions['afterToolCall'];
  approveToolCalls?: AgentLoopOptions['approveToolCalls'];
  beforeFinal?: AgentLoopOptions['beforeFinal'];
  beforeStep?: AgentLoopOptions['beforeStep'];
  beforeToolCall?: AgentLoopOptions['beforeToolCall'];
  buildToolResultMessages?: AgentLoopOptions['buildToolResultMessages'];
  maxConversationMessages?: number;
  messages?: unknown[];
  onAbort?: AgentLoopOptions['onAbort'];
  onError?: AgentLoopOptions['onError'];
  onStep?: AgentLoopOptions['onStep'];
  stopWhen?: StopCondition | StopCondition[];
  toolApprovalMode?: ToolApprovalMode;
}

export interface AgentLoopOptions {
  /** Optional hook fired after terminal run events are emitted. */
  afterFinal?: (context: AgentLoopFinalContext) => void | Promise<void>;
  /** Optional hook fired after RUN_STARTED is emitted. */
  afterInit?: (context: AgentLoopContext) => void | Promise<void>;
  /** Optional hook fired after state has been updated for a completed step. */
  afterStep?: (context: AgentLoopStepContext) => void | Promise<void>;
  /** Optional hook fired after tool result messages have been built. */
  afterToolCall?: (context: AgentLoopToolContext) => void | Promise<void>;
  /** Optional tool approval callback used by `ask` and `auto` modes. */
  approveToolCalls?: (
    context: ToolApprovalContext
  ) =>
    | boolean
    | ToolApprovalDecision
    | ToolApprovalResult
    | Promise<boolean | ToolApprovalDecision | ToolApprovalResult>;
  /** Optional hook fired before terminal run events are emitted/returned. */
  beforeFinal?: (context: AgentLoopFinalContext) => void | Promise<void>;
  /** Optional hook fired after loop state is initialized but before RUN_STARTED is emitted. */
  beforeInit?: (context: AgentLoopContext) => void | Promise<void>;
  /** Optional hook fired immediately before each loop step executes. */
  beforeStep?: (context: AgentLoopContext) => void | Promise<void>;
  /** Optional hook fired before transforming tool calls into tool result messages. */
  beforeToolCall?: (context: AgentLoopToolContext) => void | Promise<void>;
  /** Caller-supplied function that transforms completed tool calls into messages to append. */
  buildToolResultMessages: (toolCalls: XmlToolCall[]) => Promise<unknown[]>;
  /** Caller-supplied LLM invocation. Receives current message history, returns a stream of chunks. */
  execute: (messages: unknown[]) => AsyncIterable<StreamChunk>;
  /** Optional interrupt controller for cancelling execution. */
  interruptController?: InterruptController;
  /** Maximum conversation messages to retain. Older messages are trimmed. Defaults to unlimited. */
  maxConversationMessages?: number;
  /** Hard cap on loop iterations. Defaults to 20. */
  maxSteps?: number;
  /** Optional callback fired when the loop aborts via explicit abort() or interrupt controller. */
  onAbort?: (reason: AgentLoopAbortReason, context: AgentLoopContext) => void | Promise<void>;
  /** Optional callback fired for AG-UI protocol events (RUN_STARTED, STEP_STARTED, etc). */
  onAgUiEvent?: (event: AgUiEvent) => void | Promise<void>;
  /** Optional callback fired when execute/process logic throws. */
  onError?: (error: Error, context: AgentLoopContext) => void | Promise<void>;
  /** Optional callback fired after each completed step. */
  onStep?: (result: StepResult) => void | Promise<void>;
  /** Optional hook for per-step message/callback/tool configuration overrides. */
  prepareStep?: (
    context: AgentLoopContext
  ) => AgentLoopStepOverrides | undefined | Promise<AgentLoopStepOverrides | undefined>;
  /** Unique identifier for this run (e.g., UUID). Used for AG-UI events. */
  runId?: string;
  /** Stop condition(s) evaluated after every step. Loop continues only when ALL conditions return false. */
  stopWhen: StopCondition | StopCondition[];
  /** Thread ID for this conversation (optional). Passed through AG-UI events. */
  threadId?: string;
  /** Tool approval mode. Defaults to `allow`. `ask` requires `approveToolCalls` to continue. */
  toolApprovalMode?: ToolApprovalMode;
}

export interface AgentLoopHandle {
  /** Abort the running loop. No further parts are emitted after abort is called. */
  abort: () => void;
  /** Async generator that yields OutputParts across all steps until the loop terminates. */
  run: (initialMessages: unknown[]) => AsyncGenerator<OutputPart>;
}
