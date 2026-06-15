import type { AgentSpec, LoadedAgent } from '../specs/types.js';

/**
 * Initialize an agent from a specification for runtime execution
 */
export function initializeAgent(spec: AgentSpec): LoadedAgent {
  const hooks = new Map<string, Array<(context: unknown) => Promise<void> | void>>();

  if (spec.hooks) {
    const hookTypes = Object.keys(spec.hooks) as Array<keyof typeof spec.hooks>;

    for (const hookType of hookTypes) {
      const hookNames = spec.hooks[hookType] ?? [];
      if (hookNames.length > 0) {
        hooks.set(hookType, []);
      }
    }
  }

  const budget = {
    total: spec.tokenBudget ?? 0,
    used: 0,
    remaining: spec.tokenBudget ?? 0,
    allocations: new Map()
  };

  const skillRegistry = spec.skillRegistry ?? [];

  return {
    budget,
    hooks,
    skillRegistry,
    spec
  };
}
