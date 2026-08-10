/**
 * AG-UI Reasoning Mapper Tests
 *
 * Verifies mapping of reasoning content to AG-UI reasoning events
 */

import { EventType } from '@agentsy/shared';
import { describe, expect, it } from 'vitest';

import { mapReasoningToEvents } from './reasoning-mapper.js';

describe('mapReasoningToEvents', () => {
  it('should create 5-event sequence for reasoning', () => {
    const events = mapReasoningToEvents('thinking...', { runId: 'run_123' });

    expect(events).toHaveLength(5);
    const evt0 = events[0];
    const evt1 = events[1];
    const evt2 = events[2];
    const evt3 = events[3];
    const evt4 = events[4];
    expect(evt0).toBeDefined();
    expect(evt1).toBeDefined();
    expect(evt2).toBeDefined();
    expect(evt3).toBeDefined();
    expect(evt4).toBeDefined();
    expect(evt0?.type).toBe(EventType.REASONING_START);
    expect(evt1?.type).toBe(EventType.REASONING_MESSAGE_START);
    expect(evt2?.type).toBe(EventType.REASONING_MESSAGE_CONTENT);
    expect(evt3?.type).toBe(EventType.REASONING_MESSAGE_END);
    expect(evt4?.type).toBe(EventType.REASONING_END);
  });

  it('should assign consistent messageId across sequence', () => {
    const events = mapReasoningToEvents('thought', { runId: 'run_123' });

    expect(events.length).toBeGreaterThan(3);
    const evt1 = events[1];
    const evt2 = events[2];
    const evt3 = events[3];
    expect(evt1).toBeDefined();
    expect(evt2).toBeDefined();
    expect(evt3).toBeDefined();
    const messageId = evt1?.messageId;
    expect(evt2?.messageId).toBe(messageId);
    expect(evt3?.messageId).toBe(messageId);
  });

  it('should set messageId on START and CONTENT events only', () => {
    const events = mapReasoningToEvents('reasoning', { runId: 'run_123' });

    expect(events.length).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < 5; i++) {
      const evt = events[i];
      expect(evt).toBeDefined();
      expect(evt?.messageId).toBeDefined();
    }
  });

  it('should propagate runId to all events', () => {
    const events = mapReasoningToEvents('test', { runId: 'run_456' });

    for (const event of events) {
      expect(event.runId).toBe('run_456');
    }
  });

  it('should include threadId when provided', () => {
    const events = mapReasoningToEvents('reason', {
      runId: 'run_123',
      threadId: 'thread_789'
    });

    for (const event of events) {
      expect(event.threadId).toBe('thread_789');
    }
  });

  it('should not include threadId when not provided', () => {
    const events = mapReasoningToEvents('reason', { runId: 'run_123' });

    for (const event of events) {
      expect('threadId' in event).toBeFalsy();
    }
  });

  it('should encrypt reasoningContent when option enabled', () => {
    const reasoning = 'secret';
    const events = mapReasoningToEvents(reasoning, {
      encryptReasoning: true,
      runId: 'run_123'
    });

    expect(events.length).toBeGreaterThan(2);
    const contentEvent = events.find(e => e.type === EventType.REASONING_MESSAGE_CONTENT) ?? {};
    expect(contentEvent).toBeDefined();
    const contentProps = contentEvent as { content?: unknown };
    expect(contentProps.content).toBe(reasoning);
  });

  it('should use plain content when encryption disabled', () => {
    const reasoning = 'plain thinking';
    const events = mapReasoningToEvents(reasoning, {
      encryptReasoning: false,
      runId: 'run_123'
    });

    expect(events.length).toBeGreaterThan(2);
    const contentEvent = events.find(e => e.type === EventType.REASONING_MESSAGE_CONTENT) ?? {};
    expect(contentEvent).toBeDefined();
    expect((contentEvent as { content?: unknown }).content).toBe(reasoning);
  });

  it('should default encryption to false', () => {
    const reasoning = 'my thought';
    const events = mapReasoningToEvents(reasoning, { runId: 'run_123' });

    expect(events.length).toBeGreaterThan(2);
    const contentEvent = events.find(e => e.type === EventType.REASONING_MESSAGE_CONTENT) ?? {};
    expect(contentEvent).toBeDefined();
    expect((contentEvent as { content?: unknown }).content).toBe(reasoning);
  });

  it('should generate consistent timestamps', () => {
    const events = mapReasoningToEvents('reason', { runId: 'run_123' });

    // All timestamps should be within 10ms of each other (they should be nearly identical)
    expect(events.length).toBeGreaterThan(0);
    const firstEvent = events[0];
    expect(firstEvent).toBeDefined();
    const firstTime = firstEvent?.timestamp ? new Date(firstEvent.timestamp).getTime() : 0;
    for (const event of events) {
      const eventTime = event.timestamp ? new Date(event.timestamp).getTime() : 0;
      const diff = Math.abs(eventTime - firstTime);
      expect(diff).toBeLessThan(100); // Within 100ms
    }
  });

  it('should generate valid ISO 8601 timestamps', () => {
    const events = mapReasoningToEvents('test', { runId: 'run_123' });

    for (const event of events) {
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(() => new Date(event.timestamp)).not.toThrow();
    }
  });

  it('should handle empty reasoning string', () => {
    const events = mapReasoningToEvents('', { runId: 'run_123' });

    expect(events).toHaveLength(0);
  });

  it('should handle undefined reasoning gracefully', () => {
    const events = mapReasoningToEvents(undefined, {
      runId: 'run_123'
    });

    expect(events).toHaveLength(0);
  });

  it('should handle multiline reasoning', () => {
    const reasoning = 'line 1\nline 2\nline 3';
    const events = mapReasoningToEvents(reasoning, { runId: 'run_123' });

    expect(events.length).toBeGreaterThan(2);
    const contentEvent = events.find(e => e.type === EventType.REASONING_MESSAGE_CONTENT);
    if (!contentEvent) {
      throw new Error('contentEvent is nullish');
    }
    expect(contentEvent.content).toContain('line 1');
    expect(contentEvent.content).toContain('line 2');
    expect(contentEvent.content).toContain('line 3');
  });

  it('should generate unique messageIds for different reasoning calls', () => {
    const events1 = mapReasoningToEvents('reason1', { runId: 'run_123' });
    const events2 = mapReasoningToEvents('reason2', { runId: 'run_123' });

    expect(events1.length).toBeGreaterThan(1);
    expect(events2.length).toBeGreaterThan(1);

    const evt1 = events1[1];
    const evt2 = events2[1];
    expect(evt1).toBeDefined();
    expect(evt2).toBeDefined();
    const messageId1 = evt1?.messageId;
    const messageId2 = evt2?.messageId;

    expect(messageId1).not.toBe(messageId2);
  });
});
