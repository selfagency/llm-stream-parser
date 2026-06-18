/**
 * Event bus for cross-process communication within the daemon.
 *
 * Uses Honker queues for durable event delivery. Supports timer-based,
 * canary, and observation-threshold triggers for the learning loop
 * and other background jobs.
 *
 * @module
 */

import type { HonkerQueueAdapter } from '../jobs/honker-queue.js';
import type { Logger } from '../types.js';

// ── Event Types ────────────────────────────────────────

export type DaemonEventType =
  | 'memory.canary'
  | 'memory.observation-threshold'
  | 'learning.completed'
  | 'learning.failed';

export interface DaemonEvent {
  readonly payload?: Record<string, unknown>;
  readonly timestamp: string;
  readonly type: DaemonEventType;
}

// ── Event Bus ───────────────────────────────────────────

export interface EventBus {
  publish(event: DaemonEvent): void;
  subscribe(eventType: string, handler: (event: DaemonEvent) => Promise<void>): () => void;
}

export interface EventBusDeps {
  logger: Logger;
  queue: HonkerQueueAdapter;
}

/**
 * Honker-backed event bus for cross-process wake.
 *
 * Publishes events to a dedicated 'events' queue. Subscriptions
 * are registered in-process — the subscriber's handler is called
 * when the event is published.
 */
export class HonkerEventBus implements EventBus {
  readonly #deps: EventBusDeps;
  readonly #subscriptions = new Map<string, Array<(event: DaemonEvent) => Promise<void>>>();

  constructor(deps: EventBusDeps) {
    this.#deps = deps;
  }

  publish(event: DaemonEvent): void {
    const fullEvent: DaemonEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString()
    };

    // Enqueue for durable delivery
    this.#deps.queue.enqueue(fullEvent, { queue: 'events' });

    // Fire in-process subscribers
    const handlers = this.#subscriptions.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(fullEvent).catch(error => {
          this.#deps.logger.error('Event handler failed', {
            eventType: event.type,
            error: error instanceof Error ? error.message : String(error)
          });
        });
      }
    }

    this.#deps.logger.debug('Event published', { type: event.type });
  }

  subscribe(eventType: string, handler: (event: DaemonEvent) => Promise<void>): () => void {
    const handlers = this.#subscriptions.get(eventType) ?? [];
    handlers.push(handler);
    this.#subscriptions.set(eventType, handlers);

    this.#deps.logger.info('Event subscription registered', { eventType });

    // Return unsubscribe function
    return (): void => {
      const current = this.#subscriptions.get(eventType);
      if (current) {
        const idx = current.indexOf(handler);
        if (idx >= 0) {
          current.splice(idx, 1);
        }
        if (current.length === 0) {
          this.#subscriptions.delete(eventType);
        }
      }
    };
  }

  /** Number of active subscriptions. */
  get subscriptionCount(): number {
    let count = 0;
    for (const handlers of this.#subscriptions.values()) {
      count += handlers.length;
    }
    return count;
  }
}
