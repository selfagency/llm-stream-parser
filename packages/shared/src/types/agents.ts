/**
 * Agent execution and orchestration types.
 */

/**
 * Status of an agent execution.
 */
export const AgentStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STOPPED: 'stopped'
} as const;

export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

/**
 * Conditions under which an agent loop should stop execution.
 */
export type StopCondition =
  | { type: 'max_steps'; limit: number }
  | { type: 'max_tokens'; limit: number }
  | { type: 'time_budget'; ms: number }
  | { type: 'manual' };

/**
 * Result metadata for a single agent loop step.
 */
export interface StepResult {
  /** Error if execution failed. */
  error?: Error;

  /** Output from the step (message, tool calls, etc.). */
  output?: unknown;

  /** Status of the step. */
  status: 'success' | 'error' | 'stopped';
  /** Step index in the loop. */
  stepIndex: number;

  /** Token usage for this step. */
  usage?: { prompt: number; completion: number };
}

/**
 * Complete state of the agent loop.
 */
export interface AgentLoopState {
  /** Accumulated results from executed steps. */
  results: StepResult[];

  /** Execution status. */
  status: AgentStatus;
  /** Current step index. */
  stepIndex: number;

  /** Current stop condition, if any. */
  stopCondition?: StopCondition;

  /** Aggregated token usage. */
  totalTokens: { prompt: number; completion: number };
}

/**
 * Context passed to agent during loop execution.
 */
export interface AgentLoopContext {
  /** Agent identifier. */
  agentId: string;

  /** Runtime task context for spawning child tasks. */
  runtimeContext?: {
    sessionId: string;
    depth: number;
    spawn(tasks: unknown[], signal?: AbortSignal, sessionId?: string): Promise<unknown>;
  };
  /** Session identifier. */
  sessionId: string;

  /** Current loop step index. */
  stepIndex: number;

  /** Stop conditions for loop. */
  stopConditions?: StopCondition[];
}
