/**
 * Streaming session end-to-end test.
 *
 * Tests the InkSessionRenderer component's behavior across a complete
 * streaming lifecycle: thinking → tool calls → model deltas → done.
 *
 * Uses ink-testing-library for terminal-free Ink component rendering
 * and assertions against the rendered frame output.
 */

import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { SessionStreamEvent } from './session-renderer.tsx';
import { InkSessionRenderer } from './session-renderer.tsx';

const defaultPalette = {
  assistantAccent: '#00ccff',
  assistantDim: '#668899',
  assistantText: '#aaddff',
  emphasis: '#ffffff',
  error: '#ff4444',
  frameBorder: '#888888',
  frameBright: '#aaaaaa',
  frameDim: '#556677',
  info: '#00aaff',
  muted: '#445566',
  pending: '#ffaa00',
  success: '#44cc44',
  userDim: '#339933',
  userText: '#66dd66',
  warning: '#ff8844'
};

describe('InkSessionRenderer — streaming lifecycle', () => {
  it('renders idle state with no prior turns', () => {
    const streamEvent: SessionStreamEvent = {
      calls: [],
      isThinking: false,
      modelDelta: '',
      modelIsStreaming: false,
      thinkingText: ''
    };

    const { lastFrame } = render(
      <InkSessionRenderer
        isStreaming={false}
        palette={defaultPalette}
        status="idle"
        streamEvent={streamEvent}
        turns={[]}
      />
    );

    const frame = lastFrame();
    expect(frame).toContain('CONVERSATION');
    expect(frame).toContain('idle');
  });

  it('shows stream panel with thinking during active streaming', () => {
    const streamEvent: SessionStreamEvent = {
      calls: [],
      isThinking: true,
      modelDelta: '',
      modelIsStreaming: true,
      thinkingText: 'Analysing the request…'
    };

    const { lastFrame } = render(
      <InkSessionRenderer
        isStreaming={true}
        palette={defaultPalette}
        status="connected"
        streamEvent={streamEvent}
        turns={[{ id: 't1', role: 'user', text: 'Hello' }]}
      />
    );

    const frame = lastFrame();
    expect(frame).toContain('CONVERSATION');
    expect(frame).toContain('Hello');
    expect(frame).toContain('STREAM');
    expect(frame).toContain('thinking');
  });

  it('shows tool calls during streaming', () => {
    const streamEvent: SessionStreamEvent = {
      calls: [{ id: 'tc1', name: 'readFile', status: 'executing', args: { path: '/home/user/test.txt' } }],
      isThinking: false,
      modelDelta: '',
      modelIsStreaming: true,
      thinkingText: ''
    };

    const { lastFrame } = render(
      <InkSessionRenderer
        isStreaming={true}
        palette={defaultPalette}
        status="connected"
        streamEvent={streamEvent}
        turns={[]}
      />
    );

    const frame = lastFrame();
    expect(frame).toContain('STREAM');
    expect(frame).toContain('readFile');
  });

  it('shows model delta text during streaming', () => {
    const streamEvent: SessionStreamEvent = {
      calls: [],
      isThinking: false,
      modelDelta: 'Here is the result I found…',
      modelIsStreaming: true,
      thinkingText: ''
    };

    const { lastFrame } = render(
      <InkSessionRenderer
        isStreaming={true}
        palette={defaultPalette}
        status="connected"
        streamEvent={streamEvent}
        turns={[]}
      />
    );

    const frame = lastFrame();
    expect(frame).toContain('Here is the result');
  });

  it('shows waiting message when streaming but no events yet', () => {
    const streamEvent: SessionStreamEvent = {
      calls: [],
      isThinking: false,
      modelDelta: '',
      modelIsStreaming: false,
      thinkingText: ''
    };

    const { lastFrame } = render(
      <InkSessionRenderer
        isStreaming={true}
        palette={defaultPalette}
        status="connecting"
        streamEvent={streamEvent}
        turns={[]}
      />
    );

    const frame = lastFrame();
    expect(frame).toContain('Waiting for');
  });

  it('renders full multi-turn conversation with prior messages', () => {
    const streamEvent: SessionStreamEvent = {
      calls: [],
      isThinking: false,
      modelDelta: '',
      modelIsStreaming: false,
      thinkingText: ''
    };

    const { lastFrame } = render(
      <InkSessionRenderer
        cursorSymbol="▌"
        elapsedSec={12}
        inputTokens={45}
        isStreaming={false}
        modelName="claude-opus"
        outputTokens={120}
        palette={defaultPalette}
        provider="anthropic"
        status="streaming"
        streamEvent={streamEvent}
        turns={[
          { id: 't1', role: 'user', text: 'What is the capital of France?' },
          { id: 't2', role: 'assistant', text: 'The capital of France is Paris.' },
          { id: 't3', role: 'user', text: 'Tell me about its landmarks.' },
          { id: 't4', role: 'assistant', text: 'Paris has the Eiffel Tower, Louvre Museum, and Notre-Dame Cathedral.' }
        ]}
      />
    );

    const frame = lastFrame();
    expect(frame).toContain('CONVERSATION');
    expect(frame).toContain('Paris');
    expect(frame).toContain('Eiffel Tower');
    expect(frame).toContain('Louvre');
    expect(frame).toContain('anthropic');
    expect(frame).toContain('claude-opus');
  });
});
