import { createSessionStore } from '@agentsy/session';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeSnapshot, RuntimeTask, RuntimeWorkflowTask } from './index.js';
import {
  createRuntimeExecutor,
  createRuntimeLoop,
  createRuntimeWorkflowExecutor,
  loadRuntimeSnapshotFromSession,
  saveRuntimeSnapshotToSession
} from './index.js';

describe('createRuntimeExecutor', () => {
  it('executes tasks in order', async () => {
    const calls: string[] = [];
    const executor = createRuntimeExecutor();
    const tasks: RuntimeTask[] = [
      {
        id: 'a',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          calls.push('a');
        }
      },
      {
        id: 'b',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          calls.push('b');
        }
      }
    ];

    await executor.execute(tasks);

    expect(calls).toStrictEqual(['a', 'b']);
  });

  it('stops execution when signal is aborted', async () => {
    const calls: string[] = [];
    const abortController = new AbortController();
    const executor = createRuntimeExecutor();
    const tasks: RuntimeTask[] = [
      {
        id: 'a',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          calls.push('a');
          abortController.abort();
        }
      },
      {
        id: 'b',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          calls.push('b');
        }
      }
    ];

    await executor.execute(tasks, abortController.signal);

    expect(calls).toStrictEqual(['a']);
  });

  it('passes task errors to onError callback', async () => {
    const onError = vi.fn();
    const executor = createRuntimeExecutor({ onError });
    const task: RuntimeTask = {
      id: 'a',
      // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
      run: async () => {
        throw new Error('boom');
      }
    };

    await executor.execute([task]);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0].message).toBe('boom');
    expect(onError.mock.calls[0]?.[1]).toBe(task);
  });

  it('converts non-Error throw values into Error instances', async () => {
    const onError = vi.fn();
    const executor = createRuntimeExecutor({ onError });
    const task: RuntimeTask = {
      id: 'a',
      // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
      run: async () => {
        // biome-ignore lint/style/useThrowOnlyError: testing non-Error throw wrapping
        throw 'boom';
      }
    };

    await executor.execute([task]);

    expect(onError).toHaveBeenCalledOnce();
    const [error] = onError.mock.calls[0] ?? [];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Runtime task failed');
  });

  it('returns execution results when requested', async () => {
    const executor = createRuntimeExecutor();
    const tasks: RuntimeTask[] = [
      {
        id: 'a',
        run: async () => {
          /* noop */
        }
      },
      {
        id: 'b',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          throw new Error('boom');
        }
      }
    ];

    const results = await executor.executeWithResults(tasks);

    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe('completed');
    expect(results[1]?.status).toBe('failed');
    expect(results[1]?.error?.message).toBe('boom');
  });

  it('keeps execute working when destructured from the executor', async () => {
    const calls: string[] = [];
    const execute = Reflect.get(createRuntimeExecutor(), 'execute');

    await execute([
      {
        id: 'a',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          calls.push('a');
        }
      }
    ]);

    expect(calls).toStrictEqual(['a']);
  });

  it('uses a detached task context when none is provided', async () => {
    const executor = createRuntimeExecutor();

    const results = await executor.executeWithResults([
      {
        id: 'spawn-attempt',
        run: async (_signal, context) => {
          await context.spawn([]);
        }
      }
    ]);

    expect(results[0]?.status).toBe('failed');
    expect(results[0]?.error?.message).toContain('Runtime spawning is unavailable');
  });
});

describe('createRuntimeLoop', () => {
  it('captures completed tasks in a resumable snapshot', async () => {
    const calls: string[] = [];
    const loop = createRuntimeLoop({ sessionId: 'session-1' });
    const tasks: RuntimeTask[] = [
      {
        id: 'a',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          calls.push('a');
        }
      },
      {
        id: 'b',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          calls.push('b');
        }
      }
    ];

    const firstSnapshot = await loop.execute(tasks);
    const secondSnapshot = await loop.execute(tasks);

    expect(calls).toStrictEqual(['a', 'b']);
    expect(firstSnapshot.sessionId).toBe('session-1');
    expect(firstSnapshot.completedTaskIds).toStrictEqual(['a', 'b']);
    expect(secondSnapshot.completedTaskIds).toStrictEqual(['a', 'b']);
    expect(secondSnapshot.results).toHaveLength(2);
    expect(secondSnapshot.depth).toBe(0);
  });

  it('fires task lifecycle callbacks', async () => {
    const onTaskStart = vi.fn();
    const onTaskComplete = vi.fn();
    const loop = createRuntimeLoop({ onTaskComplete, onTaskStart });

    await loop.execute([
      {
        id: 'task-1',
        run: async () => {
          /* noop */
        }
      }
    ]);

    expect(onTaskStart).toHaveBeenCalledOnce();
    expect(onTaskComplete).toHaveBeenCalledOnce();
    expect(onTaskComplete.mock.calls[0]?.[0]?.status).toBe('completed');
  });

  it('persists snapshots into the session store and resumes from them', async () => {
    const calls: string[] = [];
    const sessionStore = createSessionStore({ id: 'session-1', values: {} });
    const tasks: RuntimeTask[] = [
      {
        id: 'a',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          calls.push('a');
        }
      },
      {
        id: 'b',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          calls.push('b');
        }
      }
    ];

    const firstLoop = createRuntimeLoop({
      sessionId: 'session-1',
      sessionStore
    });
    const firstTask = tasks[0];
    if (!firstTask) {
      throw new Error('Expected first task');
    }

    const firstSnapshot = await firstLoop.execute([firstTask]);
    expect(firstSnapshot.completedTaskIds).toStrictEqual(['a']);

    const resumedLoop = createRuntimeLoop({
      sessionId: 'session-1',
      sessionStore
    });
    const secondSnapshot = await resumedLoop.execute(tasks);

    expect(calls).toStrictEqual(['a', 'b']);
    expect(secondSnapshot.completedTaskIds).toStrictEqual(['a', 'b']);
  });

  it('spawns child runtime work with a depth cap', async () => {
    const calls: string[] = [];
    const loop = createRuntimeLoop({ maxDepth: 1, sessionId: 'root' });

    const parentTasks: RuntimeTask[] = [
      {
        id: 'parent',
        run: async (_signal, context) => {
          calls.push(`parent:${context.depth}`);
          const childSnapshot = await context.spawn([
            {
              id: 'child',
              // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
              run: async () => {
                calls.push('child');
              }
            }
          ]);

          expect(childSnapshot.depth).toBe(1);
          expect(childSnapshot.sessionId).toContain('root:child:1');
        }
      }
    ];

    const snapshot = await loop.execute(parentTasks);

    expect(calls).toStrictEqual(['parent:0', 'child']);
    expect(snapshot.childSnapshots).toHaveLength(1);
    expect(loop.getDepth()).toBe(0);
  });

  it('rejects spawns that exceed the configured depth cap', async () => {
    const loop = createRuntimeLoop({ maxDepth: 0, sessionId: 'root' });

    await expect(
      loop.spawn([
        {
          id: 'child',
          run: async () => {
            /* noop */
          }
        }
      ])
    ).rejects.toThrow(/Runtime spawn depth exceeded maxDepth/);
  });
});

describe('runtime snapshot session helpers', () => {
  it('saves and loads snapshots via session storage', () => {
    const sessionStore = createSessionStore({ id: 'session-1', values: {} });
    const snapshot = {
      childSnapshots: [],
      completedTaskIds: ['task-1'],
      depth: 0,
      results: [
        {
          finishedAt: 2,
          startedAt: 1,
          status: 'completed',
          taskId: 'task-1'
        }
      ],
      sessionId: 'session-1',
      updatedAt: 3
    };

    saveRuntimeSnapshotToSession(sessionStore, snapshot as RuntimeSnapshot);
    expect(loadRuntimeSnapshotFromSession(sessionStore)).toStrictEqual(snapshot);
  });

  it('returns null for invalid stored snapshot values', () => {
    const sessionStore = createSessionStore({
      id: 'session-1',
      values: { runtimeSnapshot: { nope: true } }
    });

    expect(loadRuntimeSnapshotFromSession(sessionStore)).toBeNull();
  });
});

describe('createRuntimeWorkflowExecutor', () => {
  it('executes workflow tasks in dependency order', async () => {
    const calls: string[] = [];
    const workflow = createRuntimeWorkflowExecutor({ sessionId: 'workflow-1' });
    const tasks: RuntimeWorkflowTask[] = [
      {
        dependsOn: ['build'],
        id: 'deploy',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          calls.push('deploy');
        }
      },
      {
        id: 'build',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          calls.push('build');
        }
      },
      {
        dependsOn: ['build'],
        id: 'test',
        // biome-ignore lint/suspicious/useAwait: matches RuntimeTask interface
        run: async () => {
          calls.push('test');
        }
      }
    ];

    const snapshot = await workflow.execute(tasks);

    expect(calls[0]).toBe('build');
    expect(snapshot.completedTaskIds).toStrictEqual(['build', 'deploy', 'test']);
  });

  it('rejects workflows with missing dependencies', async () => {
    const workflow = createRuntimeWorkflowExecutor();
    const tasks: RuntimeWorkflowTask[] = [
      {
        dependsOn: ['build'],
        id: 'deploy',
        run: async () => {
          /* noop */
        }
      }
    ];

    await expect(workflow.execute(tasks)).rejects.toThrow(/depends on missing task/);
  });

  it('rejects workflows with cycles', async () => {
    const workflow = createRuntimeWorkflowExecutor();
    const tasks: RuntimeWorkflowTask[] = [
      {
        dependsOn: ['b'],
        id: 'a',
        run: async () => {
          /* noop */
        }
      },
      {
        dependsOn: ['a'],
        id: 'b',
        run: async () => {
          /* noop */
        }
      }
    ];

    await expect(workflow.execute(tasks)).rejects.toThrow(/contains a cycle/);
  });
});
