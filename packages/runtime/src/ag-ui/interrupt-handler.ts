/**
 * AG-UI Interrupt Handling
 *
 * Provides interrupt detection and handling for cancelling or pausing agent execution.
 * Emits INTERRUPT events to notify frontends of interruption requests.
 */

import type { RunInterruptedEvent } from '@agentsy/shared';
import { EventType } from '@agentsy/shared';

/**
 * Interrupt reason codes.
 */
export const InterruptReason = {
  USER_REQUEST: 'user_request',
  RESOURCE_LIMIT: 'resource_limit',
  SAFETY_CHECK: 'safety_check',
  TIMEOUT: 'timeout',
  ERROR: 'error'
} as const;

/**
 * Typed interrupt reason.
 * Use {@link InterruptReason} constants for known values;
 * arbitrary strings are also accepted via `(string & {})` to preserve autocomplete.
 */
export type InterruptReason = (typeof InterruptReason)[keyof typeof InterruptReason];

/**
 * Interrupt configuration and handler.
 */
export class InterruptController {
  private interrupted = false;
  private interruptReason: InterruptReason | (string & {}) | undefined;
  private interruptMessage: string | undefined;

  /**
   * Checks if an interrupt has been signaled.
   */
  isInterrupted(): boolean {
    return this.interrupted;
  }

  /**
   * Gets the reason for interruption.
   */
  getReason(): InterruptReason | (string & {}) | undefined {
    return this.interruptReason;
  }

  /**
   * Gets the interrupt message.
   */
  getMessage(): string | undefined {
    return this.interruptMessage;
  }

  /**
   * Signals an interrupt with optional reason and message.
   *
   * @param reason - Reason for the interrupt
   * @param message - Optional message
   */
  interrupt(reason: InterruptReason | (string & {}) = InterruptReason.USER_REQUEST, message?: string): void {
    this.interrupted = true;
    this.interruptReason = reason;
    this.interruptMessage = message;
  }

  /**
   * Clears the interrupt state.
   */
  clear(): void {
    this.interrupted = false;
    this.interruptReason = undefined;
    this.interruptMessage = undefined;
  }

  /**
   * Throws an error if interrupted.
   *
   * @throws Error if interrupted
   */
  throwIfInterrupted(): void {
    if (this.interrupted) {
      throw new Error(this.interruptMessage ?? `Interrupted: ${this.interruptReason}`);
    }
  }
}

/**
 * Creates an interrupt event.
 *
 * @param runId - Run ID
 * @param reason - Interrupt reason
 * @param message - Optional message
 * @param threadId - Optional thread ID
 * @returns Interrupt event
 */
export function createInterruptEvent(
  runId: string,
  reason: InterruptReason = InterruptReason.TIMEOUT,
  message?: string,
  threadId?: string
): RunInterruptedEvent {
  const interrupt: {
    id: string;
    reason: string;
    options?: { message: string };
  } = {
    id: `interrupt_${Math.random().toString(36).slice(2, 11)}`,
    reason: String(reason)
  };
  if (message !== undefined) {
    interrupt.options = { message };
  }

  const event: RunInterruptedEvent = {
    interrupts: [interrupt],
    runId,
    timestamp: new Date().toISOString(),
    type: EventType.RUN_INTERRUPTED
  };

  if (threadId !== undefined) {
    event.threadId = threadId;
  }

  return event;
}

/**
 * Creates an abort controller for interrupt handling.
 * Allows cancellation of async operations.
 */
export function createInterruptAbortController(): {
  controller: AbortController;
  interrupt: (reason?: InterruptReason, message?: string) => void;
  isInterrupted: () => boolean;
} {
  const controller = new AbortController();

  return {
    controller,
    interrupt: (_reason?: InterruptReason, _message?: string) => {
      controller.abort();
    },
    isInterrupted: () => controller.signal.aborted
  };
}

/**
 * Timeout-based interrupt handler.
 * Automatically interrupts after a specified duration.
 */
export class TimeoutInterrupt {
  private timeoutId: ReturnType<typeof setTimeout> | undefined;
  private readonly interruptController: InterruptController;
  readonly #timeoutMs: number;

  constructor(timeoutMs: number) {
    this.#timeoutMs = timeoutMs;
    this.interruptController = new InterruptController();
  }

  /**
   * Starts the timeout.
   */
  start(): void {
    this.timeoutId = setTimeout(() => {
      this.interruptController.interrupt(InterruptReason.TIMEOUT, `Operation exceeded timeout of ${this.#timeoutMs}ms`);
    }, this.#timeoutMs);
  }

  /**
   * Cancels the timeout.
   */
  cancel(): void {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }

  /**
   * Checks if timeout has been reached.
   */
  isInterrupted(): boolean {
    return this.interruptController.isInterrupted();
  }

  /**
   * Gets the interrupt controller.
   */
  getController(): InterruptController {
    return this.interruptController;
  }
}
