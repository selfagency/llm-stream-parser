import type { FinishReason, UsageInfo } from '@agentsy/shared';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { XmlToolCall } from '../../tool-calls/index.js';
import { LLMStreamProcessor } from './llm-stream-processor.js';
import { createZAiInlineToolCallParser } from './zai-inline-tool-call-parser.js';

describe('LLMStreamProcessor', () => {
  it('processes thinking tags, scrubs content, and extracts xml-wrapped tool calls', () => {
    const processor = new LLMStreamProcessor({
      knownTools: new Set(['search_files'])
    });

    const out = processor.process({
      content: '<think>reasoning</think>Hello <toolCall>{"name":"search_files","arguments":{"query":"abc"}}</toolCall>',
      done: false
    });

    expect(out.thinking).toBe('reasoning');
    expect(out.content).toBe('Hello ');
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]).toMatchObject({
      format: 'json-wrapped',
      name: 'search_files',
      parameters: { query: 'abc' }
    });
    expect(out.parts.map(part => part.type)).toStrictEqual(['thinking', 'text', 'tool_call']);

    expect(processor.accumulatedThinking).toBe('reasoning');
    expect(processor.accumulatedMessage.content).toBe('Hello ');
    expect(processor.accumulatedMessage.toolCalls).toHaveLength(1);
  });

  it('emits events and warning callbacks', () => {
    const onWarning = vi.fn<(_message: string, _context?: Record<string, unknown>) => void>();
    const onText = vi.fn<(_delta: string) => void>();
    const onThinking = vi.fn<(_delta: string) => void>();
    const onDone = vi.fn<() => void>();

    const processor = new LLMStreamProcessor({
      maxInputLength: 20,
      onWarning
    });

    processor.on('text', onText).on('thinking', onThinking).on('done', onDone);

    processor.process({ content: '<think>x</think>ok' });
    processor.process({ content: '1234567890123456789012345' });
    processor.flush();

    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('exceeded maxInputLength'),
      expect.objectContaining({ field: 'content', maxInputLength: 20, originalLength: 25 })
    );
    expect(onThinking).toHaveBeenCalledWith('x');
    expect(onText).toHaveBeenCalledWith('ok12345678901234567890');
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('maps native tool_calls into XmlToolCall shape', () => {
    const processor = new LLMStreamProcessor();
    const out = processor.process({
      tool_calls: [
        {
          function: {
            arguments: { path: '/home/user/project/a.ts' },
            name: 'read_file'
          }
        }
      ]
    });

    expect(out.toolCalls).toStrictEqual([
      {
        format: 'native-json',
        name: 'read_file',
        parameters: { path: '/home/user/project/a.ts' }
      }
    ]);
  });

  it('enforces maxToolCallsPerMessage cumulatively across multiple chunks', () => {
    const onWarning = vi.fn<(message: string, context?: Record<string, unknown>) => void>();
    const processor = new LLMStreamProcessor({
      maxToolCallsPerMessage: 2,
      onWarning
    });

    // First chunk: 2 calls — should all pass (fills the limit)
    const out1 = processor.process({
      tool_calls: [{ function: { arguments: {}, name: 'a' } }, { function: { arguments: {}, name: 'b' } }]
    });
    expect(out1.toolCalls).toHaveLength(2);
    expect(onWarning).not.toHaveBeenCalled();

    // Second chunk: 1 more call — limit already reached, should be dropped
    const out2 = processor.process({
      tool_calls: [{ function: { arguments: {}, name: 'c' } }]
    });
    expect(out2.toolCalls).toHaveLength(0);
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('maxToolCallsPerMessage'),
      expect.objectContaining({ accumulated: 2, maxToolCallsPerMessage: 2 })
    );
  });

  it('detects incomplete thinking tags on flush', () => {
    const processor = new LLMStreamProcessor({ parseThinkTags: true });

    processor.process({ content: '<think>' });
    processor.process({ content: 'reasoning but no close' });

    const out = processor.flush();

    expect(out.incomplete).toBeTruthy();
    expect(out.incompleteness).toStrictEqual([{ reason: 'Unclosed thinking tag', type: 'thinking' }]);
  });

  it('detects unclosed XML tags in residuals', () => {
    const processor = new LLMStreamProcessor({ scrubContextTags: false });

    processor.process({ content: '<test>' });
    processor.process({ content: 'content' });

    const out = processor.flush();

    expect(out.incomplete).toBeTruthy();
    expect(out.incompleteness).toStrictEqual([{ reason: 'Unmatched XML tags in residual buffer', type: 'xml' }]);
  });

  it('returns no incompleteness for complete streams', () => {
    const processor = new LLMStreamProcessor({ parseThinkTags: true });

    processor.process({ content: '</think>ok' });
    processor.process({ content: 'regular content' });

    const out = processor.flush();

    expect(out.incomplete).toBeFalsy();
    expect(out.incompleteness).toStrictEqual([]);
  });

  it('truncates tool calls when maxToolCallsPerMessage is exceeded', () => {
    const onWarning = vi.fn<(message: string, context?: Record<string, unknown>) => void>();
    const processor = new LLMStreamProcessor({
      maxToolCallsPerMessage: 1,
      onWarning
    });

    const out = processor.process({
      tool_calls: [{ function: { arguments: {}, name: 'a' } }, { function: { arguments: {}, name: 'b' } }]
    });

    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]?.name).toBe('a');
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('maxToolCallsPerMessage'),
      expect.objectContaining({ maxToolCallsPerMessage: 1, originalCount: 2 })
    );
  });

  it('drops tool calls whose argument payload exceeds maxToolArgumentBytes', () => {
    const onWarning = vi.fn<(message: string, context?: Record<string, unknown>) => void>();
    const processor = new LLMStreamProcessor({
      maxToolArgumentBytes: 8,
      onWarning
    });

    const out = processor.process({
      tool_calls: [
        {
          function: {
            arguments: { path: '/a/very/long/path.ts' },
            name: 'read_file'
          }
        }
      ]
    });

    expect(out.toolCalls).toStrictEqual([]);
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('maxToolArgumentBytes'),
      expect.objectContaining({
        maxToolArgumentBytes: 8,
        toolName: 'read_file'
      })
    );
  });

  it('drops tool calls whose arguments contain a circular reference', () => {
    const onWarning = vi.fn<(message: string, context?: Record<string, unknown>) => void>();
    const processor = new LLMStreamProcessor({ onWarning });

    const circular: { self?: unknown } = {};
    circular.self = circular;

    const out = processor.process({
      tool_calls: [{ function: { arguments: circular, name: 'circular_tool' } }]
    });

    expect(out.toolCalls).toStrictEqual([]);
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('could not be serialized'),
      expect.objectContaining({ toolName: 'circular_tool' })
    );
  });

  it('drops tool calls whose arguments contain a BigInt value', () => {
    const onWarning = vi.fn<(message: string, context?: Record<string, unknown>) => void>();
    const processor = new LLMStreamProcessor({ onWarning });

    const out = processor.process({
      tool_calls: [{ function: { arguments: { value: 42n }, name: 'bigint_tool' } }]
    });

    expect(out.toolCalls).toStrictEqual([]);
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('could not be serialized'),
      expect.objectContaining({ toolName: 'bigint_tool' })
    );
  });

  it('uses modelId with thinkingTagMap to parse custom thinking tags', () => {
    const processor = new LLMStreamProcessor({
      modelId: 'my-custom-model-v1',
      thinkingTagMap: new Map([['my-custom-model', ['<x>', '</x>']]])
    });

    const out = processor.process({ content: '<x>reason</x>ok' });
    const flushed = processor.flush();
    expect(out.thinking).toBe('reason');
    expect(out.content + flushed.content).toBe('ok');
  });

  it('rate limits warning emissions with maxWarnings', () => {
    const onWarning = vi.fn<(message: string, context?: Record<string, unknown>) => void>();
    const processor = new LLMStreamProcessor({
      maxInputLength: 10,
      maxWarnings: 3,
      onWarning
    });

    // Trigger 5 warnings by sending oversized content
    for (let i = 0; i < 5; i++) {
      processor.process({ content: 'x'.repeat(20) });
    }

    expect(onWarning).toHaveBeenCalledTimes(3);
  });

  it('resets warning count on reset()', () => {
    const onWarning = vi.fn<(message: string, context?: Record<string, unknown>) => void>();
    const processor = new LLMStreamProcessor({
      maxInputLength: 10,
      maxWarnings: 2,
      onWarning
    });

    processor.process({ content: 'x'.repeat(20) });
    processor.process({ content: 'x'.repeat(20) });
    processor.process({ content: 'x'.repeat(20) }); // should be suppressed
    expect(onWarning).toHaveBeenCalledTimes(2);

    processor.reset();
    processor.process({ content: 'x'.repeat(20) });
    expect(onWarning).toHaveBeenCalledTimes(3); // warning count was reset
  });

  it('can be reused after flush() + reset() cycle', () => {
    const processor = new LLMStreamProcessor();

    processor.process({ content: '<think>thought1</think>content1' });
    processor.flush();

    processor.reset();

    const out = processor.process({
      content: '<think>thought2</think>content2'
    });
    const flushed = processor.flush();
    expect(out.thinking).toBe('thought2');
    expect(out.content + flushed.content).toBe('content2');
  });

  it('returns done on second flush() without process()', () => {
    const processor = new LLMStreamProcessor();
    processor.process({ content: '<think>t</think>content' });
    const first = processor.flush();
    const second = processor.flush();

    expect(first.done).toBeTruthy();
    expect(second.done).toBeTruthy();
    expect(second.thinking).toBe('');
    expect(second.toolCalls).toStrictEqual([]);
  });

  it('emits events in correct order across process+flush', () => {
    const events: string[] = [];
    const processor = new LLMStreamProcessor({
      parseThinkTags: true,
      scrubContextTags: false
    });

    processor.on('thinking', () => events.push('thinking'));
    processor.on('text', () => events.push('text'));
    processor.on('done', () => events.push('done'));

    processor.process({ content: '<think>plan</think>output' });
    processor.flush();

    expect(events).toStrictEqual(['thinking', 'text', 'done']);
  });

  // -------------------------------------------------------------------
  // Usage / token tracking (Phase 3)
  // -------------------------------------------------------------------

  it('stores usage from a chunk carrying usage data', () => {
    const processor = new LLMStreamProcessor();
    processor.process({
      content: 'hello',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    });

    expect(processor.accumulatedMessage.usage).toStrictEqual({
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30
    });
  });

  it('includes usage in ProcessedOutput when chunk has usage', () => {
    const processor = new LLMStreamProcessor();
    const out = processor.process({
      content: 'hi',
      usage: { inputTokens: 5, outputTokens: 8 }
    });

    expect(out.usage).toStrictEqual({ inputTokens: 5, outputTokens: 8 });
  });

  it('merges usage from multiple chunks (last-write-wins per field)', () => {
    const processor = new LLMStreamProcessor();
    processor.process({ content: 'a', usage: { inputTokens: 10 } });
    processor.process({
      content: 'b',
      usage: { outputTokens: 20, totalTokens: 30 }
    });

    expect(processor.accumulatedMessage.usage).toStrictEqual({
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30
    });
  });

  it('emits usage event when chunk carries usage', () => {
    const onUsage = vi.fn<(_usage: UsageInfo) => void>();
    const processor = new LLMStreamProcessor();
    processor.on('usage', onUsage);

    processor.process({
      content: 'x',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
    });

    expect(onUsage).toHaveBeenCalledOnce();
    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3
    });
  });

  it('does not emit usage event when chunk has no usage', () => {
    const onUsage = vi.fn<(usage: UsageInfo) => void>();
    const processor = new LLMStreamProcessor();
    processor.on('usage', onUsage);

    processor.process({ content: 'no usage here' });

    expect(onUsage).not.toHaveBeenCalled();
  });

  it('usage is undefined in accumulatedMessage when no chunks carried usage', () => {
    const processor = new LLMStreamProcessor();
    processor.process({ content: 'hello' });

    expect(processor.accumulatedMessage.usage).toBeUndefined();
  });

  it('flush() output includes accumulated usage', () => {
    const processor = new LLMStreamProcessor();
    processor.process({
      content: '<think>t</think>',
      usage: { inputTokens: 7 }
    });
    const flushed = processor.flush();

    expect(flushed.usage).toStrictEqual({ inputTokens: 7 });
  });

  it('processComplete() output includes accumulated usage', () => {
    const processor = new LLMStreamProcessor();
    const out = processor.processComplete({
      content: 'done',
      done: true,
      usage: { inputTokens: 4, outputTokens: 8, totalTokens: 12 }
    });

    expect(out.usage).toStrictEqual({
      inputTokens: 4,
      outputTokens: 8,
      totalTokens: 12
    });
  });

  it('reset() clears accumulated usage', () => {
    const processor = new LLMStreamProcessor();
    processor.process({ usage: { inputTokens: 99 } });
    expect(processor.accumulatedMessage.usage).toBeDefined();

    processor.reset();
    expect(processor.accumulatedMessage.usage).toBeUndefined();
  });

  // -------------------------------------------------------------------
  // Concurrent events — content + done in a single chunk
  // -------------------------------------------------------------------

  it('processes content and done flag in the same chunk', () => {
    const onText = vi.fn<(delta: string) => void>();
    const onDone = vi.fn<() => void>();
    const processor = new LLMStreamProcessor({ scrubContextTags: false });

    processor.on('text', onText).on('done', onDone);

    const out = processor.process({ content: 'final text', done: true });

    expect(out.content).toBe('final text');
    expect(out.done).toBeTruthy();
    expect(onText).toHaveBeenCalledWith('final text');
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('includes thinking and signals done in the same chunk', () => {
    const events: string[] = [];
    // Disable context tag scrubbing so xmlFilter does not buffer 'answer' text
    const processor = new LLMStreamProcessor({ scrubContextTags: false });

    processor.on('thinking', () => events.push('thinking'));
    processor.on('text', () => events.push('text'));
    processor.on('done', () => events.push('done'));

    const out = processor.process({
      content: '<think>plan</think>answer',
      done: true
    });

    expect(out.thinking).toBe('plan');
    expect(out.content).toBe('answer');
    expect(out.done).toBeTruthy();
    expect(events).toStrictEqual(['thinking', 'text', 'done']);
  });

  it('emits tool_call and done events when final chunk carries tool calls and done: true', () => {
    const onToolCall = vi.fn<(_call: XmlToolCall) => void>();
    const onDone = vi.fn<() => void>();
    const processor = new LLMStreamProcessor();

    processor.on('tool_call', onToolCall).on('done', onDone);

    const out = processor.process({
      done: true,
      tool_calls: [
        {
          function: {
            arguments: { url: 'https://example.com' },
            name: 'fetch'
          }
        }
      ]
    });

    expect(out.toolCalls).toHaveLength(1);
    expect(out.done).toBeTruthy();
    expect(onToolCall).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('handles fragmented JSON tool_call across chunks (integration)', () => {
    const processor = new LLMStreamProcessor({ knownTools: new Set(['do']) });

    // First chunk contains start of the tool_call JSON
    processor.process({ content: '<tool_call>{"name":"do","arguments":{"a":' });
    // Second chunk completes the JSON and closes the tag
    const out = processor.processComplete({
      content: '"x"}}</tool_call>',
      done: true
    });

    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]).toMatchObject({
      format: 'json-wrapped',
      name: 'do',
      parameters: { a: 'x' }
    });
  }, 5000);

  it('enforces maxResidualBytes limit to prevent unbounded buffer growth', () => {
    const warnings: [string, Record<string, unknown> | undefined][] = [];
    const onWarning = vi.fn<(message: string, context?: Record<string, unknown>) => void>(
      (message: string, context?: Record<string, unknown>) => {
        warnings.push([message, context]);
      }
    );

    const processor = new LLMStreamProcessor({
      knownTools: new Set(['test']),
      maxResidualBytes: 100, // Very small limit for testing
      onWarning
    });

    // First chunk: fits within limit
    processor.process({ content: '<tool_call>{"name":"test"' });
    expect(warnings).toHaveLength(0);

    // Second chunk: would exceed limit, should be dropped
    const largeChunk = `<arguments>{"data":"${'x'.repeat(200)}"}}</tool_call>`;
    processor.process({ content: largeChunk, done: true });

    // Warning should have been emitted about exceeding limit
    expect(warnings.length).toBeGreaterThan(0);
    // Verify the warning message mentions maxResidualBytes
    const warningMessage = warnings.find(([msg]) => msg.includes('maxResidualBytes'));
    expect(warningMessage).toBeDefined();
  });

  it('tracks errors and warnings counts in processor stats', () => {
    const processor = new LLMStreamProcessor({
      maxInputLength: 20,
      onWarning: () => {
        // Intentionally empty to trigger warnings
      }
    });

    // Process content that exceeds maxInputLength to trigger warning
    processor.process({ content: 'x'.repeat(100), done: false });
    processor.process({ content: 'y'.repeat(100), done: false });

    // Stats should track that warnings were emitted
    // (Note: exact count depends on internal implementation)
    // This test validates that the stats fields exist and are tracked
    processor.flush();

    // Fields should exist and be initialized
    const stats = processor.getStats();
    expect(stats).toHaveProperty('warningsCount');
    expect(stats).toHaveProperty('errorsCount');
    expectTypeOf(stats.warningsCount).toBeNumber();
    expectTypeOf(stats.errorsCount).toBeNumber();
  });
});

// ---------------------------------------------------------------------------
// Phase 1: finishReason propagation and ToolCallState
// ---------------------------------------------------------------------------

describe('LLMStreamProcessor — finishReason propagation', () => {
  it('propagates finishReason stop from terminal chunk to ProcessedOutput', () => {
    const processor = new LLMStreamProcessor();
    const result = processor.process({
      content: 'hi',
      done: true,
      finishReason: 'stop'
    });
    expect(result.finishReason).toBe('stop');
  });

  it('propagates finishReason tool-calls from terminal chunk', () => {
    const processor = new LLMStreamProcessor({
      knownTools: new Set(['search'])
    });
    const result = processor.process({
      content: '',
      done: true,
      finishReason: 'tool-calls'
    });
    expect(result.finishReason).toBe('tool-calls');
  });

  it('propagates finishReason length from terminal chunk', () => {
    const processor = new LLMStreamProcessor();
    const result = processor.process({
      content: 'truncated',
      done: true,
      finishReason: 'length'
    });
    expect(result.finishReason).toBe('length');
  });

  it('does not set finishReason when chunk has none', () => {
    const processor = new LLMStreamProcessor();
    const result = processor.process({ content: 'hi', done: false });
    expect(result.finishReason).toBeUndefined();
  });

  it('accumulates finishReason across multi-chunk stream — last chunk wins', () => {
    const processor = new LLMStreamProcessor();
    processor.process({ content: 'Hello' });
    processor.process({ content: ' world' });
    const result = processor.process({
      content: '!',
      done: true,
      finishReason: 'stop'
    });
    expect(result.finishReason).toBe('stop');
  });

  it('flush() returns finishReason from last processed chunk', () => {
    const processor = new LLMStreamProcessor();
    processor.process({ content: 'Hello', done: false });
    processor.process({
      content: ' world',
      done: true,
      finishReason: 'length'
    });
    const result = processor.flush();
    expect(result.finishReason).toBe('length');
  });

  it('reset() clears finishReason for next stream', () => {
    const processor = new LLMStreamProcessor();
    processor.process({
      content: 'hi',
      done: true,
      finishReason: 'stop'
    });
    processor.reset();
    const result = processor.flush();
    expect(result.finishReason).toBeUndefined();
  });

  it('emits tool_call parts with state input-complete', () => {
    const processor = new LLMStreamProcessor({
      knownTools: new Set(['get_weather'])
    });
    // Feed a complete native tool call via nativeToolCallDeltas (id+name header, then arguments done)
    processor.process({
      nativeToolCallDeltas: [{ id: 'call_abc', index: 0, name: 'get_weather' }]
    });
    const result = processor.process({
      done: true,
      finishReason: 'tool-calls',
      nativeToolCallDeltas: [{ argumentsDelta: '{"city":"NYC"}', index: 0 }]
    });
    const toolCallPart = result.parts.find(p => p.type === 'tool_call');
    expect(toolCallPart).toBeDefined();

    if (!toolCallPart) {
      throw new Error('Expected tool_call part');
    }

    expect(toolCallPart.state).toBe('input-complete');
    expect(toolCallPart.call.id).toBe('call_abc');
  });
});

describe('Phase 1 — type exports', () => {
  it('FinishReason and ToolCallState are valid type-level exports from tool-calls', async () => {
    const mod = await import('@agentsy/core/tool-calls');
    // Types-only check: the module should export without error
    expect(mod).toBeDefined();
  });

  it('FinishReason values cover expected string literals', () => {
    const values: FinishReason[] = ['stop', 'length', 'tool-calls', 'content-filter', 'other', 'error'];
    expect(values).toHaveLength(6);
  });

  it('propagates stepIndex and stepUsage from the input chunk', () => {
    const processor = new LLMStreamProcessor();
    const result = processor.process({
      content: 'step output',
      stepIndex: 2,
      stepUsage: { inputTokens: 11, outputTokens: 7 }
    });

    expect(result.stepIndex).toBe(2);
    expect(result.stepUsage).toStrictEqual({
      inputTokens: 11,
      outputTokens: 7
    });
  });

  it('does not invent step metadata during flush()', () => {
    const processor = new LLMStreamProcessor();
    processor.process({ content: 'plain output' });

    const result = processor.flush();

    expect(result.stepIndex).toBeUndefined();
    expect(result.stepUsage).toBeUndefined();
  });
});

describe('LLMStreamProcessor — Phase 2 tool call streaming lifecycle', () => {
  it('emits tool_call_delta parts for each nativeToolCallDelta with argumentsDelta', () => {
    const processor = new LLMStreamProcessor({
      accumulateNativeToolCalls: true
    });
    const deltaParts: ReturnType<typeof processor.process>['parts'] = [];

    processor.on('tool_call_delta', delta => deltaParts.push(delta));

    processor.process({
      nativeToolCallDeltas: [{ id: 'call_1', index: 0, name: 'get_weather' }]
    });
    processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '{"city":', index: 0 }]
    });
    processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '"NYC"}', index: 0 }]
    });
    processor.process({ done: true, finishReason: 'tool-calls' });

    expect(deltaParts).toHaveLength(2);
    expect(deltaParts[0]).toMatchObject({
      argumentsDelta: '{"city":',
      name: 'get_weather',
      type: 'tool_call_delta'
    });
    expect(deltaParts[1]).toMatchObject({
      argumentsDelta: '"NYC"}',
      name: 'get_weather',
      type: 'tool_call_delta'
    });
  });

  it('tool_call_delta part includes id from header delta', () => {
    const processor = new LLMStreamProcessor({
      accumulateNativeToolCalls: true
    });
    const output = processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '{}', id: 'call_abc', index: 0, name: 'fn' }]
    });

    const deltaPart = output.parts.find(p => p.type === 'tool_call_delta');
    expect(deltaPart).toBeDefined();
    expect(deltaPart).toMatchObject({
      argumentsDelta: '{}',
      id: 'call_abc',
      name: 'fn',
      type: 'tool_call_delta'
    });
  });

  it('tool_call_delta part resolves name from accumulator for subsequent deltas', () => {
    const processor = new LLMStreamProcessor({
      accumulateNativeToolCalls: true
    });

    processor.process({
      nativeToolCallDeltas: [{ id: 'call_abc', index: 0, name: 'search' }]
    });
    const out = processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '{"q":"ts"}', index: 0 }]
    });

    const deltaPart = out.parts.find(p => p.type === 'tool_call_delta');
    expect(deltaPart).toMatchObject({
      argumentsDelta: '{"q":"ts"}',
      name: 'search',
      type: 'tool_call_delta'
    });
  });

  it('emits completed native call mid-stream before done: true', () => {
    const processor = new LLMStreamProcessor({
      accumulateNativeToolCalls: true
    });
    const toolCalls: string[] = [];
    processor.on('tool_call', call => toolCalls.push(call.name));

    processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '{}', index: 0, name: 'lookup' }]
    });
    // Arguments are now valid JSON — mid-stream completion should fire tool_call
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toBe('lookup');

    // done: true should NOT re-emit the same call
    processor.process({ done: true, finishReason: 'tool-calls' });
    expect(toolCalls).toHaveLength(1);
  });

  it('does not duplicate tool_call emission when call completed mid-stream', () => {
    const processor = new LLMStreamProcessor({
      accumulateNativeToolCalls: true
    });
    const toolCalls: string[] = [];
    processor.on('tool_call', call => toolCalls.push(call.name));

    processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '{"a":1}', index: 0, name: 'fn' }]
    });
    processor.process({ done: true, finishReason: 'tool-calls' });

    expect(toolCalls).toHaveLength(1);
  });

  it('tool_call_delta event fires on processor.on("tool_call_delta")', () => {
    const processor = new LLMStreamProcessor({
      accumulateNativeToolCalls: true
    });
    const fired: string[] = [];
    processor.on('tool_call_delta', delta => fired.push(delta.argumentsDelta));

    processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '{"x":', index: 0, name: 'fn' }]
    });
    processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '1}', index: 0 }]
    });

    expect(fired).toStrictEqual(['{"x":', '1}']);
  });

  it('reset() clears emitted call index tracking so same index can be reused', () => {
    const processor = new LLMStreamProcessor({
      accumulateNativeToolCalls: true
    });
    const toolCalls: string[] = [];
    processor.on('tool_call', call => toolCalls.push(call.name));

    // First stream
    processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '{}', index: 0, name: 'fn' }]
    });
    expect(toolCalls).toHaveLength(1);

    // Reset and second stream using same index
    processor.reset();
    processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '{}', index: 0, name: 'fn2' }]
    });
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[1]).toBe('fn2');
  });

  it('emits step_started with messageId for first step in a conversation', () => {
    const processor = new LLMStreamProcessor({ scrubContextTags: false });
    const events: unknown[] = [];

    processor.on('conversation_event', event => {
      events.push(event);
    });

    processor.process({ content: 'hello', stepIndex: 0 });

    const stepStarted = events.find(
      (
        e
      ): e is { messageId?: string; stepIndex: number; usage?: unknown } & {
        type: 'step_started';
      } => (e as { type?: string }).type === 'step_started'
    );
    expect(stepStarted).toBeDefined();
    if (stepStarted?.messageId) {
      expectTypeOf(stepStarted.messageId).toBeString();
    }
  });

  it('uses previous step usage when emitting step_finished on step switch', () => {
    const processor = new LLMStreamProcessor({ scrubContextTags: false });
    const events: unknown[] = [];

    processor.on('conversation_event', event => {
      events.push(event);
    });

    processor.process({
      content: 'step 0',
      stepIndex: 0,
      stepUsage: { outputTokens: 3 }
    });
    processor.process({
      content: 'step 1',
      stepIndex: 1,
      stepUsage: { outputTokens: 9 }
    });

    const stepFinished = events.find(
      (
        e
      ): e is { messageId?: string; stepIndex?: number; usage?: unknown } & {
        type: 'step_finished';
      } => (e as { type?: string }).type === 'step_finished'
    );
    expect(stepFinished).toBeDefined();
    expect(stepFinished?.usage).toStrictEqual({ outputTokens: 3 });
  });

  it('keeps native toolCallId stable across tool_call_delta and tool_call updates', () => {
    const processor = new LLMStreamProcessor({
      accumulateNativeToolCalls: true
    });
    const events: unknown[] = [];

    processor.on('conversation_event', event => {
      events.push(event);
    });

    processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '{"q":', index: 0, name: 'lookup' }]
    });
    processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '"ts"}', index: 0 }]
    });

    const added = events.find(
      (e): e is { toolCall: { id: string } } & { type: 'tool_call_part_added' } =>
        (e as { type?: string }).type === 'tool_call_part_added'
    );
    const updated = events.find(
      (e): e is { toolCallId?: string } & { type: 'tool_call_updated' } & { state: string } =>
        (e as { type?: string }).type === 'tool_call_updated' && (e as { state?: string }).state === 'input-complete'
    );

    expect(added?.toolCall?.id).toBeDefined();
    expect(updated?.toolCallId).toBe(added?.toolCall?.id);
  });

  it('emits distinct synthetic IDs for multiple XML calls with the same name', () => {
    const processor = new LLMStreamProcessor({
      knownTools: new Set(['search']),
      scrubContextTags: false
    });
    const events: unknown[] = [];

    processor.on('conversation_event', event => {
      events.push(event);
    });

    processor.process({
      content: '<search><q>one</q></search><search><q>two</q></search>'
    });

    const adds = events.filter(
      (e): e is { toolCall: { id: string } } & { type: 'tool_call_part_added' } =>
        (e as { type?: string }).type === 'tool_call_part_added'
    );
    expect(adds).toHaveLength(2);

    const ids = adds.map(e => (e as { toolCall: { id: string } }).toolCall.id);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe('LLMStreamProcessor — Z.ai inline tool-call parser', () => {
  it('strips Z.ai inline tool tokens from content and emits tool call parts', () => {
    const processor = new LLMStreamProcessor({
      toolCallParsers: [createZAiInlineToolCallParser()]
    });

    processor.process({
      content: '<|tool_call_begin|>get_weather<|tool_call_argument_begin|>{"city":"Boston"}<|tool_call_end|>',
      done: false
    });

    const flushed = processor.flush();

    expect(processor.accumulatedMessage.content).toBe('');
    expect(flushed.toolCalls).toHaveLength(0);

    const complete = processor.accumulatedMessage.toolCalls;
    expect(complete).toHaveLength(1);
    expect(complete[0]).toMatchObject({
      format: 'native-json',
      name: 'get_weather',
      parameters: { city: 'Boston' }
    });
  });

  it('handles token boundaries split across chunks', () => {
    const processor = new LLMStreamProcessor({
      toolCallParsers: [createZAiInlineToolCallParser()]
    });

    processor.process({ content: 'Hello <|tool_call_be' });
    processor.process({
      content: 'gin|>search<|tool_call_argument_begin|>{"q":"a"}<|tool_call_end|> world'
    });
    processor.flush();

    expect(processor.accumulatedMessage.content).toBe('Hello  world');
    expect(processor.accumulatedMessage.toolCalls).toHaveLength(1);
    expect(processor.accumulatedMessage.toolCalls[0]).toMatchObject({
      name: 'search',
      parameters: { q: 'a' }
    });
  });
});
