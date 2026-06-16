import type { Logger } from '../types.js';

// fallow-ignore-next-line unused-type
export interface JobQueueDeps {
  logger: Logger;
}

export class JobQueue {
  private queue: { id: string; payload: unknown; enqueuedAt: number }[] = [];

  enqueue(payload: unknown): string {
    const id = `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.queue.push({ id, payload, enqueuedAt: Date.now() });
    return id;
  }

  dequeue(): { id: string; payload: unknown } | undefined {
    return this.queue.shift();
  }

  peek(): { id: string; payload: unknown } | undefined {
    return this.queue[0];
  }

  remove(id: string): boolean {
    const idx = this.queue.findIndex(item => item.id === id);
    if (idx === -1) {
      return false;
    }
    this.queue.splice(idx, 1);
    return true;
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}
