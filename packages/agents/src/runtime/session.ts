import type { AgentSpec, LoadedAgent } from '../specs/types.js';
import { executeAgent } from './executor.js';
import { AgentSessionState, AgentStateMachine } from './state-machine.js';
import type { AgentExecutionContext, ExecuteOptions, ExecutionResult } from './types.js';

export interface AgentSessionOptions {
  options?: ExecuteOptions;
  spec: AgentSpec;
  task: string;
}

export interface AgentSessionHandle {
  readonly agent: LoadedAgent;
  readonly context: AgentExecutionContext;
  getResult(): ExecutionResult | null;
  onStateChange(listener: (from: AgentSessionState, to: AgentSessionState) => void): void;
  pause(): void;
  resume(): Promise<ExecutionResult>;

  start(): Promise<ExecutionResult>;
  readonly state: AgentSessionState;
}

/**
 * Create an agent session — wraps agent lifecycle, state machine, and execution
 */
export function createAgentSession(options: AgentSessionOptions): AgentSessionHandle {
  const stateMachine = new AgentStateMachine();
  // Initialize state to READY
  stateMachine.transition(AgentSessionState.READY);
  let result: ExecutionResult | null = null;

  const agent: LoadedAgent = {
    budget: {
      total: options.spec.tokenBudget ?? 0,
      used: 0,
      remaining: options.spec.tokenBudget ?? 0,
      allocations: new Map()
    },
    hooks: new Map(),
    skillRegistry: options.spec.skillRegistry ?? [],
    spec: options.spec
  };

  const context: AgentExecutionContext = {
    agent,
    results: new Map(),
    spec: options.spec,
    state: {
      completedSteps: [],
      failedSteps: [],
      errors: []
    },
    task: options.task,
    tokens: {
      total: options.spec.tokenBudget ?? 0,
      used: 0,
      remaining: options.spec.tokenBudget ?? 0
    }
  };

  async function runAndTransition(
    sm: AgentStateMachine,
    ctx: AgentExecutionContext,
    executeOptions: ExecuteOptions | undefined,
    onBefore?: () => void
  ): Promise<ExecutionResult> {
    sm.transition(AgentSessionState.RUNNING);
    onBefore?.();

    try {
      result = await executeAgent(ctx, executeOptions);
      if (sm.state === AgentSessionState.RUNNING) {
        sm.transition(AgentSessionState.DONE);
      }
    } catch (error) {
      ctx.state.errors.push(error instanceof Error ? error : new Error(String(error)));
      if (sm.state === AgentSessionState.RUNNING) {
        sm.transition(AgentSessionState.ERROR);
      }
      throw error;
    }

    return result;
  }

  return {
    get state(): AgentSessionState {
      return stateMachine.state;
    },

    get agent(): LoadedAgent {
      return agent;
    },

    get context(): AgentExecutionContext {
      return context;
    },

    async start(): Promise<ExecutionResult> {
      if (!stateMachine.canTransition(AgentSessionState.RUNNING)) {
        throw new Error(`Cannot start session from state ${stateMachine.state}. Expected READY state.`);
      }
      return runAndTransition(stateMachine, context, options.options, () => {
        result = null;
      });
    },

    pause(): void {
      if (!stateMachine.canTransition(AgentSessionState.PAUSED)) {
        throw new Error(`Cannot pause session from state ${stateMachine.state}`);
      }
      stateMachine.transition(AgentSessionState.PAUSED);
    },

    async resume(): Promise<ExecutionResult> {
      if (!stateMachine.canTransition(AgentSessionState.RUNNING)) {
        throw new Error(`Cannot resume session from state ${stateMachine.state}`);
      }
      return runAndTransition(stateMachine, context, options.options, () => {
        result = null;
      });
    },

    getResult(): ExecutionResult | null {
      return result;
    },

    onStateChange(listener: (from: AgentSessionState, to: AgentSessionState) => void): void {
      stateMachine.onTransition(listener);
    }
  };
}
