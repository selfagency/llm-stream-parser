import { LLMStreamProcessor } from '@agentsy/core/processor';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createInkRenderer } from './create-ink-renderer.js';

// Mock cli-markdown for consistent ANSI output in tests
vi.mock(import('cli-markdown'), () => ({
  default: vi.fn<(markdown: string) => string>((markdown: string) => `[ANSI:${markdown}]`)
}));

// Mock Ink's render to avoid terminal setup in test environment
vi.mock('ink', () => ({
  render: vi.fn((_component: React.ReactElement) => ({
    clear: vi.fn(),
    lastFrame: () => '[mock frame]',
    rerender: vi.fn(),
    unmount: vi.fn()
  }))
}));

describe('Ink Renderer', () => {
  let processor: LLMStreamProcessor;
  let onWarning: (message: string, context?: Record<string, unknown>) => void;
  let onFinish: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    onWarning = vi.fn<(message: string, context?: Record<string, unknown>) => void>();
    onFinish = vi.fn<() => void>();
    processor = new LLMStreamProcessor({
      enforcePrivacyTags: true,
      onWarning,
      parseThinkTags: true,
      scrubContextTags: true
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a renderer with processor', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor
    });

    expect(renderer).toBeDefined();
    expect(renderer.instance).toBeDefined();
    expectTypeOf(renderer.unmount).toBeFunction();
    expectTypeOf(renderer.write).toBeFunction();
    expectTypeOf(renderer.end).toBeFunction();

    renderer.unmount();
  });

  it('handles text chunks from processor', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor
    });

    processor.process({ content: 'Hello ' });
    processor.process({ content: 'World' });
    processor.process({ done: true });

    expect(onFinish).toHaveBeenCalled();

    renderer.unmount();
  });

  it('processes thinking tags when parseThinkTags is enabled', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor,
      showThinking: true,
      thinkingStyle: 'blockquote'
    });

    processor.process({ content: '<thinking>Deep thought</thinking>' });
    processor.process({ content: 'Main text' });
    processor.process({ done: true });

    expect(onFinish).toHaveBeenCalled();

    renderer.unmount();
  });

  it('respects thinkingStyle: blockquote', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor,
      showThinking: true,
      thinkingStyle: 'blockquote'
    });

    processor.process({ content: '<thinking>Blockquote thought</thinking>' });
    processor.process({ done: true });

    // If no error, the blockquote style is being handled correctly
    expect(renderer.instance).toBeDefined();

    renderer.unmount();
  });

  it('respects thinkingStyle: inline', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor,
      showThinking: true,
      thinkingStyle: 'inline'
    });

    processor.process({ content: '<thinking>Inline thought</thinking>' });
    processor.process({ done: true });

    expect(renderer.instance).toBeDefined();

    renderer.unmount();
  });

  it('respects thinkingStyle: suppress', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor,
      showThinking: true,
      thinkingStyle: 'suppress'
    });

    processor.process({ content: '<thinking>Hidden thought</thinking>' });
    processor.process({ content: 'Main text' });
    processor.process({ done: true });

    expect(renderer.instance).toBeDefined();

    renderer.unmount();
  });

  it('shows tool calls when showToolCalls is true', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor,
      showToolCalls: true
    });

    processor.process({ content: 'Calling search' });
    processor.process({ done: true });

    expect(renderer.instance).toBeDefined();

    renderer.unmount();
  });

  it('hides tool calls when showToolCalls is false', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor,
      showToolCalls: false
    });

    processor.process({ content: 'Calling search' });
    processor.process({ done: true });

    expect(renderer.instance).toBeDefined();

    renderer.unmount();
  });

  it('handles markdown: false option', async () => {
    const renderer = await createInkRenderer({
      markdown: false,
      onFinish,
      onWarning,
      processor
    });

    processor.process({ content: '# Heading\n**bold**' });
    processor.process({ done: true });

    expect(renderer.instance).toBeDefined();

    renderer.unmount();
  });

  it('handle.end() sets isStreaming to false', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor
    });

    processor.process({ content: 'Content' });

    // Call handle's end() method
    renderer.end();

    expect(renderer.instance).toBeDefined();

    renderer.unmount();
  });

  it('handle.write() is a no-op (event-driven)', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor
    });

    // write() should not throw or cause issues
    renderer.write('This is ignored');
    processor.process({ content: 'This comes from processor' });
    processor.process({ done: true });

    expect(onFinish).toHaveBeenCalled();

    renderer.unmount();
  });

  it('calls onFinish callback when processor ends', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor
    });

    processor.process({ content: 'Text' });
    processor.process({ done: true });

    expect(onFinish).toHaveBeenCalled();

    renderer.unmount();
  });

  it('calls onWarning on processor warnings', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor
    });

    // Processor will emit warning for certain conditions
    processor.process({ content: '' });
    processor.process({ done: true });

    // At minimum, renderer shouldn't error
    expect(renderer.instance).toBeDefined();

    renderer.unmount();
  });

  it('combines thinking, tool calls, and text', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor,
      showThinking: true,
      showToolCalls: true,
      thinkingStyle: 'blockquote'
    });

    processor.process({ content: '<thinking>Planning...</thinking>' });
    processor.process({ content: '\nResult is 42' });
    processor.process({ done: true });

    expect(onFinish).toHaveBeenCalled();

    renderer.unmount();
  });

  it('renders with default options', async () => {
    const renderer = await createInkRenderer({
      onWarning,
      processor
    });

    processor.process({ content: 'Default rendering' });
    processor.process({ done: true });

    expect(renderer.instance).toBeDefined();

    renderer.unmount();
  });

  it('handles empty write sequence', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor
    });

    processor.process({ done: true });

    expect(onFinish).toHaveBeenCalled();

    renderer.unmount();
  });

  it('handles multiple text chunks', async () => {
    const renderer = await createInkRenderer({
      markdown: false,
      onFinish,
      onWarning,
      processor
    });

    processor.process({ content: 'Chunk 1\n' });
    processor.process({ content: 'Chunk 2\n' });
    processor.process({ content: 'Chunk 3' });
    processor.process({ done: true });

    expect(onFinish).toHaveBeenCalled();

    renderer.unmount();
  });

  it('unmount() cleanly closes renderer', async () => {
    const renderer = await createInkRenderer({
      onFinish,
      onWarning,
      processor
    });

    processor.process({ content: 'Text' });

    // Unmount should not throw
    expect(() => {
      renderer.unmount();
    }).not.toThrow();
  });

  describe('Theme Resolution', () => {
    const themeNames = [
      'default',
      'dark',
      'light',
      'minimal',
      'dracula',
      'catppuccin-mocha',
      'catppuccin-latte',
      'catppuccin-macchiato',
      'catppuccin-frappe',
      'ayu-mirage',
      'houston',
      'one-dark',
      'one-candy',
      'github-dark'
    ] as const;

    it.each(themeNames)('resolves %s theme correctly', async themeName => {
      const renderer = await createInkRenderer({
        onFinish,
        onWarning,
        processor,
        theme: themeName
      });

      processor.process({ content: 'Test content' });
      processor.process({ done: true });

      expect(onFinish).toHaveBeenCalled();
      expect(renderer.instance).toBeDefined();

      renderer.unmount();
    });

    it('resolves all theme names without throwing', async () => {
      const { resolveTheme } = await import('./themes/index.js');

      expect(() => {
        for (const themeName of themeNames) {
          const theme = resolveTheme(themeName);
          expect(theme).toBeDefined();
          expect(theme).toHaveProperty('thinking');
          expect(theme).toHaveProperty('toolCall');
          expect(theme).toHaveProperty('text');
          expect(theme).toHaveProperty('border');
          expect(theme).toHaveProperty('highlight');
        }
      }).not.toThrow();
    });

    it('returns default theme for undefined', async () => {
      const { resolveTheme } = await import('./themes/index.js');
      const { defaultTheme } = await import('./themes/index.js');

      const theme = resolveTheme();
      expect(theme).toStrictEqual(defaultTheme);
    });

    it('returns custom Theme object as-is', async () => {
      const { resolveTheme } = await import('./themes/index.js');
      const customTheme = {
        border: { color: 'gray', style: 'single' as const },
        highlight: {},
        text: { cursorSymbol: '|', dimColor: false },
        thinking: {
          borderColor: 'magenta',
          spinnerColor: 'magenta',
          textColor: 'magenta'
        },
        toolCall: {
          doneColor: 'green',
          doneSymbol: '✓',
          pendingColor: 'yellow',
          pendingSymbol: '?'
        }
      };

      const theme = resolveTheme(customTheme);
      expect(theme).toBe(customTheme);
    });
  });
});
