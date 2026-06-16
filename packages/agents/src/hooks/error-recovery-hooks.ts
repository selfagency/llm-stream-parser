import type { AgentExecutionContext } from '../specs/types.js';
import type { AgentHookDefinition } from './types.js';
import { AgentLifecycleHook } from './types.js';

/**
 * Error recovery hook
 * Attempts to recover from agent execution errors
 */
export function createErrorRecoveryHook(): AgentHookDefinition {
  return {
    name: 'error-recovery',
    description: 'Attempt recovery from agent execution errors',
    handler: (context: AgentExecutionContext): void => {
      const { state } = context;
      const errors = state.errors;

      if (errors.length === 0) {
        return;
      }

      const lastErrorIndex = errors.length - 1;
      const lastError = errors[lastErrorIndex];
      if (!lastError) {
        return;
      }

      state.failedSteps.push(`recovery-attempt:${lastError.message}`);
    }
  };
}

/**
 * Retry strategy hook
 * Implements exponential backoff for retries
 */
export function createRetryStrategyHook(): AgentHookDefinition {
  return {
    name: 'retry-strategy',
    description: 'Implement exponential backoff for retries',
    handler: (context: AgentExecutionContext): void => {
      const { state } = context;
      const retryCount = state.failedSteps.filter(s => s.startsWith('retry:')).length;
      const backoffMs = Math.min(1000 * 2 ** retryCount, 30_000);

      state.failedSteps.push(`retry:${retryCount}:backoff:${backoffMs}ms`);

      if (retryCount >= 3) {
        throw new Error(`Max retries exceeded (${retryCount}). Escalating to human.`);
      }
    }
  };
}

/**
 * Register error recovery hooks for an agent
 */
export function registerErrorRecoveryHooks(registry: Map<AgentLifecycleHook, AgentHookDefinition[]>): void {
  const onError = registry.get(AgentLifecycleHook.ON_ERROR) ?? [];
  onError.push(createErrorRecoveryHook());
  registry.set(AgentLifecycleHook.ON_ERROR, onError);

  const onRetry = registry.get(AgentLifecycleHook.ON_RETRY) ?? [];
  onRetry.push(createRetryStrategyHook());
  registry.set(AgentLifecycleHook.ON_RETRY, onRetry);
}
