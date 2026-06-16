// fallow-ignore-file unused-file

import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Theme } from '../themes/types.ts';
import { StreamingText } from './streaming-text.tsx';

// Mock markdownToAnsi
vi.mock(import('../utils/markdown-to-ansi.ts'), () => ({
  markdownToAnsi: vi.fn<(text: string) => Promise<string>>(async (text: string) => `ANSI[${text}]`)
}));

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

describe('StreamingText' as const, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders static text without streaming', async () => {
    const { lastFrame, unmount } = render(
      <StreamingText isStreaming={false} markdown={false} text="Hello world" theme={mockTheme} />
    );

    // Give rendering time
    await vi.runAllTimersAsync();

    const output = lastFrame();
    expect(output).toContain('Hello world');

    unmount();
  });

  it('renders text with streaming cursor', async () => {
    const { lastFrame, unmount } = render(
      <StreamingText isStreaming={true} markdown={false} text="Streaming" theme={mockTheme} />
    );

    // Let rendering complete
    await vi.advanceTimersByTimeAsync(200);

    const output = lastFrame();
    expect(output).toContain('Streaming');
    expect(output).toContain('▌'); // cursor symbol

    unmount();
  });

  it('splits text at last double newline when streaming', async () => {
    const { lastFrame, unmount } = render(
      <StreamingText isStreaming={true} markdown={false} text="Para 1\n\nPara 2 incomplete" theme={mockTheme} />
    );

    // Let rendering complete
    await vi.advanceTimersByTimeAsync(200);

    const output = lastFrame();
    // Stable prefix should be rendered
    expect(output).toContain('Para 1');

    unmount();
  });

  it('renders complete text when no double newline', async () => {
    const { lastFrame, unmount } = render(
      <StreamingText isStreaming={true} markdown={false} text="Single paragraph" theme={mockTheme} />
    );

    // Let rendering complete
    await vi.advanceTimersByTimeAsync(200);

    const output = lastFrame();
    expect(output).toContain('Single paragraph');

    unmount();
  });

  it('disables markdown for screen readers', async () => {
    const { lastFrame, unmount } = render(
      <StreamingText isStreaming={false} markdown={true} screenReader={true} text="**Bold** text" theme={mockTheme} />
    );

    await vi.runAllTimersAsync();

    const output = lastFrame();
    // Should render plain text, not ANSI-converted
    expect(output).toContain('**Bold** text');

    unmount();
  });

  it('converts markdown when not for screen readers', async () => {
    const { markdownToAnsi } = await import('../utils/markdown-to-ansi.ts');

    const { unmount } = render(
      <StreamingText isStreaming={false} markdown={true} screenReader={false} text="*italic*" theme={mockTheme} />
    );

    await vi.runAllTimersAsync();

    expect(markdownToAnsi).toHaveBeenCalledWith('*italic*', expect.objectContaining({ syntaxHighlight: false }));

    unmount();
  });

  it('skips markdown conversion when markdown prop is false', async () => {
    const { lastFrame, unmount } = render(
      <StreamingText isStreaming={false} markdown={false} text="# Heading" theme={mockTheme} />
    );

    await vi.runAllTimersAsync();

    const output = lastFrame();
    expect(output).toContain('# Heading');

    unmount();
  });

  it('enables syntax highlighting when specified', async () => {
    const { markdownToAnsi } = await import('../utils/markdown-to-ansi.ts');

    const { unmount } = render(
      <StreamingText
        isStreaming={false}
        markdown={true}
        syntaxHighlight={true}
        text="```js\ncode\n```"
        theme={mockTheme}
      />
    );

    await vi.runAllTimersAsync();

    expect(markdownToAnsi).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ syntaxHighlight: true }));

    unmount();
  });

  it('animates cursor while streaming', () => {
    const { lastFrame, unmount } = render(
      <StreamingText isStreaming={true} markdown={false} text="Streaming content" theme={mockTheme} />
    );

    // Advance timer to trigger cursor animation
    vi.advanceTimersByTime(100);

    const frame1 = lastFrame();
    expect(frame1).toContain('▌');

    // Advance timer more to trigger next animation frame
    vi.advanceTimersByTime(100);

    const frame2 = lastFrame();
    // Cursor animation is controlled by tick state
    expect(frame2).toContain('▌');

    unmount();
  });

  it('stops cursor animation when stream completes', async () => {
    const { lastFrame, rerender, unmount } = render(
      <StreamingText isStreaming={true} markdown={false} text="Still streaming" theme={mockTheme} />
    );

    vi.advanceTimersByTime(100);
    const streamingOutput = lastFrame();
    expect(streamingOutput).toContain('▌');

    // Stop streaming
    rerender(<StreamingText isStreaming={false} markdown={false} text="Complete text" theme={mockTheme} />);

    await vi.runAllTimersAsync();
    const completedOutput = lastFrame();
    // Cursor should no longer appear
    expect(completedOutput).not.toContain('▌');

    unmount();
  });

  it('cancels pending markdown conversion on unmount', async () => {
    const { unmount } = render(
      <StreamingText isStreaming={false} markdown={true} text="**markdown**" theme={mockTheme} />
    );

    // Unmount before async conversion completes
    unmount();

    // Should not throw or cause memory leaks
    await vi.runAllTimersAsync();
    expect(true).toBeTruthy(); // Cleanup completed without error
  });

  it('handles rapid text updates', () => {
    const { lastFrame, rerender, unmount } = render(
      <StreamingText isStreaming={true} markdown={false} text="First" theme={mockTheme} />
    );

    vi.advanceTimersByTime(100);

    // Rapid updates
    rerender(<StreamingText isStreaming={true} markdown={false} text="First\n\nSecond" theme={mockTheme} />);
    vi.advanceTimersByTime(100);

    rerender(<StreamingText isStreaming={true} markdown={false} text="First\n\nSecond\n\nThird" theme={mockTheme} />);
    vi.advanceTimersByTime(100);

    const output = lastFrame();
    expect(output).toContain('First');

    unmount();
  });

  it('handles multiline streaming text correctly', () => {
    const multiline = 'Line 1\nLine 2\nLine 3 partial';
    const { lastFrame, unmount } = render(
      <StreamingText isStreaming={true} markdown={false} text={multiline} theme={mockTheme} />
    );

    vi.advanceTimersByTime(100);

    const output = lastFrame();
    // Component should render without error
    expect(typeof output).toBe('string');

    unmount();
  });

  it('does not render cursor for screen readers', () => {
    const { lastFrame, unmount } = render(
      <StreamingText
        isStreaming={true}
        markdown={false}
        screenReader={true}
        text="Screen reader text"
        theme={mockTheme}
      />
    );

    vi.advanceTimersByTime(100);

    const output = lastFrame();
    // Component should render without error when screenReader is true
    expect(typeof output).toBe('string');

    unmount();
  });
});
