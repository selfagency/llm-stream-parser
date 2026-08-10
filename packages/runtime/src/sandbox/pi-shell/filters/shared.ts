/**
 * Shared helpers for pi-shell output filters.
 *
 * All filters collapse consecutive blank lines and pass through error lines.
 * This module centralizes that common skeleton so each filter only implements
 * its tool-specific noise filtering.
 */

/**
 * Collapse consecutive blank lines, keeping at most one blank line between
 * non-blank lines. Returns the trimmed line and whether it should be kept.
 */
export function collapseBlankLines(out: string[], raw: string): { keep: boolean; trimmed: string } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    if (out.length > 0 && out.at(-1)?.trim() === '') {
      return { keep: false, trimmed };
    }
    return { keep: true, trimmed };
  }
  return { keep: true, trimmed };
}

/**
 * Append a filtered-line summary to the output, inserting it before the first
 * line matching `anchor` (if any) or prepending it otherwise.
 */
export function insertFilterSummary(out: string[], summary: string, anchor?: RegExp): void {
  if (anchor) {
    const idx = out.findIndex(l => anchor.test(l));
    if (idx >= 0) {
      out.splice(idx, 0, summary);
      return;
    }
  }
  out.unshift(summary);
}
