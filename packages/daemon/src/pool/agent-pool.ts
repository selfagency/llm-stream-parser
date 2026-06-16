import Piscina from 'piscina';
import type { AgentPoolConfig, PoolStats, TaskPayload, TaskResult } from './task-types.js';

class PriorityTaskQueue {
  private readonly highQueue: unknown[] = [];
  private readonly normalQueue: unknown[] = [];
  private readonly lowQueue: unknown[] = [];

  get size(): number {
    return this.highQueue.length + this.normalQueue.length + this.lowQueue.length;
  }

  shift(): unknown | null {
    return this.highQueue.shift() ?? this.normalQueue.shift() ?? this.lowQueue.shift() ?? null;
  }

  push(task: unknown): void {
    const t = task as { priority?: string };
    const priority = t.priority ?? 'normal';
    switch (priority) {
      case 'high':
        this.highQueue.push(task);
        break;
      case 'low':
        this.lowQueue.push(task);
        break;
      default:
        this.normalQueue.push(task);
        break;
    }
  }

  remove(task: unknown): void {
    for (const queue of [this.highQueue, this.normalQueue, this.lowQueue]) {
      const idx = queue.indexOf(task);
      if (idx !== -1) {
        queue.splice(idx, 1);
        return;
      }
    }
  }
}

export class AgentPool {
  private readonly piscina: Piscina;

  constructor(config: AgentPoolConfig) {
    this.piscina = new Piscina({
      filename: config.filename,
      minThreads: config.minThreads ?? 2,
      maxThreads: config.maxThreads ?? 4,
      idleTimeoutMs: config.idleTimeoutMs ?? 30_000,
      maxQueue: config.maxQueueSize ?? 100,
      concurrentTasksPerWorker: config.concurrentTasksPerWorker ?? 1,
      resourceLimits: config.resourceLimits ?? {
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 64
      },
      taskQueue: new PriorityTaskQueue()
    });
  }

  runTask<T = TaskResult>(
    task: TaskPayload,
    options?: { signal?: AbortSignal; priority?: 'high' | 'normal' | 'low' }
  ): Promise<T> {
    return this.piscina.run(task, {
      signal: options?.signal as never,
      name: task.type
    }) as Promise<T>;
  }

  stats(): PoolStats {
    return {
      threads: this.piscina.threads.length,
      queueSize: this.piscina.queueSize,
      completed: this.piscina.completed,
      utilization: this.piscina.utilization,
      waitTime: this.piscina.waitTime,
      runTime: this.piscina.runTime,
      duration: this.piscina.duration
    };
  }

  async destroy(): Promise<void> {
    await this.piscina.destroy();
  }
}
