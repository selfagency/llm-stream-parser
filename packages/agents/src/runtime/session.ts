import type { AgentSpec, LoadedAgent } from '../specs/types.js';
import { AgentStateMachine, AgentSessionState } from './state-machine.js';
import { executeAgent } from './executor.js';
import type { AgentExecutionContext, ExecuteOptions, ExecutionResult } from './types.js';

export interface AgentSessionOptions {
  spec: AgentSpec;
  task: string;
  options?: ExecuteOptions;
}

export interface AgentSessionHandle {
  readonly state: AgentSessionState;
  readonly agent: LoadedAgent;
  readonly context: AgentExecutionContext;

  start(): Promise<ExecutionResult>;
  pause(): void;
  resume(): Promise<ExecutionResult>;
  getResult(): ExecutionResult | null;
  onStateChange(listener: (from: AgentSessionState, to: AgentSessionState) => void): void;
}

/**
 * Create an agent session — wraps agent lifecycle, state machine, and execution
 */
export function createAgentSession(options: AgentSessionOptions): AgentSessionHandle {
  const stateMachine = new AgentStateMachine();
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
        throw new Error(`Cannot start session from state ${stateMachine.state}. ` + 'Expected READY state.');
      }

      stateMachine.transition(AgentSessionState.RUNNING);

      try {
        result = await executeAgent(context, options.options);
        stateMachine.transition(AgentSessionState.DONE);
      } catch (error) {
        context.state.errors.push(error instanceof Error ? error : new Error(String(error)));
        stateMachine.transition(AgentSessionState.ERROR);
        throw error;
      }

      return result;
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

      stateMachine.transition(AgentSessionState.RUNNING);

      try {
        result = await executeAgent(context, options.options);
        stateMachine.transition(AgentSessionState.DONE);
      } catch (error) {
        context.state.errors.push(error instanceof Error ? error : new Error(String(error)));
        stateMachine.transition(AgentSessionState.ERROR);
        throw error;
      }

      return result;
    },

    getResult(): ExecutionResult | null {
      return result;
    },

    onStateChange(listener: (from: AgentSessionState, to: AgentSessionState) => void): void {
      stateMachine.onTransition(listener);
    }
  };
}
