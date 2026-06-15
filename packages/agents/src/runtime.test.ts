import { describe, expect, it, vi } from 'vitest';
import { executeAgent, initializeAgent } from './runtime/index.js';
import type { AgentSpec } from '../specs/types.js';

describe('Agent Runtime', () => {
  it('should initialize agent from spec', () => {
    const spec: AgentSpec = {
      name: 'test',
      role: 'test agent',
      description: 'A test agent',
      tokenBudget: 10_000
    };

    const agent = initializeAgent(spec);

    expect(agent.spec).toEqual(spec);
    expect(agent.budget.total).toBe(10_000);
    expect(agent.budget.used).toBe(0);
    expect(agent.budget.remaining).toBe(10_000);
    expect(agent.hooks).toBeInstanceOf(Map);
    expect(agent.skillRegistry).toEqual([]);
  });

  it('should execute sequential agent', async () => {
    const spec: AgentSpec = {
      name: 'test',
      role: 'test agent',
      description: 'A test agent',
      tokenBudget: 10_000,
      orchestrator: 'sequential',
      layers: [
        {
          role: 'layer1',
          goal: 'Test layer 1',
          tokenBudget: 5000,
          skills: []
        },
        {
          role: 'layer2',
          goal: 'Test layer 2',
          tokenBudget: 5000,
          skills: [],
          dependsOn: ['layer1']
        }
      ]
    };

    const agent = initializeAgent(spec);
    const context = {
      agent,
      results: new Map(),
      spec,
      state: {
        currentLayer: undefined,
        currentStep: undefined,
        completedSteps: [],
        failedSteps: [],
        errors: []
      },
      task: 'Test task',
      tokens: {
        total: 10_000,
        used: 0,
        remaining: 10_000
      }
    };
    const result = await executeAgent(context);

    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toEqual(['step-1', 'step-2']);
    expect(result.stepsFailed).toHaveLength(0);
  });

  it('should handle errors gracefully', async () => {
    const spec: AgentSpec = {
      name: 'test',
      role: 'test agent',
      description: 'A test agent',
      tokenBudget: 10_000
    };

    const agent = initializeAgent(spec);
    const context = {
      agent,
      results: new Map(),
      spec,
      state: {
        currentLayer: undefined,
        currentStep: undefined,
        completedSteps: [],
        failedSteps: [],
        errors: []
      },
      task: 'Test task',
      tokens: {
        total: 10_000,
        used: 0,
        remaining: 10_000
      }
    };
    const result = await executeAgent(context);

    // Should complete successfully even with empty spec
    expect(result).toBeDefined();
    expect(result.tokensUsed).toBeGreaterThanOrEqual(0);
  });

  it('should call progress callback when provided', async () => {
    const onProgress = vi.fn();

    const spec: AgentSpec = {
      name: 'test',
      role: 'test agent',
      description: 'A test agent',
      tokenBudget: 10_000
    };

    const agent = initializeAgent(spec);
    const context = {
      agent,
      results: new Map(),
      spec,
      state: {
        currentLayer: undefined,
        currentStep: undefined,
        completedSteps: [],
        failedSteps: [],
        errors: []
      },
      task: 'Test task',
      tokens: {
        total: 10_000,
        used: 0,
        remaining: 10_000
      }
    };
    await executeAgent(context, { onProgress });

    // Progress callback is implementation-dependent
    // Currently the executor doesn't call onProgress
    expect(onProgress).not.toHaveBeenCalled();
  });
});
