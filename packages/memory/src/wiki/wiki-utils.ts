/**
 * The result of a line-level diff between two page versions.
 */
export interface PageDiff {
  addedLines: string[];
  removedLines: string[];
}

/**
 * Compute a simple line-level diff of two page bodies.
 */
export function getDiff(fromBody: string, toBody: string): PageDiff {
  const fromLines = fromBody.split('\n');
  const toLines = toBody.split('\n');

  const fromSet = new Set(fromLines);
  const toSet = new Set(toLines);

  const addedLines = toLines.filter(line => !fromSet.has(line));
  const removedLines = fromLines.filter(line => !toSet.has(line));

  return { addedLines, removedLines };
}
