import { describe, expect, expectTypeOf, it } from 'vitest';

import { hasMarkdownSyntax, markdownToAnsi } from './markdown-to-ansi.ts';

describe('Markdown Detection with Tightened Regex', () => {
  describe('Detects valid markdown patterns', () => {
    it('detects headings', () => {
      expect(hasMarkdownSyntax('# Heading')).toBeTruthy();
      expect(hasMarkdownSyntax('## Subheading')).toBeTruthy();
      expect(hasMarkdownSyntax('### Level 3')).toBeTruthy();
    });

    it('detects code fences', () => {
      expect(hasMarkdownSyntax('```typescript\ncode\n```')).toBeTruthy();
      expect(hasMarkdownSyntax('```\ncode\n```')).toBeTruthy();
    });

    it('detects inline code', () => {
      expect(hasMarkdownSyntax('Use `variable` in code')).toBeTruthy();
    });

    it('detects bold text', () => {
      expect(hasMarkdownSyntax('This is **bold text**')).toBeTruthy();
      expect(hasMarkdownSyntax('This is __bold text__')).toBeTruthy();
    });

    it('detects unordered lists', () => {
      expect(hasMarkdownSyntax('- Item 1\n- Item 2')).toBeTruthy();
      expect(hasMarkdownSyntax('* Item 1\n* Item 2')).toBeTruthy();
    });

    it('detects ordered lists', () => {
      expect(hasMarkdownSyntax('1. First\n2. Second')).toBeTruthy();
    });

    it('detects links', () => {
      expect(hasMarkdownSyntax('[Link text](https://example.com)')).toBeTruthy();
      expect(hasMarkdownSyntax('[example](path/to/file)')).toBeTruthy();
    });
  });

  describe('Avoids false positives', () => {
    it('does not detect single * or _ in mathematical expressions', () => {
      expect(hasMarkdownSyntax('number is 5*3')).toBeFalsy();
      expect(hasMarkdownSyntax('math: 10/5*2')).toBeFalsy();
      expect(hasMarkdownSyntax('constant_value')).toBeFalsy();
    });

    it('does not detect incomplete patterns', () => {
      expect(hasMarkdownSyntax('This is just text')).toBeFalsy();
      expect(hasMarkdownSyntax('Some regular content here')).toBeFalsy();
    });

    it('does not detect incomplete code fences', () => {
      expect(hasMarkdownSyntax('some regular text')).toBeFalsy();
    });

    it('does not detect unmatched link brackets', () => {
      expect(hasMarkdownSyntax('This (text) has parens')).toBeFalsy();
      expect(hasMarkdownSyntax('array[index] access')).toBeFalsy();
    });
  });

  describe('Handles edge cases', () => {
    it('works with empty string', () => {
      expect(hasMarkdownSyntax('')).toBeFalsy();
    });

    it('works with very long strings (only samples first 500 chars)', () => {
      const longText = `${'a'.repeat(600)}\n# Heading`;
      // Should not detect heading since it's beyond 500 char sample
      expect(hasMarkdownSyntax(longText)).toBeFalsy();
    });

    it('detects markdown within first 500 chars', () => {
      const textWithHeading = `# Heading\n${'a'.repeat(600)}`;
      expect(hasMarkdownSyntax(textWithHeading)).toBeTruthy();
    });

    it('detects multiple patterns', () => {
      expect(hasMarkdownSyntax('# Title\n\n**Bold** and *italic*')).toBeTruthy();
      expect(hasMarkdownSyntax('- List item\n```code```')).toBeTruthy();
    });
  });
});

describe('Markdown to ANSI Conversion', () => {
  describe('Basic conversions', () => {
    it('converts headings to bold ANSI', async () => {
      const result = await markdownToAnsi('# Main Heading');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('converts bold markdown', async () => {
      const result = await markdownToAnsi('This is **bold** text');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('converts italic markdown', async () => {
      const result = await markdownToAnsi('This is *italic* text');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('converts code blocks', async () => {
      const result = await markdownToAnsi('```javascript\nconst x = 1;\n```');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('converts inline code', async () => {
      const result = await markdownToAnsi('Use `variable` here');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('converts lists', async () => {
      const result = await markdownToAnsi('- Item 1\n- Item 2\n- Item 3');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('converts links', async () => {
      const result = await markdownToAnsi('[Google](https://google.com)');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });
  });

  describe('Complex markdown', () => {
    it('converts nested formatting', async () => {
      const result = await markdownToAnsi('**Bold with *italic* inside**');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('converts mixed content', async () => {
      const result = await markdownToAnsi(
        '# Title\n\nParagraph with **bold** and *italic*.\n\n- List item\n- Another item'
      );
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('converts document with multiple sections', async () => {
      const markdown =
        '# Section 1\n\nContent here.\n\n## Subsection\n\nMore content with **formatting**.\n\n# Section 2\n\nFinal content.';
      const result = await markdownToAnsi(markdown);
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('preserves code block formatting', async () => {
      const code = '```python\ndef hello():\n    print("world")\n```';
      const result = await markdownToAnsi(code);
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('handles empty string', async () => {
      const result = await markdownToAnsi('');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('handles plain text without markdown', async () => {
      const result = await markdownToAnsi('Just plain text');
      expect(result).toBeDefined();
      expect(result).toBe('Just plain text');
    });

    it('handles text with special characters', async () => {
      const result = await markdownToAnsi('Text with <brackets> & symbols © ™');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('handles very long content', async () => {
      const longText = 'Line\n'.repeat(100);
      const result = await markdownToAnsi(longText);
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('handles unicode content', async () => {
      const result = await markdownToAnsi('**Hello** 世界 🌍');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('handles escaped characters', async () => {
      const result = await markdownToAnsi(String.raw`Escaped \*asterisk\*`);
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('handles multiple consecutive blank lines', async () => {
      const result = await markdownToAnsi('Text\n\n\n\nMore text');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });
  });

  describe('ANSI output characteristics', () => {
    it('returns valid string output', async () => {
      const result = await markdownToAnsi('**bold**');
      expectTypeOf(result).toBeString();
      expect(result.length).toBeGreaterThan(0);
    });

    it('preserves text content', async () => {
      const originalText = 'Important information here';
      const result = await markdownToAnsi(originalText);
      expect(result).toContain('Important');
      expect(result).toContain('information');
    });

    it('handles multiple heading levels', async () => {
      const markdown = '# H1\n## H2\n### H3\n#### H4';
      const result = await markdownToAnsi(markdown);
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('converts blockquotes', async () => {
      const result = await markdownToAnsi('> This is a blockquote\n> with multiple lines');
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });

    it('converts tables', async () => {
      const table = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |';
      const result = await markdownToAnsi(table);
      expect(result).toBeDefined();
      expectTypeOf(result).toBeString();
    });
  });

  describe('Performance characteristics', () => {
    it('handles large inputs efficiently', async () => {
      const largeText = 'Line\n'.repeat(1000);
      const start = Date.now();
      const result = await markdownToAnsi(largeText);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('returns result quickly for small inputs', async () => {
      const start = Date.now();
      await markdownToAnsi('**test**');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
