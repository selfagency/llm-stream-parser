import type { AgentExecutionContext } from '../specs/types.js';
import type { AgentHookDefinition } from './types.js';
import { AgentLifecycleHook } from './types.js';
import { registerMemoryHooks } from './memory-hooks.js';
import { registerBudgetHooks } from './budget-hooks.js';
import { registerApprovalHooks } from './approval-hooks.js';
import { registerErrorRecoveryHooks } from './error-recovery-hooks.js';

/**
 * Hook registry for agent-specific hooks
 * Maps lifecycle events to hook definitions
 */
export type AgentHookMap = Map<AgentLifecycleHook, AgentHookDefinition[]>;

/**
 * Create a default hook map with all standard hooks registered
 */
export function createDefaultHookMap(): AgentHookMap {
  const registry = new Map<AgentLifecycleHook, AgentHookDefinition[]>();

  // Register all hook categories
  registerMemoryHooks(registry);
  registerBudgetHooks(registry);
  registerApprovalHooks(registry);
  registerErrorRecoveryHooks(registry);

  return registry;
}

/**
 * Get hooks for a specific lifecycle phase
 */
export function getHooks(registry: AgentHookMap, lifecycle: AgentLifecycleHook): AgentHookDefinition[] {
  return registry.get(lifecycle) ?? [];
}

/**
 * Execute hooks for a lifecycle phase
 */
export async function executeHooks(
  registry: AgentHookMap,
  lifecycle: AgentLifecycleHook,
  context: AgentExecutionContext
): Promise<void> {
  const hooks = getHooks(registry, lifecycle);
  for (const hook of hooks) {
    await hook.handler(context);
  }
}

/**
 * Resolve hook names to actual hook definitions
 * Phase 3: Hook System Integration
 */
export async function resolveAgentHooks(hookNames: string[], _agentName: string): Promise<AgentHookDefinition[]> {
  const resolved: AgentHookDefinition[] = [];
  const defaultMap = createDefaultHookMap();

  for (const hookName of hookNames) {
    const hook = findHookByName(hookName, defaultMap);
    if (hook) {
      resolved.push(hook);
    }
  }

  return resolved;
}

/**
 * Find a hook definition by name across all lifecycle phases
 */
function findHookByName(hookName: string, registry: AgentHookMap): AgentHookDefinition | null {
  for (const hooks of registry.values()) {
    for (const hook of hooks) {
      if (hook.name === hookName) {
        return hook;
      }
    }
  }
  return null;
}
