/**
 * Steering & Follow-up Queue — mid-turn injection and turn-ordered delivery.
 *
 * `steer()` injects a message mid-turn (processed before the next LLM call).
 * `queue()` enqueues a message for delivery after the current turn completes.
 *
 * @module
 */

export interface Message {
  readonly content: string;
  readonly role: string;
}

export type QueueMode = 'all' | 'one-at-a-time';

export class SteeringQueue {
  #steers: Message[] = [];
  #queued: Message[] = [];

  /** Inject a message mid-turn. */
  steer(message: Message): void {
    this.#steers.push(message);
  }

  /** Enqueue a message for after-turn delivery. */
  queue(message: Message, _mode: QueueMode = 'all'): void {
    this.#queued.push(message);
  }

  /** Drain all pending steers, clearing the queue. */
  drainSteers(): Message[] {
    const result = this.#steers;
    this.#steers = [];
    return result;
  }

  /**
   * Promote queued messages to active.
   * - `'all'` — returns every queued message and clears the queue.
   * - `'one-at-a-time'` — returns at most one message (FIFO).
   */
  promoteQueued(mode: QueueMode): Message[] {
    if (mode === 'all') {
      const result = this.#queued;
      this.#queued = [];
      return result;
    }
    const first = this.#queued.shift();
    return first === undefined ? [] : [first];
  }
}
