import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSpec } from '../specs/types.js';
import { createAgentSession } from './session.js';
import { AgentSessionState } from './state-machine.js';

describe('createAgentSession', () => {
  let mockSpec: AgentSpec;
  let mockExecuteAgent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSpec = {
      name: 'test-agent',
      role: 'assistant',
      description: 'Test agent for coverage',
      tokenBudget: 1000,
      orchestrator: 'sequential',
      skillRegistry: [],
      layers: [],
      tasks: []
    };

    mockExecuteAgent = vi.fn().mockResolvedValue({
      output: 'test result',
      tokenUsage: { input: 100, output: 200 }
    });

    vi.mock('./executor.js', () => ({
      executeAgent: mockExecuteAgent
    }));
  });

  it('creates a session with correct initial state', () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    expect(session.state).toBe(AgentSessionState.READY);
    expect(session.agent.budget.total).toBe(1000);
    expect(session.agent.budget.remaining).toBe(1000);
    expect(session.agent.budget.used).toBe(0);
    expect(session.context.task).toBe('test task');
  });

  it('creates a session with default token budget when not specified', () => {
    const specNoBudget: AgentSpec = {
      ...mockSpec,
      tokenBudget: undefined
    };

    const session = createAgentSession({
      spec: specNoBudget,
      task: 'test task'
    });

    expect(session.agent.budget.total).toBe(0);
    expect(session.context.tokens.total).toBe(0);
  });

  it('creates a session with skill registry from spec', () => {
    const specWithSkills: AgentSpec = {
      ...mockSpec,
      skillRegistry: [
        { name: 'skill1', category: 'test' },
        { name: 'skill2', category: 'test' }
      ]
    };

    const session = createAgentSession({
      spec: specWithSkills,
      task: 'test task'
    });

    expect(session.agent.skillRegistry).toHaveLength(2);
    expect(session.agent.skillRegistry[0].name).toBe('skill1');
  });

  it('returns null result before execution', () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    expect(session.getResult()).toBeNull();
  });

  it('starts execution from READY state', async () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    const result = await session.start();

    expect(result).toEqual({
      output: 'test result',
      tokenUsage: { input: 100, output: 200 }
    });
    expect(mockExecuteAgent).toHaveBeenCalledOnce();
    expect(session.state).toBe(AgentSessionState.DONE);
    expect(session.getResult()).toEqual(result);
  });

  it('transitions to ERROR when executeAgent throws', async () => {
    const error = new Error('Execution failed');
    mockExecuteAgent.mockRejectedValue(error);

    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    await expect(session.start()).rejects.toThrow('Execution failed');
    expect(session.state).toBe(AgentSessionState.ERROR);
    expect(session.context.state.errors).toHaveLength(1);
    expect(session.context.state.errors[0]).toBe(error);
  });

  it('pushes non-Error objects as wrapped Errors', async () => {
    const errorObj = { message: 'Not an Error' };
    mockExecuteAgent.mockRejectedValue(errorObj);

    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    await expect(session.start()).rejects.toThrow();
    expect(session.context.state.errors[0]).toBeInstanceOf(Error);
    expect(session.context.state.errors[0].message).toBe('Not an Error');
  });

  it('throws when starting from non-READY state', async () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    await session.start();

    await expect(session.start()).rejects.toThrow('Cannot start session from state DONE');
  });

  it('pauses from RUNNING state', async () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    // Start execution but don't await
    const startPromise = session.start();
    session.pause();

    expect(session.state).toBe(AgentSessionState.PAUSED);
    await startPromise;
  });

  it('throws when pausing from non-RUNNING state', async () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    await expect(() => session.pause()).rejects.toThrow('Cannot pause session from state READY');
  });

  it('resumes from PAUSED state', async () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    // Start then pause
    const startPromise = session.start();
    session.pause();

    // Resume
    mockExecuteAgent.mockResolvedValueOnce({
      output: 'resumed result',
      tokenUsage: { input: 50, output: 100 }
    });

    const result = await session.resume();

    expect(result).toEqual({
      output: 'resumed result',
      tokenUsage: { input: 50, output: 100 }
    });
    expect(session.state).toBe(AgentSessionState.DONE);
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2);
    await startPromise;
  });

  it('throws when resuming from non-PAUSED state', async () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    await expect(session.resume()).rejects.toThrow('Cannot resume session from state READY');
  });

  it('transitions to DONE after successful execution', async () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    await session.start();

    expect(session.state).toBe(AgentSessionState.DONE);
  });

  it('calls state change listeners on transitions', async () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    const listener = vi.fn();
    session.onStateChange(listener);

    await session.start();

    expect(listener).toHaveBeenCalledWith(AgentSessionState.READY, AgentSessionState.RUNNING);
    expect(listener).toHaveBeenCalledWith(AgentSessionState.RUNNING, AgentSessionState.DONE);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('calls state change listener on error transition', async () => {
    mockExecuteAgent.mockRejectedValue(new Error('Failed'));

    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    const listener = vi.fn();
    session.onStateChange(listener);

    await expect(session.start()).rejects.toThrow();

    expect(listener).toHaveBeenCalledWith(AgentSessionState.READY, AgentSessionState.RUNNING);
    expect(listener).toHaveBeenCalledWith(AgentSessionState.RUNNING, AgentSessionState.ERROR);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('calls state change listener on pause transition', async () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    const listener = vi.fn();
    session.onStateChange(listener);

    const startPromise = session.start();
    session.pause();

    expect(listener).toHaveBeenCalledWith(AgentSessionState.READY, AgentSessionState.RUNNING);
    expect(listener).toHaveBeenCalledWith(AgentSessionState.RUNNING, AgentSessionState.PAUSED);
    await startPromise;
  });

  it('calls state change listener on resume transition', async () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    const listener = vi.fn();
    session.onStateChange(listener);

    const startPromise = session.start();
    session.pause();

    mockExecuteAgent.mockResolvedValueOnce({
      output: 'resumed',
      tokenUsage: { input: 1, output: 1 }
    });

    await session.resume();

    const resumeCalls = listener.mock.calls.filter(call => call[1] === AgentSessionState.RUNNING);
    expect(resumeCalls).toHaveLength(2);
    await startPromise;
  });

  it('supports multiple state change listeners', async () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    const listener1 = vi.fn();
    const listener2 = vi.fn();

    session.onStateChange(listener1);
    session.onStateChange(listener2);

    await session.start();

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  it('passes ExecuteOptions through to executeAgent', async () => {
    const executeOptions = {
      model: 'gpt-4',
      provider: 'openai'
    };

    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task',
      options: executeOptions
    });

    await session.start();

    expect(mockExecuteAgent).toHaveBeenCalledWith(expect.anything(), executeOptions);
  });

  it('initializes context with empty completedSteps and failedSteps', () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    expect(session.context.state.completedSteps).toEqual([]);
    expect(session.context.state.failedSteps).toEqual([]);
  });

  it('initializes context with empty errors array', () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    expect(session.context.state.errors).toEqual([]);
  });

  it('initializes context results as empty Map', () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    expect(session.context.results).toBeInstanceOf(Map);
    expect(session.context.results.size).toBe(0);
  });

  it('initializes agent hooks as empty Map', () => {
    const session = createAgentSession({
      spec: mockSpec,
      task: 'test task'
    });

    expect(session.agent.hooks).toBeInstanceOf(Map);
    expect(session.agent.hooks.size).toBe(0);
  });
});
