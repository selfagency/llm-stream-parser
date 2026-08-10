import { beforeEach, describe, expect, it } from 'vitest';
import { ContextManager } from '../context/manager.js';
import { BackgroundTaskManager } from './background-tasks.js';

describe('BackgroundTaskManager', () => {
  let contextManager: ContextManager;
  let manager: BackgroundTaskManager;

  beforeEach(() => {
    contextManager = new ContextManager();
    manager = new BackgroundTaskManager(contextManager);
  });

  it('spawns a task and it completes', async () => {
    const handle = manager.spawn({
      agentId: 'worker-1',
      parentAgentId: 'orchestrator',
      sessionId: 'session-1',
      inheritedFields: ['taskData'],
      inheritedMetadata: { priority: 'high' },
      execute: async () => 'result-42'
    });

    expect(handle.status).toBe('running');
    const result = await handle.waitForCompletion();
    expect(result).toBe('result-42');
    expect(handle.status).toBe('completed');
  });

  it('handles failed tasks', async () => {
    const handle = manager.spawn({
      agentId: 'worker-2',
      parentAgentId: 'orchestrator',
      sessionId: 'session-1',
      inheritedFields: [],
      inheritedMetadata: {},
      // biome-ignore lint/suspicious/useAwait: interface requires Promise return
      execute: async () => {
        throw new Error('Task failed');
      }
    });

    await expect(handle.waitForCompletion()).rejects.toThrow('Task failed');
    expect(handle.status).toBe('failed');
    expect(handle.error?.message).toBe('Task failed');
  });

  it('cancels a running task', () => {
    const handle = manager.spawn({
      agentId: 'worker-3',
      parentAgentId: 'orchestrator',
      sessionId: 'session-1',
      inheritedFields: [],
      inheritedMetadata: {},
      execute: async () => new Promise(resolve => setTimeout(() => resolve('late'), 1000))
    });

    handle.cancel();
    expect(handle.status).toBe('cancelled');
  });

  it('lists tasks by status', async () => {
    const h1 = manager.spawn({
      agentId: 'w1',
      parentAgentId: 'orch',
      sessionId: 's1',
      inheritedFields: [],
      inheritedMetadata: {},
      execute: async () => 'done'
    });
    const _h2 = manager.spawn({
      agentId: 'w2',
      parentAgentId: 'orch',
      sessionId: 's1',
      inheritedFields: [],
      inheritedMetadata: {},
      execute: async () => new Promise(r => setTimeout(r, 500))
    });

    await h1.waitForCompletion();
    expect(manager.list('completed').length).toBe(1);
    expect(manager.list('running').length).toBe(1);
    expect(manager.list().length).toBe(2);
  });

  it('get returns null for unknown task', () => {
    expect(manager.get('nonexistent')).toBeNull();
  });

  it('creates isolated context frame', () => {
    const handle = manager.spawn({
      agentId: 'worker-4',
      parentAgentId: 'parent-1',
      sessionId: 'session-x',
      inheritedFields: ['field1', 'field2'],
      inheritedMetadata: { key: 'value' },
      execute: async () => ({})
    });
    expect(handle.frameId).toBeDefined();
    expect(handle.frameId).not.toBe('');
  });
});
