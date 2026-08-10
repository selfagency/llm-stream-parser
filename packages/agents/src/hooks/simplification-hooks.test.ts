import { describe, expect, it } from 'vitest';
import type { AgentExecutionContext } from '../specs/types.js';
import { shouldSimplify, simplificationHook } from './simplification-hooks.js';

function makeContext(overrides: Partial<AgentExecutionContext> = {}): AgentExecutionContext {
  return {
    agent: {
      budget: { total: 10_000, used: 0, remaining: 10_000, allocations: new Map() },
      hooks: new Map(),
      skillRegistry: [],
      spec: {
        name: 'test-agent',
        role: 'test',
        description: 'test'
      }
    },
    results: new Map(),
    spec: {
      name: 'test-agent',
      role: 'test',
      description: 'test'
    },
    state: {
      completedSteps: [],
      currentLayer: 'implementer',
      errors: [],
      failedSteps: []
    },
    task: 'test task',
    tokens: { total: 10_000, used: 0, remaining: 10_000 },
    ...overrides
  } as AgentExecutionContext;
}

describe('simplificationHook', () => {
  it('does not run when agent has no atlas manifest', async () => {
    const ctx = makeContext();
    expect(shouldSimplify(ctx)).toBe(false);
    await simplificationHook(ctx);
    expect(ctx.results.has('__simplification_suggestions__')).toBe(false);
  });

  // biome-ignore lint/suspicious/useAwait: async required by test interface
  it('does not run when atlas has no task_generate', async () => {
    const ctx = makeContext({
      spec: {
        name: 'test',
        role: 'test',
        description: 'test',
        atlas: {
          aiTasks: ['task_detect'],
          humanTasks: [],
          systemTasks: [],
          dataArtifacts: [],
          constraints: [],
          touchpoints: []
        }
      } as any
    });
    expect(shouldSimplify(ctx)).toBe(false);
  });

  it('runs when atlas includes task_generate', async () => {
    const ctx = makeContext({
      spec: {
        name: 'test',
        role: 'test',
        description: 'test',
        atlas: {
          aiTasks: ['task_generate'],
          humanTasks: [],
          systemTasks: [],
          dataArtifacts: [],
          constraints: [],
          touchpoints: []
        }
      } as any,
      results: new Map([['file1.ts', 'const x = 1;']])
    });
    expect(shouldSimplify(ctx)).toBe(true);
    await simplificationHook(ctx);
    // Should have suggestions (even if empty array for simple code)
    expect(ctx.results.has('__simplification_suggestions__')).toBe(true);
  });

  it('does not run when currentLayer is not implementer', async () => {
    const ctx = makeContext({
      spec: {
        name: 'test',
        role: 'test',
        description: 'test',
        atlas: {
          aiTasks: ['task_generate'],
          humanTasks: [],
          systemTasks: [],
          dataArtifacts: [],
          constraints: [],
          touchpoints: []
        }
      } as any,
      state: {
        completedSteps: [],
        currentLayer: 'spec-writer',
        errors: [],
        failedSteps: []
      }
    });
    await simplificationHook(ctx);
    expect(ctx.results.has('__simplification_suggestions__')).toBe(false);
  });

  it('detects excessive null checks', async () => {
    const code = 'const a = obj?.x?.y?.z?.w?.v?.u?.t?.s?.r?.q?.p?.o?.n?.m?.l?.k;';
    const ctx = makeContext({
      spec: {
        name: 'test',
        role: 'test',
        description: 'test',
        atlas: {
          aiTasks: ['task_generate'],
          humanTasks: [],
          systemTasks: [],
          dataArtifacts: [],
          constraints: [],
          touchpoints: []
        }
      } as any,
      results: new Map([['file.ts', code]])
    });
    await simplificationHook(ctx);
    const suggestions = ctx.results.get('__simplification_suggestions__') as any[];
    expect(suggestions).toBeDefined();
    expect(suggestions.some(s => s.pattern === 'excessive-null-checks')).toBe(true);
  });

  it('detects excessive length', async () => {
    const longCode = '// line\n'.repeat(250);
    const ctx = makeContext({
      spec: {
        name: 'test',
        role: 'test',
        description: 'test',
        atlas: {
          aiTasks: ['task_generate'],
          humanTasks: [],
          systemTasks: [],
          dataArtifacts: [],
          constraints: [],
          touchpoints: []
        }
      } as any,
      results: new Map([['big.ts', longCode]])
    });
    await simplificationHook(ctx);
    const suggestions = ctx.results.get('__simplification_suggestions__') as any[];
    expect(suggestions.some(s => s.pattern === 'excessive-length')).toBe(true);
  });
});
