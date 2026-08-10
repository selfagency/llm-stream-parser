import { describe, expect, it } from 'vitest';

import { parseWholeFile } from './whole-file.js';

describe('parseWholeFile', () => {
  it('parses a single file with === header', () => {
    const input = `=== src/index.ts
const x = 1;
export const y = 2;`;

    const result = parseWholeFile(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]).toMatchObject({
      filePath: 'src/index.ts',
      type: 'whole-file',
      replacement: 'const x = 1;\nexport const y = 2;'
    });
  });

  it('parses a single file with --- header', () => {
    const input = `--- src/index.ts
const x = 1;`;

    const result = parseWholeFile(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]?.filePath).toBe('src/index.ts');
    expect(result.edits[0]?.replacement).toBe('const x = 1;');
  });

  it('parses multiple files', () => {
    const input = `=== src/a.ts
content a
=== src/b.ts
content b`;

    const result = parseWholeFile(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(2);
    expect(result.edits[0]?.filePath).toBe('src/a.ts');
    expect(result.edits[0]?.replacement).toBe('content a');
    expect(result.edits[1]?.filePath).toBe('src/b.ts');
    expect(result.edits[1]?.replacement).toBe('content b');
  });

  it('parses XML filename tag format', () => {
    const input = `<filename>src/index.ts</filename>
const x = 1;
export const y = 2;`;

    const result = parseWholeFile(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]?.filePath).toBe('src/index.ts');
    expect(result.edits[0]?.replacement).toBe('const x = 1;\nexport const y = 2;');
  });

  it('parses multiple XML filename blocks', () => {
    const input = `<filename>src/a.ts</filename>
content a

<filename>src/b.ts</filename>
content b`;

    const result = parseWholeFile(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(2);
    expect(result.edits[0]?.filePath).toBe('src/a.ts');
    expect(result.edits[1]?.filePath).toBe('src/b.ts');
  });

  it('ignores content before the first header as preamble', () => {
    const input = `Some preamble text that should be ignored.

=== src/index.ts
actual content`;

    const result = parseWholeFile(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]?.filePath).toBe('src/index.ts');
    expect(result.edits[0]?.replacement).toBe('actual content');
  });

  it('emits an edit with empty content when header has no following content', () => {
    const input = '=== src/index.ts';

    const result = parseWholeFile(input);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]?.replacement).toBe('');
  });

  it('reports error when no edits found', () => {
    const result = parseWholeFile('Just some text without any file markers');
    expect(result.edits).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns empty result for empty input', () => {
    const result = parseWholeFile('');
    expect(result.edits).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('preserves multiline content between headers', () => {
    const input = `=== src/index.ts
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
=== src/utils.ts
export const VERSION = '1.0.0';`;

    const result = parseWholeFile(input);
    expect(result.edits).toHaveLength(2);
    expect(result.edits[0]?.replacement).toContain('function greet');
    expect(result.edits[0]?.replacement).toContain('return `Hello');
    expect(result.edits[1]?.replacement).toContain("'1.0.0'");
  });
});
