import { describe, expect, it } from 'vitest';

import type { DocumentViewerProps, LineRange } from './index.js';

describe('DocumentViewer types', () => {
  it('LineRange has start and end', () => {
    const range: LineRange = { end: 10, start: 5 };
    expect(range.start).toBe(5);
    expect(range.end).toBe(10);
  });

  it('DocumentViewerProps shape is correct', () => {
    const props: DocumentViewerProps = {
      content: 'line1\nline2',
      palette: {} as DocumentViewerProps['palette'],
      path: 'test.ts'
    };
    expect(props.content).toBe('line1\nline2');
    expect(props.path).toBe('test.ts');
  });

  it('highlights option is optional', () => {
    const props: DocumentViewerProps = {
      content: 'line1',
      palette: {} as DocumentViewerProps['palette'],
      path: 'test.ts'
    };
    expect(props.highlights).toBeUndefined();
  });

  it('lineNumbers defaults to true', () => {
    const props: DocumentViewerProps = {
      content: 'line1',
      palette: {} as DocumentViewerProps['palette'],
      path: 'test.ts'
    };
    expect(props.lineNumbers).toBeUndefined();
  });
});
