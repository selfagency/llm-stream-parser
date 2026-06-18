import type { AgentExecutionContext } from '../specs/types.js';
import type { AgentHookDefinition } from './types.js';
import { AgentLifecycleHook } from './types.js';

/**
 * Pre-turn memory retrieval hook
 * Loads relevant memory context before agent execution
 */
export function createMemoryPreTurnHook(): AgentHookDefinition {
  return {
    name: 'memory-pre-turn',
    description: 'Retrieve relevant memories from previous turns',
    handler: (context: AgentExecutionContext): void => {
      if (context.task) {
        context.state.completedSteps.push('memory-retrieval');
      }
    }
  };
}

/**
 * Post-turn memory capture hook
 * Captures observations and decisions after agent execution
 */
export function createMemoryPostTurnHook(): AgentHookDefinition {
  return {
    name: 'memory-post-turn',
    description: 'Capture observations and decisions from completed turn',
    handler: (context: AgentExecutionContext): void => {
      const { state, results } = context;
      if (state.completedSteps.length > 0) {
        results.set('lastObservations', {
          completedSteps: [...state.completedSteps],
          failedSteps: [...state.failedSteps],
          timestamp: Date.now()
        });
      }
    }
  };
}

/**
 * Register memory hooks for an agent
 */
export function registerMemoryHooks(registry: Map<AgentLifecycleHook, AgentHookDefinition[]>): void {
  const preTurn = registry.get(AgentLifecycleHook.PRE_TURN) ?? [];
  preTurn.push(createMemoryPreTurnHook());
  registry.set(AgentLifecycleHook.PRE_TURN, preTurn);

  const postTurn = registry.get(AgentLifecycleHook.POST_TURN) ?? [];
  postTurn.push(createMemoryPostTurnHook());
  registry.set(AgentLifecycleHook.POST_TURN, postTurn);
}
