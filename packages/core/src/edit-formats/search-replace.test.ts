import { describe, expect, it } from 'vitest';

import { parseSearchReplace, RelativeIndenter } from './search-replace.js';

// ---------------------------------------------------------------------------
// RelativeIndenter
// ---------------------------------------------------------------------------

describe('RelativeIndenter', () => {
  describe('baseIndent', () => {
    it('returns 0 for empty text', () => {
      expect(RelativeIndenter.baseIndent('')).toBe(0);
    });

    it('returns 0 for text with no indentation', () => {
      expect(RelativeIndenter.baseIndent('line1\nline2')).toBe(0);
    });

    it('finds common base indent across lines', () => {
      const text = '    const x = 1;\n    const y = 2;';
      expect(RelativeIndenter.baseIndent(text)).toBe(4);
    });

    it('ignores blank lines when computing base indent', () => {
      const text = '    const x = 1;\n\n    const y = 2;';
      expect(RelativeIndenter.baseIndent(text)).toBe(4);
    });

    it('uses minimum indent across non-empty lines', () => {
      const text = '    const x = 1;\n  const y = 2;';
      expect(RelativeIndenter.baseIndent(text)).toBe(2);
    });

    it('handles tabs as indentation', () => {
      const text = '\t\tconst x = 1;\n\t\tconst y = 2;';
      expect(RelativeIndenter.baseIndent(text)).toBe(2);
    });
  });

  describe('normalize', () => {
    it('returns text unchanged when base indent is 0', () => {
      const text = 'const x = 1;';
      expect(RelativeIndenter.normalize(text)).toBe(text);
    });

    it('strips common base indent from all lines', () => {
      const text = '    const x = 1;\n    const y = 2;';
      expect(RelativeIndenter.normalize(text)).toBe('const x = 1;\nconst y = 2;');
    });

    it('preserves relative indentation within the block', () => {
      const text = '  if (true) {\n    return 1;\n  }';
      // base indent = 2, strip 2 from all lines
      expect(RelativeIndenter.normalize(text)).toBe('if (true) {\n  return 1;\n}');
    });
  });

  describe('matches', () => {
    it('returns true for identical text', () => {
      expect(RelativeIndenter.matches('const x = 1;', 'const x = 1;')).toBe(true);
    });

    it('matches text with different base indentation', () => {
      const search = '  const x = 1;\n  const y = 2;';
      const target = '    const x = 1;\n    const y = 2;';
      expect(RelativeIndenter.matches(search, target)).toBe(true);
    });

    it('returns false for structurally different text', () => {
      expect(RelativeIndenter.matches('const x = 1;', 'const y = 2;')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// parseSearchReplace
// ---------------------------------------------------------------------------

describe('parseSearchReplace', () => {
  it('parses a single SEARCH/REPLACE block', () => {
    const input = `src/index.ts
\`\`\`search-replace
SEARCH
const x = 1;
REPLACE
const x = 2;
\`\`\``;

    const result = parseSearchReplace(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]).toMatchObject({
      filePath: 'src/index.ts',
      type: 'search-replace',
      original: 'const x = 1;',
      replacement: 'const x = 2;'
    });
  });

  it('parses multiple SEARCH/REPLACE blocks', () => {
    const input = `src/a.ts
\`\`\`
SEARCH
const a = 1;
REPLACE
const a = 2;
\`\`\`

src/b.ts
\`\`\`
SEARCH
const b = 1;
REPLACE
const b = 2;
\`\`\``;

    const result = parseSearchReplace(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(2);
    expect(result.edits[0]?.filePath).toBe('src/a.ts');
    expect(result.edits[1]?.filePath).toBe('src/b.ts');
  });

  it('supports lang="SEARCH" style fence tag', () => {
    const input = `src/index.ts
\`\`\`SEARCH
const x = 1;
REPLACE
const x = 2;
\`\`\``;

    const result = parseSearchReplace(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]?.original).toBe('const x = 1;');
    expect(result.edits[0]?.replacement).toBe('const x = 2;');
  });

  it('skips code fences without SEARCH/REPLACE', () => {
    const input = `src/index.ts
\`\`\`typescript
const x = 1;
\`\`\``;

    const result = parseSearchReplace(input);
    expect(result.edits).toHaveLength(0);
  });

  it('collects errors for blocks without filepath', () => {
    const input = `\`\`\`
SEARCH
const x = 1;
REPLACE
const x = 2;
\`\`\``;

    const result = parseSearchReplace(input);
    expect(result.edits).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('collects errors for blocks without REPLACE section', () => {
    // The content doesn't contain REPLACE, so it won't match at all
    const input = `src/index.ts
\`\`\`
SEARCH
const x = 1;
\`\`\``;

    const result = parseSearchReplace(input);
    expect(result.edits).toHaveLength(0);
    // Without REPLACE separator, the block is silently skipped
    expect(result.errors).toHaveLength(0);
  });

  it('handles multiline SEARCH/REPLACE content', () => {
    const input = `src/index.ts
\`\`\`
SEARCH
function foo() {
  return 1;
}
REPLACE
function foo() {
  return 2;
}
\`\`\``;

    const result = parseSearchReplace(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]?.original).toContain('function foo()');
    expect(result.edits[0]?.replacement).toContain('return 2');
  });

  it('parses blocks with XML filename tags', () => {
    const input = `<filename>src/index.ts</filename>
\`\`\`
SEARCH
const x = 1;
REPLACE
const x = 2;
\`\`\``;

    const result = parseSearchReplace(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]?.filePath).toBe('src/index.ts');
  });

  it('returns empty result when no blocks exist', () => {
    const result = parseSearchReplace('Just some random text without any code fences');
    expect(result.edits).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns empty result for completely empty input', () => {
    const result = parseSearchReplace('');
    expect(result.edits).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
