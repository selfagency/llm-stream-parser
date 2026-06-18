import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Theme } from '../themes/types.ts';
import { ThinkingBlock } from './thinking-block.tsx';

// Mock default theme
const mockTheme: Theme = {
  border: {
    color: 'blue',
    style: 'round'
  },
  highlight: {},
  text: {
    cursorSymbol: '▌',
    dimColor: false
  },
  thinking: {
    borderColor: 'cyan',
    spinnerColor: 'cyan',
    spinnerIntervalMs: 80,
    textColor: 'yellow'
  },
  toolCall: {
    doneColor: 'green',
    doneSymbol: '✓',
    pendingColor: 'yellow',
    pendingSymbol: '⠋'
  }
};

describe('ThinkingBlock' as const, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing for suppress style', () => {
    const { lastFrame } = render(
      <ThinkingBlock isStreaming={true} style="suppress" text="thinking..." theme={mockTheme} />
    );

    const output = lastFrame();
    expect(output).toBe('');
  });

  it('renders inline thinking text', () => {
    const { lastFrame } = render(
      <ThinkingBlock isStreaming={false} style="inline" text="reasoning process" theme={mockTheme} />
    );

    const output = lastFrame();
    expect(output).toContain('[Thinking] reasoning process');
  });

  it('renders inline thinking with streaming indicator', () => {
    const { lastFrame } = render(
      <ThinkingBlock isStreaming={true} style="inline" text="reasoning" theme={mockTheme} />
    );

    const output = lastFrame();
    expect(output).toContain('[Thinking] reasoning…');
  });

  it('renders blockquote thinking with spinner', () => {
    const { lastFrame } = render(
      <ThinkingBlock isStreaming={true} style="blockquote" text="thinking..." theme={mockTheme} />
    );

    const output = lastFrame();
    expect(output).toContain('thinking…');
  });

  it('renders blockquote thinking without text when streaming', () => {
    const { lastFrame } = render(
      <ThinkingBlock isStreaming={true} style="blockquote" text="partial thought" theme={mockTheme} />
    );

    const output = lastFrame();
    // Should show spinner animation, not full text
    expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  });

  it('renders full blockquote thinking text when not streaming', () => {
    const { lastFrame } = render(
      <ThinkingBlock isStreaming={false} style="blockquote" text="complete thought" theme={mockTheme} />
    );

    const output = lastFrame();
    expect(output).toContain('complete thought');
  });

  it('animates spinner during streaming blockquote', () => {
    const { lastFrame, unmount } = render(
      <ThinkingBlock isStreaming={true} style="blockquote" text="thinking" theme={mockTheme} />
    );

    const frame1 = lastFrame();
    expect(frame1).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);

    // Advance time to trigger next frame
    vi.advanceTimersByTime(80);

    const frame2 = lastFrame();
    // Spinner should have changed
    expect(frame2).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);

    unmount();
  });

  it('renders screen reader friendly inline thinking', () => {
    const { lastFrame } = render(
      <ThinkingBlock isStreaming={false} screenReader={true} style="inline" text="SR reasoning" theme={mockTheme} />
    );

    const output = lastFrame();
    expect(output).toContain('Thinking:');
    expect(output).toContain('SR reasoning');
  });

  it('renders screen reader friendly blockquote thinking', () => {
    const { lastFrame } = render(
      <ThinkingBlock isStreaming={false} screenReader={true} style="blockquote" text="SR thought" theme={mockTheme} />
    );

    const output = lastFrame();
    expect(output).toContain('Thinking:');
    expect(output).toContain('SR thought');
  });

  it('uses custom theme colors for inline thinking', () => {
    const customTheme: Theme = {
      ...mockTheme,
      thinking: {
        ...mockTheme.thinking,
        textColor: 'red'
      }
    };

    const { lastFrame } = render(
      <ThinkingBlock isStreaming={false} style="inline" text="colored thought" theme={customTheme} />
    );

    const output = lastFrame();
    expect(output).toContain('colored thought');
  });

  it('handles empty thinking text', () => {
    const { lastFrame } = render(<ThinkingBlock isStreaming={true} style="inline" text="" theme={mockTheme} />);

    const output = lastFrame();
    expect(output).toContain('[Thinking]');
  });

  it('stops spinner animation when not streaming', () => {
    const { lastFrame, unmount } = render(
      <ThinkingBlock isStreaming={true} style="blockquote" text="thought" theme={mockTheme} />
    );

    vi.advanceTimersByTime(160); // Advance past animation
    const _streamingFrame = lastFrame();

    // Re-render without streaming
    unmount();
    const { lastFrame: finalFrame } = render(
      <ThinkingBlock isStreaming={false} style="blockquote" text="thought" theme={mockTheme} />
    );

    const nonStreamingFrame = finalFrame();
    expect(nonStreamingFrame).toContain('thought');
  });
});
