import { describe, expect, it } from 'vitest';

import { normalizeBedrockConverseEvent } from './bedrock.js';

// ---------------------------------------------------------------------------
// AWS Bedrock Converse API streaming event normalizer
// ---------------------------------------------------------------------------

describe('normalizeBedrockConverseEvent', () => {
  it('maps contentBlockDelta.delta.text to chunk.content', () => {
    const result = normalizeBedrockConverseEvent({
      contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Hello' } }
    });
    expect(result?.chunk.content).toBe('Hello');
    expect(result?.chunk.done).toBeFalsy();
  });

  it('maps contentBlockDelta.delta.reasoningContent.text to chunk.thinking', () => {
    const result = normalizeBedrockConverseEvent({
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { text: 'Let me think...' } }
      }
    });
    expect(result?.chunk.thinking).toBe('Let me think...');
  });

  it('maps contentBlockDelta.delta.toolUse.input to nativeToolCallDeltas', () => {
    const result = normalizeBedrockConverseEvent({
      contentBlockDelta: {
        contentBlockIndex: 1,
        delta: { toolUse: { input: '{"location":' } }
      }
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.argumentsDelta).toBe('{"location":');
  });

  it('maps contentBlockStart.start.toolUse to nativeToolCallDeltas with id+name', () => {
    const result = normalizeBedrockConverseEvent({
      contentBlockStart: {
        contentBlockIndex: 1,
        start: { toolUse: { name: 'get_weather', toolUseId: 'tooluse_abc' } }
      }
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.id).toBe('tooluse_abc');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('get_weather');
  });

  it('sets done=true on messageStop event', () => {
    const result = normalizeBedrockConverseEvent({
      messageStop: { stopReason: 'end_turn' }
    });
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps Bedrock messageStop end_turn to finishReason stop', () => {
    const result = normalizeBedrockConverseEvent({
      messageStop: { stopReason: 'end_turn' }
    });
    expect(result?.chunk.finishReason).toBe('stop');
  });

  it('maps Bedrock messageStop tool_use to finishReason tool-calls', () => {
    const result = normalizeBedrockConverseEvent({
      messageStop: { stopReason: 'tool_use' }
    });
    expect(result?.chunk.finishReason).toBe('tool-calls');
  });

  it('maps Bedrock messageStop max_tokens to finishReason length', () => {
    const result = normalizeBedrockConverseEvent({
      messageStop: { stopReason: 'max_tokens' }
    });
    expect(result?.chunk.finishReason).toBe('length');
  });

  it('maps Bedrock messageStop guardrail_intervened to finishReason content-filter', () => {
    const result = normalizeBedrockConverseEvent({
      messageStop: { stopReason: 'guardrail_intervened' }
    });
    expect(result?.chunk.finishReason).toBe('content-filter');
  });

  it('sets done=true for all messageStop stopReason values', () => {
    expect(normalizeBedrockConverseEvent({ messageStop: { stopReason: 'tool_use' } })?.chunk.done).toBeTruthy();
    expect(
      normalizeBedrockConverseEvent({
        messageStop: { stopReason: 'max_tokens' }
      })?.chunk.done
    ).toBeTruthy();
  });

  it('extracts usage from metadata event', () => {
    const result = normalizeBedrockConverseEvent({
      metadata: {
        usage: { inputTokens: 15, outputTokens: 42, totalTokens: 57 }
      }
    });
    expect(result?.chunk.usage?.inputTokens).toBe(15);
    expect(result?.chunk.usage?.outputTokens).toBe(42);
    expect(result?.chunk.usage?.totalTokens).toBe(57);
  });

  it('returns null for contentBlockStop and messageStart', () => {
    expect(
      normalizeBedrockConverseEvent({
        contentBlockStop: { contentBlockIndex: 0 }
      })
    ).toBeNull();
    expect(normalizeBedrockConverseEvent({ messageStart: { role: 'assistant' } })).toBeNull();
  });

  it('returns null for non-Bedrock objects', () => {
    expect(normalizeBedrockConverseEvent(null)).toBeNull();
    expect(normalizeBedrockConverseEvent({ choices: [] })).toBeNull();
    expect(normalizeBedrockConverseEvent('string')).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() => normalizeBedrockConverseEvent({ contentBlockDelta: null })).not.toThrow();
    expect(() => normalizeBedrockConverseEvent({ contentBlockDelta: { delta: null } })).not.toThrow();
    expect(() => normalizeBedrockConverseEvent(undefined)).not.toThrow();
  });
});
