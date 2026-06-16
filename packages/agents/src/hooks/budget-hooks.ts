import type { AgentExecutionContext } from '../specs/types.js';
import type { AgentHookDefinition } from './types.js';
import { AgentLifecycleHook } from './types.js';

/**
 * Pre-skill budget check hook
 * Validates token budget before skill execution
 */
export function createBudgetCheckHook(): AgentHookDefinition {
  return {
    name: 'budget-check',
    description: 'Check token budget before skill execution',
    handler: (context: AgentExecutionContext): void => {
      const { tokens } = context;
      const softLimit = tokens.total * 0.8;

      if (tokens.used >= tokens.total) {
        throw new Error(`Token budget exhausted: used ${tokens.used}/${tokens.total}`);
      }

      if (tokens.used >= softLimit) {
        context.state.completedSteps.push('budget-warning');
      }
    }
  };
}

/**
 * Post-skill budget deduction hook
 * Tracks actual token usage after skill execution
 */
export function createBudgetDeductionHook(): AgentHookDefinition {
  return {
    name: 'budget-deduction',
    description: 'Deduct actual token usage after skill execution',
    handler: (context: AgentExecutionContext): void => {
      const { tokens, agent } = context;
      const estimatedCost = 1000;
      tokens.used += estimatedCost;
      tokens.remaining = tokens.total - tokens.used;
      agent.budget.used = tokens.used;
      agent.budget.remaining = tokens.remaining;
    }
  };
}

/**
 * Register budget enforcement hooks for an agent
 */
export function registerBudgetHooks(registry: Map<AgentLifecycleHook, AgentHookDefinition[]>): void {
  const preSkill = registry.get(AgentLifecycleHook.PRE_SKILL) ?? [];
  preSkill.push(createBudgetCheckHook());
  registry.set(AgentLifecycleHook.PRE_SKILL, preSkill);

  const postSkill = registry.get(AgentLifecycleHook.POST_SKILL) ?? [];
  postSkill.push(createBudgetDeductionHook());
  registry.set(AgentLifecycleHook.POST_SKILL, postSkill);
}
