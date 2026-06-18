/**
 * AG-UI Interrupt Handler Tests
 *
 * Verifies interrupt detection, event creation, and abort controller behavior
 */

import { EventType } from '@agentsy/shared';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createInterruptAbortController,
  createInterruptEvent,
  InterruptController,
  InterruptReason,
  TimeoutInterrupt
} from './interrupt-handler.js';

describe('InterruptReason enum', () => {
  it('should have expected interrupt reasons', () => {
    expect(InterruptReason.USER_REQUEST).toBe('user_request');
    expect(InterruptReason.RESOURCE_LIMIT).toBe('resource_limit');
    expect(InterruptReason.SAFETY_CHECK).toBe('safety_check');
    expect(InterruptReason.TIMEOUT).toBe('timeout');
    expect(InterruptReason.ERROR).toBe('error');
  });
});

describe('InterruptController', () => {
  let controller: InterruptController;

  beforeEach(() => {
    controller = new InterruptController();
  });

  it('should initialize as not interrupted', () => {
    expect(controller.isInterrupted()).toBeFalsy();
  });

  it('should return undefined reason when not interrupted', () => {
    expect(controller.getReason()).toBeUndefined();
  });

  it('should return undefined message when no custom message set', () => {
    expect(controller.getMessage()).toBeUndefined();
  });

  it('should interrupt with custom reason', () => {
    controller.interrupt(InterruptReason.USER_REQUEST, 'User cancelled');

    expect(controller.isInterrupted()).toBeTruthy();
    expect(controller.getReason()).toBe(InterruptReason.USER_REQUEST);
    expect(controller.getMessage()).toBe('User cancelled');
  });

  it('should interrupt with only reason', () => {
    controller.interrupt(InterruptReason.TIMEOUT);

    expect(controller.isInterrupted()).toBeTruthy();
    expect(controller.getReason()).toBe(InterruptReason.TIMEOUT);
    expect(controller.getMessage()).toBeUndefined();
  });

  it('should interrupt with no arguments (defaults)', () => {
    controller.interrupt();

    expect(controller.isInterrupted()).toBeTruthy();
    expect(controller.getReason()).toBe(InterruptReason.USER_REQUEST);
  });

  it('should clear interrupt state', () => {
    controller.interrupt(InterruptReason.USER_REQUEST);

    controller.clear();

    expect(controller.isInterrupted()).toBeFalsy();
    expect(controller.getReason()).toBeUndefined();
  });

  it('should throw when throwIfInterrupted() called while interrupted', () => {
    controller.interrupt(InterruptReason.SAFETY_CHECK, 'Safety violation');

    expect(() => {
      controller.throwIfInterrupted();
    }).toThrow('Safety violation');
  });

  it('should not throw when throwIfInterrupted() called while not interrupted', () => {
    expect(() => {
      controller.throwIfInterrupted();
    }).not.toThrow();
  });
});

describe('createInterruptEvent', () => {
  it('should create RunInterruptedEvent with minimal params', () => {
    const event = createInterruptEvent('run_123');

    expect(event.type).toBe(EventType.RUN_INTERRUPTED);
    expect(event.runId).toBe('run_123');
    expect(event.interrupts).toBeDefined();
    expect(event.interrupts?.length).toBeGreaterThan(0);
    const interrupt = event.interrupts?.[0];
    expect(interrupt?.reason).toBe(InterruptReason.TIMEOUT);
  });

  it('should create interrupt with unique ID', () => {
    const event1 = createInterruptEvent('run_123');
    const event2 = createInterruptEvent('run_123');

    // Both events should have unique IDs
    expect(event1.interrupts).toBeDefined();
    expect(event2.interrupts).toBeDefined();
    expect(event1.interrupts?.length).toBeGreaterThan(0);
    expect(event2.interrupts?.length).toBeGreaterThan(0);
    const id1 = event1.interrupts?.[0]?.id;
    const id2 = event2.interrupts?.[0]?.id;
    expect(id1).not.toBe(id2);
  });

  it('should include reason in interrupt object', () => {
    const event = createInterruptEvent('run_123', InterruptReason.TIMEOUT);

    expect(event.interrupts).toBeDefined();
    expect(event.interrupts?.length).toBeGreaterThan(0);
    const interrupt = event.interrupts?.[0];
    expect(interrupt?.reason).toBe(InterruptReason.TIMEOUT);
  });

  it('should include message in interrupt event', () => {
    const runId = 'run_123';
    const message = 'Manual stop';
    const event = createInterruptEvent(runId, InterruptReason.USER_REQUEST, message);

    expect(event.interrupts).toBeDefined();
    expect(event.interrupts?.length).toBeGreaterThan(0);
    const interrupt = event.interrupts?.[0];
    expect(interrupt?.options?.message).toBe(message);
  });

  it('should include threadId in interrupt event if provided', () => {
    const runId = 'run_123';
    const threadId = 'thread_456';
    const event = createInterruptEvent(runId, InterruptReason.USER_REQUEST, undefined, threadId);

    expect(event.threadId).toBe(threadId);
    expect(event.interrupts).toBeDefined();
    expect(event.interrupts?.length).toBeGreaterThan(0);
    const interrupt = event.interrupts?.[0];
    expect(interrupt?.reason).toBe(InterruptReason.USER_REQUEST);
  });

  it('should not include message if undefined', () => {
    const event = createInterruptEvent('run_123', InterruptReason.TIMEOUT);

    expect(event.interrupts).toBeDefined();
    expect(event.interrupts?.length).toBeGreaterThan(0);
    const interrupt = event.interrupts?.[0];
    expect(interrupt?.options?.message).toBeUndefined();
  });

  it('should include optional threadId', () => {
    const event = createInterruptEvent('run_123', InterruptReason.SAFETY_CHECK, undefined, 'thread_456');

    expect(event.threadId).toBe('thread_456');
  });

  it('should not include threadId if undefined', () => {
    const event = createInterruptEvent('run_123');

    expect('threadId' in event).toBeFalsy();
  });

  it('should generate ISO 8601 timestamp', () => {
    const event = createInterruptEvent('run_123');

    expectTypeOf(event.timestamp).toBeString();
    expect(() => new Date(event.timestamp)).not.toThrow();
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should have exactly one interrupt in array', () => {
    const event = createInterruptEvent('run_123', InterruptReason.ERROR, 'Failed');

    expect(Array.isArray(event.interrupts)).toBeTruthy();
    expect(event.interrupts).toHaveLength(1);
  });
});

describe('createInterruptAbortController', () => {
  it('should return controller with interrupt function', () => {
    const { interrupt } = createInterruptAbortController();

    expectTypeOf(interrupt).toBeFunction();
  });

  it('should return isInterrupted function', () => {
    const { isInterrupted } = createInterruptAbortController();

    expectTypeOf(isInterrupted).toBeFunction();
    expect(isInterrupted()).toBeFalsy();
  });

  it('should support interrupting via returned function', () => {
    const { controller, interrupt, isInterrupted } = createInterruptAbortController();

    interrupt();

    expect(isInterrupted()).toBeTruthy();
    expect(controller.signal.aborted).toBeTruthy();
  });

  it('should have signal property compatible with AbortController', () => {
    const { controller } = createInterruptAbortController();

    expect(controller.signal).toBeDefined();
    expectTypeOf(controller.signal.addEventListener).toBeFunction();
  });

  it('should abort signal when interrupted', () => {
    const { controller, interrupt } = createInterruptAbortController();

    interrupt();

    expect(controller.signal.aborted).toBeTruthy();
  });
});

describe('TimeoutInterrupt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should initialize without triggering interrupt', () => {
    const timeout = new TimeoutInterrupt(1000);

    expect(timeout.isInterrupted()).toBeFalsy();
  });

  it('should start countdown on start()', () => {
    const timeout = new TimeoutInterrupt(1000);

    timeout.start();
    vi.advanceTimersByTime(999);

    expect(timeout.isInterrupted()).toBeFalsy();

    vi.advanceTimersByTime(2);

    expect(timeout.isInterrupted()).toBeTruthy();
  });

  it('should expose controller', () => {
    const timeout = new TimeoutInterrupt(5000);

    expect(timeout.getController()).toBeDefined();
    expectTypeOf(timeout.getController().isInterrupted).toBeFunction();
  });

  it('should cancel timer', () => {
    const timeout = new TimeoutInterrupt(1000);

    timeout.start();
    timeout.cancel();

    vi.advanceTimersByTime(2000);

    expect(timeout.isInterrupted()).toBeFalsy();
  });

  it('should not trigger after cancel()', () => {
    const timeout = new TimeoutInterrupt(500);

    timeout.start();
    vi.advanceTimersByTime(250);
    timeout.cancel();

    vi.advanceTimersByTime(1000);

    expect(timeout.isInterrupted()).toBeFalsy();
  });

  it('should use TIMEOUT reason when interrupting', () => {
    const timeout = new TimeoutInterrupt(1000);

    timeout.start();
    vi.advanceTimersByTime(1001);

    const controller = timeout.getController();
    expect(controller.getReason()).toBe(InterruptReason.TIMEOUT);
  });

  it('should use default TIMEOUT reason', () => {
    const timeout = new TimeoutInterrupt(1000);

    timeout.start();
    vi.advanceTimersByTime(1001);

    const controller = timeout.getController();
    expect(controller.getReason()).toBe(InterruptReason.TIMEOUT);
  });

  it('should handle multiple start/cancel cycles', () => {
    const timeout = new TimeoutInterrupt(500);

    // First cycle
    timeout.start();
    vi.advanceTimersByTime(250);
    timeout.cancel();
    expect(timeout.isInterrupted()).toBeFalsy();

    // Second cycle
    timeout.start();
    vi.advanceTimersByTime(501);
    expect(timeout.isInterrupted()).toBeTruthy();
  });

  it('should include timeout message', () => {
    const timeout = new TimeoutInterrupt(1000);

    timeout.start();
    vi.advanceTimersByTime(1001);

    const controller = timeout.getController();
    expect(controller.getMessage()).toContain('timeout');
  });
});
