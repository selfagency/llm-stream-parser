import { describe, expect, it } from 'vitest';
import { createLoadedAgent, loadAgent, loadAgents, parseAgentSpec } from './index.js';
import { AgentSpecSchema } from './specs/schema.js';

describe('Agent Specs', () => {
  it('should parse a valid agent spec', async () => {
    const yaml = `
      name: "test"
      role: "test agent"
      description: "A test agent"
      tokenBudget: 10000
    `;

    const spec = await parseAgentSpec(yaml);
    expect(spec.name).toBe('test');
    expect(spec.role).toBe('test agent');
    expect(spec.tokenBudget).toBe(10_000);
  });

  it('should validate agent spec with schema', async () => {
    const yaml = `
      name: "test"
      role: "test agent"
      description: "A test agent"
      tokenBudget: 10000
    `;

    const spec = await parseAgentSpec(yaml);
    const validated = AgentSpecSchema.safeParse(spec);
    expect(validated.success).toBe(true);
  });

  it('should reject invalid agent specs', async () => {
    const yaml = `
      name: "test"
      description: "Missing required role field"
    `;

    expect(() => parseAgentSpec(yaml)).toThrow();
  });
});

describe('Agent Loader', () => {
  it('should create a loaded agent from spec', async () => {
    const yaml = `
      name: "test"
      role: "test agent"
      description: "A test agent"
      tokenBudget: 10000
    `;

    const spec = await parseAgentSpec(yaml);
    const agent = await createLoadedAgent(spec);

    expect(agent.spec).toEqual(spec);
    expect(agent.hooks).toBeInstanceOf(Map);
    expect(agent.skillRegistry).toEqual([]);
    expect(agent.budget.total).toBe(10_000);
    expect(agent.budget.used).toBe(0);
    expect(agent.budget.remaining).toBe(10_000);
  });

  it('should load agent with layers', async () => {
    const yaml = `
      name: "test"
      role: "test agent"
      description: "A test agent"
      tokenBudget: 10000
      layers:
        - role: "layer1"
          goal: "Test goal"
          tokenBudget: 5000
          skills:
            - "skill1"
          execution: "sequential"
    `;

    const spec = await parseAgentSpec(yaml);
    const agent = await createLoadedAgent(spec);

    expect(agent.spec.layers).toHaveLength(1);
    expect(agent.spec.layers?.[0].role).toBe('layer1');
    expect(agent.spec.layers?.[0].tokenBudget).toBe(5000);
  });

  it('should load agent with skill registry', async () => {
    const yaml = `
      name: "test"
      role: "test agent"
      description: "A test agent"
      tokenBudget: 10000
      skillRegistry:
        - name: "skill1"
          cost: "1000-2000"
          latency: "1-5"
          confidence: 0.9
          applicableTo:
            - "test"
    `;

    const spec = await parseAgentSpec(yaml);
    const agent = await createLoadedAgent(spec);

    expect(agent.skillRegistry).toHaveLength(1);
    expect(agent.skillRegistry[0].name).toBe('skill1');
    expect(agent.skillRegistry[0].cost).toBe('1000-2000');
    expect(agent.skillRegistry[0].confidence).toBe(0.9);
  });

  it('should load agent with hooks', async () => {
    const yaml = `
      name: "test"
      role: "test agent"
      description: "A test agent"
      tokenBudget: 10000
      hooks:
        preInit:
          - "hook1"
          - "hook2"
        postTurn:
          - "hook3"
    `;

    const spec = await parseAgentSpec(yaml);
    const agent = await createLoadedAgent(spec);

    expect(agent.hooks.has('preInit')).toBe(true);
    expect(agent.hooks.get('preInit')).toEqual([]); // Hooks not resolved yet (Phase 3)
    expect(agent.hooks.has('postTurn')).toBe(true);
  });
});

describe('Default Agents', () => {
  it('should load coder agent spec', async () => {
    const { agent, errors } = await loadAgent({
      filePath: './src/specs/coder.yaml'
    });

    expect(errors).toHaveLength(0);
    expect(agent).not.toBeNull();
    expect(agent?.spec.name).toBe('coder');
    expect(agent?.spec.tokenBudget).toBe(45_000);
    expect(agent?.spec.layers).toHaveLength(5);
  });

  it('should load researcher agent spec', async () => {
    const { agent, errors } = await loadAgent({
      filePath: './src/specs/researcher.yaml'
    });

    expect(errors).toHaveLength(0);
    expect(agent).not.toBeNull();
    expect(agent?.spec.name).toBe('researcher');
    expect(agent?.spec.tokenBudget).toBe(30_000);
    expect(agent?.spec.layers).toHaveLength(3);
  });

  it('should load planner agent spec', async () => {
    const { agent, errors } = await loadAgent({
      filePath: './src/specs/planner.yaml'
    });

    expect(errors).toHaveLength(0);
    expect(agent).not.toBeNull();
    expect(agent?.spec.name).toBe('planner');
    expect(agent?.spec.tokenBudget).toBe(20_000);
    expect(agent?.spec.layers).toHaveLength(4);
  });

  it('should load general agent spec', async () => {
    const { agent, errors } = await loadAgent({
      filePath: './src/specs/general.yaml'
    });

    expect(errors).toHaveLength(0);
    expect(agent).not.toBeNull();
    expect(agent?.spec.name).toBe('general');
    expect(agent?.spec.tokenBudget).toBe(5000);
    expect(agent?.spec.layers).toHaveLength(1);
  });

  it('should load all default agents', async () => {
    const agents = await loadAgents([
      './src/specs/coder.yaml',
      './src/specs/researcher.yaml',
      './src/specs/planner.yaml',
      './src/specs/general.yaml'
    ]);

    expect(agents.size).toBe(4);
    expect(agents.has('coder')).toBe(true);
    expect(agents.has('researcher')).toBe(true);
    expect(agents.has('planner')).toBe(true);
    expect(agents.has('general')).toBe(true);
  });
});
