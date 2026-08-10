import type { CompletionMessage } from '@agentsy/shared';
import { describe, expect, it } from 'vitest';

import { transformContext } from './transform-context.js';

const userMsg = (content: string): CompletionMessage => ({
  content,
  role: 'user'
});

const assistantMsg = (content: string): CompletionMessage => ({
  content,
  role: 'assistant'
});

const systemMsg = (content: string): CompletionMessage => ({
  content,
  role: 'system'
});

describe('transformContext', () => {
  it('filters messages by scope', async () => {
    const messages: CompletionMessage[] = [
      systemMsg('You are a helpful assistant.'),
      userMsg('Hello'),
      assistantMsg('Hi there!'),
      userMsg('What is the weather?')
    ];

    const result = await transformContext({
      messages,
      scope: ['user'],
      maxTokens: 10_000
    });

    // System messages are always kept; user-scope keeps user messages.
    for (const msg of result) {
      expect(['system', 'user']).toContain(msg.role);
    }
    expect(result.length).toBeLessThan(messages.length);
  });

  it('injects memory segments (placeholder)', async () => {
    const messages: CompletionMessage[] = [
      systemMsg('You are a helpful assistant.'),
      userMsg('Remember that my name is Alice.'),
      assistantMsg('Got it!')
    ];

    // Current implementation passes through — memory injection is
    // a consumer-implemented extension point.
    const result = await transformContext({
      messages,
      scope: [],
      maxTokens: 10_000
    });

    expect(result).toHaveLength(3);
    expect(result[0]?.role).toBe('system');
  });

  it('compacts context when overflow occurs', async () => {
    // Build a set of messages that will exceed a small token budget.
    const messages: CompletionMessage[] = [
      systemMsg('You are a helpful assistant.'),
      userMsg('A'.repeat(400)),
      assistantMsg('B'.repeat(400)),
      userMsg('C'.repeat(400)),
      assistantMsg('D'.repeat(400))
    ];

    // Budget small enough that compaction is forced (~200 chars = ~50 tokens
    // plus overhead already exceeds 20).
    const result = await transformContext({
      messages,
      scope: [],
      maxTokens: 30
    });

    // System message should be preserved.
    expect(result[0]?.role).toBe('system');

    // The result should have been compacted (markers added or messages removed).
    const compactedCount = result.filter(m => m.content === '[Earlier context compacted]').length;
    expect(compactedCount).toBeGreaterThan(0);
  });

  it('returns messages unchanged when under the token budget', async () => {
    const messages: CompletionMessage[] = [
      systemMsg('You are a helpful assistant.'),
      userMsg('Hello'),
      assistantMsg('Hi!')
    ];

    const result = await transformContext({
      messages,
      scope: [],
      maxTokens: 10_000
    });

    expect(result).toStrictEqual(messages);
  });

  it('preserves system messages during compaction', async () => {
    const messages: CompletionMessage[] = [
      systemMsg('You are a helpful assistant.'),
      userMsg('A'.repeat(1000)),
      assistantMsg('B'.repeat(1000))
    ];

    const result = await transformContext({
      messages,
      scope: [],
      maxTokens: 20
    });

    // System message always first and intact.
    expect(result[0]?.role).toBe('system');
    expect(result[0]?.content).toBe('You are a helpful assistant.');
  });

  it('handles empty messages gracefully', async () => {
    const result = await transformContext({
      messages: [],
      scope: [],
      maxTokens: 1000
    });

    expect(result).toStrictEqual([]);
  });

  it('handles empty scope gracefully (no filtering)', async () => {
    const messages: CompletionMessage[] = [userMsg('Hello'), assistantMsg('Hi!')];

    const result = await transformContext({
      messages,
      scope: [],
      maxTokens: 10_000
    });

    expect(result).toHaveLength(2);
  });
});
