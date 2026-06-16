import type { AgentExecutionContext } from '../specs/types.js';
import type { AgentHookDefinition } from './types.js';
import { AgentLifecycleHook } from './types.js';

const DESTRUCTIVE_PATTERNS = [
  'delete',
  'remove',
  'destroy',
  'overwrite',
  'drop',
  'clear',
  'reset',
  'purge',
  'wipe',
  'nuke',
  'rm',
  'kill',
  'terminate',
  'shutdown',
  'format',
  'replace',
  'rename',
  'move',
  'archive',
  'expunge',
  'erase',
  'unlink',
  'chmod',
  'chown'
] as const;

function isDestructiveSkill(skillName: string): boolean {
  const lower = skillName.toLowerCase();
  return DESTRUCTIVE_PATTERNS.some(pattern => lower.includes(pattern));
}

/**
 * Pre-skill approval gate hook
 * Blocks destructive operations unless explicitly approved
 */
export function createApprovalGateHook(): AgentHookDefinition {
  return {
    name: 'approval-gate',
    description: 'Gate destructive operations requiring user approval',
    handler: async (context: AgentExecutionContext): Promise<void> => {
      const { state } = context;
      const lastSkill = state.completedSteps[state.completedSteps.length - 1];

      if (lastSkill && isDestructiveSkill(lastSkill)) {
        state.failedSteps.push(`approval-required:${lastSkill}`);
        throw new Error(
          `Destructive operation requires approval: "${lastSkill}". ` +
            'Use --force or configure approval gate to proceed.'
        );
      }
    }
  };
}

/**
 * Post-skill approval tracking hook
 * Records approved operations for audit trail
 */
export function createApprovalTrackingHook(): AgentHookDefinition {
  return {
    name: 'approval-tracking',
    description: 'Track approved operations for audit trail',
    handler: (context: AgentExecutionContext): void => {
      const { results, state } = context;
      const completed = [...state.completedSteps];

      if (completed.length > 0) {
        const completedIndex = completed.length - 1;
        const audit = results.get('approvalAudit') ?? [];
        (audit as Array<{ step: string; timestamp: number }>).push({
          step: completed[completedIndex] as string,
          timestamp: Date.now()
        });
        results.set('approvalAudit', audit);
      }
    }
  };
}

/**
 * Register approval gate hooks for an agent
 */
export function registerApprovalHooks(registry: Map<AgentLifecycleHook, AgentHookDefinition[]>): void {
  const preSkill = registry.get(AgentLifecycleHook.PRE_SKILL) ?? [];
  preSkill.push(createApprovalGateHook());
  registry.set(AgentLifecycleHook.PRE_SKILL, preSkill);

  const postSkill = registry.get(AgentLifecycleHook.POST_SKILL) ?? [];
  postSkill.push(createApprovalTrackingHook());
  registry.set(AgentLifecycleHook.POST_SKILL, postSkill);
}
