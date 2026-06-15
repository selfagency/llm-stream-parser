/**
 * Agent-specific hook definitions
 * These hooks provide lifecycle integration points for agents
 */

import type { AgentExecutionContext } from '../specs/types.js';

export type AgentHookHandler = (context: AgentExecutionContext) => Promise<void> | void;

/**
 * Hook definition for an agent
 */
export interface AgentHookDefinition {
  /** Expected arguments */
  args?: string[];

  /** Hook description */
  description: string;

  /** Hook handler function */
  handler: AgentHookHandler;
  /** Hook name */
  name: string;

  /** Return type */
  returns?: string;
}

/**
 * Available lifecycle hooks for agents
 */
export enum AgentLifecycleHook {
  PRE_INIT = 'preInit',
  POST_INIT = 'postInit',
  PRE_TURN = 'preTurn',
  SKILL_SELECTION = 'skillSelection',
  PRE_SKILL = 'preSkill',
  POST_SKILL = 'postSkill',
  POST_TURN = 'postTurn',
  ON_ERROR = 'onError',
  ON_RETRY = 'onRetry',
  PRE_CLEANUP = 'preCleanup',
  POST_CLEANUP = 'postCleanup',
  LAYER_TRANSITION = 'layerTransition',
  STEP_EXECUTE = 'stepExecute',
  STEP_TRANSITION = 'stepTransition'
}

/**
 * Agent hook registry for managing agent-specific hooks
 */
export class AgentHookRegistry {
  private hooks: Map<AgentLifecycleHook, AgentHookDefinition[]> = new Map();

  /**
   * Register a hook
   */
  register(lifecycle: AgentLifecycleHook, hook: AgentHookDefinition): void {
    const existing = this.hooks.get(lifecycle) ?? [];
    this.hooks.set(lifecycle, [...existing, hook]);
  }

  /**
   * Get hooks for a lifecycle phase
   */
  get(lifecycle: AgentLifecycleHook): AgentHookDefinition[] {
    return this.hooks.get(lifecycle) ?? [];
  }

  /**
   * Execute hooks for a lifecycle phase
   */
  async execute(lifecycle: AgentLifecycleHook, context: AgentExecutionContext): Promise<void> {
    const hooks = this.get(lifecycle);
    for (const hook of hooks) {
      await hook.handler(context);
    }
  }

  /**
   * Clear all hooks
   */
  clear(): void {
    this.hooks.clear();
  }

  /**
   * Get all registered hooks
   */
  getAll(): Map<AgentLifecycleHook, AgentHookDefinition[]> {
    return new Map(this.hooks);
  }
}
