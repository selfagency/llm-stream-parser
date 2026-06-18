import { describe, expect, it } from 'vitest';

import type { DiffHunk, DiffLine, DiffViewerProps } from './index.js';

describe('DiffViewer types', () => {
  it('DiffLine has correct shape', () => {
    const line: DiffLine = { content: 'test', index: 0, type: 'add' };
    expect(line.content).toBe('test');
    expect(line.type).toBe('add');
  });

  it('DiffHunk has lines and location', () => {
    const hunk: DiffHunk = {
      index: 0,
      lines: [{ content: 'line', index: 0, type: 'context' }],
      location: '@@ -1 +1 @@'
    };
    expect(hunk.lines).toHaveLength(1);
    expect(hunk.location).toContain('@@');
  });

  it('DiffViewerProps shape is correct', () => {
    const props: DiffViewerProps = {
      filePath: 'test.ts',
      modified: 'line2',
      original: 'line1',
      palette: {} as DiffViewerProps['palette']
    };
    expect(props.original).toBe('line1');
    expect(props.modified).toBe('line2');
    expect(props.filePath).toBe('test.ts');
  });
});
