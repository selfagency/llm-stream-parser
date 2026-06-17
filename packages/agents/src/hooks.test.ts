import { describe, expect, it } from 'vitest';
import { createApprovalGateHook, createApprovalTrackingHook } from './hooks/approval-hooks.js';
import { createBudgetCheckHook, createBudgetDeductionHook } from './hooks/budget-hooks.js';
import { createErrorRecoveryHook, createRetryStrategyHook } from './hooks/error-recovery-hooks.js';
import { createMemoryPostTurnHook, createMemoryPreTurnHook } from './hooks/memory-hooks.js';
import { createDefaultHookMap, executeHooks, resolveAgentHooks } from './hooks/resolver.js';
import { AgentLifecycleHook, type AgentHookDefinition } from './hooks/types.js';
import type { AgentExecutionContext, AgentSpec, LoadedAgent } from './specs/types.js';

function createMockContext(overrides?: Partial<AgentExecutionContext>): AgentExecutionContext {
  const spec: AgentSpec = {
    name: 'test',
    role: 'test agent',
    description: 'A test agent',
    tokenBudget: 10_000
  };

  const agent: LoadedAgent = {
    budget: { total: 10_000, used: 0, remaining: 10_000, allocations: new Map() },
    hooks: new Map(),
    skillRegistry: [],
    spec
  };

  return {
    agent,
    results: new Map(),
    spec,
    state: {
      completedSteps: [],
      failedSteps: [],
      errors: []
    },
    task: 'test task',
    tokens: { total: 10_000, used: 0, remaining: 10_000 },
    ...overrides
  };
}

describe('Memory Hooks', () => {
  it('should mark memory retrieval on pre-turn', async () => {
    const hook = createMemoryPreTurnHook();
    const ctx = createMockContext();
    await hook.handler(ctx);
    expect(ctx.state.completedSteps).toContain('memory-retrieval');
  });

  it('should capture observations on post-turn', async () => {
    const hook = createMemoryPostTurnHook();
    const ctx = createMockContext();
    ctx.state.completedSteps.push('step-1');
    await hook.handler(ctx);
    const obs = ctx.results.get('lastObservations') as { completedSteps: string[] };
    expect(obs.completedSteps).toContain('step-1');
  });
});

describe('Budget Hooks', () => {
  it('should throw when budget exhausted', async () => {
    const hook = createBudgetCheckHook();
    const ctx = createMockContext({ tokens: { total: 1000, used: 1000, remaining: 0 } });
    await expect(hook.handler(ctx)).rejects.toThrow('Token budget exhausted');
  });

  it('should warn at soft limit', async () => {
    const hook = createBudgetCheckHook();
    const ctx = createMockContext({ tokens: { total: 1000, used: 850, remaining: 150 } });
    await hook.handler(ctx);
    expect(ctx.state.completedSteps).toContain('budget-warning');
  });

  it('should deduct tokens on post-skill', async () => {
    const hook = createBudgetDeductionHook();
    const ctx = createMockContext();
    await hook.handler(ctx);
    expect(ctx.tokens.used).toBe(1000);
    expect(ctx.tokens.remaining).toBe(9000);
  });
});

describe('Approval Hooks', () => {
  it('should block destructive operations', async () => {
    const hook = createApprovalGateHook();
    const ctx = createMockContext();
    ctx.state.completedSteps.push('delete-files');
    await expect(hook.handler(ctx)).rejects.toThrow('requires approval');
    expect(ctx.state.failedSteps).toContain('approval-required:delete-files');
  });

  it('should allow non-destructive operations', async () => {
    const hook = createApprovalGateHook();
    const ctx = createMockContext();
    ctx.state.completedSteps.push('code-generation');
    await expect(hook.handler(ctx)).resolves.toBeUndefined();
  });

  it('should track approved operations', async () => {
    const hook = createApprovalTrackingHook();
    const ctx = createMockContext();
    ctx.state.completedSteps.push('read-file');
    await hook.handler(ctx);
    const audit = ctx.results.get('approvalAudit') as Array<{ step: string }>;
    expect(audit).toHaveLength(1);
    expect(audit![0].step).toBe('read-file');
  });
});

describe('Error Recovery Hooks', () => {
  it('should log recovery attempt on error', async () => {
    const hook = createErrorRecoveryHook();
    const ctx = createMockContext();
    ctx.state.errors.push(new Error('test error'));
    await hook.handler(ctx);
    expect(ctx.state.failedSteps[0]).toContain('recovery-attempt');
  });

  it('should skip recovery when no errors', async () => {
    const hook = createErrorRecoveryHook();
    const ctx = createMockContext();
    await hook.handler(ctx);
    expect(ctx.state.failedSteps).toHaveLength(0);
  });

  it('should implement exponential backoff', async () => {
    const hook = createRetryStrategyHook();
    const ctx = createMockContext();
    ctx.state.failedSteps.push('retry:0:backoff:1000ms');
    ctx.state.failedSteps.push('retry:1:backoff:2000ms');
    await hook.handler(ctx);
    expect(ctx.state.failedSteps[2]).toContain('retry:2:backoff:4000ms');
  });

  it('should escalate after max retries', async () => {
    const hook = createRetryStrategyHook();
    const ctx = createMockContext();
    ctx.state.failedSteps.push('retry:0:backoff:1000ms');
    ctx.state.failedSteps.push('retry:1:backoff:2000ms');
    ctx.state.failedSteps.push('retry:2:backoff:4000ms');
    await expect(hook.handler(ctx)).rejects.toThrow('Max retries exceeded');
  });
});

describe('Hook Registry', () => {
  it('should create default hook map with all categories', () => {
    const map = createDefaultHookMap();
    expect(map.has(AgentLifecycleHook.PRE_TURN)).toBe(true);
    expect(map.has(AgentLifecycleHook.POST_TURN)).toBe(true);
    expect(map.has(AgentLifecycleHook.PRE_SKILL)).toBe(true);
    expect(map.has(AgentLifecycleHook.POST_SKILL)).toBe(true);
    expect(map.has(AgentLifecycleHook.ON_ERROR)).toBe(true);
    expect(map.has(AgentLifecycleHook.ON_RETRY)).toBe(true);
  });

  it('should resolve hook names to definitions', async () => {
    const hooks = await resolveAgentHooks(['memory-pre-turn', 'budget-check'], 'test');
    expect(hooks).toHaveLength(2);
    expect(hooks![0].name).toBe('memory-pre-turn');
    expect(hooks![1].name).toBe('budget-check');
  });

  it('should return empty for unknown hook names', async () => {
    const hooks = await resolveAgentHooks(['nonexistent-hook'], 'test');
    expect(hooks).toHaveLength(0);
  });

  it('should execute hooks in order', async () => {
    const map = createDefaultHookMap();
    const ctx = createMockContext();
    const order: string[] = [];

    // Add a custom hook to track execution order
    const preTurnHooks = map.get(AgentLifecycleHook.PRE_TURN) ?? [];
    const originalHandler = preTurnHooks[0]?.handler;
    if (originalHandler) {
      const updatedHook = {
        ...preTurnHooks[0],
        handler: async (c: AgentExecutionContext) => {
          order.push('pre-turn');
          await originalHandler(c);
        }
      } as AgentHookDefinition;
      preTurnHooks[0] = updatedHook;
      map.set(AgentLifecycleHook.PRE_TURN, preTurnHooks);
    }

    await executeHooks(map, AgentLifecycleHook.PRE_TURN, ctx);
    expect(order).toContain('pre-turn');
  });
});
