import { describe, expect, it } from 'vitest';
import type { LoadedAgent, SkillMetadata } from './specs/types.js';
import { SkillCostTracker, selectSkills } from './skills/index.js';

describe('Skill Selector', () => {
  it('should select applicable skills for a task', () => {
    const skillRegistry: SkillMetadata[] = [
      {
        name: 'research',
        cost: '3000-5000',
        latency: '2-10',
        confidence: 0.95,
        applicableTo: ['all', 'research']
      },
      {
        name: 'coding',
        cost: '2000-4000',
        latency: '1-5',
        confidence: 0.9,
        applicableTo: ['coding']
      }
    ];

    const agent: LoadedAgent = {
      spec: {
        name: 'test',
        role: 'test',
        description: 'test',
        skillRegistry
      },
      hooks: new Map(),
      skillRegistry,
      budget: {
        total: 10_000,
        used: 0,
        remaining: 10_000,
        allocations: new Map()
      }
    };

    const context = {
      agent,
      state: {
        completedSteps: [],
        failedSteps: []
      },
      tokens: {
        used: 0
      }
    };

    const skills = selectSkills(context, skillRegistry, agent.budget);

    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe('coding');
    expect(skills[1].name).toBe('research');
  });

  it('should respect budget constraints', () => {
    const skillRegistry: SkillMetadata[] = [
      {
        name: 'expensive',
        cost: '5000-8000',
        latency: '5-10',
        confidence: 0.95,
        applicableTo: ['all']
      },
      {
        name: 'cheap',
        cost: '1000-2000',
        latency: '1-2',
        confidence: 0.85,
        applicableTo: ['all']
      }
    ];

    const agent: LoadedAgent = {
      spec: {
        name: 'test',
        role: 'test',
        description: 'test',
        skillRegistry
      },
      hooks: new Map(),
      skillRegistry,
      budget: {
        total: 3000,
        used: 0,
        remaining: 3000,
        allocations: new Map()
      }
    };

    const context = {
      agent,
      state: {
        completedSteps: [],
        failedSteps: []
      },
      tokens: {
        used: 0
      }
    };

    const skills = selectSkills(context, skillRegistry, agent.budget);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('cheap');
  });

  it('should return empty array when no applicable skills', () => {
    const skillRegistry: SkillMetadata[] = [
      {
        name: 'coding',
        cost: '2000-4000',
        latency: '1-5',
        confidence: 0.9,
        applicableTo: ['coding']
      }
    ];

    const agent: LoadedAgent = {
      spec: {
        name: 'test',
        role: 'test',
        description: 'test',
        skillRegistry
      },
      hooks: new Map(),
      skillRegistry,
      budget: {
        total: 10_000,
        used: 0,
        remaining: 10_000,
        allocations: new Map()
      }
    };

    const context = {
      agent,
      state: {
        completedSteps: [],
        failedSteps: []
      },
      tokens: {
        used: 0
      }
    };
    const skills = selectSkills(context, [], agent.budget);

    expect(skills).toHaveLength(0);
  });
});

describe('Skill Cost Tracker', () => {
  it('should record skill execution costs', () => {
    const tracker = new SkillCostTracker();

    tracker.record('skill1', 1000);

    const cost = tracker.get('skill1');

    expect(cost).toBeDefined();
    expect(cost?.name).toBe('skill1');
    expect(cost?.cost).toBe(1000);
    expect(cost?.executionCount).toBe(1);
    expect(cost?.averageCost).toBe(1000);
  });

  it('should average costs across multiple executions', () => {
    const tracker = new SkillCostTracker();

    tracker.record('skill1', 1000);
    tracker.record('skill1', 2000);
    tracker.record('skill1', 3000);

    const cost = tracker.get('skill1');

    expect(cost?.averageCost).toBe(2000);
    expect(cost?.executionCount).toBe(3);
  });

  it('should get estimated cost for skill', () => {
    const tracker = new SkillCostTracker();

    tracker.record('skill1', 1000);
    tracker.record('skill1', 2000);

    const estimated = tracker.getEstimatedCost('skill1');

    expect(estimated).toBe(1500);
  });

  it('should return undefined for unknown skill', () => {
    const tracker = new SkillCostTracker();

    const cost = tracker.get('unknown');

    expect(cost).toBeUndefined();
  });
});
