import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { darkTheme, defaultTheme } from '../themes/index.js';
import { ThinkingBlock } from './thinking-block.tsx';

// Mock Ink render to avoid terminal setup in test environment
vi.mock('ink', () => ({
  render: vi.fn(() => ({
    clear: vi.fn(),
    lastFrame: () => '',
    rerender: vi.fn(),
    unmount: vi.fn()
  }))
}));

describe('ThinkingBlock Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Blockquote style tests
  describe('blockquote style', () => {
    it('renders blockquote thinking when streaming', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        screenReader: false,
        style: 'blockquote',
        text: 'Analyzing the problem',
        theme: darkTheme
      });
      expect(element).toBeDefined();
      expect(element.props.text).toBe('Analyzing the problem');
    });

    it('renders blockquote thinking when not streaming', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        screenReader: false,
        style: 'blockquote',
        text: 'Analysis complete',
        theme: darkTheme
      });
      expect(element).toBeDefined();
      expect(element.props.isStreaming).toBeFalsy();
    });

    it('uses theme colors for blockquote border', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        screenReader: false,
        style: 'blockquote',
        text: 'Testing colors',
        theme: darkTheme
      });
      expect(element.props.theme.thinking).toBeDefined();
      expect(element.props.theme.thinking.borderColor).toBeDefined();
    });
  });

  // Inline style tests
  describe('inline style', () => {
    it('renders inline thinking when streaming', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        screenReader: false,
        style: 'inline',
        text: 'Quick thought',
        theme: darkTheme
      });
      expect(element).toBeDefined();
      expect(element.props.style).toBe('inline');
    });

    it('renders inline thinking when not streaming', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        screenReader: false,
        style: 'inline',
        text: 'Thought complete',
        theme: darkTheme
      });
      expect(element).toBeDefined();
      expect(element.props.isStreaming).toBeFalsy();
    });
  });

  // Suppress style tests
  describe('suppress style', () => {
    it('renders suppressed (null) thinking', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        screenReader: false,
        style: 'suppress',
        text: 'Hidden thought',
        theme: darkTheme
      });
      expect(element).toBeDefined();
      expect(element.props.style).toBe('suppress');
    });

    it('renders nothing for suppress style regardless of content', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        screenReader: false,
        style: 'suppress',
        text: 'x'.repeat(1000),
        theme: darkTheme
      });
      expect(element).toBeDefined();
    });
  });

  // Screen reader tests
  describe('screen reader mode', () => {
    it('renders screen reader version for blockquote with SR enabled', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        screenReader: true,
        style: 'blockquote',
        text: 'Accessible thinking',
        theme: darkTheme
      });
      expect(element).toBeDefined();
      expect(element.props.screenReader).toBeTruthy();
    });

    it('renders screen reader version for inline with SR enabled', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        screenReader: true,
        style: 'inline',
        text: 'Inline accessible',
        theme: darkTheme
      });
      expect(element).toBeDefined();
      expect(element.props.screenReader).toBeTruthy();
    });

    it('does not render screen reader for suppress style even with SR enabled', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        screenReader: true,
        style: 'suppress',
        text: 'Still hidden',
        theme: darkTheme
      });
      expect(element).toBeDefined();
    });
  });

  // Text content tests
  describe('text content handling', () => {
    it('handles empty thinking text', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        screenReader: false,
        style: 'blockquote',
        text: '',
        theme: darkTheme
      });
      expect(element.props.text).toBe('');
    });

    it('handles very long thinking text', () => {
      const longText = 'x'.repeat(1000);
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        screenReader: false,
        style: 'inline',
        text: longText,
        theme: darkTheme
      });
      expect(element.props.text).toHaveLength(1000);
    });

    it('preserves text with special characters', () => {
      const specialText = 'Thinking: [1] Why? (Because!) & what...';
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        screenReader: false,
        style: 'inline',
        text: specialText,
        theme: darkTheme
      });
      expect(element.props.text).toBe(specialText);
    });

    it('handles multiline thinking text', () => {
      const multilineText = 'Line 1\nLine 2\nLine 3';
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        screenReader: false,
        style: 'blockquote',
        text: multilineText,
        theme: darkTheme
      });
      expect(element.props.text).toContain('Line 1');
      expect(element.props.text).toContain('Line 2');
    });
  });

  // Theme tests
  describe('theme handling', () => {
    it('respects theme colors for blockquote', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        screenReader: false,
        style: 'blockquote',
        text: 'Themed',
        theme: darkTheme
      });
      expect(element.props.theme.thinking.borderColor).toBe(darkTheme.thinking.borderColor);
      expect(element.props.theme.thinking.spinnerColor).toBe(darkTheme.thinking.spinnerColor);
    });

    it('respects theme colors for inline', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        screenReader: false,
        style: 'inline',
        text: 'Inline themed',
        theme: defaultTheme
      });
      expect(element.props.theme).toBe(defaultTheme);
    });

    it('uses theme spinner interval when defined', () => {
      const customTheme = {
        ...darkTheme,
        thinking: { ...darkTheme.thinking, spinnerIntervalMs: 120 }
      };
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        screenReader: false,
        style: 'blockquote',
        text: 'Animated',
        theme: customTheme
      });
      expect(element.props.theme.thinking.spinnerIntervalMs).toBe(120);
    });
  });

  // Streaming state tests
  describe('streaming state', () => {
    it('renders different output when streaming vs not streaming', () => {
      const streamingElement = React.createElement(ThinkingBlock, {
        isStreaming: true,
        screenReader: false,
        style: 'blockquote',
        text: 'Processing',
        theme: darkTheme
      });

      const completeElement = React.createElement(ThinkingBlock, {
        isStreaming: false,
        screenReader: false,
        style: 'blockquote',
        text: 'Complete result',
        theme: darkTheme
      });

      expect(streamingElement.props.isStreaming).toBeTruthy();
      expect(completeElement.props.isStreaming).toBeFalsy();
    });
  });

  // Default prop tests
  describe('default props', () => {
    it('has screenReader default to false', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        style: 'blockquote',
        text: 'Test',
        theme: darkTheme
      } as React.ComponentProps<typeof ThinkingBlock>);
      expect(element).toBeDefined();
    });

    it('renders with inline style', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        style: 'inline',
        text: 'Inline thoughts',
        theme: darkTheme
      } as React.ComponentProps<typeof ThinkingBlock>);
      expect(element.props.style).toBe('inline');
    });

    it('renders with suppress style', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        style: 'suppress',
        text: 'Hidden thoughts',
        theme: darkTheme
      } as React.ComponentProps<typeof ThinkingBlock>);
      expect(element.props.style).toBe('suppress');
    });
  });

  describe('thinking content variations', () => {
    it('handles empty thinking text', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        style: 'blockquote',
        text: '',
        theme: darkTheme
      } as React.ComponentProps<typeof ThinkingBlock>);
      expect(element.props.text).toBe('');
    });

    it('handles long thinking text', () => {
      const longThinking = 'Thought '.repeat(100);
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        style: 'blockquote',
        text: longThinking,
        theme: darkTheme
      } as React.ComponentProps<typeof ThinkingBlock>);
      expect(element.props.text.length).toBeGreaterThan(500);
    });

    it('handles multiline thinking', () => {
      const multilineThinking = 'First thought\nSecond thought\nThird thought';
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        style: 'blockquote',
        text: multilineThinking,
        theme: darkTheme
      } as React.ComponentProps<typeof ThinkingBlock>);
      expect(element.props.text).toContain('First thought');
      expect(element.props.text).toContain('Second thought');
    });
  });

  describe('theme application', () => {
    it('applies dark theme colors', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        style: 'blockquote',
        text: 'Themed thought',
        theme: darkTheme
      } as React.ComponentProps<typeof ThinkingBlock>);
      expect(element.props.theme).toBe(darkTheme);
    });

    it('applies default theme colors', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        style: 'blockquote',
        text: 'Themed thought',
        theme: defaultTheme
      } as React.ComponentProps<typeof ThinkingBlock>);
      expect(element.props.theme).toBe(defaultTheme);
    });
  });

  describe('streaming behavior', () => {
    it('renders while streaming', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: true,
        style: 'blockquote',
        text: 'Streaming thought...',
        theme: darkTheme
      } as React.ComponentProps<typeof ThinkingBlock>);
      expect(element.props.isStreaming).toBeTruthy();
    });

    it('renders complete thinking', () => {
      const element = React.createElement(ThinkingBlock, {
        isStreaming: false,
        style: 'blockquote',
        text: 'Completed thought',
        theme: darkTheme
      } as React.ComponentProps<typeof ThinkingBlock>);
      expect(element.props.isStreaming).toBeFalsy();
    });
  });
});
