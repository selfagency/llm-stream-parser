import { describe, expect, it } from 'vitest';

import { parseUdiffs } from './udiff.js';

describe('parseUdiffs', () => {
  it('parses a simple unified diff with context, add, and delete', () => {
    const input = `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 line one
 line two
+new line
 line three
-line four
 line five
+line six`;

    const result = parseUdiffs(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]?.filePath).toBe('src/index.ts');
    expect(result.edits[0]?.type).toBe('udiff');
    expect(result.edits[0]?.original).toBe(input);
    expect(result.edits[0]?.replacement).toBeTruthy();

    // Verify the serialised hunk data
    const patch = JSON.parse(result.edits[0]?.replacement ?? '[]');
    expect(Array.isArray(patch)).toBe(true);
    expect(patch.length).toBe(1);
    expect(patch[0].oldStart).toBe(1);
    expect(patch[0].newStart).toBe(1);
  });

  it('parses multiple hunks', () => {
    const input = `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 context one
+added after one
 context two
@@ -10,4 +11,4 @@
 before
 context three
-deleted line
+replacement line
 end`;

    const result = parseUdiffs(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);

    const patch = JSON.parse(result.edits[0]?.replacement ?? '[]');
    expect(patch.length).toBe(2);
  });

  it('parses diffs inside ```diff fences', () => {
    const input = `some preamble text

\`\`\`diff
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1,3 @@
 old line
+new line
\`\`\``;

    const result = parseUdiffs(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]?.filePath).toBe('src/index.ts');
  });

  it('parses diffs inside plain ``` fences', () => {
    const input = `\`\`\`
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1,3 @@
 old
+new
\`\`\``;

    const result = parseUdiffs(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);
  });

  it('parses diffs with no leading a/b prefix', () => {
    const input = `--- src/index.ts
+++ src/index.ts
@@ -1,2 +1,2 @@
-old
+new`;

    const result = parseUdiffs(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]?.filePath).toBe('src/index.ts');
  });

  it('collects individual hunk line types correctly', () => {
    const input = `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,4 +1,5 @@
 context
+added
-deleted
 more context
+another addition`;

    const result = parseUdiffs(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);

    const patch = JSON.parse(result.edits[0]?.replacement ?? '[]');
    const lines = patch[0].lines;

    // context line
    expect(lines[0].type).toBe('context');
    expect(lines[0].content).toBe('context');
    // added line
    expect(lines[1].type).toBe('add');
    expect(lines[1].content).toBe('added');
    // deleted line
    expect(lines[2].type).toBe('delete');
    expect(lines[2].content).toBe('deleted');
    // more context
    expect(lines[3].type).toBe('context');
    expect(lines[3].content).toBe('more context');
    // another addition
    expect(lines[4].type).toBe('add');
    expect(lines[4].content).toBe('another addition');
  });

  it('returns empty when input has no diff', () => {
    const result = parseUdiffs('Just regular text without any diff markers');
    expect(result.edits).toHaveLength(0);
    // When no diff markers exist no error is recorded — just no edits
    expect(result.errors).toHaveLength(0);
  });

  it('returns empty for completely empty input', () => {
    const result = parseUdiffs('');
    expect(result.edits).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('handles diffs with multiple files', () => {
    const input = `--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 a old
+a new

--- a/src/b.ts
+++ b/src/b.ts
@@ -1,2 +1,2 @@
-b old
+b new`;

    const result = parseUdiffs(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(2);
    expect(result.edits[0]?.filePath).toBe('src/a.ts');
    expect(result.edits[1]?.filePath).toBe('src/b.ts');
  });

  it('handles \\"No newline at end of file\\" markers', () => {
    const input = `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1,2 @@
 line one
-line two
\\ No newline at end of file
+line two updated`;

    const result = parseUdiffs(input);
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);

    const patch = JSON.parse(result.edits[0]?.replacement ?? '[]');
    const lines = patch[0].lines;
    // The \\ marker line should be skipped — we get context, delete, and add
    expect(lines).toHaveLength(3);
    expect(lines[0]?.type).toBe('context');
    expect(lines[1]?.type).toBe('delete');
    expect(lines[2]?.type).toBe('add');
  });

  it('safety-bounds on very large hunks', () => {
    const lines: string[] = ['--- a/src/index.ts', '+++ b/src/index.ts', '@@ -1,10000 +1,10000 @@'];
    // Generate more than 10k lines to hit the safety bound
    for (let i = 0; i < 15_000; i++) {
      lines.push(`+line ${i}`);
    }

    const result = parseUdiffs(lines.join('\n'));
    expect(result.errors).toHaveLength(0);
    expect(result.edits).toHaveLength(1);

    const patch = JSON.parse(result.edits[0]?.replacement ?? '[]');
    expect(patch[0].lines.length).toBeLessThanOrEqual(10_001); // includes context counting
  });
});
