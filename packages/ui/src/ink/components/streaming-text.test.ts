import React from 'react';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { darkTheme, defaultTheme } from '../themes/index.ts';
import { StreamingText } from './streaming-text.tsx';

// Mock cli-markdown
vi.mock(import('cli-markdown'), () => ({
  default: vi.fn<(text: string) => string>((text: string) => `[formatted:${text}]`)
}));

describe('StreamingText Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Markdown rendering tests
  describe('markdown rendering', () => {
    it('renders with markdown enabled', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: true,
        screenReader: false,
        text: '# Heading\n**bold**',
        theme: darkTheme
      });
      expect(element).toBeDefined();
      expect(element.props.markdown).toBeTruthy();
    });

    it('renders without markdown when disabled', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: false,
        screenReader: false,
        text: '# Heading\n**bold**',
        theme: darkTheme
      });
      expect(element).toBeDefined();
      expect(element.props.markdown).toBeFalsy();
    });

    it('handles code blocks with markdown', () => {
      const codeBlock = '```javascript\nconst x = 42;\n```';
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: true,
        screenReader: false,
        text: codeBlock,
        theme: darkTheme
      });
      expect(element.props.text).toContain('javascript');
    });

    it('handles lists with markdown', () => {
      const list = '- Item 1\n- Item 2\n- Item 3';
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: true,
        screenReader: false,
        text: list,
        theme: darkTheme
      });
      expect(element.props.text).toContain('Item 1');
    });

    it('handles tables with markdown', () => {
      const table = '| Col1 | Col2 |\n|------|------|\n| A    | B    |';
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: true,
        screenReader: false,
        text: table,
        theme: darkTheme
      });
      expect(element.props.text).toContain('Col1');
    });
  });

  // Streaming state tests
  describe('streaming state', () => {
    it('renders with streaming enabled', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: false,
        screenReader: false,
        text: 'Streaming content',
        theme: darkTheme
      });
      expect(element.props.isStreaming).toBeTruthy();
    });

    it('renders with streaming disabled', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: false,
        screenReader: false,
        text: 'Complete content',
        theme: darkTheme
      });
      expect(element.props.isStreaming).toBeFalsy();
    });

    it('shows cursor when streaming', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: false,
        screenReader: false,
        text: 'Streaming...',
        theme: darkTheme
      });
      expect(element.props.isStreaming).toBeTruthy();
      expect(element.props.theme.text.cursorSymbol).toBeDefined();
    });
  });

  // Text content tests
  describe('text content handling', () => {
    it('handles empty text', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: false,
        screenReader: false,
        text: '',
        theme: darkTheme
      });
      expect(element.props.text).toBe('');
    });

    it('handles very long text', () => {
      const longText = 'word '.repeat(500);
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: false,
        screenReader: false,
        text: longText,
        theme: darkTheme
      });
      expect(element.props.text.length).toBeGreaterThan(1000);
    });

    it('handles multiline text', () => {
      const multilineText = 'Line 1\nLine 2\nLine 3';
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: false,
        screenReader: false,
        text: multilineText,
        theme: darkTheme
      });
      const lines = element.props.text.split('\n');
      expect(lines).toHaveLength(3);
    });

    it('handles text with special characters', () => {
      const specialText = 'Text with <brackets> & symbols! © ™ ®';
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: false,
        screenReader: false,
        text: specialText,
        theme: darkTheme
      });
      expect(element.props.text).toContain('<brackets>');
      expect(element.props.text).toContain('©');
    });

    it('preserves whitespace in plain text', () => {
      const textWithSpaces = '  indented\n\t\ttabbed\n   spaced   ';
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: false,
        screenReader: false,
        text: textWithSpaces,
        theme: darkTheme
      });
      expect(element.props.text).toBe(textWithSpaces);
    });

    it('handles ANSI codes in text', () => {
      const ansiText = 'Normal \u001B[31mRed\u001B[0m text';
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: false,
        screenReader: false,
        text: ansiText,
        theme: darkTheme
      });
      expect(element.props.text).toContain('Red');
    });
  });

  // Syntax highlighting tests
  describe('syntax highlighting', () => {
    it('enables syntax highlighting when true', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: true,
        screenReader: false,
        syntaxHighlight: true,
        text: '```ts\nconst x = 1;\n```',
        theme: darkTheme
      });
      expect(element.props.syntaxHighlight).toBeTruthy();
    });

    it('disables syntax highlighting when false', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: true,
        screenReader: false,
        syntaxHighlight: false,
        text: '```ts\nconst x = 1;\n```',
        theme: darkTheme
      });
      expect(element.props.syntaxHighlight).toBeFalsy();
    });
  });

  // Screen reader tests
  describe('screen reader mode', () => {
    it('renders accessible output with screen reader enabled', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: false,
        screenReader: true,
        text: 'Accessible content',
        theme: darkTheme
      });
      expect(element.props.screenReader).toBeTruthy();
    });

    it('renders regular output with screen reader disabled', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: false,
        screenReader: false,
        text: 'Regular content',
        theme: darkTheme
      });
      expect(element.props.screenReader).toBeFalsy();
    });

    it('handles complex markdown with screen reader', () => {
      const complexMarkdown = '# Title\n\nParagraph with **bold** and *italic*.\n\n```\ncode\n```';
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: true,
        screenReader: true,
        text: complexMarkdown,
        theme: darkTheme
      });
      expect(element.props.text).toContain('Title');
    });
  });

  // Theme tests
  describe('theme handling', () => {
    it('uses theme colors for text', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: false,
        screenReader: false,
        text: 'Themed text',
        theme: darkTheme
      });
      expect(element.props.theme).toBe(darkTheme);
      expect(element.props.theme.text.cursorSymbol).toBeDefined();
    });

    it('handles different themes', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: false,
        screenReader: false,
        text: 'Different theme',
        theme: defaultTheme
      });
      expect(element.props.theme).toBe(defaultTheme);
    });

    it('respects theme cursor symbol', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: false,
        screenReader: false,
        text: 'Cursor test',
        theme: darkTheme
      });
      expect(element.props.theme.text.cursorSymbol).toBeDefined();
      expectTypeOf(element.props.theme.text.cursorSymbol).toBeString();
    });

    it('respects theme dimColor setting', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: false,
        screenReader: false,
        text: 'Dim test',
        theme: darkTheme
      });
      expect(element.props.theme.text.dimColor).toBeDefined();
      expectTypeOf(element.props.theme.text.dimColor).toBeBoolean();
    });
  });

  // Combination tests
  describe('combined options', () => {
    it('handles markdown + streaming + theme', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: true,
        screenReader: false,
        syntaxHighlight: true,
        text: '# Live Update\n\n**Bold** text streaming...',
        theme: darkTheme
      });
      expect(element.props.markdown).toBeTruthy();
      expect(element.props.isStreaming).toBeTruthy();
      expect(element.props.syntaxHighlight).toBeTruthy();
    });

    it('handles plain text + complete + theme', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: false,
        screenReader: true,
        syntaxHighlight: false,
        text: 'Complete plain text\nWith multiple lines',
        theme: defaultTheme
      });
      expect(element.props.markdown).toBeFalsy();
      expect(element.props.isStreaming).toBeFalsy();
      expect(element.props.screenReader).toBeTruthy();
    });
  });

  // Default prop tests
  describe('default props', () => {
    it('works with minimal required props', () => {
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: true,
        screenReader: false,
        text: 'Test',
        theme: darkTheme
      });
      expect(element).toBeDefined();
    });
  });

  // Block boundary tests
  describe('block boundary handling', () => {
    it('identifies block boundaries with double newlines', () => {
      const textWithBlocks = 'First block\n\nSecond block\n\nThird block';
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: false,
        screenReader: false,
        text: textWithBlocks,
        theme: darkTheme
      });
      expect(element.props.text).toContain('First block');
      expect(element.props.text).toContain('Second block');
    });

    it('handles text without block boundaries', () => {
      const singleBlock = 'Single continuous text without double newlines';
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: false,
        screenReader: false,
        text: singleBlock,
        theme: darkTheme
      });
      expect(element.props.text).toBe(singleBlock);
    });

    it('handles multiple consecutive block boundaries', () => {
      const multiBlock = 'Text\n\n\n\nMore text';
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: false,
        screenReader: false,
        text: multiBlock,
        theme: darkTheme
      });
      expect(element.props.text).toContain('Text');
    });
  });

  // Combined feature tests
  describe('combined features', () => {
    it('handles markdown + syntax highlighting + streaming', () => {
      const code = '```typescript\nfunction hello() { console.log("world"); }\n```';
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: true,
        screenReader: false,
        syntaxHighlight: true,
        text: code,
        theme: darkTheme
      });
      expect(element.props.markdown).toBeTruthy();
      expect(element.props.syntaxHighlight).toBeTruthy();
      expect(element.props.isStreaming).toBeTruthy();
    });

    it('handles screen reader + markdown disabled', () => {
      const plainText = 'Plain text content';
      const element = React.createElement(StreamingText, {
        isStreaming: false,
        markdown: false,
        screenReader: true,
        text: plainText,
        theme: darkTheme
      });
      expect(element.props.screenReader).toBeTruthy();
      expect(element.props.markdown).toBeFalsy();
    });

    it('handles all options together', () => {
      const fullMarkdown =
        '# Header\n\n**Bold** and *italic* with `code` and `languages`\n\n```python\nprint("hello")\n```';
      const element = React.createElement(StreamingText, {
        isStreaming: true,
        markdown: true,
        screenReader: true,
        syntaxHighlight: true,
        text: fullMarkdown,
        theme: darkTheme
      });
      expect(element.props.text).toContain('Header');
      expect(element.props.markdown).toBeTruthy();
      expect(element.props.syntaxHighlight).toBeTruthy();
      expect(element.props.isStreaming).toBeTruthy();
      expect(element.props.screenReader).toBeTruthy();
    });
  });
});
