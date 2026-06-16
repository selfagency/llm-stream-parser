import { describe, expect, it, vi } from 'vitest';

import { createProcessorEventAdapter } from './create-processor-event-adapter.js';
import { LLMStreamProcessor } from './llm-stream-processor.js';

describe('createProcessorEventAdapter', () => {
  it('forwards onToolCallDelta, onStep, and onFinish callbacks', () => {
    const processor = new LLMStreamProcessor({
      accumulateNativeToolCalls: true
    });
    const onToolCallDelta = vi.fn<() => void>();
    const onStep = vi.fn<(stepIndex: number, usage?: import('@agentsy/shared').UsageInfo) => void>();
    const onFinish = vi.fn<() => void>();

    createProcessorEventAdapter(processor, {
      onFinish,
      onStep,
      onToolCallDelta
    });

    processor.process({ content: 'hello', stepIndex: 0 });
    processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '{"q":', index: 0, name: 'lookup' }]
    });
    processor.process({
      nativeToolCallDeltas: [{ argumentsDelta: '"x"}', index: 0 }]
    });
    processor.process({
      done: true,
      finishReason: 'tool-calls',
      usage: { inputTokens: 1, outputTokens: 2 }
    });

    expect(onToolCallDelta).toHaveBeenCalledWith({
      argumentsDelta: '{"q":',
      index: 0,
      name: 'lookup',
      type: 'tool_call_delta'
    });
    expect(onStep).toHaveBeenCalledWith(0, undefined);
    expect(onFinish).toHaveBeenCalledWith('tool-calls', {
      inputTokens: 1,
      outputTokens: 2
    });
  });

  it('disposes listeners cleanly', () => {
    const processor = new LLMStreamProcessor();
    const onText = vi.fn();
    const adapter = createProcessorEventAdapter(processor, { onText });

    adapter.dispose();
    processor.process({ content: 'after-dispose' });

    expect(onText).not.toHaveBeenCalled();
  });
});
